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

The segment panel has two separate tabs, for two different moments of the work:

**Memory tab — creating new phrases**: a phrase only enters the collection from a segment you have **locked** (the translation is final). Lock the segment, click "Extract phrases": Glossa proposes a list of candidate source/translation pairs. Review them one by one — accept, discard, or fix the text — and you can also add pairs manually. Only once you confirm are the accepted phrases saved to the workspace collection. If you switch to another segment mid-review, the unconfirmed work is still there waiting for you when you come back.

**References tab — reusing already-saved phrases**: here you see the matches found for the open segment, with an adjustable similarity threshold, plus the entire project glossary (always included in the translation). Only the matches you check are actually sent as reference the next time you translate or rerun that segment — matches that are found but left unchecked stay visible but are ignored.

## When to avoid it

Disable or ignore matches when the text changes register, narrative voice, or domain.
Lexical similarity is not enough: a retrieved phrase must make sense in the current
chunk and in the document you are translating.

## Good practice

- Keep the source text stable when you want reliable phrase reuse.
- Treat phrase memory as a helper, not an automatic replacement for editorial judgment.
- Review the selected matches before relying on them in production.
