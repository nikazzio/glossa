---
title: Document pipeline
---

# Document pipeline

Glossa is built around a four-phase document workflow:

1. **Configure** the translation pipeline, glossary, and language pair.
2. **Test** one chunk first so you can inspect output without locking the whole document.
3. **Translate** the full document once the setup is stable.
4. **Review** the audit results and iterate if the quality needs work.

## Two working modes

| Mode | Best for | What changes |
|---|---|---|
| Sandbox | Short passages, prompt tuning, isolated experiments | No document import, no chunk list |
| Document | Real texts, long-form translation, review workflows | Chunking, index, audit, notes, export |

Use Sandbox when you want fast iteration on a sample. Use Document mode when
the text needs structure, continuity, and review history.

## Standard document flow

1. Import a document.
2. Choose chunking and confirm the import preview.
3. Set the source and target languages.
4. Choose the provider and model for each active stage.
5. Add glossary entries or phrase-memory retrieval if the project needs terminology control.
6. Run a test chunk.
7. Review the candidate translation, audit findings, and chunk metadata.
8. Switch to production mode and process the remaining chunks.
9. Lock or revise chunks as you complete editorial review.

| Run state | Purpose |
|---|---|
| Test | Preview one chunk and keep the config editable |
| Production | Process all remaining chunks |

## Stage behavior

| Stage | Purpose |
|---|---|
| Translation | Produce the first candidate from the source chunk |
| Refine | Rewrite the candidate with better style, accuracy, or terminology |
| Format | Clean the output format without re-translating the source |
| Judge | Evaluate the result and report structured issues |
| Coherence | Check consistency across translated chunks when enabled |

Editorial mode exposes more of these stages explicitly. Standard mode keeps the
workflow lighter.

## What you review at each phase

| Phase | Main question |
|---|---|
| Configure | Are languages, stages, prompts, and glossary correct? |
| Test | Is one representative chunk good enough to scale out? |
| Translate | Is the batch progressing cleanly and producing stable chunks? |
| Review | Which chunks still need editorial intervention? |

## What survives between runs

- Completed chunks are not recomputed unless you explicitly re-run them
- Cancelled batches resume from already completed work when possible
- Test runs do not lock the whole configuration
- Review data and annotations stay attached to the chunk they describe

## Common mistakes

- Switching provider and prompt at the same time, then not knowing what changed
- Moving to Production before one difficult chunk has passed Test cleanly
- Using the format stage to repair translation errors instead of formatting only
- Treating chunk completion as final acceptance without reading the audit

## Practical rules

- Stay in **Test** until the prompt, glossary, and model choice stop moving.
- Use **Production** only when you want the remaining document to follow the same setup.
- If the formatting stage starts changing meaning, remove or simplify it.
- If a chunk is difficult, [annotate it](./annotations) instead of relying on memory alone.

## See also

- [Annotations](./annotations) — for tracking editorial findings per chunk
- [Audit and review](./audit-review) — detailed review loop with the judge
- [Context and caching](./context-and-caching) — how Glossa uses context across adjacent chunks
- [Pipeline config](../reference/pipeline-config) — full reference for all controls
