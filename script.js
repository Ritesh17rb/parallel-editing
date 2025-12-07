// script.js — module
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
// import { BroadcastChannelProvider } from 'y-broadcastchannel';
import { IndexeddbPersistence } from 'y-indexeddb';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';

// IMPORTANT: asyncLLM is exported as a default async generator in many ESM builds.
// Import it as the default and treat it like an async-stream producer.
import asyncLLM from 'asyncllm';

import 'bootstrap-llm-provider'; // web component; no bindings needed here
import config, { templates } from './config.js';

// -------------------------
// 1. Yjs + IndexedDB + Quill
// -------------------------
const ydoc = new Y.Doc();
const ytext = ydoc.getText('quill');

// 1a. Room Setup (Auto-generate unique room if missing)
const urlParams = new URLSearchParams(window.location.search);
let roomName = urlParams.get('room');

function generateRoomId() {
  return 'doc-' + Math.random().toString(36).substring(2, 9);
}

if (!roomName) {
  roomName = generateRoomId();
  // Update URL without reloading
  const newUrl = new URL(window.location);
  newUrl.searchParams.set('room', roomName);
  window.history.replaceState({}, '', newUrl);
}

// Update UI
const roomEl = document.getElementById('room-name');
if (roomEl) roomEl.innerText = roomName;

// Copy Link Handler
document.getElementById('room-badge')?.addEventListener('click', () => {
  const url = new URL(window.location);
  url.searchParams.set('room', roomName);
  navigator.clipboard.writeText(url.toString()).then(() => {
    // Visual feedback
    const badge = document.getElementById('room-badge');
    const original = badge.innerHTML;
    badge.innerHTML = `<i class="bi bi-check"></i> Copied!`;
    setTimeout(() => badge.innerHTML = original, 2000);
  });
});

// IndexedDB persistence (Unique per room)
const provider = new IndexeddbPersistence(roomName, ydoc);

