---
title: Pipeline configuration
---

# Pipeline configuration

Configuration belongs to a project’s pipeline. Service credentials and
connections belong to application settings.

## The window

The configuration opens from the gear in the Translation Studio's top row, or
with Ctrl + comma. The title is the pipeline name: rename it from the Studio's
top row, not here. Explanations are not written under the fields: they appear
when you hover a section title or a row name.

| Tab | Parameters |
| --- | --- |
| General | Mode, languages, persona |
| Stages | Service, model, prompt and options for each stage; context memory |
| Quality control | Refinement loop, assessment model, assessment and consistency prompts |
| Memory | Phrase memory and translation examples (off in DeepL mode) |
| Glossary | Assigned dictionary and its terms |
| Prompt preview | Request structure for active stages |

While the pipeline runs the window stays open and readable, but a veil locks
its controls. At the bottom, the red **Reset all translations** icon deletes
translations and their audits after a confirmation; it is off, with the reason,
during a run or when there is nothing to reset.

Once translations exist, mode, stage prompts and context memory cannot be
changed; a stage's model is closed by a lock. Opening it lets you change the
model, but chunks already translated keep the previous one.

Standard, Editorial and DeepL Hybrid modes are described in the
[translation workflow](../guides/document-pipeline).

## Languages and persona

Set source and target languages. A persona is free text that replaces the
default opening of the system message. It can specify role, subject area,
languages and register. When customised, it should state the language pair
accurately; the pair stays fixed until the persona is reset.

Prompts can be saved as reusable templates, organised by context: while
editing, the bookmark saves the prompt under a name and the book opens the
list of saved templates, with search. Templates are deleted from the language
resources. Prompt
refinement sends the current text to a configured model and places a revised
version in the field. It requires a connection and any credentials needed
by the selected provider: without a key the command is off and its tooltip
says which one is missing.

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

A pipeline can hold up to five translation examples, added from a verified
segment’s Audit tab and edited in the Memory tab. [Phrase memory](../guides/phrase-memory)
instead supplies references selected for an individual segment.
[Prompt caching](../guides/context-and-caching) has provider-specific rules.

## Cost estimates

In the Studio's tools column, the estimate follows the selected action. Details distinguish stages and models.

Estimates use an approximate word-to-token conversion and the model prices
recorded in Glossa. Usage shown after execution uses token counts returned
by the service; the associated cost is still Glossa’s calculation, not an
invoice. DeepL reports billed characters, which are not LLM tokens and are
not included in the same dollar estimate.
