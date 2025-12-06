// script.js — module
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';

// IMPORTANT: asyncLLM is exported as a default async generator in many ESM builds.
// Import it as the default and treat it like an async-stream producer.
import asyncLLM from 'asyncllm';

import 'bootstrap-llm-provider'; // web component; no bindings needed here
import config from './config.js';

// -------------------------
// 1. Yjs + WebRTC + Quill
// -------------------------
const ydoc = new Y.Doc();
const ytext = ydoc.getText('quill');

const provider = new WebrtcProvider(config.roomName, ydoc, {
  signaling: ['wss://signaling.yjs.dev'] // default public signaling server
});

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

// fill initialContent only when remote doc is empty after first sync
provider.on('synced', () => {
  if (ytext.toString().trim() === '') {
    // paste once (use Quill's clipboard to preserve HTML)
    editor.clipboard.dangerouslyPasteHTML(0, config.initialContent);
    log(`Initialized document with template content.`);
  }
  log(`Connected to room: ${config.roomName}`);
});

// awareness updates (active users)
provider.awareness.on('change', () => {
  const count = provider.awareness.getStates().size;
  document.getElementById('user-count').innerText = String(count);
});

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
document.getElementById('configure-llm').addEventListener('click', () => {
  if (llmProviderEl) {
    llmProviderEl.open = true;
  } else {
    alert('LLM provider element not found.');
  }
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
    // asyncLLM returns an async iterator of events (depends on the package build)
    for await (const ev of asyncLLM(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body
    })) {
      // The event shape differs by library. We'll handle common cases:
      // - ev.delta (string chunk)
      // - ev (string)
      // - ev.type === 'delta' && ev.data
      let chunk = '';

      if (!ev) continue;
      if (typeof ev === 'string') {
        chunk = ev;
      } else if (typeof ev === 'object') {
        // common shapes:
        if ('delta' in ev && typeof ev.delta === 'string') chunk = ev.delta;
        else if ('text' in ev && typeof ev.text === 'string') chunk = ev.text;
        else if ('data' in ev && typeof ev.data === 'string') chunk = ev.data;
        else if (ev.type === 'chunk' && ev.chunk) chunk = ev.chunk;
      }

      if (!chunk) continue; // nothing meaningful this iteration

      // Resolve current absolute index (clamp to document length)
      insertIndex = Math.min(insertIndex, ytext.length);
      // Insert chunk into CRDT — this will propagate to all peers and update editor
      ytext.insert(insertIndex, chunk);
      // Advance our local notion of the insertion point so next chunk appends
      insertIndex += chunk.length;
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
