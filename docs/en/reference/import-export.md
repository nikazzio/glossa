---
title: Import and export
---

# Import and export

Import creates a project’s source text. Export generates a document from
pipeline segments. Neither operation replaces an
[application backup](./backup-and-restore).

## Import formats

| Format | Processing | File limit |
| --- | --- | --- |
| TXT | UTF-8 text | 50 MiB |
| Markdown | UTF-8 text with Markdown structure | 50 MiB |
| DOCX | Experimental structured extraction to Markdown | 100 MiB |
| PDF | Extraction of text available in the file | 50 MiB |

Limits use multiples of 1024 bytes. Unrecognised extensions are read as plain
text when selected through **All files** in the file dialog. This does not
add support for binary or structured formats such as ODT or RTF. Non-UTF-8
text is rejected with an encoding error.

The system dialog can select files from any accessible directory, including
external drives. The preview lets you check extraction and segmentation
before confirming. A PDF containing only images does not provide text through
this extraction path; import does not perform OCR.

## Source footnotes

DOCX and Markdown footnotes are retained separately. The pipeline receives
the body text without their markers or contents. Translating and positioning
footnotes requires manual work. See [Annotations and notes](../guides/annotations).

## Export formats

| Format | Contents |
| --- | --- |
| TXT | Translation text; the Markdown option can flatten its structure to plain text |
| Markdown | Text and markup, including annotations when supplied to export |
| HTML | A document generated from Markdown |
| DOCX | A document generated from Markdown by the backend |
| Bilingual Markdown | Source and translation per segment, completed assessment ratings and audit findings |

Standard formats use the source text where a segment has no translation.
**Export does not certify that a translation is complete.** Bilingual export
explicitly marks missing translations and does not insert annotations through
the same path as Markdown export.

## Separators and formatting

Segment separators are available only for TXT and Markdown. HTML, DOCX and
bilingual output use their own composition rules. DOCX output is generated
from the current Markdown text and does not necessarily recreate the imported
document’s layout.

Before delivery, check incomplete segments, annotations, footnotes and the
structure of the generated file. Cancelling the save dialog does not create
an export.
