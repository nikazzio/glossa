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

The bar places **work / pipeline** together, truncating long names and showing
the full name on hover. The pipeline name, with its small arrow, opens the menu to
select, create, rename or delete; the gear opens options. **Simple, Editorial
or DeepL** mode is always visible with an icon. Only DeepL displays a language
pair in the bar. Pipeline operations stay blocked while processing.

| Tab | Parameters |
| --- | --- |
| General | Mode, DeepL languages, Translation context |
| Stages | Service, model, prompt and options for each stage; context memory |
| Quality control | Refinement loop, assessment model, assessment and consistency prompts |
| Memory | Phrase memory and translation examples (off in DeepL mode) |
| Glossary | Assigned dictionary and its terms |
| Prompt preview | Every request piece by piece: stages, audit, coherence, DeepL request |

While the pipeline runs the window stays open and readable, but a veil locks
its controls. At the bottom, the red **Reset all translations** icon deletes
translations and their audits after a confirmation; it is off, with the reason,
during a run or when there is nothing to reset.

Once translations exist, mode, stage prompts and context memory cannot be
changed; a stage's model is closed by a lock. Opening it lets you change the
model, but chunks already translated keep the previous one.

Standard, Editorial and DeepL Hybrid modes are described in the
[translation workflow](../guides/document-pipeline).

## Translation context and DeepL languages

The **Translation context** replaces the language pair for LLMs: languages,
historical varieties, audience, register and goal. It is required and never
empty: a new pipeline starts from a default text (English into Italian) that
you can rewrite or replace with a saved template; the circular arrow restores
it and confirming an empty text is disabled. Translation, refinement, audit and
coherence receive it alongside their own instructions; formatting remains
limited to syntax. No language pair is added automatically to prompts: the
languages live in the context.

Next to each prompt title is where its text comes from:
**Default**, **Custom** or **Template “name”** when it matches a saved
template of the same category. Recognition compares the text: a template
edited after it was applied is no longer recognised, because the pipeline
keeps the applied copy.

The pencil opens a draft; the checkmark confirms and X discards it. Model-based
refinement also changes only the draft. Prompts use a subdued surface with a
green accent, icon commands and expandable previews. The context is saved with
the pipeline and copied when duplicated.

The **DeepL · languages** pair remains visible in General, disabled in LLM
modes and enabled in DeepL. Unused stages remain visible as disabled tabs.
Switching modes preserves all stage configurations. DeepL retains LLM
refinement, audit and coherence. General language metadata is still used by
phrase memory; its configuration will be consolidated with linguistic resources.

In **Prompt preview**, choose a stage, Audit or Coherence: you see the request
piece by piece in sending order, split into the **system message**
(instructions, rules and resources, identical for every chunk) and the **user
message** (the chunk and the final request). The pieces come from the backend,
the same ones that compose the real request: preview and sending match. Each
piece says whether it is **fixed in the program**, **your text**, **data** or
**automatic**, and where it is changed; its title explains its purpose. Pieces
absent from this pipeline stay visible, disabled, with the reason (for example
“only for documents imported as Markdown”). Placeholders in double braces show
where chunk data goes: it is built from the current settings, not a historical
request. **Open chunk** mode fills the same pieces with the real data of the
chunk open in the Studio, including checked memory phrases.

All the text the program adds around your prompts — roles, rules, headings,
result requests, response format, user message — is a **system prompt** and is
edited here, in Structure mode. Each system prompt is locked: unlocking makes
it like the other prompts (draft with confirm and discard, refine wand,
templates of the **System** category, circular arrow back to the default). The
lock closes again when you close the window. The audit and coherence response
format asks for an extra confirmation, because the app reads the answer by that
format. In the user message and frames, placeholders in double braces (for
example `{{TEXT}}`) are required: without them confirming stays disabled.
Pieces whose content lives in another tab (Translation context, phase prompts,
glossary table, examples) are not edited here: they only have the arrow that
opens that tab, and their heading stays the default. Glossary rules are a
system prompt instead and are edited here. Prompts are always read and edited
in a monospaced font. Role, rules and frames of Translation and Refine are shared:
editing them once applies to both. Changed texts are saved with the pipeline
and carried to new pipelines created by copy.

Optional pieces can be **switched off per phase** with the switch on their
card: role, structural rules, glossary rules, Markdown rules, examples,
neighbouring chunks, glossary table, review method, result request. A switched
off piece stays in the list as a grey “switched off in this phase” line with
the switch to turn it back on; the choice is saved with the pipeline and also
applies when running. The Translation context, phase prompt, user message and
response format are always on. Switching neighbouring chunks off also drops the
chunk identifier, which only serves to find the chunk among them. DeepL shows the request body.

Prompts can be saved as reusable templates, organised by context: while
editing, the bookmark saves the prompt under a name and the book opens the
list of saved templates, with search. Templates are deleted from the language
resources. A template whose scope is no longer recognised is left out of the
list and named in a notice, without hiding the others. Prompt
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

Choose the DeepL pair in General, using the service's language lists.
Automatic source detection is available; a glossary requires an explicit source.
Changing either language unlinks the remote glossary, and changing the target
resets formality to its default. The Translation context is not sent to DeepL; its
Context field is separate.

The target must be selected explicitly; requests without a target are blocked before contacting DeepL. Both the configuration preview and the chunk preview display the API
body, built by the backend as for execution; the configuration preview uses a
placeholder for chunk text. Logs retain the actual request without credentials.

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
