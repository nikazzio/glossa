---
title: Phrase memory and examples
---

# Phrase memory and examples

While editing text or metadata, search stays disabled with its reason.
Long provenance titles wrap.

Phrase memory stores source text and approved translation pairs for reuse
in translations. Finding matches, selecting them for a prompt and saving
new phrases are separate operations.

## Retrieving references

When enabled, Glossa searches for matches for the document’s segments using
resources available to the workspace. This search changes neither translations
nor saved phrases.

The **References** sub-tab of the **Memory** tab displays matches. At the top
there is a single row: the similarity threshold (slider, or − and + one
hundredth at a time), the globe and refresh. Each result shows the original in
book type and the translation below, with the language code in the margin; at
the top, next to the similarity, the phrase's language pair with its varieties
(“Italian (Old Italian) → English”); below, one line with work and chunk; the “i” icon adds workspace, book and model.
Each result says where it comes from: “this document”
(highlighted), “another work in the workspace” or “another workspace”. The
order is this document first, then the workspace, then the rest; within each
group the highest similarity comes first. Only selected pairs are included in the next request for that
segment. If matches exist but none are selected, starting translation warns
that those references will not be used.

Pairs are appended to stage instructions after the static prefix and document
context. They do not change the shared blocks prepared for caching. Similarity
indicates possible relevance, not semantic equivalence or suitability for the
current context.

## Creating and reviewing phrases

1. Review the translation and mark it as verified.
2. Open **Memory** → **Memory**: saved pairs are loaded read-only.
3. Use **Extract phrases** to generate proposals, or add pairs manually.
4. Edit the text and select the pairs to retain.
5. Use the disk command **Add checked pairs to memory**.

Extraction does not save automatically. Saving only adds selected new pairs,
preserving existing ones. To remove a saved pair, use its own trash command
and confirm. Unconfirmed edits remain in the
segment’s draft when you switch segments during review; this is not a
permanent save.

## Scope and compatibility

New saved phrases take the language, variety and note of the work they come
from; automatic phrase-pair extraction tells the model the work’s real
languages, with variety and note. After every Confirm in the
[Languages of the work](./document-pipeline) window, if
memory holds phrases from this work with different languages, the app asks
whether to give them the work’s languages: text and similarity measures stay
the same and the previous version stays in the history. Extracted phrases follow the current workspace of their source translation.
Provenance separately preserves the workspace at extraction time. Viewing a
phrase from another workspace does not create links or copies.

The globe icon next to the References refresh button extends the search to
other workspaces and unassigned phrases; the choice is remembered per workspace
and is no longer in the workspace settings. Only the target language filters:
phrases translated into a different target language are not suggested; the
source language does not filter. If the work has no target language, no
language filter applies. Search always requires the same embedding model,
dimensions and input profile. Texts without the requested embedding remain
in the catalogue but are excluded from similarity results. Different models
are never compared. Already saved chunk pairs are not inserted as zero-distance matches.

## Texts, provenance and multiple embeddings

Each pair links to a textual unit with revisions of its source and translation.
Adding a model preserves embeddings from other models without duplicating the
pair. Equal texts from different chunks remain distinct units.

When creating a translation, select **Source book and version** from the Library (searchable by title or copy).
Without this explicit choice, the book remains **Not specified**; the filename
does not determine it. Extracted phrases record the book, version, translation,
chunk and original workspace. Unknown page numbers are never invented.

## Managing the collection

Open **Linguistic resources → Memories**. General resources start with all
phrases; workspace resources start with its collection. Filter by workspace,
**All**, **Unassigned** and tag, or search texts and tags.

Each entry shows source and translation side by side. Languages with varieties, an origin
title and tags help identify it without opening details. **Provenance, tags and
measurements** opens the full information for the selected entry: book,
workspace, translation, chunk, date, tags and embedding models.

Select a model in the details and use plus to add its embedding or the circular
arrow to recalculate it. Calculation requires an OpenAI key and incurs costs,
described in the confirmation. Other models are preserved. Search and filters
are disabled while editing text or tags to preserve the draft; finish or cancel
the edit to use them again.
Workspace settings can calculate the selected model for all its memory entries.
Saving settings applies the active search model independently of calculation.

The pencil edits both memory texts. Editing only the translation does not
recalculate source embeddings. Editing the source recalculates every available
embedding after cost confirmation: text and vectors are saved together, or
nothing changes if a calculation fails. Earlier revisions remain archived;
search uses only the current revision. These edits do not change the source document.

**Text tags** are reusable manual labels, separated by semicolons. They are
not automatic classifications. After confirmation, the bin removes the pair,
its revisions and embeddings. The dictionary command copies it into the
selected dictionary; save pending dictionary edits first. **CSV export**
includes text, tags, provenance and models for visible phrases only. The app
backup also preserves revisions and vectors; CSV does not replace it.

The underlying structure supports variable-length units and untranslated texts.
Selecting pages or sections, automatic classification and semantic corpus
analysis are future work, not tools currently available on this screen.

Deleting a translation preserves archived texts, book and provenance.
They become unassigned entries and indicate that the translation is unavailable.
After a source edit, provenance still describes the initial extraction; a row
identifies the edit without silently reassigning the citation.

## Style examples

Translation examples are complete source and translation segment pairs used
to guide a pipeline’s register and style. They are not retrieved according
to similarity with the current segment.

For a verified segment, **Use as a style example** in the Audit tab adds the
pair to the Memory tab of the pipeline configuration, where it can be edited or removed. The limit is
five examples. Since they form part of the static context, their length
contributes to request size.

Use the [glossary](./glossary-and-memory) for mandatory terminology and memory
references for wording relevant to an individual passage.

## In the Translation Studio

In the Memory tab, **References** shows similar phrases already in memory: for
each, under the pair, where it comes from (workspace, translation, segment, or
“imported”). The circled check decides which to use in the translation.
**Memory** opens only once the translation is verified: saved pairs are removed
one by one with the bin; new ones are checked and added with the disk, which
never deletes the others. The search excludes phrases translated into a
different target language than the work’s.

Collection entries have one muted background distinct from the window; expanded details share that same surface. Details list embeddings one per row; the calculation command shows a spinner until the request completes.
