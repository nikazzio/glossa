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

Plain text has a **50 MB** limit. Any other extension is read as plain text —
pick **All files** in the picker's type menu to see it. Be aware, though: a
format with internal markup such as `.rtf` or `.odt` arrives with its
formatting codes inside the text, because Glossa does not yet have a dedicated
reader for those formats.

**From any folder.** Import is not limited to Documents, Downloads, or Desktop:
pick a file from wherever you keep it, including working folders and external
drives.

If a text file is not UTF-8 encoded, Glossa tells you instead of importing
mangled characters: reopen it in a text editor, save it as UTF-8, and try again.

During import, Glossa lets you review segmentation before the document becomes
the active chunk list.

## Import expectations

- Plain text is the simplest path when structure is minimal.
- Markdown is best when headings and formatting matter.
- DOCX and PDF are useful for real editorial material, but always review the preview before running the pipeline.

## Imported footnotes

If a DOCX or Markdown file contains footnotes, Glossa keeps them with the project
but leaves them outside automatic translation. The model receives the body text,
not the footnote content. After translation, review and place footnotes manually:
in real translations they often need different wording and position.

See also [Annotations](../guides/annotations) for the distinction between imported
source notes and annotations created during review.

## Workspace backups

Before asking to replace local data, Glossa checks that a backup is complete and
compatible. An incomplete or altered file, or one made by a newer version, is
rejected without changing the current workspace.

## Data location

The app database contains projects, glossaries, and settings. Under
**Settings → Data** you can see the folder in use and choose another one.
Glossa first copies the database, verifies the copy, and only then records the
new location. The original is never deleted automatically, and the new
location is used after restarting the app.

This operation covers the app database. Future Library materials such as
downloaded scans and images are not yet part of the move.

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
