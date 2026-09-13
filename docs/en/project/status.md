---
title: Project status
---

# Project status

Glossa is in private beta. Version numbers do not indicate that every planned
feature is complete. This site documents code merged into `main`; compare
your installed version with the
[release notes](https://github.com/nikazzio/glossa/releases).

## Available features

- Dashboard summaries and single-source or multi-source search with persistent history.
- A catalogue of works with editable metadata, collections and workspace links.
- IIIF viewing, downloads, local versions, image reduction and integrity checks.
- Translation workspaces and projects with text import and segmentation.
- Standard, Editorial and DeepL Hybrid pipelines with revision and assessment.
- Dictionaries, phrase memory, examples, annotations and translation history.
- Translation export and application-data backups.

## Current limitations

| Area | Limitation |
| --- | --- |
| Transcription | The transcription studio, OCR/HTR and page-level revision do not yet form a complete workflow |
| Source to translation | Transfer from an approved transcription to translation is incomplete |
| PDFs in the Library | Metadata is available; downloading and integrated viewing are not |
| Individual pages | Saving the current page is supported; advanced management and multiple-page selection are incomplete |
| Search | Capabilities vary by source; metadata filtering is local and coverage depends on the queried services |
| Workspace transfer | Backups replace application data rather than exporting and importing one workspace |
| Export Studio and Analysis | Advanced workflows remain in development |

PDF text extraction for translation is available and separate from PDF viewing
in the Library. It does not recognise text in scanned images.

## Data preservation

Restoration accepts only the current backup schema and replaces local data.
Credentials, images and exported files require separate handling. Read
[Backup and restore](../reference/backup-and-restore) before using it.

The [roadmap](https://github.com/nikazzio/glossa/blob/main/docs-dev/ROADMAP_2_0.md)
records priorities and dependencies for remaining work. A navigation entry
does not imply that its workflow is already usable.
