---
title: Assessment and review
---

# Assessment and review

Automated assessment, labelled **Audit** in the interface, compares a segment’s
translation with its source. The consistency check is a separate review of
translations across the document. Both produce findings for a reviewer to assess.

## Evaluator output

The response includes an overall rating and findings with a category,
severity and description. Categories cover glossary compliance, accuracy,
fluency, grammar and consistency. When textual references are available,
the interface attempts to locate the relevant passage.

The backend uses a shared response schema. OpenAI, Anthropic, Gemini and
Ollama receive their respective structured-output parameters. DeepSeek and
custom endpoints use JSON mode with local validation. A response that cannot
be interpreted is reported as an error.

For schema-constrained output, the Ollama adapter sets temperature to zero,
overriding the configured value. This does not guarantee identical or correct
assessments; schema compliance concerns the response format.

## Review procedure

1. Open the translated segment’s **Audit** tab.
2. Compare each finding with the source and translation.
3. Edit the text manually or rerun the relevant stage.
4. Use **Re-evaluate** to update the assessment without translating again.
5. Record decisions and unresolved questions in **Notes**.
6. Lock the translation when review is complete.

An audit finding can be converted into an annotation. Passage lookup uses
text supplied by the model and may not find the exact location. Locking a
translation is a reviewer decision, separate from the automated rating and
annotation type.

## Document consistency

After completing the segments, run the consistency check. It examines
translations with neighbouring translated segments as context, without
comparing them with the source. It uses the dedicated prompt under
**Quality Control** and displays results in the Insight panel’s
**Coherence** tab.

This check can identify terminology or style variations between passages.
It does not replace a segment-level accuracy assessment.

## Interpreting results

A positive rating is not editorial approval. If findings recur, check the
instructions, assigned terminology and memory references before changing
the evaluator’s criteria. Compare stage outputs to identify where an error
was introduced.

See [Annotations and notes](./annotations) for recording decisions and
[Pipeline configuration](../reference/pipeline-config) for quality-control
parameters.
