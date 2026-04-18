<div align="center">

# ✦ Glossa

**Multi-stage AI translation pipeline for scholars**

A desktop application that chains multiple LLM passes — draft, refinement, audit — to produce publication-quality translations. Built for philologists, classicists, and translators who need precision over speed.

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://v2.tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://rust-lang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## How it works

Glossa runs your source text through a **configurable pipeline** of LLM stages, each with its own prompt, model, and provider. An AI judge then audits the final translation against your glossary and instructions, scoring it on accuracy, fluency, glossary adherence, and grammar.

```
Source text
  │
  ├─► Stage 1: Initial Pass (Gemini / Ollama / ...)
  │     ↓
  ├─► Stage 2: Refinement (OpenAI / Anthropic / ...)
  │     ↓
  ├─► Stage N: (add as many as you need)
  │     ↓
  └─► AI Judge: audit score + issues + suggested fixes
```

Translations stream token-by-token in real time. You can edit the candidate translation manually before auditing, re-run only the audit, and iterate until the quality meets your standards.

## Features

| Category | Details |
|----------|---------|
| **5 LLM providers** | Gemini, OpenAI, Anthropic, DeepSeek, **Ollama** (local models) |
| **Streaming** | Real-time token display during translation |
| **Multi-stage pipeline** | Add/remove/reorder stages, each with its own model and prompt |
| **AI Judge** | LLM-as-a-judge audit with score (0–100), categorized issues, and fixes |
| **Glossary** | Keyword registry enforced across all stages and the audit |
| **Auto-segmentation** | Splits source text by paragraphs for chunk-by-chunk processing |
| **Project management** | Save/load projects with full pipeline config and translations |
| **File I/O** | Import `.txt`/`.md`, export as plain text or bilingual Markdown |
| **Secure keys** | API keys stored in OS keychain (GNOME Keyring / macOS Keychain / Windows Credential Manager) |
| **i18n** | English and Italian interface |
| **Desktop native** | Tauri v2 — lightweight binaries, no browser runtime |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) ≥ 1.77
- System libraries for Tauri (Linux only):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev
  ```

### Install & run

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm install
npm run tauri:dev      # development mode with hot reload
```

### Build for production

```bash
npm run tauri:build
```

Outputs `.deb`, `.rpm`, and `.AppImage` on Linux; `.dmg` on macOS; `.msi` on Windows.  
Bundles are in `src-tauri/target/release/bundle/`.

## Configuration

### API keys

Open **Settings** (⚙️ icon) and paste your API keys. They are stored in your operating system's keychain — never in plain text, never sent anywhere except to the provider's API.

| Provider | Get a key |
|----------|-----------|
| Gemini | [ai.google.dev](https://ai.google.dev/) |
| OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/) |

### Ollama (local models)

For fully offline, private translation with models running on your own hardware:

1. Install Ollama: [ollama.com/download](https://ollama.com/download)
2. Pull a model: `ollama pull llama3.2` (or `mistral`, `gemma2`, etc.)
3. Start the server: `ollama serve`
4. In Glossa Settings, the Ollama section will show connected status and available models.

No API key is needed. All data stays on your machine.

## Usage guide

### 1. Set up the pipeline

In the left panel (**Global Setup**):

- Choose source and target languages
- Configure pipeline stages:
  - Each stage has its own **provider**, **model**, and **prompt**
  - Stage 1 typically does a literal draft; Stage 2 refines for fluency
  - Add more stages for specialized tasks (terminology, register, etc.)
- Set up the **Audit Guard** with a judge model and audit instructions
- Add terms to the **Keyword Registry** (glossary) to enforce consistent terminology

### 2. Run the pipeline

In the center panel (**Production Stream**):

1. Paste or import your source text
2. Click **"Stage Content to Stream"** to segment the text
3. Click **"Begin Pipeline"** — tokens stream in real time for each stage
4. Review the candidate translation, edit it manually if needed
5. The AI Judge automatically scores the result

### 3. Review the audit

In the right panel (**Audit Logs**):

- **Composite score** (0–100) across all chunks
- **Issues** categorized by type (glossary, fluency, accuracy, grammar) and severity
- **Suggested fixes** for each issue
- Click **"Re-Evaluate Drafts"** after manual edits to get an updated score

### 4. Projects and files

- **📂 Projects**: Save your entire pipeline config + translations. Reload anytime.
- **⬆ Import**: Load `.txt` or `.md` files via native OS dialog
- **⬇ Export**: Save as plain `.txt` (translation only) or bilingual `.md` (source + translation + audit)
- **💾 Save**: Persist the current project state to SQLite

## Architecture

```
┌──────────────────────────────────────────┐
│  Frontend (React 19 + Zustand + Vite)    │
│  ├── PipelineConfig   (left panel)       │
│  ├── ProductionStream (center panel)     │
│  ├── AuditPanel       (right panel)      │
│  ├── SettingsModal    (API keys, Ollama) │
│  └── ProjectPanel     (CRUD projects)    │
├──────────────────────────────────────────┤
│  Tauri IPC (invoke / events)             │
├──────────────────────────────────────────┤
│  Rust Backend                            │
│  ├── LLM calls   (reqwest + SSE stream)  │
│  ├── API keys    (OS keyring)            │
│  └── Plugins     (SQLite, FS, Dialog)    │
└──────────────────────────────────────────┘
```

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri v2 (webview + Rust sidecar) |
| Frontend | React 19, TypeScript, Tailwind CSS, Zustand |
| LLM integration | Rust `reqwest` with SSE streaming |
| Storage | SQLite via `tauri-plugin-sql` |
| API key security | OS keychain via `keyring` crate |
| i18n | `react-i18next` with bundled JSON |

## Project structure

```
glossa/
├── src/                    # React frontend
│   ├── components/         # UI components (pipeline, audit, settings, projects)
│   ├── hooks/              # usePipeline (execution logic)
│   ├── services/           # llmService, projectService, fileService, dbService
│   ├── stores/             # Zustand stores (pipeline, project)
│   ├── i18n/               # en.json, it.json
│   └── utils/              # retry logic, helpers
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri app entry, plugin registration
│   │   └── llm.rs          # All LLM providers, streaming, Ollama, keychain
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## Contributing

1. Fork the repo and create a branch
2. Make your changes
3. Run `npm run lint` (TypeScript check) and `npm run tauri:build` (full build)
4. Open a PR

## License

MIT — see [LICENSE](LICENSE) for details.
