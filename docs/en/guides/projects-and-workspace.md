---
title: Projects and workspace
---

# Projects and workspace

Glossa separates application settings, workspace resources, and per-project pipeline configuration.

## Three levels of state

| Level | What lives there |
|---|---|
| App | API keys, Ollama connection, interface preferences, defaults |
| Workspace | Phrase memory, Language-resource glossaries, translation area context |
| Project / pipeline | Languages, stages, prompts, glossary assignment, chunks, outputs |

## Practical meaning

- Change app settings when the whole installation should behave differently.
- Change workspace-level resources when multiple projects should share them.
- Change project or pipeline settings when you are tuning one translation job.

## Typical project workflow

1. Create or open a project.
2. Select the active pipeline.
3. Configure languages and stages.
4. Assign a glossary if needed.
5. Import a document and run test chunks.
6. Save as you iterate.

## Compact navigation

You can collapse the side rail to leave more room for the content. Inside a project, the previous/next chunk controls and the translation action remain available; the technical chunk number no longer occupies space in the rail. On the collapsed Dashboard, Dashboard, every area, and workspace icons remain visible: areas that are not available yet are visible but cannot be selected.

On the collapsed Dashboard, the Glossa mark remains visible at the top. On
hover or keyboard focus, it becomes the button that reopens the rail; a click
or keyboard activation is still required. Inside a collapsed project, that
same position shows the project workspace's mark instead.

## Recognising a workspace

When you create a workspace, choose one of the available historical-editorial
marks, such as a manuscript, quill, archive, or seal. You can change it later
from workspace settings together with its name and description. The same mark,
shown more prominently in project lists, appears in the side rail, workspace
context, language resources, and project lists; hover it or reach it with the keyboard to
access the full workspace name. In global areas, the mark always accompanies a
smaller icon for the item's type rather than replacing it. These marks are
distinct from the icons that identify the Translations, Library, Transcriptions,
and Analysis areas: areas always retain their own symbols. Custom icons are not
available.

## Chunk indicators

The row of circles above the document lets you switch chunks and summarises
state without relying on colour alone:

- the central mark distinguishes a chunk that is ready, processing, completed,
  or in error;
- the top-left signal marks unresolved audit issues;
- the top-right signal marks notes;
- the bottom-left signal marks a locked translation;
- the bottom-right signal marks a translation that needs updating after its
  source changed;
- a small triangle under the circle marks the current chunk.

Hover an indicator or reach it with the keyboard to read the full state summary
and any related counts.

## Shared versus local resources

| Resource | Scope |
|---|---|
| API keys | App-wide |
| Interface preferences | App-wide |
| Phrase-memory storage | Workspace |
| Language-resource glossaries | Workspace |
| Glossary assigned to pipeline | Project / pipeline |
| Chunks, drafts, audit output, notes | Project / pipeline |

## What a workspace holds

A workspace is a folder that gathers your material, in two different ways.

**Living there** are translations and transcriptions: each one belongs to **a
single** workspace, and that is where it takes its resources from. If it lived
in two, «which dictionaries does this work see» would have no single answer.

**Linked to it** are books, dictionaries and imported phrases: the same things
can sit in **several workspaces at once**, and are never duplicated. A book in
two workspaces is one book, and its files on disk are the same ones.

## Using a dictionary in several workspaces

Link the same dictionary wherever you need it: it stays one dictionary, and the
entries you add show up everywhere it is linked.

If one workspace needs an entry translated differently, **correct it there**:
the correction applies only in that workspace and the original does not change.
You can also hide an entry that does not belong there. Anyone looking at the
dictionary from another workspace still sees the original version.

If instead you want to take a dictionary as a starting point and go your own
way, the **copy** is still there: it creates a new, independent dictionary that
lives on its own from then on.

## Moving a translation to another workspace

On the workspace page, every translation has a command that moves it elsewhere.
From then on it sees the new workspace's resources — dictionaries, phrase memory,
linked works. **The work already done stays counted where it was done**:
yesterday's costs and calls belong to the workspace of that time, and the move
itself is written into the history. Moving copies nothing and changes not a
comma of the text.

Phrases remembered from that translation follow it without you doing anything:
they belong to the work they came from.

## Setting a workspace aside

When a job is done but you do not want to throw it away, **archive it**: it
leaves the list of workspaces you work in and everything it holds stays where it
is. Reopen it when you need it.

## Deleting a workspace

The command no longer refuses. It tells you what is inside and lets you choose
**once for everything**:

- **set it aside** — the road that takes nothing away;
- **move everything to another workspace**, then delete the empty one;
- **delete** — the translations and transcriptions that lived there go with it.

**Books, dictionaries and phrases always stay**: they are linked, not owned, and
may live elsewhere too. A dictionary left without any workspace is not deleted:
you find it in the general catalogue of the language resources.

## Naming advice

- Name pipelines by purpose, not by provider alone
- Rename experimental pipelines instead of overwriting the production one
- Keep one project per coherent text or editorial unit

## What should stay stable

- Keep one provider/model combination stable inside the same project unless you have a clear reason to change it.
- Do not mix exploratory prompts and production prompts in the same saved pipeline without renaming it.
- Treat the workspace as shared memory, not as a dumping ground for temporary experiments.
