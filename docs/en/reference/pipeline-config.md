---
title: Pipeline config
---

# Pipeline config

Glossa separates pipeline configuration from document content so you can tune
the run before starting a batch.

If you want to understand why controls are split by stage, also read
[LLMs and pipelines](../guides/llm-and-pipelines): it explains why translation,
refinement, formatting, and judging have different responsibilities.

## Main controls

- Source language
- Target language
- Pipeline mode
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
| DeepL Hybrid | DeepL first pass, optional LLM refinement, and LLM audit |

## Stage-level advice

- Keep the translation stage focused on accuracy and basic style.
- In DeepL Hybrid, use the DeepL stage for the first draft and keep LLM prompts/models separate for refinement and judging.
- Use refine for rewriting, not for first-pass translation.
- Keep format narrow so it does not silently alter meaning.
- Use the judge to report issues, not to replace human review.

## Advanced Ollama options

Use the advanced JSON block only when the local provider has given you specific
options to send. It must contain a **JSON object**: a list, a single value, or
invalid JSON is not saved in the pipeline configuration.

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
- DeepL stages are measured in billed characters by DeepL: Glossa can show those after the run, but the dollar estimate remains based on token-priced LLM providers.

## Temperature for stages and the judge

Next to the reasoning control (where present), every stage and the judge have an
optional temperature control — how much the model varies from the most likely
response. Low value = more deterministic, repeatable output; high value = more variation.

- **Anthropic** and **Gemini**: always available, range 0–1 for Anthropic, 0–2 for Gemini.
- **OpenAI** and **DeepSeek**: only available when reasoning for that stage is set to
  "none" or the model doesn't reason at all — both providers reject or ignore the
  parameter while actively reasoning. Range 0–2.

If you don't touch the control it stays at 0 (maximum precision). Raise it for more
stylistic variety, keep it low for technical or philological translation where precision
matters.

## Translation examples (few-shot)

In the pipeline settings you can keep a small set of whole translations (cap of 5,
2-3 recommended) picked by hand as a style example for the whole run — different
from phrase memory, which suggests one-off sentence pairs.

To add one: in the chunk's Audit tab, after locking it with a rendering you consider
exemplary, press the dedicated button (it also shows how many examples you've
already saved). The example shows up immediately here in the settings, where you
can review, shorten, or remove it.

## Anthropic caching with extended TTL

For Anthropic providers, prompt caching is **off by default** and must be turned on
explicitly in the pipeline settings:

- With Glossa's typical usage pattern (one chunk at a time, often minutes or hours
  apart), the default cache would expire before it's ever reread — turning it on
  without a reason would only cost the write surcharge, never save anything.
- Turn caching on only if you're working through chunks in quick succession.
- If a slow stage sits between two Anthropic chunks in the pipeline (e.g. a local
  provider), extend the cache lifetime to 1 hour instead of the 5-minute default —
  it costs double on writes instead of 1.25x, but avoids losing the cache while
  waiting on the slow stage.

## See also

- [Provider support](./provider-support) — provider comparison and model selection guide
- [LLMs and pipelines](../guides/llm-and-pipelines) — principles behind stage separation
- [Document pipeline](../guides/document-pipeline) — how settings apply to the end-to-end workflow
- [Context and caching](../guides/context-and-caching) — how the prompt is structured to optimise costs
