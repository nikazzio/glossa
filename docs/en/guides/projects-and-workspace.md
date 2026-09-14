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

You can create projects from a workspace page or the **Translations** area.
Translations lists projects across all workspaces. A workspace’s name,
description and icon identify it throughout the application.

Autosave operates on projects that have already been created. It detects changes
and saves them after a short idle interval; while processing is active, it waits
for a stable state. The status bar distinguishes unsaved changes, saving,
successful saves and errors. `Ctrl + S` requests a manual save, subject to the
conditions described under [keyboard shortcuts](./keyboard-shortcuts).

## Dashboard

The Dashboard contains an overview, a search across multiple sources, and a
single-source or identifier search. Only the visible tab is mounted in the
interface; the backend manages jobs that have already started independently.

The overview shows recent works and translations, items requiring attention,
jobs by status, recent searches and recent activity. Expanded and collapsed
sections retain their state. The workspace filter applies to the relevant
summaries; jobs and searches remain global. A section that cannot load its
data displays an error rather than a zero count.

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
