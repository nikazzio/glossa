---
title: Phrase memory
---

# Phrase memory

Phrase memory helps Glossa reuse previously approved source-target fragments
when similar wording appears again.

> This page is a compact overview. For the full workflow, read [Glossary and phrase memory](./glossary-and-memory).

## What it stores

- Short source phrases
- Approved target phrases
- Confidence values for the extracted pair

## How it is used

1. Enable phrase memory in the workspace or pipeline settings.
2. Let Glossa search for matching phrases automatically, or trigger a manual refresh.
3. Review the matches that come back for the current chunk.
4. Select only the matches you want to inject into the run.

## When to avoid it

Disable or ignore matches when the text changes register, narrative voice, or domain.
Lexical similarity is not enough: a retrieved phrase must make sense in the current
chunk and in the document you are translating.

## Good practice

- Keep the source text stable when you want reliable phrase reuse.
- Treat phrase memory as a helper, not an automatic replacement for editorial judgment.
- Review the selected matches before relying on them in production.
