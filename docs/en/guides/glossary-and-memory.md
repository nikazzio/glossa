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

Import provides a preview and a choice between merging data and replacing
the contents. Check the source, target and notes field mapping before
confirming. Replacement removes the dictionary’s previous entries.

## Sharing and local overrides

**General language resources** offer the same management. The workspace
filter shows every linked dictionary, including shared dictionaries; it also
supports all dictionaries or those without a workspace. This filter narrows
the list: general resources always read and edit originals. Select a
destination workspace to create, import or copy a dictionary. Search checks
dictionary names.

In an open dictionary, **You are editing** and **Changes apply to** show the
actual resource and scope. Shared original edits apply to all linked
workspaces; existing local overrides remain in effect. Editing as a guest
workspace changes only its view of existing entries. New terms are added to
the shared original, as a separate row explains. Existing source terms cannot
be renamed through a local override.

The disk saves edited entries. **Save and close** respects the same scope; a
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
Stages, Quality control, Persona, Memory, or OCR. Templates are shared across
the application without belonging to a workspace. Use **+** to create a
template or its pencil command to edit it.

The form stores a name, scope, workflow, text, and an optional default provider
and model. Label hints explain each field. Select a provider and model to
refine the text; disabled commands explain missing requirements. The disk
saves and the cross cancels. A name already used in the same scope and
workflow requires editing that template or choosing a different name. The
trash command deletes only after confirmation.

## Glossary, memory and examples

| Resource | Role |
| --- | --- |
| Glossary | Required terminology for the project |
| Phrase memory | Bilingual pairs selected as references for a segment |
| Translation examples | Approved segments that guide pipeline style |

See [Phrase memory and examples](./phrase-memory) for extraction, selection
and saving of bilingual pairs.
