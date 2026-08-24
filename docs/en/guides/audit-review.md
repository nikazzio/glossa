---
title: Audit and review
---

# Audit and review

Glossa does not stop at generating a draft. It also runs a judge stage so you
can inspect quality issues chunk by chunk.

The judge is separate from generation because the model that produced a draft should
not be the only reviewer of that draft. [LLMs and pipelines](./llm-and-pipelines)
explains the general principle.

## What the judge reports

- Overall quality rating
- Structured issues
- Suggested fixes
- Terminology, accuracy, grammar and fluency concerns

**Consistency across segments** comes from the coherence check instead, which is
a separate pass with its own prompt.

### The shape of the answer is the same for everyone

The judge has to answer in a precise shape — a rating, a list of issues, the
type and severity of each — and that shape is **a single one**, valid for every
provider. With local models Glossa enforces it while the answer is generated, so
the model cannot even phrase an answer outside the format; with cloud providers
it is declared in the request.

For the same reason, **at judging time the temperature stays at zero** on local
models, whatever value is set: an answer bound to a schema has to be
predictable, and two runs on the same text must not give different verdicts by
chance. Translations keep using the temperature you chose, and a note in the
judge's settings says so where the field is filled in.

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

## See also

- [Annotations](./annotations) — how to track and anchor editorial findings per chunk
- [Glossary and phrase memory](./glossary-and-memory) — for controlling terminology drift upstream
- [LLMs and pipelines](./llm-and-pipelines) — why the judge is a separate stage
- [Context and caching](./context-and-caching) — how Glossa keeps consistency across chunks
