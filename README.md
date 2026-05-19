<div align="center">

# ✦ Glossa

**Multi-stage AI translation pipeline for scholars**

A desktop application that chains multiple LLM passes — draft, refinement, audit — to produce publication-quality translations. Built for philologists, classicists, and translators who need precision over speed.

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://v2.tauri.app)
[![Release](https://img.shields.io/github/v/release/nikazzio/glossa?display_name=tag)](https://github.com/nikazzio/glossa/releases/latest)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://rust-lang.org)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

</div>

---

## How it works

Glossa runs your source text through a configurable pipeline of LLM stages, then audits the result with an AI judge.

**Standard mode** — single translation pass:
```
Source text
  └─► Translation (model + prompt + persona)
        └─► AI Judge: quality rating + issues + suggested fixes
```

**Editorial mode** — three-stage refinement:
```
Source text
  └─► Translation → Refine → Format
                               └─► AI Judge
```

Each stage has its own model, provider, prompt, and can be individually inspected. Long documents are split into chunks processed in sequence.

**Four-phase workflow** (Document mode):

| Phase | What happens |
|-------|-------------|
| **Configure** | Set up pipeline, language pair, glossary |
| **Test** | Run one chunk as a preview — config stays editable, nothing is locked |
| **Translate** | Full production run across all unlocked chunks |
| **Review** | Audit panel with quality ratings, issues, and suggested fixes |

Translations stream token-by-token in real time. You can edit the candidate translation manually before auditing, re-run only the audit, and iterate until the quality meets your standards.

## Features

| Category | Details |
|----------|---------|
| **5 LLM providers** | Gemini, OpenAI, Anthropic, DeepSeek, **Ollama** (local models) |
| **Streaming** | Real-time token display during translation |
| **Responsive stop** | Stop requests cancel in-flight Ollama and cloud-provider stage calls, then halt after the current unit |
| **Standard pipeline** | Single translation pass with model, provider, prompt, and optional persona |
| **Editorial pipeline** | Three-stage Translation → Refine → Format, each with its own model and prompt |
| **Test / Production mode** | Test on a single chunk before committing to a full run; config stays editable until you switch to Production |
| **AI Judge** | LLM-as-a-judge audit with semantic quality ratings, categorized issues, and fixes |
| **Glossary** | Keyword registry enforced across all stages and the audit |
| **Import-aware segmentation** | Splits source text by paragraphs, keeps Markdown headings attached to following content, and can carry only genuinely short plain-text trailing blocks forward |
| **Project management** | Save/load projects with full pipeline config and translations |
| **File I/O** | Import `.txt`, `.md`, `.docx`, `.pdf`; export `.txt`, `.md`, `.html`, `.docx`, or bilingual Markdown |
| **Markdown-safe import** | Markdown imports preserve significant whitespace such as hard line breaks, indentation, and fenced-block spacing |
| **Secure keys** | API keys stored in OS keychain (GNOME Keyring / macOS Keychain / Windows Credential Manager) |
| **i18n** | English and Italian interface |
| **Desktop native** | Tauri v2 — lightweight binaries, no browser runtime |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18 (20 LTS recommended)
- [Rust](https://rust-lang.org/tools/install/) ≥ 1.77.2
- System libraries for Tauri (Linux only):
  ```bash
  sudo apt update
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
    libgtk-3-dev libsecret-1-dev
  ```

### Install Rust

Linux, macOS, or WSL:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version
cargo --version
```

Windows:

1. Install Microsoft Visual Studio C++ Build Tools with **Desktop development with C++**.
2. Install Rust with `winget install --id Rustlang.Rustup` or download `rustup-init.exe` from [rust-lang.org/tools/install](https://rust-lang.org/tools/install/).
3. Use the MSVC toolchain:
   ```powershell
   rustup default stable-msvc
   rustc --version
   cargo --version
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

### Development checks

```bash
npm run lint
npm test
npm run build
cd src-tauri
cargo test
```

### Verify release downloads

GitHub Releases include machine-readable SHA-256 checksum files so you can verify downloaded assets before running them.

Windows PowerShell:
```powershell
Get-FileHash .\Glossa-setup.exe -Algorithm SHA256
```

Windows CMD:
```cmd
certutil -hashfile Glossa-setup.exe SHA256
```

Compare the resulting hash with the corresponding entry in `SHA256SUMS-*.txt`.

Note: Tauri updater artifacts are also signed for in-app update verification, but that signature is separate from Windows Authenticode code signing and does not suppress SmartScreen warnings.

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

In the configuration panel (sidebar in **Sandbox** mode, gear icon in **Document** mode):

- Choose source and target languages
- Configure the translation pass (Translation tab):
  - Set the **provider**, **model**, and **translation instructions**
  - Toggle **Rolling context** to pass the tail of the previous chunk as background context
- Optionally set a **Persona** (Settings tab) to define the translator's voice and domain — replaces the default opener with your custom system prompt
- Set up the **Quality Control** tab with a judge model, audit prompt and coherence prompt
- Add terms to the **Term Registry** tab to enforce consistent terminology

### 2. Run the pipeline

**Sandbox mode** — single text, no chunking:

1. Paste your source text in the center panel
2. Click **"Stage Content"** to prepare it
3. Click **"Begin Pipeline"** — tokens stream in real time for each stage
4. Review the candidate translation and edit it manually if needed

**Document mode** — long texts split into chunks:

1. Import a file (`.txt`, `.md`, `.docx`, `.pdf`) via the upload icon
2. Set segmentation options in the preview dialog and confirm
   - In Markdown mode, isolated `#` headings stay attached to the paragraph that follows
   - Markdown imports preserve significant whitespace before chunking
3. Open the document — you are now in **Configure** phase with the pipeline fully editable
4. **Test** the pipeline on a single chunk first:
   - The run bar defaults to **Test mode** (flask icon)
   - Click the run button — Glossa processes one chunk and marks it as *preview*
   - Inspect the result in the translation pane; config remains unlocked
   - Repeat until satisfied, then switch to **Production mode** (lightning icon)
5. Click run in **Production mode** to translate all remaining chunks
6. Navigate chunks via the **Insights** panel (Index tab) and review the audit results

If a batch is interrupted, the next run resumes and skips chunks already completed. If a full batch already finished, running it again reprocesses every chunk that is not explicitly locked.

### 3. Review the audit

**Chunk-level** (Insights panel → Audit tab, Document mode / right panel in Sandbox):

- **Quality rating** for each chunk
- **Issues** categorized by type (glossary, fluency, accuracy, grammar, consistency) and severity
- **Suggested fixes** for each issue
- Click **"Re-Evaluate Drafts"** after manual edits to get an updated quality rating
- Lock a translation when you want to keep it out of later full-document reruns

**Document-level coherence** (Insights panel → Coherence tab, Document mode):

- Cross-segment consistency check using the Coherence prompt
- Run after all chunks are complete for a holistic terminology review

### 4. Projects and files

- **📂 Projects**: Save your entire pipeline config + translations. Reload anytime.
- **⬆ Import**: Load `.txt`, `.md`, `.docx`, or `.pdf` files via native OS dialog
- **⬇ Export**: Save as `.txt`, `.md`, `.html`, `.docx`, or bilingual `.md` (source + translation + audit)
- **💾 Save**: Persist the current project state to SQLite

### 5. Stop, resume, and rerun

- **Stop** is best-effort immediate cancellation for the in-flight provider request; Glossa then stops cleanly without continuing to later stages or chunks.
- **Resume** appears after an interrupted batch and continues from the unfinished chunks.
- **Run again after completion** starts a new batch round and preserves only chunks you have explicitly locked.

## Architecture

```
┌──────────────────────────────────────────┐
│  Frontend (React 19 + Zustand + Vite)    │
│  ├── ConfigDrawer     (pipeline setup)   │
│  ├── DocumentView     (chunk editor)     │
│  ├── InsightsDrawer   (audit + index)    │
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

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, commit conventions, and the release process.

## License

GNU GPL v3.0 or later — see [LICENSE](LICENSE) for details.
