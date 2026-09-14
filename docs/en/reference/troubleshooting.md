---
title: Troubleshooting
---

# Troubleshooting

To diagnose a problem, identify the operation, the message received and the
service involved. Keep other parameters unchanged while investigating one cause.

## Connection or credentials

If a stage does not start, check its key, model and, for Custom, selected
profile under **Settings → Provider**. Authentication errors, unavailable
models and exhausted quotas require different actions. Custom remote endpoints
must use HTTPS; HTTP is accepted only for supported local addresses.

For Ollama, check the server URL, connection status and installed model.
`ollama list` lists installed models; `ollama serve` starts the server when
your installation does not already manage it. For inference timeouts, check
context size and available resources.

In DeepL Hybrid, distinguish failures in the initial DeepL stage from failures
in subsequent LLM stages. An exhausted character quota or incompatible remote
glossary cannot be fixed by changing the evaluator’s prompt.

## Empty or incomplete search

Check that the source supports keyword search and that an identifier follows
the displayed example. In federated search, check how many sources completed
and which failed. Filters operate on returned metadata; missing values can
leave a result unverified.

A record without an accessible digital copy is marked unavailable. A network
error does not establish that the work is absent. If results came from the
cache, use refresh to request a new response.

## Missing pages and waiting jobs

Check whether the viewer is restricted to local files and whether the selected
version contains the page. Also check that the repository drive is connected.
For missing or damaged files, run a repository check and review any recovery
offer.

A waiting job may be observing a network limit; its details show whether a
retry is scheduled. A paused job instead requires an explicit resume. Before
deleting files used by a paused job, cancel the job: pausing preserves its
ability to resume writing.

## Import or translation problems

A UTF-8 error requires converting the text file to that encoding. For DOCX
and PDF, check the extracted text before translating. A scanned PDF requires
OCR outside the current import workflow.

If the translation is unsuitable, test a representative segment and compare
stage outputs. Check the glossary, selected references and instructions.
Inconsistent assessments must be checked against the text; do not apply a
change solely because a model proposed it.

## Saving and backups

If the status bar reports a failed save, check access to the data directory
and available disk space. Treat changes as unsaved until completion is shown.

An incompatible or invalid backup is rejected before restoration. An encrypted
archive requires a password or recovery code. Missing images after restoration
do not necessarily indicate a failure: repository files are
[excluded from backups](./backup-and-restore).

## Running from source

This section concerns development, not installed packages. Vite uses port
`48123`; a port conflict prevents startup. To select another port:

```bash
# Linux and macOS
GLOSSA_DEV_PORT=9999 npm run tauri:dev
```

```powershell
# Windows PowerShell
$env:GLOSSA_DEV_PORT=9999
npm run tauri:dev
```

Also check the dependencies in the [installation guide](../intro/getting-started).
Distributed desktop packages do not use the development server.

## Reporting a problem

Include the Glossa version, operating system, action taken, expected result
and actual message. The operations console shows stages and requests; the
in-app guide provides the log directory. Prompt details may contain document
text, so review them before sharing. For additional technical diagnostics,
the application can be started with `RUST_LOG=debug`.
