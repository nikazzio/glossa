---
title: Installation and first project
---

# Installation and first project

Glossa is a desktop application for consulting digitised sources and translating
documents with language models. Its React frontend communicates with a Rust
backend through Tauri, and working data is stored in a local SQLite database.

This documentation follows the `main` branch and may cover features newer than
your installed release. See [project status](../project/status) for the current
beta limitations.

## Installation

Download the package for your operating system from
[GitHub Releases](https://github.com/nikazzio/glossa/releases). Distribution
formats include Windows installers, macOS disk images, and AppImage, DEB and
RPM packages for Linux. Check the assets attached to your chosen release.

Remote translation services require their own credentials. Local processing
requires a running Ollama server and a downloaded model. Configure your
connection under **Settings → Provider**.

## Your first translation project

1. Create a workspace: a group of projects and shared resources.
2. Create a project in that workspace and import a document.
3. Check the extracted text and segment boundaries in the import preview.
4. Set the languages, pipeline mode, providers and models for the active stages.
5. Run a test on a representative segment and compare the result with the source.
6. Process the remaining segments, review the translations and export the document.

The [translation guide](../guides/document-pipeline) explains execution and
segment states. To work with digitised material, start with
[source search](../guides/source-search).

## Running from source

Development requires Node.js `^20.19.0` or `>=22.12.0`, npm `>=11`, Rust and
the Tauri system dependencies. Node.js and npm requirements are declared in
`package.json`; system dependencies are listed in the
[README](https://github.com/nikazzio/glossa#develop).

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm install
npm run tauri:dev
```

`tauri:dev` starts both Vite and the desktop application.
`npm run tauri:build` produces distribution packages using the release configuration.

## Local documentation and deployment

```bash
npm run docs:start
npm run docs:build
```

The first command starts VitePress at `127.0.0.1:3001`; the second generates
the site in `docs/.vitepress/dist`. Italian content lives in `docs/` and English
content in `docs/en/`. Navigation and locales are configured in
`docs/.vitepress/config.ts`.

The documentation workflow deploys to GitHub Pages after a push to `main`
that changes a configured path, including `docs/`, the workflow itself or the
npm manifests. Merges that do not affect those paths do not trigger deployment.
Internal development notes live in `docs-dev/`.
