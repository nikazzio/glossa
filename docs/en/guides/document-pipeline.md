---
title: Translating a document
---

# Translating a document

During execution you cannot switch pipelines or create a new one. Memory,
Review and Document remember the selected subtab when you visit another tab;
if that view is unavailable, an available view is shown instead.

Translation operates on text segments, also called *chunks* in the interface.
Each segment retains its source text, stage outputs, editable translation,
assessment and annotations. A document containing only one segment uses the
same workflow.

## Import and segmentation

Import a file or enter source text, then review the preview. Automatic
segmentation uses a target word count. Markdown heading options can keep a
heading with the following text or split sections at a chosen heading level.

Check the boundaries before confirming: they define the units used for
translation and review. See the [import and export reference](../reference/import-export)
for formats, size limits and imported footnotes.

## Configuration

Open the pipeline configuration (the gear in the Studio's top row) and set the
Translation context, mode, providers, models and instructions; choose languages only for DeepL: its tabs are described in
[pipeline configuration](../reference/pipeline-config). Pipeline modes define these sequences:

| Mode | Processing |
| --- | --- |
| Standard | Translation and automated assessment |
| Editorial | Translation, draft revision (*Refine*), formatting (*Format*) and assessment |
| DeepL Hybrid | DeepL translation, LLM refinement and LLM assessment |

Each LLM stage has an independent provider and model selection. DeepL requires
its own API key and does not act as the evaluator. The pipeline mode cannot
be changed when processing or existing results lock that setting.

## Testing and execution

Use **Test** to assess a segment while keeping the configuration editable.
Review the draft and findings before switching to production. Execution
controls let you process the current segment or multiple segments; the selected
count limits the group to process.

Processing advances through the segments and updates their states. Cancelling
stops the current work without removing completed results. Resuming and rerunning
serve different purposes: resuming processes outstanding work, while rerunning
recalculates the unverified segments covered by the selected action.
If models, stage or audit prompts, the Translation context or DeepL options change after the
interruption, resuming warns that the configuration is no longer the one the
work started with.

While a segment is being translated, its translation text is covered by a gold
veil, “Translation in progress…”, and cannot be edited: the text does not
appear as it is generated, it arrives when the stage finishes. The stage column
in the margin stays usable; the original is read-only and the pencil says why.

## Reading and review

The translation studio opens inside the application frame: the main bar on
the left stays visible and leads to any area, closing the translation. While
the pipeline is running its entries are off, like the way back to the
catalogue.

At the top, the bar shows work / pipeline and Simple, Editorial or DeepL mode. Long names are truncated; hover reveals the full name. Click the work name to rename it. The pipeline name, with its small arrow, opens the menu to select, create, rename or delete; the gear opens options. Only DeepL displays a language pair. Import, export, language resources and deletion are on the right.

In the middle the two sheets place source and translation side by side. Above
them, on the left, the number of the open segment; in the middle a window of
seven dots, one per segment with its state: the open segment stays still under
the central mark while the others slide to the sides. The single arrows move
to the neighbouring segment, the double ones jump by seven; the mouse wheel
over the dots also scrolls through segments, and clicking a dot opens it. To
the right of the dots, the stage indicators show where the open segment stands
(translation, revision, formatting, audit): a click opens that stage's detail.
The magnifier next to them opens the whole-document search below the row; a
result leads to its segment, Esc closes it.

On the right, the **Tools** column starts with execution — translate, the **Multiple chunks** switch with the number of
segments to process (always visible, off when translating a single segment) —
and costs, then the tabs, in this order: **Glossary**,
**Memory**, **Preview**, **Review** and **Document**, which gathers the
whole-document summaries as three sub-tabs: **Index**, **Statistics** and
**Coherence**. Memory gathers two sub-tabs: **similar phrases
in memory**, to use while translating, and **Extract phrases**, which saves the
segment's pairs; extraction turns on once the segment is translated. Review gathers three sub-tabs,
**Audit**, **Notes** and **Source notes** (the footnotes imported with the
source, shown only when the segment has some): icon tabs with name and count
in the tooltip, each with its own list; it opens on the audit when it has open findings,
otherwise on the notes. Audit turns on once the segment is translated,
Glossary once a glossary is assigned; the reason stays in the
tooltip. Collapsed to icons, the column
keeps only the translate button visible, or stop while running.

Intermediate stage outputs help identify where a change was introduced.
Their controls sit in a column in the right margin of the translation page,
next to the scrollbar: at the top the stages in pipeline order, then
comparison and the pairs to compare; the one you are viewing is highlighted.
After a manual edit, **Re-evaluate** runs the quality assessment alone.
If you correct the source with the pencil, the ochre **Source changed** label
appears next to the translation title and the segment’s circle gets an ochre
mark: the translation needs updating.

The check next to the **Candidate translation** title marks the translation as
verified: it turns green, the text locks and rerunning unverified segments
skips it. Verifying also clears “needs updating”, because it means you checked
it against the current source; the same control returns it to draft. The check
is off while the segment is being translated or when there is no translation
yet. Every disabled control gives its reason in the tooltip.

Current limit: “needs updating” is not kept when the translation is closed;
reopening it, the mark is gone.

### Segment history

**Review → History** lists the open segment’s versions, newest first, with the
author (**Pipeline** or **Manual**), date and time, and the **Current** and
**Verified** marks. A version is written at every pipeline pass (including the
rewrite after the audit), at every save with the disk or `Ctrl + S` if the
segment’s text changed since its last version, and on verification when the
verified text differs. Automatic saving writes no versions, so the history does
not fill up at every pause.

Restore puts a version’s text back on the page and writes it as a new version:
the earlier ones stay. It is off on a verified translation (return it to draft
first) and while the segment is being translated. Current limits: versions
cannot be deleted or named, and the history does not show the model used,
because a pipeline uses more than one. History is per pipeline and is lost if
the document is split again into different segments.

## Request previews

Pipeline configuration shows the structure of the prompts. The segment’s
**Preview** tab builds the selected stage’s request for the current text.
Besides the stages, the selector offers **Audit** and **Coherence**: they show
the message each would receive with the segment’s current translation
(coherence also with the neighbouring segments). On a segment without a
translation both entries are disabled, with the reason next to the name.
This action does not call a model or generate a translation.

## Export

Check incomplete segments before exporting: standard formats may use the
source text where a segment has no translation. Bilingual export explicitly
distinguishes the source from a missing translation. See
[export formats and contents](../reference/import-export).


## Saving, navigation and cost details

While translation is running, the Studio remains open. Wait until it finishes
or stop processing before leaving. The save icon and Ctrl/⌘+S save changes;
after a failure the command offers **Retry**. User feedback is translated;
technical details remain in the log. History loading and restoration follow the same rule.

Unavailable tabs remain reachable with Tab so their labels explain why they
cannot be opened. Arrow keys skip them. Circular selectors remain reachable
even when the currently selected option is unavailable.

Hover over estimated cost or usage in Tools to open details. The estimate follows
the selected mode and block count; usage refers to the open chunk. The block
count does not represent repeated translations.
