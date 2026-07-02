---
title: Pipeline config
---

# Pipeline config

Glossa separates pipeline configuration from document content so you can tune
the run before starting a batch.

## Main controls

- Source language
- Target language
- Provider and model per stage
- Translation instructions
- Persona
- Glossary / term registry
- Phrase-memory settings
- Audit / judge settings

## Typical configuration surfaces

| Surface | What you usually set there |
|---|---|
| Settings tab | Languages, run mode, general defaults, persona |
| Translation tab | Stage prompts, models, provider-specific options |
| Audit tab | Judge model, judge prompt, coherence prompt |
| Glossary area | Assigned glossary and term entries |

## What usually changes first

If a run is not good enough, change these in order:

1. Translation prompt
2. Provider or model
3. Glossary entries
4. Phrase-memory retrieval
5. Judge prompt

Leave everything else alone until you know which part is causing the failure.

## Pipeline modes

| Mode | Description |
|---|---|
| Standard | Single translation pass plus audit |
| Editorial | Translation, refine, and formatting stages before audit |

## Stage-level advice

- Keep the translation stage focused on accuracy and basic style.
- Use refine for rewriting, not for first-pass translation.
- Keep format narrow so it does not silently alter meaning.
- Use the judge to report issues, not to replace human review.

## Execution rules

- Test mode processes one chunk and leaves the configuration editable.
- Production mode processes the full document.
- A cancelled run resumes from the already completed chunks when possible.

## Stability advice

- Change one major variable at a time.
- Save the pipeline before large batch runs.
- If a project is stable, clone or rename a pipeline before experimenting.

## When to change config

Change the configuration before a full run if you need a different provider,
prompt, or glossary behavior. If you only need to inspect a result, prefer Test
mode over changing the whole pipeline.

## Cost estimate

Hovering over the info icon next to the estimated cost (in the pipeline settings panel, and next to the translate/run button in the document view) shows a per-stage breakdown with the approximate cost in dollars.

- In the pipeline settings panel the estimate always covers **the whole document**, including the coherence check if configured.
- Next to the run button in the document view, the estimate follows whatever is about to happen: in "translate chunk" mode it covers only the selected chunk, in "run all" mode it covers the whole document.
- This is an approximation based on word count and the chosen model's per-token price: the real cost may vary slightly.

## See also

- [Provider support](./provider-support) — provider comparison and model selection guide
- [Document pipeline](../guides/document-pipeline) — how settings apply to the end-to-end workflow
- [Context and caching](../guides/context-and-caching) — how the prompt is structured to optimise costs
