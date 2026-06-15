---
title: Annotations
---

# Annotations

Annotations let you attach structured notes to translated chunks so editorial
feedback stays close to the text it refers to and survives project reload.

## Annotation types

| Type | When to use |
|---|---|
| **Comment** | General observation, editorial decision worth keeping |
| **Doubt** | Open interpretation question — uncertain but not blocking |
| **Problem** | Real error that needs fixing before locking the chunk |
| **Approved** | Chunk reviewed and closed after manual reading and audit |

## How to create an annotation

- **With text selection**: right-click any text in the translation panel and choose
  *Add annotation*. The selected phrase is pre-filled as the anchor.
- **From a judge finding**: every issue in the audit output has a direct button to
  convert it to an annotation, with type, anchor, and text already filled in.
- **Without an anchor**: open the chunk notes panel and add a free annotation not
  linked to a specific passage.

## Where they appear

Annotations are visible in the **Notes** tab of the Insights panel, grouped by
chunk. In the rendered translation view, each annotation with an anchor inserts a
GFM marker (`[^a1]`, `[^a2]`, …) immediately after the anchored phrase, with the
note definition at the bottom of the chunk. The saved translation text is never
modified — markers exist only in the rendered view and disappear if the annotation
is deleted.

## What annotations are for

- Mark unresolved wording without losing the review context
- Capture editorial decisions made during audit
- Track judge findings that require manual follow-up
- Anchor a comment to a specific phrase instead of the whole chunk

## Common workflow

1. Run a test chunk and open the judge output.
2. Convert findings that need editorial work into annotations.
3. Edit the translation manually where needed.
4. Add **Comment** notes for decisions you want to keep.
5. Use **Approved** only after manual reading and a clean audit.

## Imported document footnotes

If you import a DOCX or Markdown file with footnotes, Glossa separates them
completely from the translation pipeline: the model receives only the body text,
without inline markers or footnote content. The original footnotes are saved with
the project and remain visible in the source editor. After translation you manage
footnotes manually: adapt their text to the target language and place them where
they make sense in the translated text, which may differ from the original.

> In a translation, a footnote can rarely occupy the same position as in the
> original, and its text should be rewritten rather than literally translated.
> Keeping footnotes out of the pipeline leaves the decision on position and
> wording to you.

## Practical rules

- Use **Problem** for real blockers, **Doubt** for open interpretation questions.
- Use **Approved** sparingly: it signals the chunk is genuinely closed.
- Anchoring matters: the note should point to the exact phrase you reviewed.
- Prefer short factual notes over long discussions inside a chunk.
- Source notes extracted from the document remain separate from user annotations.
