---
title: Context and prompt caching
---

# Context and prompt caching

Document context supplies references for translating a segment. Prompt caching
can reduce the processing cost of repeated request content. These are separate
mechanisms: including context does not mean the provider has cached it.

## Document context

Each segment can reference a group of source segments. Glossa builds a context
block from those references and explicitly identifies the segment to translate.
The block may cover a short document in full or a group of neighbouring
passages in a longer document.

Draft revision also receives the source. Formatting uses only translated text
with a dedicated prompt. Consistency review builds its context from translations
rather than the original text.

## Block order

For translation and revision, the system message preserves this order:

1. Static instructions: persona, structural rules, glossary and examples.
2. Shared document context.
3. Stage-specific instructions, including any selected memory references.

The user message contains the text to process and, for revision, the previous
draft. The order `static → blob → stage-instructions` keeps the reusable prefix
contiguous. Inserting variable content before the shared context would reduce
the amount that can be reused.

## Adapter behaviour

| Provider | Implemented behaviour |
| --- | --- |
| OpenAI | Derives a key from the provider, model and prefix; forwards explicit `in_memory` or `24h` retention when configured |
| Anthropic | Adds `cache_control` to eligible blocks only when caching is enabled; can request a one-hour TTL |
| Gemini | Can create and reuse cached content for eligible prefixes |
| DeepSeek | Reads cache token counts reported in the response |
| Ollama | Does not provide the same billed-cache metrics as remote providers |

These behaviours describe Glossa’s integration. Actual cache availability,
duration and pricing depend on the service and model; they cannot be inferred
from a model family name alone.

## Configuration and inspection

Anthropic caching is disabled by default. Enable it when you expect to reuse
a prefix, and consider extended retention in light of the interval between
requests. Cache writes may incur a charge, so a prefix that is never reused
does not necessarily save money.

Statistics display usage data returned by providers. An identical prefix does
not guarantee a cache hit: size, model, expiry and service policies may affect
reuse. Use the segment preview to inspect messages and the console to review
requests that have been executed.

Prompt caching is separate from the [Library’s network cache](./storage-and-jobs).
