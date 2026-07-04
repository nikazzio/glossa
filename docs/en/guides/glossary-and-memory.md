---
title: Glossary and phrase memory
---

# Glossary and phrase memory

Glossa has two separate terminology tools. They solve different problems and work best together.

The distinction matters: the glossary is a constraint, while phrase memory is
contextual support. The first tells the model what it must respect; the second
shows approved examples that may help when the context is similar.

## Glossary

The glossary is explicit and project-facing. You define source terms, required
target terms, and optional notes, then Glossa injects those constraints into the run.

Use the glossary when:

- a term must always map to the same translation
- a project has house style or editorial vocabulary
- you want the judge to flag missing or incorrect terminology

## Phrase memory

Phrase memory is retrieval-based. Glossa extracts reusable source-target pairs
from approved work, stores them, and suggests them again for similar chunks later.

Use phrase memory when:

- recurring formulations appear across a corpus
- you want assistance beyond a small hand-maintained glossary
- the project evolves over time and should benefit from previously approved phrasing

## How they differ

| Tool | Best for | Input style |
|---|---|---|
| Glossary | Mandatory terminology | Manual entries |
| Phrase memory | Reusable local phrasing | Extracted approved pairs |

## Where each one acts in practice

- The glossary constrains the run up front.
- Phrase memory suggests reusable phrasing from prior approved work.
- The judge can still flag terminology or consistency failures after both.

Do not treat phrase memory as an absolute source of truth. A retrieved match can
be perfect in one chapter and wrong in another: it should be selected, not merely accepted.

## Recommended workflow

1. Start with a small glossary for names, terms, and non-negotiable translations.
2. Run a few chunks in Test mode.
3. Keep only good outputs.
4. Let Glossa save or search phrase-memory matches from approved work.
5. Review suggested matches before injecting them into a production run.

## Good practice

- Keep the glossary short and strict; do not turn it into a full style guide.
- Use phrase memory for patterns, not for unquestioned automation.
- If a retrieved phrase is contextually wrong, reject it rather than weakening the threshold globally.
- Re-check terminology during audit, especially after refine or format stages.
- If a phrase is critical and always mandatory, promote it to the glossary instead of leaving it only in memory.
