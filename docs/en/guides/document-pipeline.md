---
title: Document pipeline
---

# Document pipeline

Glossa is built around a four-phase document workflow:

1. **Configure** the translation pipeline, glossary, and language pair.
2. **Test** one chunk first so you can inspect output without locking the whole document.
3. **Translate** the full document once the setup is stable.
4. **Review** the audit results and iterate if the quality needs work.

The underlying reasoning is explained in [LLMs and pipelines](./llm-and-pipelines):
a language model is powerful but probabilistic, so Glossa splits work into chunks,
stages, and audit passes to keep each step controllable.

## Document workflow

Glossa uses the document workflow even for short trials. The path stays the same:
create or open a project, import or paste the source text, review chunking, and
use **Test** on one representative chunk before starting a batch.

| Area | What you control | When to use it |
|---|---|---|
| Import and preview | Source text, segmentation, initial chunks | Before creating the active chunk list |
| Pipeline config | Languages, providers, models, prompts, glossary | Before Test and before long batches |
| Document view | Current chunk, output, states, runs | During translation and review |
| Chunk rail | References, Preview, Audit, Memory, Notes | During quality control and chunk closure |
| Insights panel | Index, search, statistics, coherence, glossary | On the whole document, at any stage |

## DeepL Hybrid Mode

The **DeepL Hybrid** mode combines the speed and precision of the DeepL API with the contextual refinement of an LLM:

| Stage | Provider | Role |
|---|---|---|
| Stage 1 | DeepL API | Main translation |
| Stage 2 | Optional LLM | Style and register refinement |
| Judge | LLM | Quality audit (unchanged) |

**Requirements:** DeepL API key configured in Settings → provider section.

**When to use it:** Texts that require high terminological fidelity and speed, where an LLM alone would need too much context or elaborate prompts.

**Formality:** For languages that support it (German, Italian, etc.), you can set the formal/informal register directly in the DeepL stage.

**DeepL Glossaries:** You can build a DeepL glossary from the terms in your Glossa glossary assigned to the pipeline, so DeepL automatically respects your terminology.

## Standard document flow

1. Import a document or prepare a short sample.
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
| DeepL Translation | Produces the first translation through the DeepL API when DeepL Hybrid is active |
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

## Previewing the message before you launch

In the chunk panel, the **Preview** tab (after References) shows the literal message —
system instructions and user text — that would be sent to the engine for the chosen
stage on the open chunk. Build it on demand with the dedicated button: nothing runs
for real, nothing costs, nothing gets written to the chunk. Useful for checking exactly
what the model will receive before starting a translation or an editing stage.

## See also

- [Annotations](./annotations) — for tracking editorial findings per chunk
- [LLMs and pipelines](./llm-and-pipelines) — why Glossa separates chunks, stages, and audit
- [Audit and review](./audit-review) — detailed review loop with the judge
- [Context and caching](./context-and-caching) — how Glossa uses context across adjacent chunks
- [Pipeline config](../reference/pipeline-config) — full reference for all controls
