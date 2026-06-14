---
title: Document pipeline
---

# Document pipeline

Glossa uses a four-phase document workflow:

1. **Configure** the translation pipeline, glossary, and language pair.
2. **Test** one chunk first so you can inspect output without locking the whole document.
3. **Translate** the full document once the setup is stable.
4. **Review** the audit results and iterate if the quality needs work.

## Standard workflow

1. Import a document.
2. Set the source and target languages.
3. Choose the provider and model for each stage.
4. Configure the glossary or phrase-memory settings if you need terminology control.
5. Run a test chunk.
6. Review the candidate translation and the audit output.
7. Switch to production mode and process the full document.

## Modes

| Mode | Purpose |
|---|---|
| Sandbox | Single text, no chunking |
| Document | Full import with chunking and review panes |

| Run state | Purpose |
|---|---|
| Test | Preview one chunk and keep the config editable |
| Production | Process all remaining chunks |

## Output you should expect

- Draft translations for each chunk
- Audit feedback with quality ratings and issues
- Optional annotations when you convert audit findings into notes

## Practical rule

If the document is still changing, stay in Test mode. Move to Production only
when the configuration is stable enough that repeated chunk processing is useful.
