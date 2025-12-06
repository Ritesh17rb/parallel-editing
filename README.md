# Contract AI Collaboration Demo

A real-time "Agentic Collaboration" demo where an LLM acts as a user within a shared document.

## 🌟 Key Features
1.  **Real-Time Sync**: Uses **Yjs** CRDTs to sync state between users and the AI.
2.  **Streaming Edits**: The AI streams text character-by-character directly into the shared document state.
3.  **Conflict Free**: You can type in the document *while* the AI is generating. The CRDT ensures no updates are lost.

## 🚀 Usage

1.  **Serve the files**: This project uses ES Modules, so it must be served via HTTP.
    ```bash
    npx http-server .
    ```
2.  **Open Browser**: Go to `http://127.0.0.1:8080`.
3.  **Authentication**: Enter your **LLM API Key** in the top navigation bar.
4.  **Collaborate**:
    * Open a second window to simulate another user.
    * Select text and click "Make Selection Mutual" to see the AI generate a suggestion.
    * Watch the AI type in both windows simultaneously.

## ⚙️ Configuration
See `config.js` to change the:
* `llmBaseUrl`: Currently set to `https://api.openai.com/v1`.
* `model`: Currently `gpt-4o-mini`.
* `initialContent`: The default contract text.