const editor = new Quill('#editor-container', {
  theme: 'snow',
  modules: {
    toolbar: [
      [{ header: [1, 2, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['clean']
    ]
  },
  placeholder: 'Loading contract...'
});

const binding = new QuillBinding(ytext, editor);

// fill initialContent only when doc is empty after sync
provider.on('synced', () => {
  if (ytext.toString().trim() === '') {
    // paste once (use Quill's clipboard to preserve HTML)
    editor.clipboard.dangerouslyPasteHTML(0, config.initialContent);
    log(`Initialized document with template content.`);
  }
  log(`Connected to local storage (IndexedDB).`);
});

// 1b. Network provider (WebRTC)
// We revert to the default signaling servers which are usually most reliable for demos.
const webrtcProvider = new WebrtcProvider(roomName, ydoc);

// Awareness (User Count)
webrtcProvider.awareness.on('change', () => {
  const count = webrtcProvider.awareness.getStates().size;
  document.getElementById('user-count').innerText = String(count);
});

// Diagnostic Logging
webrtcProvider.on('status', event => {
  if (event.connected) {
    log('<span class="text-success">✓ Connected to signaling server</span>');
  } else {
    log('<span class="text-warning">⚠ Disconnected from signaling</span>');
  }
});

webrtcProvider.on('peers', (event) => {
  const added = event.added.length;
  const removed = event.removed.length;
  const webRtcPeers = event.webrtcPeers.length;
  const bcPeers = event.bcPeers.length;
  
  if (added || removed) {
     log(`Peers updated: ${webRtcPeers} WebRTC, ${bcPeers} Local.`);
  }
});

webrtcProvider.connect();

// -------------------------
// 2. UI helpers & logging
// -------------------------
const llmProviderEl = document.querySelector('llm-provider');
const logs = document.getElementById('logs');

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logs.innerHTML += `> [${time}] ${msg}<br>`;
  logs.scrollTop = logs.scrollHeight;
}

// allow configure button to open provider modal
// allow configure button to open provider modal
// We use a native Bootstrap modal instead of the web component for reliability.
let configModal; // lazy init
document.getElementById('configure-llm').addEventListener('click', () => {
  if (!configModal) {
    configModal = new bootstrap.Modal(document.getElementById('llmConfigModal'));
  }
  // populate current values
  document.getElementById('llm-api-key').value = localStorage.getItem('llm_api_key') || '';
  document.getElementById('llm-url').value = localStorage.getItem('llm_url') || '';
  
  configModal.show();
});

document.getElementById('save-llm-config').addEventListener('click', () => {
  const key = document.getElementById('llm-api-key').value.trim();
  const url = document.getElementById('llm-url').value.trim();
  
  if (key) localStorage.setItem('llm_api_key', key);
  else localStorage.removeItem('llm_api_key');
  
  if (url) localStorage.setItem('llm_url', url);
  else localStorage.removeItem('llm_url');
  
  if (configModal) configModal.hide();
  log('Configuration saved.');
});

// -------------------------
// 3. Core AI trigger logic
// -------------------------
async function triggerAI(instruction, mode = 'insert') {
  // 1) get API config from the web component (bootstrap-llm-provider)
  let llmConfig = {};
  try {
    // Many bootstrap-llm-provider implementations expose a getConfig() method
    // If your specific build differs, adapt accordingly.
    if (llmProviderEl && typeof llmProviderEl.getConfig === 'function') {
      llmConfig = llmProviderEl.getConfig();
    } else {
      // fallback to stored config (e.g., localStorage) or prompt user
      llmConfig = {
        apiKey: localStorage.getItem('llm_api_key') || '',
        url: localStorage.getItem('llm_url') || ''
      };
    }
  } catch (err) {
    console.warn('Could not read provider config:', err);
  }

  if (!llmConfig || !llmConfig.apiKey) {
    alert('Please configure an API key via Configure → enter your key and Save.');
    if (llmProviderEl) llmProviderEl.open = true;
    return;
  }

  // 2) Prepare prompt and where to insert
  const currentDocText = ytext.toString();
  let prompt = `Current Contract Text:\n${currentDocText}\n\nTask: ${instruction}\n\nOutput ONLY the updated clause(s) or HTML-formatted text.`;

  // If "rewrite" and there's a selection, restrict prompt to selection
  const sel = editor.getSelection();
  let intendedIndex = ytext.length; // default: append at end

  if (mode === 'fill-gaps') {
    // Search-and-replace approach for "fill-gaps"
    // We ask the AI to list the replacements, and we apply them in-place.
    prompt = `Current Contract Text:\n${currentDocText}\n\nTask: ${instruction}\n\nOutput a list of replacements in this format:\nPlaceholder ||| Replacement Value\n\nExample:\n[DATE] ||| October 1, 2023\n\nOutput ONLY the list.`;
    // We do NOT clear the document. We will "hunt" for placeholders.
    intendedIndex = -1; // Special flag to indicate "no stream insertion, just processing"
  } else if (mode === 'rewrite' && sel && sel.length > 0) {
    const selectedText = editor.getText(sel.index, sel.length);
    prompt = `Original Text: "${selectedText}"\n\nTask: ${instruction}\n\nOutput only the rewritten text (HTML allowed).`;
    // propose to insert after selection end
    intendedIndex = Math.min(sel.index + sel.length, ytext.length);
  } else if (sel) {
    // for 'insert' mode, insert at cursor (or append)
    intendedIndex = Math.min(sel.index + (sel.length || 0), ytext.length);
  }

  // UI feedback
  const header = document.querySelector('.card-header');
  header.classList.add('ai-active-border');
  log(`AI started: ${instruction}`);



  // 3) call the streaming asyncLLM endpoint
  const baseUrl = (llmConfig.url && llmConfig.url.length) ? llmConfig.url : 'https://api.openai.com/v1';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const modelInput = document.getElementById('model')?.value || 'gpt-4o-mini';
  const systemPrompt = document.getElementById('system-prompt-input')?.value || config.systemPrompt || '';

  // Build request body for OpenAI-like streaming
  const body = {
    model: modelInput,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]
  };

  // We'll keep an evolving insertIndex. Because other users may type meanwhile,
  // we always compute a sane absolute index before inserting each chunk.
  let insertIndex = intendedIndex;

  try {
    // 3) call the streaming endpoint using standard fetch
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';
    let streamBuffer = ''; // buffer for handling split HTML tags
    let lineBuffer = '';   // buffer for line-by-line processing (fill-gaps)

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.substring(6));
            const content = json.choices?.[0]?.delta?.content || '';
            
            if (content) {
              // MODE: Fill Gaps (Search & Replace)
              if (intendedIndex === -1) {
                lineBuffer += content;
                // Parse complete lines from lineBuffer
                if (lineBuffer.includes('\n')) {
                  const parts = lineBuffer.split('\n');
                  lineBuffer = parts.pop(); // keep incomplete line
                  
                  for (const part of parts) {
                    if (part.includes('|||')) {
                      let [placeholder, replacement] = part.split('|||').map(s => s.trim());
                      // Cleanup replacement text
                      replacement = replacement.replace(/^html/i, '').trim(); // common artifact
                      if (replacement.includes('```')) replacement = replacement.replace(/```/g, ''); 
                      
                      // Find in document
                      const currentText = ytext.toString();
                      const idx = currentText.indexOf(placeholder);
                      if (idx !== -1) {
                        ytext.delete(idx, placeholder.length);
                        ytext.insert(idx, replacement);
                        // Visual delay for "reading" effect
                        await new Promise(r => setTimeout(r, 600)); 
                      }
                    }
                  }
                }
              } 
              // MODE: Insert / Rewrite (Streaming Text)
              else {
                streamBuffer += content;
                let output = '';
                // Process buffer for tags (strip HTML)
                while (true) {
                    const tagStart = streamBuffer.indexOf('<');
                    if (tagStart === -1) {
                        output += streamBuffer; 
                        streamBuffer = ''; 
                        break; 
                    }
                    if (tagStart > 0) {
                        output += streamBuffer.slice(0, tagStart);
                        streamBuffer = streamBuffer.slice(tagStart);
                        continue;
                    }
                    const tagEnd = streamBuffer.indexOf('>');
                    if (tagEnd === -1) break;
                    streamBuffer = streamBuffer.slice(tagEnd + 1);
                }

                // Clean up artifacts
                if (output.includes('```html')) output = output.replace('```html', '');
                if (output.includes('```')) output = output.replace('```', '');
                output = output.replace(/^\s*html\s*/i, '');
                
                // Normalize newlines to prevent index drift (CRLF -> LF)
                output = output.replace(/\r\n/g, '\n');

                if (output) {
                  insertIndex = Math.min(insertIndex, ytext.length);
                  
                  // Apply highlighting for "rewrite" mode (Suggestion Mode)
                  // We must apply it explicitly to the editor so Quill tracks it
                  ytext.insert(insertIndex, output);
                  
                  if (mode === 'rewrite') {
                    // Apply format to the newly inserted range
                    // We need to use valid delta or editor.formatText
                    // Note: ytext.insert with attributes works for Yjs, but binding might need help
                    // Let's force update the attribute on the Yjs text
                    const formatProps = { background: '#e2f0d9', color: '#000000' };
                    ytext.format(insertIndex, output.length, formatProps);
                  }
                  
                  insertIndex += output.length;
                  
                  await new Promise(r => setTimeout(r, 60));
                }
              }
            }
          } catch (e) {
            console.warn('Error parsing stream chunk', e);
          }
        }
      }
    }

    // finished streaming
    log(`AI finished: ${instruction}`);
  } catch (err) {
    console.error('LLM stream error', err);
    log(`LLM error: ${err.message || String(err)}`);
  } finally {
    header.classList.remove('ai-active-border');
  }
}

// -------------------------
// 4. wire UI actions
// -------------------------
// Suggestion Toolbar Logic
const suggestionToolbar = document.getElementById('suggestion-toolbar');
const acceptBtn = document.getElementById('btn-accept');
const discardBtn = document.getElementById('btn-discard');

function isSuggestionColor(color) {
  // Debug: see what color is actually returned
  // Quill/Yjs might return differing formats
  if (!color) return false;
  // Normalize checking
  const c = String(color).toLowerCase().replace(/\s/g, '');
  // #e2f0d9, rgb(226,240,217), rgba(226,240,217,1)
  const valid = c === '#e2f0d9' || c.includes('226,240,217');
  if (valid) return true;
  return false;
}

function getSuggestionRange() {
  // Helper: expands the current cursor/selection to the full block of suggestion text
  const range = editor.getSelection();
  if (!range) return null;

  // If user already selected a range, verify it has the color
  if (range.length > 0) {
    const fmt = editor.getFormat(range.index); // check start
    if (isSuggestionColor(fmt.background)) return range;
    return null;
  }

  // If cursor (length 0), find bounds of the color block
  const startFmt = editor.getFormat(range.index);
  if (!isSuggestionColor(startFmt.background)) {
    // Check previous char (cursor might be at end of block)
    if (range.index > 0) {
      const prevFmt = editor.getFormat(range.index - 1);
      if (isSuggestionColor(prevFmt.background)) {
        // we are at the end, scan backwards
        let start = range.index - 1;
        while (start > 0 && isSuggestionColor(editor.getFormat(start - 1).background)) {
          start--;
        }
        return { index: start, length: range.index - start };
      }
    }
    return null;
  }

  // Scan backwards
  let start = range.index;
  while (start > 0 && isSuggestionColor(editor.getFormat(start - 1).background)) {
    start--;
  }

  // Scan forwards
  let end = range.index;
  const totalLength = editor.getLength();
  while (end < totalLength && isSuggestionColor(editor.getFormat(end).background)) {
    end++;
  }

  return { index: start, length: end - start };
}

function updateSuggestionToolbar() {
  const range = editor.getSelection();
  if (!range) {
    suggestionToolbar.style.display = 'none';
    return;
  }
  
  // Check the format at cursor
  let format = editor.getFormat(range.index);
  // Also check character before cursor (if at end of word)
  let prevFormat = (range.index > 0) ? editor.getFormat(range.index - 1) : {};
  
  // Debug log to see what we are getting
  console.log('Cursor bg:', format.background, 'Prev bg:', prevFormat.background);

  if (isSuggestionColor(format.background) || isSuggestionColor(prevFormat.background)) {
    const bounds = editor.getBounds(range.index);
    if (bounds) {
        console.log('Showing toolbar at', bounds);
        // Ensure we calculate from page origin including scroll
        const top = (window.pageYOffset || document.documentElement.scrollTop) + bounds.top - 55;
        const left = (window.pageXOffset || document.documentElement.scrollLeft) + bounds.left;
        
        suggestionToolbar.style.top = top + 'px';
        suggestionToolbar.style.left = left + 'px';
        suggestionToolbar.style.display = 'block';
    }
  } else {
    suggestionToolbar.style.display = 'none';
  }
}

// Ensure click updates it too (sometimes selection-change is lazy or differs)
editor.root.addEventListener('click', () => {
    setTimeout(updateSuggestionToolbar, 10);
});

editor.on('selection-change', updateSuggestionToolbar);

acceptBtn.addEventListener('click', () => {
  const fullRange = getSuggestionRange();
  if (fullRange) {
    // "Accept" = remove the highlighting (make it permanent/normal)
    // Also remove the forced color so it adapts to theme
    editor.formatText(fullRange.index, fullRange.length, {
      'background': false,
      'color': false
    });
    suggestionToolbar.style.display = 'none';
  }
});

discardBtn.addEventListener('click', () => {
  // Loop to catch fragmented ranges or boundary artifacts (e.g. "one char left")
  let attempts = 0;
  
  function clean() {
    const fullRange = getSuggestionRange();
    if (fullRange) {
      log(`Discarding suggestion... (${fullRange.index}, ${fullRange.length})`);
      // Use Yjs direct delete for reliability
      ytext.delete(fullRange.index, fullRange.length);
      
      // Retry after a microtask to handle adjacent fragments
      if (attempts++ < 3) setTimeout(clean, 10);
      else suggestionToolbar.style.display = 'none';
      
    } else {
      suggestionToolbar.style.display = 'none';
    }
  }
  
  clean();
});

document.querySelectorAll('.ai-action').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const prompt = e.currentTarget.dataset.prompt;
    const mode = e.currentTarget.dataset.mode || 'insert';
    triggerAI(prompt, mode);
  });
});

document.getElementById('btn-custom')?.addEventListener('click', () => {
  const val = document.getElementById('custom-prompt')?.value;
  if (val && val.trim().length) triggerAI(val.trim(), 'insert');
});

// 5. Demo Template Loading
// -------------------------
document.querySelectorAll('.demo-card').forEach(card => {
  card.addEventListener('click', () => {
    const templateKey = card.getAttribute('data-template');
    const content = templates[templateKey];

    if (content) {
      // 1. Clear existing content (propagates to Yjs)
      ytext.delete(0, ytext.length);
      
      // 2. Insert new content via Quill (parses HTML -> Delta -> Yjs)
      // This is crucial: directly inserting string into Yjs bypasses HTML parsing
      editor.clipboard.dangerouslyPasteHTML(0, content);
      
      log(`Loaded template: ${templateKey}`);
      
      // Update header
      const docName = templateKey === 'MSA' ? 'Agreement.docx' : 
                      templateKey === 'NDA' ? 'NDA.docx' : 'Employment_Contract.docx';
      document.querySelector('.card-header span.fw-bold').innerHTML = `<i class="bi bi-file-earmark-text me-2"></i>${docName}`;
    }
  });
});

// expose simple debug on window
window.__debug = { ydoc, provider, editor, ytext };
