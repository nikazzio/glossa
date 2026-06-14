---
title: Pipeline config
---

# Pipeline config

Glossa separates pipeline configuration from document content so you can tune
the run before starting a batch.

## Main knobs

- Source language
- Target language
- Provider and model per stage
- Translation instructions
- Persona
- Glossary / term registry
- Phrase-memory settings
- Audit / judge settings

## Pipeline modes

| Mode | Description |
|---|---|
| Standard | Single translation pass plus audit |
| Editorial | Translation, refine, and formatting stages before audit |

## Execution rules

- Test mode processes one chunk and leaves the configuration editable.
- Production mode processes the full document.
- A cancelled run resumes from the already completed chunks when possible.

## When to change config

Change the configuration before a full run if you need a different provider,
prompt, or glossary behavior. If you only need to inspect a result, prefer Test
mode over changing the whole pipeline.
