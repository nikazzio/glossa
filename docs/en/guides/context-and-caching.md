---
title: Context and caching
---

# Context and caching

Glossa uses two mechanisms to keep translations consistent across chunks and limit
inference costs: a document reference block that gives each chunk access to the
source text of its neighbours, and a layered prompt structure that lets providers
cache as much as possible between calls.

This page describes the technical behavior. For the product reasoning behind the
pipeline design, read [LLMs and pipelines](./llm-and-pipelines) first.

## Document context per chunk

When translating a chunk, Glossa automatically sends the source text of adjacent
chunks as a reference block. The model uses it to keep terminology, names, pronouns,
and style consistent across chunk boundaries — without having to see the full
document at once.

For short documents the block covers the entire source; for longer documents it
covers a sliding window of adjacent chunks. The block is provided as context only:
the model receives explicit instructions to translate only the current chunk, not
the reference block content.

## Layered prompt caching

Each prompt contains three reusable layers, followed by the variable current chunk
or the output from the previous stage. This structure helps the provider reuse as
much previously computed context as possible:

| Layer | Content | Caching |
|---|---|---|
| 1 | Persona, structural rules, glossary | Cached once per run |
| 2 | Document reference block | Cached per group of adjacent chunks |
| 3 | Stage-specific instructions | Sent each call — the smallest part |

The current chunk text comes after these layers. It changes on every call, so it is
not the part Glossa tries to make cacheable.

## Stage isolation

Each stage receives exactly the information it needs — nothing more. This prevents
inadvertent re-translation and keeps each stage focused on its specific task.

| Stage | Receives |
|---|---|
| Translation | Source text of current chunk + reference block |
| Refine | Source text + reference block + translation output |
| Format | Translated text only — no source, no reference block |
| Coherence audit | Adjacent translated chunks — no source |

The Format stage receives only the translation by design: if it also received the
source, the model might re-translate instead of cleaning formatting only.

## What this means in practice

After the first chunk in a group is processed, subsequent chunks in the same group
cost less because the provider reuses the already-cached layers. On long documents
with many chunks the savings are significant, especially in Editorial mode where
three stages run per chunk.

## Cache retention by model

Cache lifetime varies by provider and model. OpenAI, for example, distinguishes
two policies:

- **Full models**: extended retention up to 24 hours — subsequent chunks benefit
  from a previous run's warm cache even across sessions.
- **Mini/nano models**: in-memory retention — the prefix expires after 5–10 minutes
  of inactivity.

This explains why the Refine stage (typically on a mini model) may show 0% cache
hits even with an identical prompt: if more than 10 minutes pass between chunks,
the cache has already expired.

The figures above (24 hours, 5–10 minutes) reflect observed behaviour and are not contractual guarantees — providers may change them without notice. Check your provider's documentation for the retention policy of the model you are using.

## Anthropic: opt-in caching with extended TTL

Unlike other providers, Anthropic caching is **off by default** and must be turned
on by hand in the pipeline settings. Reason: with Glossa's typical usage pattern
(one chunk at a time, often minutes or hours apart) the default 5-minute cache
would almost always expire before it's reread, and turning it on without a reason
would only cost the write surcharge, never save anything.

If needed, you can also extend the cache lifetime to 1 hour instead of the default
5 minutes — useful when a slow stage sits between two Anthropic chunks in the
pipeline (e.g. a local provider). It costs double on writes instead of 1.25x. See
[Pipeline config](../reference/pipeline-config) for details on both controls.

## See also

- [Pipeline config](../reference/pipeline-config) — how to configure stages and models
- [LLMs and pipelines](./llm-and-pipelines) — theoretical principles behind chunks, stages, and the judge
- [Audit and review](./audit-review) — how the judge evaluates each chunk's output
