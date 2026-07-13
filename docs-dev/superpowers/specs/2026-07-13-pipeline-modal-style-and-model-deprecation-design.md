# Pipeline modal style cleanup + model deprecation system

**Status:** approved, ready for implementation plan.

## Context

Two independent pieces of work, both scoped in the same conversation:

1. **Style pass** on the "Configura pipeline" modal (`ConfigDrawer` + its three tab
   panels: Settings, Translation, Audit) — redundant header, unclear editable
   pipeline-name field, an unexplained "context memory" card, and section-title
   markup that diverges from the shared `SectionLabel` primitive in two spots.
2. **Model deprecation system** — a follow-up to removing several OpenAI models
   from the catalog (PR #334). Deleting a model entry outright breaks pricing and
   context-window lookups for any saved project still configured with it (falls
   back to an Ollama-sized 8192-token budget instead of the model's real
   capacity — a real behavior regression, not just a cosmetic one). Need a
   reversible "deprecated" state instead of deletion, surfaced with a warning
   and an explicit override to still pick a deprecated model.

## Part A — Pipeline modal style

### A1. Redundant header
`ConfigDrawer`'s `Dialog` sets both `eyebrow={t('document.configDrawerTitle')}`
("Configurazione pipeline") and `title={t('pipeline.configurePipeline')}`
("Configura pipeline") — same phrase twice. Drop the `eyebrow` prop; `title`
alone stays.

### A2. Editable pipeline-name field
Currently a bare `<input>` styled as a large italic heading with no affordance
that it's editable, and it silently auto-saves on blur/Enter.

- Add a `Pencil` icon (same icon/size already used for "edit" elsewhere in this
  modal, e.g. `PersonaEditor`) next to the text, low opacity by default, full
  opacity on hover of the row — signals "this is editable" before any
  interaction.
- While the field is focused and its value differs from the committed pipeline
  name, show `Check` (confirm) and `X` (cancel) `IconButton`s next to it —
  mirrors the exact save/cancel icon pair `PersonaEditor` already uses for its
  template-name mini-form. `Check`/Enter commits (calls `renamePipeline`,
  same as today's blur-commit); `X`/Escape reverts the draft to the last
  committed name without saving.
- No new primitive — reuses `IconButton` + existing icons already imported in
  this modal's file tree.

### A3. Unexplained "context memory" card
The card only shows a computed number ("Automatica — ~8000 token basati su
modello X"), never what the feature is for. Add one plain-language sentence
above the existing technical line:

> "Quando il testo viene diviso in più blocchi da tradurre, questa opzione
> decide quanto del blocco precedente il modello vede per non perdere il filo
> tra un blocco e l'altro."

Also rename the toggle itself from "Memoria di contesto" (implies the toggle
turns memory on/off) to "Override manuale" (it actually only switches between
automatic and manual sizing; memory is always active). "Memoria di contesto"
stays as the section title.

### A4. Section-title inconsistency
`SettingsTabPanel` and `AuditTabPanel` already use the shared `SectionLabel`
component for section headers. Two spots hand-roll the same icon+uppercase-
label markup instead of reusing it:

- `StageCard`'s "Modello" header and "Prompt" header (raw `<Cpu>`/`<FileText>`
  + `<p>`/`<span>` markup) → replace both with `<SectionLabel icon=... label=...
  />`, following the exact same header-row layout `PersonaEditor` already uses
  when a badge and inline actions sit next to the label.
- `TranslationTabPanel`'s stage-role header (manual `text-editorial-ink`
  variant with a trailing rule) → replace with `SectionLabel`, using a
  role→icon map (translation→Languages, refine→Wand2, format→FileText,
  audit→ShieldCheck, deepl-translation→Network — same icons already imported
  in `SettingsTabPanel`'s mode-preview row).

No visual behavior change beyond consistent header styling; these are
drop-in replacements of equivalent markup.

## Part B — Model deprecation system

### B1. Catalog: `deprecated` status instead of deletion
`ModelStatus` already includes `'deprecated'` in its type but nothing reads it.
Re-add the 8 OpenAI models cut in PR #334 (`gpt-4.1`, `gpt-4.1-mini`,
`o4-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.4`, `gpt-5.4-mini`) to
`MODEL_CATALOG` with `status: 'deprecated'`, keeping their real `pricing` and
`contextWindow` values so cost estimate and blob-budget math stay correct for
any project still configured with one of them.

### B2. Picker filtering
`getSelectableModelIds` / `getKnownModelIds` gain default filtering that
excludes `deprecated` entries — new stages/judge-model picks only see current
models. Add an `includeDeprecated` opt-in parameter for the override control
(B4). A stage/judge model that is already set to a deprecated ID must still
render in its own `<select>` (never silently vanish) — same mechanism already
used for the existing `(preview)` suffix on `status === 'preview'`, extended
to also label `(superato)` for `status === 'deprecated'`.

### B3. Warning badge
Next to the model `<select>` in `StageCard` and `AuditTabPanel` — same spot
`ModelCapabilityHint`'s `iconOnly` reasoning pill already occupies — add a
second small pill (AlertTriangle, `editorial-warning` tone) shown only when
`getModelStatus(provider, model) === 'deprecated'`, tooltip explaining the
model still may work but no longer has current pricing/context data behind it
(published product-known info, not a live check against the provider).

### B4. Override button
A small `IconButton` next to the model `<select>` (both in `StageCard` and
`AuditTabPanel`) that toggles local component state to call
`getSelectableModelIds(..., { includeDeprecated: true })` for that dropdown's
option list — lets a user deliberately bring deprecated models back into the
picker. Per-dropdown local state, not a global setting.

## Out of scope
- No backend/Rust changes (nothing there depends on catalog status).
- No change to which Anthropic models are in the catalog (none were removed).
- No automated provider-side model-list fetching (separate, previously
  discussed, not part of this design).

## Testing
- Unit tests for `getSelectableModelIds`/`getKnownModelIds` deprecated
  filtering + `includeDeprecated` opt-in.
- Unit test that a stage already configured with a deprecated model still
  resolves pricing and context window correctly.
- Existing `pipelineModes.test.ts` / `costEstimate.test.ts` continue to pass
  unchanged (deprecated models are additive, not replacing survivors).
