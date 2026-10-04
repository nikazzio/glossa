---
title: Dictionaries and glossary
---

# Dictionaries and glossary

Dictionaries contain reusable terminology entries. A pipeline glossary is
the set of terms assigned to a translation. Each entry maps a source term
to the required target wording and may include usage notes.

## Managing dictionaries

Open **Language Resources** in the workspace. The window separates
dictionaries, prompt templates and phrases. The dictionary tab lets you
create, rename, duplicate and delete resources, edit entries and import CSV
or TSV data.

Import from resources creates a new dictionary in the selected workspace,
named after the file. The icon command opens the file picker; the preview
shows the first entries. For Excel, you can map source, translation and notes
columns before confirming.

## Sharing and local overrides

**General language resources** offer the same management. The workspace
filter shows every linked dictionary, including shared dictionaries; it also
supports all dictionaries or those without a workspace. This filter narrows
the list: general resources always read and edit originals. Select a
destination workspace to create, import or copy a dictionary. Search checks
dictionary names.

In an open dictionary the sharing icon identifies the **Shared original**;
the shield identifies **Local corrections**. Its hint explains where changes apply; in guest
workspaces the adjacent plus explains that new entries are added to the shared
original. Existing source terms cannot be renamed through a local override.

Entries show source and translation side by side, without opening fields for
the entire list. The pencil edits a pair; the notebook shows its notes.
**+** inserts an entry at the top and focuses the term, making it immediately
visible. The check finishes editing the entry: changes still need to be saved
with the dictionary’s disk command.

Plus and the disk remain in the entry header while you scroll.
The disk saves edited entries. Copy lists dictionaries with their source
workspace and marks the selected one; export offers CSV and Excel side by side. **Save and close** respects the same scope; a
failed save keeps the window open. **Close without saving** discards changes.
Rename and delete apply to the shared original; deletion requires
confirmation. CSV and Excel exports contain saved original entries.

A dictionary can be linked to multiple workspaces. Links share the same
resource; a copy creates an independent dictionary. Workspace overrides and
exclusions change the local view of entries without altering the shared original.

Use the assignment control to attach a dictionary to the project. The
**Glossary** tab in the Tools column shows the full assigned glossary, with the
number of terms in its title; the highlight command colours the terms in the
sheets and, while on, shows the colour legend;
in the Glossary tab of the pipeline configuration you assign the dictionary and
edit its terms, saving them with the disk icon.

## Use during translation

Translation and revision stages receive instructions requiring the glossary’s
target terms. The evaluator can report deviations. These instructions do not
guarantee that a model will apply every entry correctly: review the result,
including after formatting.

DeepL Hybrid can create a DeepL glossary from assigned terms, subject to
language-pair and service constraints. This is a remote resource distinct
from the local dictionary.

## Highlighting

The Glossary tab’s legend explains the active colours. Defaults distinguish
source terms with a blue underline, matching target terms in green and missing
target terms in pink. Text search uses a separate colour. Colours can be
changed in translation settings.

Highlighting identifies textual matches; it does not interpret context or
replace linguistic review. A missing target term may require a correction
or a justified variant recorded in the glossary notes.

## Prompt templates

The **Prompt Templates** tab searches names and prompt text and filters by
Stages, Quality control, Translation context, System, Memory, or OCR. Templates are shared across
the application without belonging to a workspace. Use **+** to create a
template or its pencil command to edit it.

The form stores a name, scope, workflow, text, and an optional default provider
and model. Label hints explain each field. Select a provider and model to
refine the text; disabled commands explain missing requirements. The disk
saves and the cross cancels. A name already used in the same scope and
workflow requires editing that template or choosing a different name. The
trash command deletes only after confirmation.

Each template has a distinct title and a short preview on the same muted surface as the entry. The eye opens the
full text; the collapse command returns to the preview. Icons beside the title
explain scope, workflow and model on hover or when pressed. The pencil opens
the form within the same entry; search and filters stay disabled while editing
to preserve the draft. The form pairs scope with workflow and provider with
model, without separators between fields.

## Glossary, memory and examples

| Resource | Role |
| --- | --- |
| Glossary | Required terminology for the project |
| Phrase memory | Bilingual pairs selected as references for a segment |
| Translation examples | Approved segments that guide pipeline style |

See [Phrase memory and examples](./phrase-memory) for extraction, selection
and saving of bilingual pairs.

Dictionary and prompt lists distinguish each entry with one muted background shared by its text and expanded details. The dictionary title pencil replaces the name in place, keeping commands on the same row; Enter saves, Escape cancels.
