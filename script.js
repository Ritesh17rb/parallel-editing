// script.js — module
import * as Y from 'yjs';
// import { WebrtcProvider } from 'y-webrtc';
// import { BroadcastChannelProvider } from 'y-broadcastchannel';
import { IndexeddbPersistence } from 'y-indexeddb';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';

// IMPORTANT: asyncLLM is exported as a default async generator in many ESM builds.
// Import it as the default and treat it like an async-stream producer.
import asyncLLM from 'asyncllm';

import 'bootstrap-llm-provider'; // web component; no bindings needed here
import config from './config.js';

// -------------------------
// 1. Yjs + IndexedDB + Quill
// -------------------------
const ydoc = new Y.Doc();
const ytext = ydoc.getText('quill');

// IndexedDB provider persists data and syncs across tabs.
const provider = new IndexeddbPersistence(config.roomName, ydoc);

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

// provider.on('synced', () => { ... });

// awareness updates (not supported by IndexeddbPersistence alone)
// provider.awareness.on('change', () => {
//   const count = provider.awareness.getStates().size;
//   document.getElementById('user-count').innerText = String(count);
// });

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
  if (mode === 'rewrite' && sel && sel.length > 0) {
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
  const baseUrl = (llmConfig.url && llmConfig.url.length) ? llmConfig.url : 'https://llmfoundry.straive.com/openai/v1';
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
              // Append to stream buffer to handle split tags
              streamBuffer += content;
              
              let output = '';
              // Process buffer for tags
              while (true) {
                const tagStart = streamBuffer.indexOf('<');
                if (tagStart === -1) {
                  // No tags, safe to output everything
                  output += streamBuffer;
                  streamBuffer = '';
                  break;
                }
                
                if (tagStart > 0) {
                  // Text before tag
                  output += streamBuffer.slice(0, tagStart);
                  streamBuffer = streamBuffer.slice(tagStart);
                  continue;
                }
                
                // Starts with <, look for end
                const tagEnd = streamBuffer.indexOf('>');
                if (tagEnd === -1) {
                  // Partial tag, wait for more chunks
                  break;
                }
                
                // Full tag found, discard it
                streamBuffer = streamBuffer.slice(tagEnd + 1);
              }

              // Clean up any markdown artifacts from the safe output
              if (output.includes('```html')) output = output.replace('```html', '');
              if (output.includes('```')) output = output.replace('```', '');

              if (output) {
                insertIndex = Math.min(insertIndex, ytext.length);
                ytext.insert(insertIndex, output);
                insertIndex += output.length;
                
                // Artificial delay for parallel editing demo
                await new Promise(r => setTimeout(r, 60)); // slightly faster
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
    // if rewrite mode, optionally mark the range visually or add note (kept minimal here)
  }
}

// -------------------------
// 4. wire UI actions
// -------------------------
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

// expose simple debug on window
window.__debug = { ydoc, provider, editor, ytext };
