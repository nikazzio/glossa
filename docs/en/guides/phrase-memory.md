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

**Memory tab — creating new phrases**: a phrase only enters the collection from a segment you have **locked** (the translation is final). Phrases already saved for that segment load automatically when you open the tab, already checked and labeled "already saved". Lock the segment and click "Extract phrases" (a separate button) to have Glossa propose new ones: they are added below the ones already shown, without identical duplicates. Review each row — check/uncheck it, fix the text if needed — and you can also add pairs manually. The "Save" button is always visible at the top: pressing it saves whatever is checked at that moment — if you unchecked an already-saved phrase, it is genuinely removed from the collection (no separate delete button needed). If you switch to another segment mid-review, the unconfirmed work is still there waiting for you when you come back.

**References tab — reusing already-saved phrases**: here you see the matches found for the open segment, with an adjustable similarity threshold. Only the matches you check are actually sent as reference the next time you translate or rerun that segment — matches that are found but left unchecked stay visible but are ignored. The project glossary isn't repeated here: it's always shown in full in its own tab on the right-hand panel.

## When to avoid it

Disable or ignore matches when the text changes register, narrative voice, or domain.
Lexical similarity is not enough: a retrieved phrase must make sense in the current
chunk and in the document you are translating.

## Good practice

- Keep the source text stable when you want reliable phrase reuse.
- Treat phrase memory as a helper, not an automatic replacement for editorial judgment.
- Review the selected matches before relying on them in production.

## Translation examples (different from phrase memory)

Beyond single phrases, you can pin 2-3 whole segment translations as a style example
for the entire pipeline: they steer register and tone on every following segment,
rather than suggesting specific pairs like phrase memory does.

To add one: lock a segment whose translation you consider a good example — usually
after checking the Audit tab and confirming it looks right — then in that same Audit
tab click "Use as style example", which also shows how many examples you've saved so
far. The example shows up right away in the pipeline Settings, where you can review it,
shorten it, or remove it. A small cap (5 examples) keeps every following translation
from being weighed down unnecessarily.
