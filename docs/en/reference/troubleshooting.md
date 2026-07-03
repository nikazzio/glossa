---
title: Troubleshooting
---

# Troubleshooting

This page covers the common failures you are likely to hit while setting up or running Glossa.

## The app does not start

- Verify `npm install` completed successfully
- Re-run `npm run tauri:dev`
- On Linux, install the Tauri system packages listed in the root `README.md`

## The app opens but shows a connection error

- The dev server uses a dedicated port (`48123`); if another process already holds it, Vite stops with a readable error instead of opening a broken window
- If the message points to a port other than 48123, override it: `GLOSSA_DEV_PORT=9999 npm run tauri:dev` (Linux/macOS) — on Windows PowerShell `$env:GLOSSA_DEV_PORT=9999; npm run tauri:dev`, on cmd.exe `set GLOSSA_DEV_PORT=9999 && npm run tauri:dev`
- This only applies to running from source: the installed app (`.deb`/`.AppImage`/`.msi`/`.dmg`) has no dev server and is not affected

## A provider does not run

- Check that the API key exists in Settings
- Verify that the selected model is valid for that provider
- Keep the provider fixed while debugging; do not change prompt and provider at the same time

## The audit is noisy or inconsistent

- Re-test on one representative chunk
- Simplify the translation prompt before rewriting the judge prompt
- Remove weak phrase-memory matches
- Check whether the glossary is too vague to enforce consistently

## Ollama is unavailable

- Start the local server with `ollama serve`
- Verify the model is installed with `ollama list`
- Use a smaller model or reduce chunk size if local inference is timing out

## The output quality is unstable

- Move back to Test mode
- Reduce prompt complexity
- Tighten the glossary to mandatory terms only
- Review phrase-memory matches before reusing them

## A document import looks wrong

- Re-open the import preview and inspect the chunking
- Prefer Markdown import when headings and structure matter
- Use smaller chunk sizes if long passages are being grouped too aggressively

## Build or CI problems

- `npm run lint` checks the frontend TypeScript surface
- `npm test` runs the frontend test suite
- `npm run docs:build` validates the VitePress site
- `cargo check --all-targets` and `cargo test` validate the Tauri backend
- The docs site is static; if it breaks, verify `docs/.vitepress/config.ts`, markdown links, and public assets first
