<div align="center">

```text
  ██████╗ ██╗      ██████╗ ███████╗███████╗ █████╗
 ██╔════╝ ██║     ██╔═══██╗██╔════╝██╔════╝██╔══██╗
 ██║  ███╗██║     ██║   ██║███████╗███████╗███████║
 ██║   ██║██║     ██║   ██║╚════██║╚════██║██╔══██║
 ╚██████╔╝███████╗╚██████╔╝███████║███████║██║  ██║
  ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
```

**Sources, research and editorial translation**

A local desktop workbench for collecting and reading historical sources, organising research, and producing translations that go through staged model passes and human review. Built for philologists, classicists, and translators who need precision over speed.

[User documentation](https://nikazzio.github.io/glossa/) · [Beta status](https://nikazzio.github.io/glossa/project/status) · [Releases](https://github.com/nikazzio/glossa/releases/latest) · [Contributing](CONTRIBUTING.md)

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://v2.tauri.app)
[![Release](https://img.shields.io/github/v/release/nikazzio/glossa?display_name=tag)](https://github.com/nikazzio/glossa/releases/latest)
[![Beta](https://img.shields.io/badge/status-private%20beta-D7A76A)](https://nikazzio.github.io/glossa/project/status)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://rust-lang.org)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

</div>

---

**Glossa is in beta.** Release numbers reflect experiments with automated versioning; a 2.x tag does not mean the planned workbench is complete. The project is currently developed and tested by its maintainer, with no established external user base.

## What works today

- **Translation:** import text, Markdown, DOCX or text-based PDF; split it into passages; test a configurable pipeline; translate, revise and export.
- **Editorial control:** glossaries, phrase memory, annotations, translation history, AI review and document-level coherence checks. Human review remains essential.
- **Library:** search supported collections, save source records, organise them across workspaces, read IIIF pages and keep local image versions for offline use.
- **Long-running work:** persistent downloads, pause/resume, local image optimisation and integrity checks.
- **Recovery:** whole-app backups, optional password encryption and recovery code. Downloaded images are kept separately in the vault.
- **Providers:** Gemini, OpenAI, Anthropic, DeepSeek, Ollama and custom OpenAI-compatible endpoints; DeepL for the initial translation pass.
- **Interface:** Italian and English.

A workspace brings related research together without duplicating shared sources. The Library contains source materials; Language resources contains dictionaries and prompt templates.

## What is still being built

The complete transcription studio, OCR/HTR assistance, the approved-transcription-to-translation bridge, PDF reading/downloads within the Library, advanced export and the Analysis area are not complete. A visible area or an existing data model does not imply an operational workflow.

See the [completion roadmap](docs-dev/ROADMAP_2_0.md) for dependencies, acceptance criteria and remaining work. Scriptoria remains a technical and workflow reference for sources, storage, jobs, transcription and export; patterns are evaluated and adapted to Glossa.

## How translation works

Source text is split into passages and pushed through a configurable chain of
model passes, then reviewed by an AI judge. Each pass has its own provider,
model and prompt, and can be inspected on its own.

**Standard** — one pass plus review:

```
passage ──► translation ──► AI judge: rating, issues, suggested fixes
```

**Editorial** — three passes plus review:

```
passage ──► translation ──► refine ──► format ──► AI judge
```

**DeepL Hybrid** — DeepL produces the first draft, the model refines it.

A run has four phases:

| Phase | What happens |
|-------|--------------|
| **Configure** | Chain, language pair, glossary, phrase memory |
| **Test** | One representative passage, everything still editable, nothing locked |
| **Translate** | Full run across the unlocked passages |
| **Review** | Ratings, issues and suggested fixes, per passage and per document |

Output streams token by token. A candidate translation can be edited by hand,
the review can be re-run on its own, and a passage can be locked once it is
final.

## Try the beta

Glossa is a desktop application first: to use it, download a release build
instead of cloning the repository.

- **Windows** — `.exe` or `.msi` installer
- **Linux** — `.AppImage`, `.deb` or `.rpm`
- **macOS** — `.dmg`, Apple Silicon only

Latest build and its notes: [GitHub Releases](https://github.com/nikazzio/glossa/releases/latest).

The documentation follows development on `main`; a downloaded build can lag behind it. Check the version shown in the app against the release notes; the [beta status](https://nikazzio.github.io/glossa/project/status) page lists current limits.

For a first translation, create a workspace and project, import a short sample, configure a provider and run one passage in Test mode. Review the result before processing the full document. For source research, start with the Library guide.

Data stays on your computer except for requests you make to remote libraries or language providers. Local translation requires a running Ollama model. Provider credentials use the operating-system keychain when available, with an encrypted local fallback.

Beta data and backup formats may change. Current backups do not accept earlier formats. Keep useful source documents and exports alongside backups; read compatibility notes before switching builds.

## Develop

Node and npm requirements live in `package.json` under `engines`: Node **20.19+ or 22.12+** (Node 24 included) and npm 11. Rust: current stable. CI runs Node 22 and stable Rust.

Linux system dependencies:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev libsecret-1-dev
```

Windows needs Visual Studio C++ Build Tools and WebView2. macOS needs Xcode command-line tools.

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm ci
npm run tauri:dev
```

The development port defaults to 48123; set `GLOSSA_DEV_PORT` to override it.

```bash
npm run lint:all
npm test
# From src-tauri:
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Run focused checks during development. Browser smoke tests use a simulated desktop bridge; they do not replace testing an installed app. See [Contributing](CONTRIBUTING.md) for release and verification details.

## Project organisation

React/TypeScript provides the interface; Rust/Tauri handles native operations, network access and jobs; SQLite stores structured data. Downloaded images live separately from the database.

- [Development documentation](docs-dev/README.md): architecture, product boundaries and UI conventions.
- [Roadmap](docs-dev/ROADMAP_2_0.md): remaining capabilities and completion order.
- [User guides](https://nikazzio.github.io/glossa/): workflows and current limitations.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and [third-party attributions](ATTRIBUTIONS.md).
