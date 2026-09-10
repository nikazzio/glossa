---
title: Getting started
---

# Getting started

Glossa is in beta: read the [current status and limitations](../project/status).
Guides follow main and can describe features newer than your installed build.

Glossa is a Tauri desktop app. You run it locally, configure a translation
pipeline, import or prepare source text, and work chunk by chunk: test one
representative passage first, then run the full batch.

## Download the app

If you want to use Glossa, the correct path is to download a binary release from GitHub. The repository is for development and contribution, not the primary end-user install path.

- Windows: `.exe` installer or `.msi` package
- macOS: `.dmg`
- Linux: `.AppImage`, `.deb`, or `.rpm`

Useful links:

- [Latest release](https://github.com/nikazzio/glossa/releases/latest)
- Read the selected release notes: its number does not certify beta completion.

## Prerequisites

- Node.js and npm at the versions declared in [`package.json`](https://github.com/nikazzio/glossa/blob/main/package.json), `engines` field
- Current stable Rust
- `npm` for frontend dependencies
- Linux users also need the system libraries listed in the [development guide](https://github.com/nikazzio/glossa#develop)

## Develop from source

Clone the repository only if you want to develop Glossa, test local changes, or contribute code.

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm install
```

## Run the desktop app in development

```bash
npm run tauri:dev
```

This starts the Vite frontend and the Tauri shell together.

## Build the app locally

```bash
npm run tauri:build
```

## Run the docs locally

```bash
npm run docs:start
```

Build the static docs site with:

```bash
npm run docs:build
```

## Recommended first-run path

1. Open the app and configure your provider credentials in **Settings**.
2. Create or open a workspace and then create a project.
3. Set the source and target languages.
4. Choose a provider and model for the first stage.
5. Import a document. For a short trial, import or paste only a sample and use **Test** on one chunk.
6. Run a test chunk before launching a full batch.

## What you should configure first

- **Provider keys** in Settings
- **Pipeline mode**: Standard for simpler jobs, Editorial for multi-stage refinement, DeepL Hybrid when you want a DeepL first pass followed by LLM refinement
- **Glossary** if terminology is non-negotiable
- **Chunking** if the source text is long or structurally sensitive

## Local docs and app scope

- `docs/` is the public static site
- `docs-dev/` holds internal notes for maintainers
- `src/` and `src-tauri/` are the actual application codebases

## Development checks

```bash
npm run lint:all
npm test
npm run build
```

Backend checks are run from `src-tauri/`:

```bash
cargo check --all-targets
cargo test
```

## Next steps

- Read the [document pipeline guide](../guides/document-pipeline)
- Read [glossary and phrase memory](../guides/glossary-and-memory)
- Read [audit and review](../guides/audit-review)
- Review [keyboard shortcuts](../guides/keyboard-shortcuts)
- Check [provider support](../reference/provider-support)
