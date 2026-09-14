---
title: Processing model
---

# Processing model

The pipeline separates translation generation from revision and assessment.
This page describes each stage’s responsibilities and inputs; the
[document guide](./document-pipeline) covers the operational controls.

## Unit of work

A segment is the unit of execution, review and recovery. Segmentation allows
part of a document to be processed independently, intermediate outputs to be
retained, and a stage to be repeated without recalculating the entire text.

Each model request is assembled from the configuration and available data.
The model does not automatically have access to the project’s history:
context, terminology, examples and references must be included in the request.

## Stage responsibilities

| Stage | Main inputs | Expected output |
| --- | --- | --- |
| Translation | Current source, document context, instructions and glossary | Initial translation |
| Refine | Source, context and previous draft | Complete revised translation |
| Format | Translated text and formatting instructions | Structural and Markdown syntax repairs |
| Judge | Source, translation and assessment criteria | Assessment and structured findings |
| Coherence | Translations and neighbouring translated segments | Findings about consistency across segments |

Format uses a separate prompt. It does not receive the translation persona,
glossary or source context. Its instructions limit it to formatting repairs,
but the output still requires review.

In DeepL Hybrid mode, the initial stage uses the DeepL API and its language,
formality and glossary parameters. Any subsequent stages use independently
configured LLM providers.

## Configuration and reproducibility

Separate stages make it possible to compare outputs and identify the step
that introduced an error. They do not make generation deterministic: repeating
a request may produce a different response, even at a low temperature.
Valid JSON provides a parseable structure, not a guarantee of sound judgement.

To assess a change, keep the text and evaluation criteria fixed and change
one parameter at a time. Use intermediate outputs and the operations console
to compare the actual requests. The reviewer remains responsible for the
final editorial decision.

## Context and resources

The glossary specifies required terminology. Phrase memory supplies only the
references selected for the current segment. Translation examples guide
style across the pipeline.

See [Context and prompt caching](./context-and-caching) for request structure
and prefix reuse, and [Pipeline configuration](../reference/pipeline-config)
for the available parameters.
