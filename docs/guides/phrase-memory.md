---
title: Phrase memory
---

# Phrase memory

La phrase memory aiuta Glossa a riutilizzare frammenti sorgente-target già approvati
quando ricompare una formulazione simile.

> Questa pagina è una panoramica rapida. Per il workflow completo, leggi [Glossario e phrase memory](./glossary-and-memory).

## What it stores

- Short source phrases
- Approved target phrases
- Confidence values for the extracted pair

## How it is used

1. Enable phrase memory in the workspace or pipeline settings.
2. Let Glossa search for matching phrases automatically, or trigger a manual refresh.
3. Review the matches that come back for the current chunk.
4. Select only the matches you want to inject into the run.

## Good practice

- Keep the source text stable when you want reliable phrase reuse.
- Treat phrase memory as a helper, not an automatic replacement for editorial judgment.
- Review the selected matches before relying on them in production.
