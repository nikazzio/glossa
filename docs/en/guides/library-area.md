---
title: Library area
---

# Library area

The Library is a workspace area that groups shared terminology resources and prompt templates across all projects.

## How to open it

- **From the workspace hub**: click the **Library** card on the main workspace screen.
- **From the header (even inside an open project)**: click the Library icon (📚) in the top-right corner. Glossa closes the current project and navigates directly to the Library.

## Sections

### Dictionaries

Contains reusable glossaries. From here you can:

- Create a new dictionary with the **+** button
- Rename a dictionary with a double-click
- Duplicate it with **Fork**
- Import terms from CSV/XLSX
- Assign a dictionary to the current project session

### Phrase Memory

Shows the source-target pairs stored for the active workspace. Pairs are extracted automatically from approved outputs during pipeline runs.

From the Memories section you can:

- Search through stored pairs
- Delete individual pairs or in bulk
- **Export to CSV** all pairs for the current workspace using the **Export CSV** button

### Prompt Templates

Holds reusable prompt templates, filterable by context and workflow.

**Workflow filter** — choose between **Translation** and **Transcription** to see only templates that belong to the current working area. Templates are assigned to a workflow at creation time.

**Context filter** — further narrows the list by template type:

| Context | Used in |
|---|---|
| Stage | Translation stages (Translate, Refine, Format) |
| Audit | Judge prompt and Coherence prompt |
| Persona | Persona section in the pipeline config |
| Memory | Workspace phrase-memory extractor |

## Internal navigation

From the Library hub, click a card to enter a section. The breadcrumb at the top always lets you go back:

- Inside a section → click the Library name → returns to the Library hub
- In the Library hub → click the workspace name → returns to the workspace hub
