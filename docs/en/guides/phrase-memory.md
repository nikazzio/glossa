---
title: Phrase memory and examples
---

# Phrase memory and examples

Phrase memory stores source text and approved translation pairs for reuse
within a workspace. Finding matches, selecting them for a prompt and saving
new phrases are separate operations.

## Retrieving references

When enabled, Glossa searches for matches for the document’s segments using
resources available to the workspace. This search changes neither translations
nor saved phrases.

The **References** tab displays matches and lets you adjust the similarity
threshold. Only selected pairs are included in the next request for that
segment. If matches exist but none are selected, starting translation warns
that those references will not be used.

Pairs are appended to stage instructions after the static prefix and document
context. They do not change the shared blocks prepared for caching. Similarity
indicates possible relevance, not semantic equivalence or suitability for the
current context.

## Creating and reviewing phrases

1. Review the translation and lock the segment.
2. Open **Memory**: previously saved pairs are loaded and selected.
3. Use **Extract phrases** to generate proposals, or add pairs manually.
4. Edit the text and select the pairs to retain.
5. Save to apply the selection.

Extraction does not save automatically. Deselecting a previously saved pair
and saving removes it from the collection. Unconfirmed edits remain in the
segment’s draft when you switch segments during review; this is not a
permanent save.

## Scope

Extracted phrases retain their link to the originating translation. Moving
that translation to another workspace moves its phrases with it. Imported,
linked resources can be shared through workspace links. The **Phrases** tab
in Language Resources provides access to the collection.

## Style examples

Translation examples are complete source and translation segment pairs used
to guide a pipeline’s register and style. They are not retrieved according
to similarity with the current segment.

For a locked segment, **Use as a style example** in the Audit tab adds the
pair to pipeline settings, where it can be edited or removed. The limit is
five examples. Since they form part of the static context, their length
contributes to request size.

Use the [glossary](./glossary-and-memory) for mandatory terminology and memory
references for wording relevant to an individual passage.
