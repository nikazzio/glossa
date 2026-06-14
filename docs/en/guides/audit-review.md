---
title: Audit and review
---

# Audit and review

Glossa does not stop at generating a draft. It also runs a judge stage so you
can inspect quality issues chunk by chunk.

## What the judge reports

- Overall quality rating
- Structured issues
- Suggested fixes
- Terminology, accuracy, grammar, fluency, and consistency concerns

## What to do after an audit pass

| Outcome | Next move |
|---|---|
| Minor wording issues | Edit manually, then re-run audit |
| Systematic terminology drift | Fix glossary or phrase-memory selection |
| Wrong interpretation | Revisit the translation prompt or provider choice |
| Formatting noise | Narrow the format stage instead of compensating in audit |

## Review loop

1. Run a test chunk or full batch.
2. Open the audit output for the chunk.
3. Read the issue list against the source and translated text.
4. Edit manually, re-run a stage, or re-run audit only.
5. Convert persistent issues into annotations if they need editorial tracking.

## When to trust the judge

The judge is best used as a second pass, not as the final authority.

- Trust it for spotting repeated terminology drift or obvious omissions.
- Verify it manually on nuanced register, interpretation, or philological edge cases.
- If it keeps reporting noise, tighten the prompt or simplify the earlier stages.

## Review strategy for long documents

- Use **Test** mode early to calibrate the pipeline on representative chunks.
- Use annotations to mark unresolved passages without losing context.
- Use coherence checks when the document depends on cross-chunk consistency.
- Export only after the chunk list is no longer carrying unresolved issues.
- Lock stable chunks only after they have survived both manual reading and audit review.
