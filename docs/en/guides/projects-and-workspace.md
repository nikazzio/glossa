---
title: Projects and workspace
---

# Projects and workspace

Glossa separates application settings, workspace resources, and per-project pipeline configuration.

## Three levels of state

| Level | What lives there |
|---|---|
| App | API keys, Ollama connection, interface preferences, defaults |
| Workspace | Phrase memory, Library glossaries, translation area context |
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

You can collapse the side rail to leave more room for the content. Inside a project, the previous/next chunk controls and the translation action remain available; the technical chunk number no longer occupies space in the rail. On the collapsed Dashboard, Dashboard and every area remain visible: areas that are not available yet are visible but cannot be selected; reopen the rail to see the workspace list.

At the top, the Glossa mark opens the rail on hover. The closed rail therefore remains recognisable without permanently showing another command.

## Shared versus local resources

| Resource | Scope |
|---|---|
| API keys | App-wide |
| Interface preferences | App-wide |
| Phrase-memory storage | Workspace |
| Library glossaries | Workspace |
| Glossary assigned to pipeline | Project / pipeline |
| Chunks, drafts, audit output, notes | Project / pipeline |

## Naming advice

- Name pipelines by purpose, not by provider alone
- Rename experimental pipelines instead of overwriting the production one
- Keep one project per coherent text or editorial unit

## What should stay stable

- Keep one provider/model combination stable inside the same project unless you have a clear reason to change it.
- Do not mix exploratory prompts and production prompts in the same saved pipeline without renaming it.
- Treat the workspace as shared memory, not as a dumping ground for temporary experiments.
