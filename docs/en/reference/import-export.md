---
title: Import and export
---

# Import and export

Glossa is designed for real documents, not just pasted snippets.

## Import

Supported input formats include:

- `.txt`
- `.md`
- `.docx` — converted to Markdown via structured extraction (experimental feature). Limit: **100 MB**.
- `.pdf` — extracted as plain text. Limit: **50 MB**.

During import, Glossa lets you review segmentation before the document becomes
the active chunk list.

## Import expectations

- Plain text is the simplest path when structure is minimal.
- Markdown is best when headings and formatting matter.
- DOCX and PDF are useful for real editorial material, but always review the preview before running the pipeline.

## Export

Typical export targets include:

- plain text (`.txt`)
- Markdown (`.md`)
- HTML
- DOCX
- bilingual Markdown

## What export is for

- Plain text for a stripped final output
- Markdown for editable text workflows
- HTML for review or publishing pipelines
- DOCX for office/editorial handoff
- Bilingual Markdown for side-by-side source and translation review, including quality rating and judge issues for completed chunks

## Chunk separators

Separators (blank line, horizontal rule `---`, asterisks `***`) are available **only for `.txt` and `.md`** exports. They do not apply to HTML, DOCX, or the bilingual format.

## Practical rules

- Use Markdown import when structure matters and you want headings preserved.
- Check the preview before confirming chunking on long files.
- Export only after review is complete; export is the handoff step, not the review step.
