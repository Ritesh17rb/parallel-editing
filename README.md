# Parallel Editing with AI Co-Pilot

A production-ready demonstration of **Real-Time Agentic Collaboration**. This application allows human users to draft legal contracts alongside an AI Co-Pilot that understands context, resolves conflicts, and suggests improvements in real-time.

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Status](https://img.shields.io/badge/status-live-success.svg)

## 🌟 Key Features

### 1. Real-Time Collaboration (Multi-User)
- **Engine**: Powered by **Yjs** (CRDTs) + **WebRTC**.
- **Live Sync**: Multiple users can edit the same document simultaneously across different browsers/devices.
- **Private Rooms**: Automatically generates unique, secure room IDs for every new session (`?room=doc-xxxx`).
- **Shareable Links**: Click the Room Badge to copy an instant invite link.
- **Awareness**: Real-time "Active User" count displayed in the navbar.

### 2. AI Co-Pilot (Agentic Workflow)
- **Streaming Edits**: The AI streams changes character-by-character into the shared document state using `asyncllm`.
- **Context Aware**: The AI reads the current document state to provide relevant suggestions.
- **Interactive Suggestions**:
    - **"Make Mutual"**: Rewrites selected clauses to be fair to both parties.
    - **"Fill Gaps"**: Automatically finds and replaces placeholders (e.g., `[DATE]`, `[AMOUNT]`).
    - **"Force Majeure" / "Liability Cap"**: Inserts standard legal clauses on demand.
- **Suggestion Mode**: AI output appears with a **Green Highlight**. Users can **Accept** (finalize) or **Discard** (cleanly remove) the suggestion via a floating toolbar.

### 3. Editor Experience
- **Rich Text Editor**: Built on **Quill.js** with custom bindings.
- **Demo Templates**: Clickable cards to instantly load **MSA**, **NDA**, or **Employment** contracts.
- **Dark Mode**: Fully supported with optimized high-contrast text for AI suggestions.
- **Local-First**: Uses `IndexedDB` to persist work offline.

## 🚀 Getting Started

### Prerequisites
You need a modern browser. No backend server is required (serverless architecture).

### Installation
1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd parallel-editing
    ```

2.  **Serve locally**:
    Because this project uses ES Modules, it must be served via HTTP (not `file://`).
    ```bash
    # Using python
    python -m http.server 8080

    # OR using node
    npx http-server .
    ```

3.  **Run**:
    Open `http://127.0.0.1:8080` in your browser.

### Configuration
1.  **API Key**: Click **Configure** in the top-right and enter your OpenAI API request (or compatible provider).
2.  **Model**: You can change the model (e.g., `gpt-4o`, `gpt-3.5-turbo`) in the **Advanced Settings** accordion.

## 🛠️ Architecture

- **`index.html`**: Main entry point, setting up the UI, Quill editor, and modular imports.
- **`script.js`**:
    - Initializes Yjs Doc and Providers (WebRTC, IndexedDB).
    - Manages Editor Bindings.
    - Handles AI Streaming Logic (Fetch API -> Stream Decoder -> Yjs Insert).
    - Implements the "Suggestion Mode" logic (Text Formatting, Range Calculation, Recursive Discard).
- **`config.js`**: Stores configuration defaults and Document Templates (MSA, NDA, Employment).

## 🧩 Technologies

- **Yjs**: Conflict-free Replicated Data Types for state management.
- **WebRTC**: Peer-to-peer real-time networking.
- **Quill**: Rich text editing.
- **Bootstrap 5**: Responsive UI styling.
- **AsyncLLM**: Efficient streaming for LLM responses.

## 🤝 Contributing

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request