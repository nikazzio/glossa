---
title: Translating a document
---

# Translating a document

Translation operates on text segments, also called *chunks* in the interface.
Each segment retains its source text, stage outputs, editable translation,
assessment and annotations. A document containing only one segment uses the
same workflow.

## Import and segmentation

Import a file or enter source text, then review the preview. Automatic
segmentation uses a target word count. Markdown heading options can keep a
heading with the following text or split sections at a chosen heading level.

Check the boundaries before confirming: they define the units used for
translation and review. See the [import and export reference](../reference/import-export)
for formats, size limits and imported footnotes.

## Configuration

Open pipeline configuration and set the languages, mode, providers, models
and instructions. Pipeline modes define these sequences:

| Mode | Processing |
| --- | --- |
| Standard | Translation and automated assessment |
| Editorial | Translation, draft revision (*Refine*), formatting (*Format*) and assessment |
| DeepL Hybrid | DeepL translation, optional LLM revision and LLM assessment |

Each LLM stage has an independent provider and model selection. DeepL requires
its own API key and does not act as the evaluator. The pipeline mode cannot
be changed when processing or existing results lock that setting.

## Testing and execution

Use **Test** to assess a segment while keeping the configuration editable.
Review the draft and findings before switching to production. Execution
controls let you process the current segment or multiple segments; the selected
count limits the group to process.

Processing advances through the segments and updates their states. Cancelling
stops the current work without removing completed results. Resuming and rerunning
serve different purposes: resuming processes outstanding work, while rerunning
recalculates the unlocked segments covered by the selected action.

## Reading and review

The document view places source and translation side by side. The segment
sidebar contains **References**, **Preview**, **Audit**, **Memory** and **Notes**.
The **Insight** panel provides the document index, search, statistics,
consistency review and glossary.

Intermediate stage outputs help identify where a change was introduced.
After a manual edit, **Re-evaluate** runs the quality assessment alone.
**Lock translation** protects an approved result from reprocessing. If the
source text changes, the interface flags the translation for updating.

## Request previews

Pipeline configuration shows the structure of the prompts. The segment’s
**Preview** tab builds the selected stage’s request for the current text.
This action does not call a model or generate a translation.

## Export

Check incomplete segments before exporting: standard formats may use the
source text where a segment has no translation. Bilingual export explicitly
distinguishes the source from a missing translation. See
[export formats and contents](../reference/import-export).
