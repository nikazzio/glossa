---
title: Getting started
---

# Getting started

Glossa is a desktop app built with Tauri, React, and Rust. You run it locally,
configure a pipeline, and process documents through the editor or document view.

## Prerequisites

- Node.js 18 or newer
- Rust 1.77 or newer
- Linux users also need the Tauri system libraries listed in the root README

## Install

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm install
```

## Run the app

```bash
npm run tauri:dev
```

## Build the app

```bash
npm run tauri:build
```

## Next steps

- Read the [document pipeline guide](../guides/document-pipeline)
- Review [keyboard shortcuts](../guides/keyboard-shortcuts)
- Check [provider support](../reference/provider-support)
