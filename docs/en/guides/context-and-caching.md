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

1. Static instructions: role and Translation context, structural rules, glossary and examples.
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

## Automatic page reading (OCR)

In automatic reading of transcription pages the document prompt is the only
instruction: Glossa adds no rules of its own. The prompt is the cached part,
identical for every page of the same document; the page image **always** lives
in the user message, outside the cache, and is billed at the normal price each
time.

- **Anthropic:** caching on, with a 1-hour lifetime. Each page is checked by eye
  before the next one, and every reading renews the lifetime.
- **OpenAI:** the same cache as translation, with one key per document.
- **Gemini:** the provider's implicit cache.

Caching only starts above a minimum prompt length that differs by provider and
model: a short prompt is simply not cached, with no error. Tokens read from the
cache appear in the Transcription log, on the outcome row of each reading.

## Configuration and inspection

Anthropic caching is disabled by default; its switch sits under the model of
each Anthropic stage, in the Stages tab. Enable it when you expect to reuse
a prefix, and consider extended retention in light of the interval between
requests. Cache writes may incur a charge, so a prefix that is never reused
does not necessarily save money.

Statistics display usage data returned by providers. An identical prefix does
not guarantee a cache hit: size, model, expiry and service policies may affect
reuse. Use the segment preview to inspect messages and the console to review
requests that have been executed.

The estimated cost bills tokens read from the cache at their reduced price where
the official price list is known: OpenAI GPT-5.4 and GPT-5.6, and the Anthropic
and DeepSeek models in the catalog. For Gemini the estimate applies no discount.
For Anthropic the cache-write surcharge is not part of the estimate, because
those tokens are not recorded: the real cost of a call that writes the cache is
slightly higher.

Prompt caching is separate from the [Library’s network cache](./storage-and-jobs).
