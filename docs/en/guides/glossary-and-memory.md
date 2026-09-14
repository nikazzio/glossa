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

A dictionary can be linked to multiple workspaces. Links share the same
resource; a copy creates an independent dictionary. Workspace overrides and
exclusions change the local view of entries without altering the shared original.

Use the assignment control to attach a dictionary to the project. The
**Glossary** tab in the Insight panel shows the full assigned glossary;
pipeline configuration provides access to its terminology register.

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

## Glossary, memory and examples

| Resource | Role |
| --- | --- |
| Glossary | Required terminology for the project |
| Phrase memory | Bilingual pairs selected as references for a segment |
| Translation examples | Approved segments that guide pipeline style |

See [Phrase memory and examples](./phrase-memory) for extraction, selection
and saving of bilingual pairs.
