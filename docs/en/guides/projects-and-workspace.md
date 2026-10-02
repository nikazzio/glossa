---
title: Workspaces and projects
---

# Workspaces and projects

A workspace defines the organisational scope of projects and language resources.
A translation project belongs to one workspace and can contain several pipelines,
each with its own configuration and results.

## Data scope

| Scope | Contents |
| --- | --- |
| Application | Credentials, provider connections, preferences, source catalogue and background jobs |
| Workspace | Projects, links to works and dictionaries, phrase memory and local terminology overrides |
| Project and pipeline | Source text, languages, stages, prompts, assigned glossary, segments, translations and review data |

Works and dictionaries can be linked to multiple workspaces without duplicating
their data. Editing a shared entry and applying a workspace override are separate
operations. An override leaves the original entry intact; creating a copy
produces an independent dictionary.

## Creation and saving

You can create projects from a workspace page or the **Translations** area:
the «+» next to the Translations title opens a window asking for the name, the
workspace and, optionally, the file to translate, in the same formats as the
editor import. The file is read as soon as you choose it: if it cannot be read
(a scanned PDF with no text, a file not in UTF-8) the reason appears under the
field and nothing is created. **Create** opens the translation in the editor
with the import preview, where you choose languages and segments; closing the
preview leaves the translation empty, and you can import the file later from
the editor. A workspace’s name, description and icon identify it throughout
the application.

## The Translations catalogue

The Translations area gathers the translations of every workspace and is laid
out like the [Transcriptions catalogue](./transcription#the-transcriptions-catalogue):
shelves on the right, search and quick filters above the list, three views
(list, covers, table).

- **Row**: name in italics, below it the source and target languages, then
  workspace, translated segments out of the total, verified segments and the
  completion bar, green when every segment is verified.
- **Shelves**: All, Recent (edited in the last 30 days), Not started (no
  segment translated), In progress, Verified (every segment verified).
- **Quick filters**: workspace (kept when you leave the page and come back)
  and language pair; sort by name, last edit or progress; group by workspace
  or language pair.
- **Row commands**: rename and delete; in the cover and table views they sit
  in the three-dot menu. Clicking a row opens the editor.

Current limits: the counts cover the project's first pipeline, the one the
editor opens; a translation is not yet linked to the work or transcription it
starts from, so there are no commands to open them, no library or century
filters and no archiving.

A translation saves itself shortly after the last edit, always as a whole:
source text and every segment. During automatic translation saving waits for
the end, because the pipeline saves by itself. The status bar, bottom right,
distinguishes unsaved changes, saving, saved and error; its tooltip gives the
time of the last save and, after an error, the reason.

To save right away there is the disk at the top of the translation page (on
the source page when only the source is open), or `Ctrl + S`, which also works
while typing on the pages. The disk also writes a version to the
[history](./document-pipeline#segment-history) of every changed segment. It is
off when there is nothing to save and no new version to write, and during
automatic translation; if a save fails it turns red and clicking it
retries.

Leaving the translation — back to the catalogue, main bar, path at the top,
switching workspace — saves before closing. If that save fails, the
translation stays open with the error in view: no edit is lost by leaving. One
limit remains: closing the Glossa window an instant after the last edit can
lose it.

## Areas and their ink

Library, Transcriptions and Translations each have their own ink — petrol,
sepia and indigo — so you can tell them apart at a glance: the area icon in the
left sidebar, a short rule under the large title and a slightly different
background paper. State colours stay the same in every area: green marks what
is selected or active, red errors, ochre cautions, gold running jobs.

## Dashboard

The Dashboard contains an overview, a search across multiple sources, and a
single-source or identifier search. Only the visible tab is mounted in the
interface; the backend manages jobs that have already started independently.

The overview shows recent works and translations, items requiring attention,
jobs by status, recent searches and recent activity. Expanded and collapsed
sections retain their state. The workspace filter applies to the relevant
summaries; jobs and searches remain global. A section that cannot load its
data displays an error rather than a zero count.

The cards can be arranged as needed: the handle to the left of the title drags a
card higher, lower or into the other column, and the chosen arrangement is
remembered. The full job list sits to the right of the overview, in a column
that can be resized and closed.

## Moving and archiving

Moving a translation changes the workspace that supplies its resources without
altering the text. Phrases extracted from that translation move with it.
Recorded costs and operations remain attributed to the workspace where they
occurred, and the move is recorded in the history.

Archiving a workspace removes it from the active list while preserving its
contents. The deletion dialog offers archiving, transferring the contents to
another workspace, or deleting them. Linked works and dictionaries remain in
the global catalogue. Deleting projects removes their translation data.

## Backups

A [backup](../reference/backup-and-restore) covers the application as a whole.
It is not an interchange format for a single workspace, and restoring one
does not merge its contents with existing data.
