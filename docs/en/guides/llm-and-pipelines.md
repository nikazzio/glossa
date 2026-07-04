---
title: LLMs and pipelines
---

# LLMs and pipelines

Glossa uses language models inside a controlled document workflow. The pipeline is
not there to make the work look more complex: it turns a probabilistic model into an
editorial process that can be repeated, inspected, and kept manageable on long texts.

## What an LLM actually does

An LLM receives text as input and generates the most likely continuation, token by
token, based on the context it was given. It does not keep a stable memory of your
project, it does not understand the document like a human reader, and it does not
automatically preserve decisions from a previous call.

That has three practical consequences:

- context must be prepared deliberately;
- instructions must be stable and unambiguous;
- output needs a separate review pass and human judgement.

The benefit is that an LLM can adapt style, register, and terminology better than a
traditional mechanical translation system. The risk is that, when too many jobs are
packed into one prompt, it may mix different responsibilities: translating, rewriting,
fixing, formatting, and judging at the same time.

## Why not use one huge prompt

A single prompt looks simpler, but it becomes fragile on long texts.

| Problem | Real workflow effect |
|---|---|
| Too much context | The model loses attention on local details |
| Mixed instructions | A stylistic fix may alter meaning |
| Higher cost | Every call resends instructions and context that could be reused |
| Harder review | You cannot tell which step introduced an error |
| Fragile recovery | If one call fails, too much work has to be repeated |

Glossa splits the process into smaller steps so each decision is easier to read. The
document is segmented into chunks; each chunk passes through stages with separate
responsibilities; the result is audited and, when needed, corrected.

## Why the document is split into chunks

Models have a limited context window and cost grows with the amount of text sent.
Even when a model has a very large context window, sending the whole document on every
request is not a good strategy: it increases noise, weakens control, and makes recovery
after errors harder.

A chunk is the smallest unit of work in Glossa:

- it lets you test one representative passage first;
- it lets a batch resume from already completed chunks;
- it makes audit findings more precise;
- it keeps notes, corrections, and editorial state attached to a clear part of the text.

To preserve continuity, Glossa also sends a reference block containing adjacent chunks.
The model sees the context, but it is explicitly instructed to translate only the
current chunk.

## Why stages are separate

Each stage has a limited responsibility. This separation reduces silent errors and
makes it easier to understand where to intervene.

| Stage | Responsibility |
|---|---|
| Translation | Produces the first translation of the chunk |
| Refine | Improves style, register, accuracy, or terminology in the draft |
| Format | Cleans Markdown, notes, and structure without re-translating |
| Judge | Evaluates quality and reports structured issues |
| Coherence | Looks for inconsistencies across translated chunks |

The Format stage is intentionally narrow: it receives only the translation, not the
source. If it saw the source as well, it might re-translate instead of only cleaning
formatting.

The Judge is separate from generation for the same reason: the system that produces a
draft should not be the only reviewer of that draft. The judge does not replace human
review, but it helps catch omissions, glossary issues, grammar problems, and stylistic
drift.

## How the prompt is built

Glossa organises the prompt in layers. The order matters:

1. static project context: persona, rules, languages, glossary;
2. document reference block;
3. stage instructions;
4. current chunk text or output from the previous stage.

This structure keeps the reusable part of the prompt stable. When the provider supports
prefix caching, static layers can be reused between calls, reducing cost and latency.

The point is not only financial. Stable ordering makes the pipeline more predictable:
glossary and rules stay high in the prompt, document context stays separate from the
text to translate, and stage-specific instructions do not leak into other steps.

## Why Test mode exists

Test mode catches repeated mistakes before they spread through the whole document. A
representative chunk quickly shows whether:

- the chosen provider handles the text well;
- the prompt produces the right register;
- the glossary is respected;
- refinement actually improves the draft;
- formatting stays within its narrow role.

Only after Test mode is stable should you run production on the whole document.

## Providers and models are not interchangeable

Providers and models differ in cost, speed, available context, style, formatting
reliability, and audit quality. That is why Glossa lets you choose provider and model
per stage.

In practice:

- a cheaper model may be enough for formatting or simple passes;
- a stronger model may be needed for refinement, judging, or coherence;
- a local provider may be useful for privacy or offline work;
- DeepL can be used as a fast first pass, with an LLM refining afterwards.

The pipeline lets you combine those tradeoffs instead of forcing one model to do
everything.

## Review: what stays human

Glossa makes the work more controllable, but it does not decide for the reviewer. The
final decision on register, interpretation, philological fidelity, and acceptance of
the text remains human.

Use the pipeline to make errors visible, not to hide them. A good run is not a run with
no human intervention: it is a run where you know which passages were generated, which
were checked, and which still need attention.

## See also

- [Document pipeline](./document-pipeline) - end-to-end operational workflow
- [Context and caching](./context-and-caching) - details on context, chunks, and cache
- [Audit and review](./audit-review) - how to use the judge without delegating final decisions
- [Pipeline config](../reference/pipeline-config) - available controls for each stage

