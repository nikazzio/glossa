---
title: Annotations and notes
---

# Annotations and notes

Annotations record observations about a segment and can refer to a specific
passage in the translation. They are stored separately from the text, so a
note can be edited or removed without rewriting the translation.

## Types

| Type | Use |
| --- | --- |
| Comment | An observation or editorial decision |
| Doubt | An interpretation that needs checking |
| Problem | An error requiring action |
| Approved | A note recording the outcome of review |

The Approved type does not replace **Lock translation**. Annotations describe
review work; locking controls whether a segment can be reprocessed.

## Creating an annotation

Select a passage in the translation and choose **Add annotation** from the
context menu. The selected text becomes the note’s anchor. You can also add
an unanchored note in the segment’s **Notes** tab or convert an audit finding
into an annotation.

Segment notes are in the project sidebar. They are separate from notes about
a bibliographic work, which belong to its Library record.

## Display and export

In the translation preview, anchored annotations can appear as Markdown
footnotes (`[^a1]`, `[^a2]` and so on). These markers are composed for display;
they are not inserted into the saved translation text. If the anchor text
changes, check that the note still refers to the correct passage.

Markdown-based exports can include annotations as footnotes. Bilingual export
uses its own structure containing source, translation and audit results.
See [Import and export](../reference/import-export).

## Source-document footnotes

Footnotes imported from Markdown or DOCX are retained with the project and
displayed in the source. Their markers and contents are excluded from the
text sent to the translation pipeline.

Source footnotes and reviewer annotations are separate data. To include a
footnote in the final translation, review its wording and insert it in the
appropriate position: the pipeline does not translate or reposition it automatically.
