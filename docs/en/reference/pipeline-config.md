---
title: Pipeline configuration
---

# Pipeline configuration

Configuration belongs to a project’s pipeline. Service credentials and
connections belong to application settings.

## Sections

| Section | Parameters |
| --- | --- |
| Settings | Mode, languages, persona, examples and general options |
| Translation | Providers, models, prompts and generation-stage options |
| Quality Control | Evaluator and consistency check |
| Term registry | Assigned glossary |
| Prompt Preview | Request structure for active stages |

Standard, Editorial and DeepL Hybrid modes are described in the
[translation workflow](../guides/document-pipeline).

## Languages and persona

Set source and target languages. A persona is free text that replaces the
default opening of the system message. It can specify role, subject area,
languages and register. When enabled, it should state the intended language
pair and instructions accurately.

Prompts can be saved as reusable templates, organised by context. Prompt
refinement sends the current text to a configured model and places a revised
version in the field. It requires a connection and any credentials needed
by the selected provider.

## Model parameters

Each LLM stage selects its provider and model independently. Available controls
depend on capabilities declared in the application.

- **Temperature:** controls sampling variability without guaranteeing accuracy
  or repeatability. Supported ranges are 0–1 for Anthropic and 0–2 for Gemini,
  OpenAI and DeepSeek.
- **Reasoning:** when requested for OpenAI or DeepSeek, the adapter omits
  the temperature parameter.
- **Ollama:** provides context, generation and reasoning options according
  to the model. Advanced options must be a valid JSON object, such as
  `{ "num_ctx": 8192 }`.
- **Ollama assessment:** schema-constrained requests set temperature to zero,
  even when another value is configured.

Invalid JSON does not replace the previous configuration. Check the meaning
of service-specific options for the model you use.

## DeepL Hybrid

The first stage uses DeepL settings: language, formality where supported,
translation mode and remote glossary. Its API key is separate from the keys
used by revision and assessment LLMs. DeepL quota or glossary errors must be
resolved with that service before the sequence can complete.

## Examples and context

A pipeline can hold up to five translation examples, added from a locked
segment’s Audit tab and edited in settings. [Phrase memory](../guides/phrase-memory)
instead supplies references selected for an individual segment.
[Prompt caching](../guides/context-and-caching) has provider-specific rules.

## Cost estimates

The configuration estimate covers the entire document, including consistency
review when configured. In the document sidebar, the estimate follows the
selected action. Details distinguish stages and models.

Estimates use an approximate word-to-token conversion and the model prices
recorded in Glossa. Usage shown after execution uses token counts returned
by the service; the associated cost is still Glossa’s calculation, not an
invoice. DeepL reports billed characters, which are not LLM tokens and are
not included in the same dollar estimate.
