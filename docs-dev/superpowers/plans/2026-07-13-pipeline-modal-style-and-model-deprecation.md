# Pipeline Modal Style + Model Deprecation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the "Configura pipeline" modal's redundant/unclear UI, unify its section-title markup on the shared `SectionLabel` primitive, and replace catalog-model deletion with a reversible `deprecated` status plus a picker override and warning badge.

**Architecture:** Pure frontend (React/TypeScript), no Rust/backend changes. Style fixes are localized markup swaps in existing components. The deprecation system adds one new catalog status filter (already-typed but unused `ModelStatus = 'deprecated'`) plus two small presentational additions (a warning badge, a per-dropdown override toggle) reusing existing primitives (`IconButton`, `SectionLabel`, `data-tooltip`).

**Tech Stack:** React 19, TypeScript, Tailwind, Vitest, react-i18next (it.json/en.json).

Design doc: `docs-dev/superpowers/specs/2026-07-13-pipeline-modal-style-and-model-deprecation-design.md`

## Global Constraints

- No new ad-hoc buttons/labels — reuse `IconButton`, `SectionLabel`, `ToggleRow` from `src/components/ui` per `docs-dev/UI_DESIGN_SYSTEM.md`.
- Tooltips on non-interactive indicators use the app's `data-tooltip` attribute (see `ModelCapabilityHint`'s `iconOnly` variant) — never the native HTML `title` attribute.
- Every new user-facing string needs both `src/i18n/it.json` and `src/i18n/en.json` entries, same key, same nesting.
- No backend/Rust changes — nothing there reads model status.
- Run `npx tsc --noEmit -p .` after every task; must report "No errors found" before committing.
- Don't touch `help.features.configDrawerTitle` (a distinct, unrelated i18n key in the same file) — only `document.configDrawerTitle` is removed.

---

### Task 1: ConfigDrawer — drop redundant header, add editable-name affordance

**Files:**
- Modify: `src/components/document/ConfigDrawer.tsx`
- Modify: `src/i18n/it.json:886` (delete `document.configDrawerTitle` key)
- Modify: `src/i18n/en.json:886` (delete `document.configDrawerTitle` key)
- Test: `src/components/document/ConfigDrawer.test.tsx` (create — no existing test file for this component)

**Interfaces:**
- Consumes: `IconButton` (`../ui`, existing), `renamePipeline` (existing `useProjectStore` action, unchanged signature `(id: string, name: string) => Promise<void>`).
- Produces: no new exports; internal-only markup change.

- [ ] **Step 1: Remove the redundant `eyebrow` prop**

In `src/components/document/ConfigDrawer.tsx`, find:

```tsx
    <Dialog
      open={showConfigDrawer}
      onOpenChange={(open) => { if (!open) setShowConfigDrawer(false); }}
      title={t('pipeline.configurePipeline')}
      eyebrow={t('document.configDrawerTitle')}
      closeLabel={t('common.close')}
```

Replace with:

```tsx
    <Dialog
      open={showConfigDrawer}
      onOpenChange={(open) => { if (!open) setShowConfigDrawer(false); }}
      title={t('pipeline.configurePipeline')}
      closeLabel={t('common.close')}
```

- [ ] **Step 2: Delete the now-unused i18n key in both locales**

In `src/i18n/it.json`, delete line 886:
```json
    "configDrawerTitle": "Configurazione pipeline",
```
In `src/i18n/en.json`, delete line 886:
```json
    "configDrawerTitle": "Pipeline configuration",
```
(Confirm each is a top-level key under the `"document"` object, and that no trailing/leading comma breaks the JSON — the entry above and below it keep their own commas as-is; only this one line is removed.)

- [ ] **Step 3: Add `Pencil`, `Check`, `X` to the lucide-react import**

Find:
```tsx
import { LibraryBig, Save, Trash2 } from 'lucide-react';
```
Replace with:
```tsx
import { Check, LibraryBig, Pencil, Save, Trash2, X } from 'lucide-react';
```

- [ ] **Step 4: Replace the `nameInput` block with an editable-affordance + confirm/cancel version**

Find:
```tsx
  const nameInput = (
    <input
      id="config-drawer-title"
      type="text"
      value={nameValue}
      onChange={(e) => setNameValue(e.target.value)}
      onBlur={() => {
        const trimmed = nameValue.trim();
        if (!trimmed) { setNameValue(activePipeline?.name ?? t('pipeline.globalSetup')); return; }
        if (activePipelineId && activePipeline && trimmed !== activePipeline.name) {
          void renamePipeline(activePipelineId, trimmed);
        }
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder={t('pipeline.globalSetup')}
      aria-label={t('pipeline.pipelineNameLabel')}
      className="w-full bg-transparent font-display text-2xl italic tracking-tight text-editorial-ink outline-none placeholder:text-editorial-muted/40 transition-colors focus:text-editorial-accent"
    />
  );
```

Replace with:
```tsx
  const isNameDirty = !!activePipelineId && !!activePipeline && nameValue.trim() !== activePipeline.name;

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) { setNameValue(activePipeline?.name ?? t('pipeline.globalSetup')); return; }
    if (activePipelineId && activePipeline && trimmed !== activePipeline.name) {
      void renamePipeline(activePipelineId, trimmed);
    }
  };

  const cancelNameEdit = () => {
    setNameValue(activePipeline?.name ?? '');
  };

  const nameInput = (
    <div className="flex items-center gap-2">
      <div className="group relative flex-1">
        <input
          id="config-drawer-title"
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={() => { if (isNameDirty) commitName(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitName(); e.currentTarget.blur(); }
            if (e.key === 'Escape') { cancelNameEdit(); e.currentTarget.blur(); }
          }}
          placeholder={t('pipeline.globalSetup')}
          aria-label={t('pipeline.pipelineNameLabel')}
          className="w-full bg-transparent font-display text-2xl italic tracking-tight text-editorial-ink outline-none placeholder:text-editorial-muted/40 transition-colors focus:text-editorial-accent border-b border-transparent group-hover:border-editorial-border/60 focus:border-editorial-accent/50"
        />
        {!isNameDirty && (
          <Pencil
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-editorial-muted/30 opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
      {isNameDirty && (
        <div className="flex items-center gap-1 shrink-0">
          <IconButton size="sm" tone="accent" onClick={commitName} title={t('common.confirm')}>
            <Check size={14} />
          </IconButton>
          <IconButton size="sm" onClick={cancelNameEdit} title={t('common.cancel')}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: `No errors found`

- [ ] **Step 6: Write the failing test**

Create `src/components/document/ConfigDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigDrawer } from './ConfigDrawer';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';

vi.mock('../../services/glossaryService', () => ({
  assignGlossaryToProject: vi.fn(),
  upsertGlossaryEntries: vi.fn(),
}));

describe('ConfigDrawer pipeline name field', () => {
  beforeEach(() => {
    useUiStore.setState({ showConfigDrawer: true });
    useProjectStore.setState({
      currentProjectId: 'proj-1',
      activePipelineId: 'pipe-1',
      pipelines: [{ id: 'pipe-1', name: 'Draft A' } as any],
      renamePipeline: vi.fn().mockResolvedValue(undefined),
    } as any);
  });

  it('shows confirm/cancel controls only while the name is dirty', () => {
    render(
      <ConfigDrawer onRunPipeline={() => {}} onRunAuditOnly={() => {}} onCancelPipeline={() => {}} />,
    );
    // react-i18next is globally mocked in src/test/setup.ts to return the raw key
    // (`t: (key) => key`), and IconButton's aria-label defaults to its `title` prop —
    // so query by the untranslated i18n key, not the Italian copy.
    const input = screen.getByLabelText('pipeline.pipelineNameLabel') as HTMLInputElement;
    expect(screen.queryByRole('button', { name: 'common.confirm' })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Draft B' } });
    expect(screen.getByRole('button', { name: 'common.confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
  });

  it('cancel reverts to the committed name without calling renamePipeline', () => {
    const { renamePipeline } = useProjectStore.getState();
    render(
      <ConfigDrawer onRunPipeline={() => {}} onRunAuditOnly={() => {}} onCancelPipeline={() => {}} />,
    );
    const input = screen.getByLabelText('pipeline.pipelineNameLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Draft B' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(input.value).toBe('Draft A');
    expect(renamePipeline).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/document/ConfigDrawer.test.tsx`
Expected: both tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/document/ConfigDrawer.tsx src/components/document/ConfigDrawer.test.tsx src/i18n/it.json src/i18n/en.json
git commit -m "fix(pipeline): drop redundant modal header, add editable-name affordance"
```

---

### Task 2: TranslationTabPanel — context-memory explainer, override rename, stage-role SectionLabel

**Files:**
- Modify: `src/components/pipeline/TranslationTabPanel.tsx`
- Modify: `src/i18n/it.json` (add `pipeline.blobContextExplainer`, `pipeline.blobOverrideToggle`)
- Modify: `src/i18n/en.json` (same keys)

**Interfaces:**
- Consumes: `SectionLabel` (`../ui`, existing, signature `{ icon: LucideIcon; label: string }`).
- Produces: no new exports.

- [ ] **Step 1: Add the two new i18n keys**

In `src/i18n/it.json`, right after line 93 (`"blobContextAutoDesc": "..."`), insert:
```json
    "blobContextExplainer": "Quando il testo viene diviso in più blocchi da tradurre, questa opzione decide quanto del blocco precedente il modello vede, per non perdere il filo tra un blocco e l'altro.",
    "blobOverrideToggle": "Override manuale",
```

In `src/i18n/en.json`, right after line 93, insert:
```json
    "blobContextExplainer": "When the text is split into multiple translation blocks, this option decides how much of the previous block the model sees, so it doesn't lose the thread between one block and the next.",
    "blobOverrideToggle": "Manual override",
```

- [ ] **Step 2: Import `SectionLabel`, `Languages`, `Wand2`, `Network`**

Find:
```tsx
import { AlertTriangle, FileText, RotateCcw, ShieldCheck } from 'lucide-react';
```
Replace with:
```tsx
import { AlertTriangle, FileText, Languages, Network, RotateCcw, ShieldCheck, Wand2, type LucideIcon } from 'lucide-react';
```

Find:
```tsx
import { IconButton, ToggleRow } from '../ui';
```
Replace with:
```tsx
import { IconButton, SectionLabel, ToggleRow } from '../ui';
```

Find:
```tsx
import type { OllamaStatus, PipelineConfig, PipelineStageConfig, PromptTemplate } from '../../types';
```
Replace with:
```tsx
import type { OllamaStatus, PipelineConfig, PipelineStageConfig, PromptTemplate, StageRole } from '../../types';
```

- [ ] **Step 3: Add the role→icon map at module scope**

Right after the imports (before `interface TranslationTabPanelProps`), add:
```tsx
const STAGE_ROLE_ICON: Record<StageRole, LucideIcon> = {
  translation: Languages,
  refine: Wand2,
  format: FileText,
  'deepl-translation': Network,
};
```

- [ ] **Step 4: Wrap the blob-context card with a `SectionLabel` + explainer, rename the toggle**

Find:
```tsx
  const blobContextCard = (
    <div className="space-y-3 border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
      <ToggleRow
        icon={<FileText size={13} />}
        label={t('pipeline.blobContext')}
        checked={isOverride}
        disabled={translationsExist}
        onChange={() => setConfig((prev) => ({
          ...prev,
          blobBudgetTokens: isOverride ? 0 : auto.budget,
        }))}
      />
      {!isOverride && (
```

Replace with:
```tsx
  const blobContextCard = (
    <div className="space-y-3">
      <SectionLabel icon={FileText} label={t('pipeline.blobContext')} />
      <div className="space-y-3 border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
        <p className="text-xs leading-relaxed text-editorial-muted/80">
          {t('pipeline.blobContextExplainer')}
        </p>
        <ToggleRow
          icon={<FileText size={13} />}
          label={t('pipeline.blobOverrideToggle')}
          checked={isOverride}
          disabled={translationsExist}
          onChange={() => setConfig((prev) => ({
            ...prev,
            blobBudgetTokens: isOverride ? 0 : auto.budget,
          }))}
        />
        {!isOverride && (
```

Then find the closing of this card (the original had two closing `</div>` — one for the `isOverride` block and one for the outer card):
```tsx
          <p className="text-[11px] text-editorial-muted/70">{t('pipeline.blobOverlapHint')}</p>
        </div>
      )}
    </div>
  );
```

Replace with (one extra closing `</div>` for the new wrapper, plus re-indentation of the block already there):
```tsx
          <p className="text-[11px] text-editorial-muted/70">{t('pipeline.blobOverlapHint')}</p>
        </div>
      )}
      </div>
    </div>
  );
```

(The inner content between these two edited boundaries — the `{isOverride && (...)}` block with the budget/overlap number inputs — is unchanged; only its surrounding indentation level is now one level deeper because of the new wrapper `<div>`. Re-indent it for readability but do not change its logic.)

- [ ] **Step 5: Replace the stage-role header with `SectionLabel`**

Find:
```tsx
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-sans uppercase tracking-[0.14em] text-editorial-ink font-bold">
                {t(`pipeline.stageRole.${stage.role ?? 'translation'}`)}
              </span>
              <span className="h-px flex-1 bg-editorial-border/60" aria-hidden="true" />
            </div>
```
Replace with:
```tsx
            <div className="flex items-center gap-2">
              <SectionLabel
                icon={STAGE_ROLE_ICON[stage.role ?? 'translation']}
                label={t(`pipeline.stageRole.${stage.role ?? 'translation'}`)}
              />
              <span className="h-px flex-1 bg-editorial-border/60" aria-hidden="true" />
            </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: `No errors found`

- [ ] **Step 7: Run the existing pipeline test suite to confirm no regressions**

Run: `npx vitest run src/pipeline`
Expected: all tests still pass (this task doesn't change any config/behavior, only markup/copy).

- [ ] **Step 8: Commit**

```bash
git add src/components/pipeline/TranslationTabPanel.tsx src/i18n/it.json src/i18n/en.json
git commit -m "fix(pipeline): explain context-memory card, unify stage-role titles on SectionLabel"
```

---

### Task 3: StageCard — unify "Modello" and "Prompt" headers on SectionLabel

**Files:**
- Modify: `src/components/pipeline/StageCard.tsx`

**Interfaces:**
- Consumes: `SectionLabel` (`../ui`, existing).
- Produces: no new exports; markup-only change, no prop/behavior change.

- [ ] **Step 1: Import `SectionLabel`**

Find:
```tsx
import { IconButton } from '../ui';
```
Replace with:
```tsx
import { IconButton, SectionLabel } from '../ui';
```

- [ ] **Step 2: Replace the "Modello" header**

Find:
```tsx
        <div className="flex items-center gap-1.5">
          <Cpu size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-editorial-muted">
            {t('pipeline.stageModelLabel')}
          </p>
        </div>
```
Replace with:
```tsx
        <SectionLabel icon={Cpu} label={t('pipeline.stageModelLabel')} />
```

- [ ] **Step 3: Replace the "Prompt" header**

Find:
```tsx
          <div className="flex items-center gap-1.5">
            <FileText size={11} className="text-editorial-accent shrink-0" />
            <span className="text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-editorial-muted">
              {t('pipeline.prompt')}
            </span>
            {isCustomPrompt && !isEditingPrompt && (
```
Replace with:
```tsx
          <div className="flex items-center gap-1.5">
            <SectionLabel icon={FileText} label={t('pipeline.prompt')} />
            {isCustomPrompt && !isEditingPrompt && (
```

(Both `Cpu` and `FileText` are already imported in this file — no import list change needed beyond Step 1.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: `No errors found`

- [ ] **Step 5: Run the pipeline test suite**

Run: `npx vitest run src/pipeline`
Expected: all tests pass (markup-only change).

- [ ] **Step 6: Commit**

```bash
git add src/components/pipeline/StageCard.tsx
git commit -m "fix(pipeline): unify StageCard section headers on SectionLabel"
```

---

### Task 4: Catalog — `deprecated` status filtering + re-add cut OpenAI models

**Files:**
- Modify: `src/models/catalog.ts`
- Modify: `src/models/catalog.test.ts`

**Interfaces:**
- Produces:
  - `getProviderCatalogEntries(provider: ModelProvider, options?: { includeDeprecated?: boolean }): ModelEntry[]`
  - `getKnownModelIds(provider: ModelProvider, options?: { includeDeprecated?: boolean }): string[]`
  - `getSelectableModelIds(provider: ModelProvider, ollamaModels?: string[], options?: { includeDeprecated?: boolean }): string[]`
  - `ensureModelInList(options: string[], currentModel: string): string[]` — new export, used by Task 5.
- Consumed by: Task 5 (`ensureModelInList`, `getKnownModelIds` with `includeDeprecated: true`, `getModelStatus` already existing).

- [ ] **Step 1: Re-add the 8 cut OpenAI models with `status: 'deprecated'`**

In `src/models/catalog.ts`, find line 63-64:
```ts
  { id: 'gpt-5.6-sol',   provider: 'openai', status: 'stable', reasoning: 'optional', contextWindow: 1_000_000, pricing: { input: 5.00, output: 30.00 }, preferredFor: ['judge', 'coherence', 'refine'], discouragedFor: ['format'], description: 'Flagship GPT-5.6 tier for complex reasoning and review' },
  // Anthropic (Claude 4 line — all support optional extended/adaptive thinking)
```
Replace with:
```ts
  { id: 'gpt-5.6-sol',   provider: 'openai', status: 'stable', reasoning: 'optional', contextWindow: 1_000_000, pricing: { input: 5.00, output: 30.00 }, preferredFor: ['judge', 'coherence', 'refine'], discouragedFor: ['format'], description: 'Flagship GPT-5.6 tier for complex reasoning and review' },
  // OpenAI — deprecated (superseded by GPT-5.6). Kept so pricing/context-window lookups stay
  // correct for existing projects still configured with one of these; hidden from new-model
  // pickers by default — see getSelectableModelIds's includeDeprecated option.
  { id: 'gpt-4.1-mini', provider: 'openai', status: 'deprecated', reasoning: 'non_reasoning', contextWindow: 1_047_576, pricing: { input: 0.40, output: 1.60 }, preferredFor: ['translation', 'format'], description: 'Lightweight non-reasoning model for format and bulk tasks' },
  { id: 'gpt-4.1', provider: 'openai', status: 'deprecated', reasoning: 'non_reasoning', contextWindow: 1_047_576, pricing: { input: 2.00, output: 8.00 }, preferredFor: ['translation', 'refine', 'judge'], description: 'Large-context non-reasoning model for detailed translation' },
  { id: 'o4-mini', provider: 'openai', status: 'deprecated', reasoning: 'reasoning', contextWindow: 200_000, pricing: { input: 1.10, output: 4.40 }, preferredFor: ['refine', 'judge', 'coherence'], discouragedFor: ['format'], description: 'Compact reasoning model for review and coherence' },
  { id: 'gpt-5-nano', provider: 'openai', status: 'deprecated', reasoning: 'optional', contextWindow: 128_000, pricing: { input: 0.05, output: 0.40 }, preferredFor: ['translation', 'format'], description: 'Ultra-fast optional-reasoning model for high-volume tasks' },
  { id: 'gpt-5-mini', provider: 'openai', status: 'deprecated', reasoning: 'optional', contextWindow: 400_000, pricing: { input: 0.25, output: 2.00 }, preferredFor: ['translation', 'refine'], description: 'Fast optional-reasoning model for translation' },
  { id: 'gpt-5', provider: 'openai', status: 'deprecated', reasoning: 'optional', contextWindow: 400_000, pricing: { input: 1.25, output: 10.00 }, preferredFor: ['translation', 'refine', 'judge'], description: 'Flagship GPT-5 model for quality translation and review' },
  { id: 'gpt-5.4-mini', provider: 'openai', status: 'deprecated', reasoning: 'optional', contextWindow: 400_000, pricing: { input: 0.75, output: 4.50 }, preferredFor: ['translation', 'refine', 'judge'], description: 'Mid-tier snapshot with optional reasoning and large context' },
  { id: 'gpt-5.4', provider: 'openai', status: 'deprecated', reasoning: 'optional', contextWindow: 1_000_000, pricing: { input: 2.50, output: 15.00 }, preferredFor: ['judge', 'coherence', 'refine'], discouragedFor: ['format'], description: 'High-capacity snapshot for complex review tasks' },
  // Anthropic (Claude 4 line — all support optional extended/adaptive thinking)
```

- [ ] **Step 2: Add `includeDeprecated` filtering to the picker functions**

Find:
```ts
export function getProviderCatalogEntries(provider: ModelProvider): ModelEntry[] {
  return MODEL_CATALOG.filter((entry) => entry.provider === provider);
}

export function getKnownModelIds(provider: ModelProvider): string[] {
  return getProviderCatalogEntries(provider).map((entry) => entry.id);
}
```
Replace with:
```ts
export function getProviderCatalogEntries(
  provider: ModelProvider,
  options?: { includeDeprecated?: boolean },
): ModelEntry[] {
  return MODEL_CATALOG.filter(
    (entry) => entry.provider === provider && (options?.includeDeprecated || entry.status !== 'deprecated'),
  );
}

export function getKnownModelIds(provider: ModelProvider, options?: { includeDeprecated?: boolean }): string[] {
  return getProviderCatalogEntries(provider, options).map((entry) => entry.id);
}
```

Find:
```ts
export function getSelectableModelIds(
  provider: ModelProvider,
  ollamaModels?: string[],
): string[] {
  return provider === 'ollama' ? (ollamaModels ?? []) : getKnownModelIds(provider);
}
```
Replace with:
```ts
export function getSelectableModelIds(
  provider: ModelProvider,
  ollamaModels?: string[],
  options?: { includeDeprecated?: boolean },
): string[] {
  return provider === 'ollama' ? (ollamaModels ?? []) : getKnownModelIds(provider, options);
}

/** Ensures a stage's currently-selected model stays in its option list even if filtered out (e.g. deprecated). */
export function ensureModelInList(options: string[], currentModel: string): string[] {
  return !currentModel || options.includes(currentModel) ? options : [...options, currentModel];
}
```

- [ ] **Step 3: Write the failing tests**

In `src/models/catalog.test.ts`, add (inside the existing `describe('MODEL_CATALOG', ...)` block, after the last `it(...)`):
```ts
  it('excludes deprecated models from the default selectable list', () => {
    const ids = getKnownModelIds('openai');
    expect(ids).not.toContain('gpt-4.1-mini');
    expect(ids).not.toContain('gpt-5');
    expect(ids).toContain('gpt-5.6-sol');
  });

  it('includes deprecated models when explicitly requested', () => {
    const ids = getKnownModelIds('openai', { includeDeprecated: true });
    expect(ids).toContain('gpt-4.1-mini');
    expect(ids).toContain('gpt-5.6-sol');
  });

  it('resolves real pricing and context window for a deprecated model', () => {
    const entry = MODEL_CATALOG.find((e) => e.provider === 'openai' && e.id === 'gpt-4.1-mini');
    expect(entry?.status).toBe('deprecated');
    expect(entry?.contextWindow).toBe(1_047_576);
    expect(entry?.pricing).toEqual({ input: 0.40, output: 1.60 });
  });

  it('ensureModelInList appends a missing current model without duplicating an existing one', () => {
    expect(ensureModelInList(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(ensureModelInList(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(ensureModelInList(['a', 'b'], '')).toEqual(['a', 'b']);
  });
```

Update the import line at the top of `src/models/catalog.test.ts`:
```ts
import {
  ensureModelInList,
  getKnownModelIds,
  getMissingPricingModels,
  getResolvedModelReasoning,
  getSelectableModelIds,
  MODEL_CATALOG,
  MODEL_PROVIDER_ORDER,
} from './catalog';
```

- [ ] **Step 4: Run the tests to verify they fail first (before Step 1-2 land — skip if already applied in order)**

Run: `npx vitest run src/models/catalog.test.ts`
Expected (if run before Steps 1-2): FAIL — `getKnownModelIds`/`ensureModelInList` behavior not yet implemented. If Steps 1-2 are already applied (recommended order: implement then test), this step is a no-op confirmation — proceed to Step 5.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/models/catalog.test.ts`
Expected: all tests pass, including the pre-existing ones (`getSelectableModelIds('openai')` still equals `getKnownModelIds('openai')` since both now default to non-deprecated).

- [ ] **Step 6: Type-check and run the full frontend suite**

Run: `npx tsc --noEmit -p .`
Expected: `No errors found`

Run: `npx vitest run`
Expected: all tests pass (this task only adds entries and an optional parameter — no existing call site changes behavior).

- [ ] **Step 7: Commit**

```bash
git add src/models/catalog.ts src/models/catalog.test.ts
git commit -m "feat(models): mark superseded OpenAI models deprecated instead of deleting them"
```

---

### Task 5: Deprecated-model warning badge + override toggle in StageCard and AuditTabPanel

**Files:**
- Create: `src/components/models/DeprecatedModelBadge.tsx`
- Create: `src/components/models/DeprecatedModelBadge.test.tsx`
- Modify: `src/components/pipeline/StageCard.tsx`
- Modify: `src/components/pipeline/AuditTabPanel.tsx`
- Modify: `src/i18n/it.json` (add `pipeline.modelDeprecatedHint`, `pipeline.toggleDeprecatedModels`)
- Modify: `src/i18n/en.json` (same keys)

**Interfaces:**
- Consumes (from Task 4): `getModelStatus(provider, modelId): ModelStatus | undefined`, `getKnownModelIds(provider, options?): string[]`, `ensureModelInList(options, currentModel): string[]`.
- Produces: `DeprecatedModelBadge` component — `{ provider: ModelProvider; model: string }`, renders `null` unless the model's status is `'deprecated'`.

- [ ] **Step 1: Add the two new i18n keys**

In `src/i18n/it.json`, in the `pipeline` object (anywhere alongside the other `pipeline.*` keys, e.g. right after `stageModelLabel` at line 242), insert:
```json
    "modelDeprecatedHint": "Modello non più tra le scelte consigliate: potrebbe funzionare ancora, ma prezzo e capienza mostrati potrebbero non essere aggiornati.",
    "toggleDeprecatedModels": "Mostra anche modelli superati",
```

In `src/i18n/en.json`, same location:
```json
    "modelDeprecatedHint": "This model is no longer a recommended choice: it may still work, but the shown price and context window may be out of date.",
    "toggleDeprecatedModels": "Show deprecated models too",
```

- [ ] **Step 2: Write the failing test for the badge**

Create `src/components/models/DeprecatedModelBadge.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DeprecatedModelBadge } from './DeprecatedModelBadge';

describe('DeprecatedModelBadge', () => {
  it('renders nothing for a stable model', () => {
    const { container } = render(<DeprecatedModelBadge provider="openai" model="gpt-5.6-sol" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a warning indicator for a deprecated model', () => {
    const { container } = render(<DeprecatedModelBadge provider="openai" model="gpt-4.1-mini" />);
    expect(container.querySelector('[data-tooltip]')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/models/DeprecatedModelBadge.test.tsx`
Expected: FAIL — module `./DeprecatedModelBadge` does not exist yet.

- [ ] **Step 4: Implement `DeprecatedModelBadge`**

Create `src/components/models/DeprecatedModelBadge.tsx`:
```tsx
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider } from '../../types';
import { getModelStatus } from '../../models/catalog';

interface DeprecatedModelBadgeProps {
  provider: ModelProvider;
  model: string;
}

export function DeprecatedModelBadge({ provider, model }: DeprecatedModelBadgeProps) {
  const { t } = useTranslation();
  if (getModelStatus(provider, model) !== 'deprecated') return null;

  return (
    <span
      className="inline-flex items-center justify-center rounded-full border border-editorial-warning/30 bg-editorial-warning/10 p-1 text-editorial-warning"
      data-tooltip={t('pipeline.modelDeprecatedHint')}
    >
      <AlertTriangle size={10} />
    </span>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/models/DeprecatedModelBadge.test.tsx`
Expected: both tests pass.

- [ ] **Step 6: Wire the badge + override toggle into `StageCard`**

In `src/components/pipeline/StageCard.tsx`, find the import block and add `DeprecatedModelBadge` + `getKnownModelIds`/`ensureModelInList` (the latter two already come from `'../../models/catalog'`, just extend that import) and a new `useState` for the toggle, plus an `Eye`-family icon:

Find:
```tsx
import { useState } from 'react';
```
Replace with (no change needed — already imported; skip if identical).

Find:
```tsx
import { getKnownModelIds, getModelStatus, getResolvedModelReasoning, LLM_PROVIDER_ORDER } from '../../models/catalog';
```
Replace with:
```tsx
import { ensureModelInList, getKnownModelIds, getModelStatus, getResolvedModelReasoning, LLM_PROVIDER_ORDER } from '../../models/catalog';
```

Find:
```tsx
import { DeeplStageConfig } from './DeeplStageConfig';
import { IconButton } from '../ui';
```
Replace with:
```tsx
import { DeeplStageConfig } from './DeeplStageConfig';
import { DeprecatedModelBadge } from '../models/DeprecatedModelBadge';
import { IconButton, SectionLabel } from '../ui';
```
(Note: `SectionLabel` was already added here in Task 3 — if Task 3 already ran, this replace will not find the old two-import line; instead just add `DeprecatedModelBadge` to the existing import block from Task 3 and add the line above it. Adjust the find/replace to match whatever the file currently has; the end state is both `DeprecatedModelBadge` and `SectionLabel` imported.)

Add the icon import — find:
```tsx
import {
  BookmarkPlus,
  BookOpen,
  Check,
  Cpu,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wand2,
  WifiOff,
  X,
} from 'lucide-react';
```
Replace with:
```tsx
import {
  BookmarkPlus,
  BookOpen,
  Check,
  Cpu,
  FileText,
  History,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wand2,
  WifiOff,
  X,
} from 'lucide-react';
```

Add local state — find:
```tsx
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
```
Replace with:
```tsx
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [showDeprecatedModels, setShowDeprecatedModels] = useState(false);
```

Compute the effective option list — find:
```tsx
  const role = stage.role ?? 'translation';
```
Replace with:
```tsx
  const role = stage.role ?? 'translation';
  const canToggleDeprecated = stage.provider !== 'ollama' && stage.provider !== 'custom';
  const effectiveModelOptions = ensureModelInList(
    showDeprecatedModels && canToggleDeprecated
      ? getKnownModelIds(stage.provider, { includeDeprecated: true })
      : modelOptions,
    stage.model,
  );
```

Use `effectiveModelOptions` (instead of the raw `modelOptions` prop) in the select, add the `(superato)` suffix, and place the badge + toggle button next to `ModelCapabilityHint`. Find:
```tsx
          ) : modelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <select
                value={stage.model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={translationsExist || isProcessing}
                className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('pipeline.stageModelLabel')}
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}{getModelStatus(stage.provider, m) === 'preview' ? ' (preview)' : ''}
                  </option>
                ))}
              </select>
              <ModelCapabilityHint provider={stage.provider} model={stage.model} iconOnly />
            </div>
          ) : (
```
Replace with:
```tsx
          ) : effectiveModelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <select
                value={stage.model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={translationsExist || isProcessing}
                className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('pipeline.stageModelLabel')}
              >
                {effectiveModelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                    {getModelStatus(stage.provider, m) === 'preview' ? ' (preview)' : ''}
                    {getModelStatus(stage.provider, m) === 'deprecated' ? ' (superato)' : ''}
                  </option>
                ))}
              </select>
              <ModelCapabilityHint provider={stage.provider} model={stage.model} iconOnly />
              <DeprecatedModelBadge provider={stage.provider} model={stage.model} />
              {canToggleDeprecated && (
                <IconButton
                  size="sm"
                  tone={showDeprecatedModels ? 'accent' : 'default'}
                  onClick={() => setShowDeprecatedModels(!showDeprecatedModels)}
                  title={t('pipeline.toggleDeprecatedModels')}
                  ariaPressed={showDeprecatedModels}
                >
                  <History size={13} />
                </IconButton>
              )}
            </div>
          ) : (
```

- [ ] **Step 7: Same wiring in `AuditTabPanel` for the judge model**

In `src/components/pipeline/AuditTabPanel.tsx`, find:
```tsx
import { getKnownModelIds, getModelStatus, getResolvedModelReasoning, LLM_PROVIDER_ORDER } from '../../models/catalog';
```
Replace with:
```tsx
import { ensureModelInList, getKnownModelIds, getModelStatus, getResolvedModelReasoning, LLM_PROVIDER_ORDER } from '../../models/catalog';
```

Find:
```tsx
import { AlertTriangle, Cpu, RefreshCw, Scale, Wand2 } from 'lucide-react';
```
Replace with:
```tsx
import { AlertTriangle, Cpu, History, RefreshCw, Scale, Wand2 } from 'lucide-react';
```

Find:
```tsx
import { SectionLabel, ToggleRow } from '../ui';
import { ReasoningPicker } from '../models/ReasoningPicker';
```
Replace with:
```tsx
import { IconButton, SectionLabel, ToggleRow } from '../ui';
import { DeprecatedModelBadge } from '../models/DeprecatedModelBadge';
import { ReasoningPicker } from '../models/ReasoningPicker';
```

Add local state and effective options at the top of the component body — find:
```tsx
  const { t } = useTranslation();
  const judgeResolvedReasoning = getResolvedModelReasoning(config.judgeProvider, config.judgeModel);
```
Replace with:
```tsx
  const { t } = useTranslation();
  const judgeResolvedReasoning = getResolvedModelReasoning(config.judgeProvider, config.judgeModel);
  const [showDeprecatedModels, setShowDeprecatedModels] = useState(false);
  const canToggleDeprecated = config.judgeProvider !== 'ollama';
  const effectiveJudgeModels = ensureModelInList(
    showDeprecatedModels && canToggleDeprecated
      ? getKnownModelIds(config.judgeProvider, { includeDeprecated: true })
      : judgeModels,
    config.judgeModel,
  );
```

Add the `useState` import — find:
```tsx
import type { Dispatch, SetStateAction } from 'react';
```
Replace with:
```tsx
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
```

Now use `effectiveJudgeModels` and add the badge/toggle. Find:
```tsx
          {judgeModels.length > 0 ? (
            <select
              value={config.judgeModel}
              onChange={(e) => handleJudgeModelChange(e.target.value)}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('pipeline.auditModelLabel')}
            >
              {judgeModels.map((m) => (
                <option key={m} value={m}>
                  {m}{getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}
                </option>
              ))}
            </select>
          ) : config.judgeProvider === 'ollama' ? (
```
Replace with:
```tsx
          {effectiveJudgeModels.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <select
                value={config.judgeModel}
                onChange={(e) => handleJudgeModelChange(e.target.value)}
                className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                aria-label={t('pipeline.auditModelLabel')}
              >
                {effectiveJudgeModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                    {getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}
                    {getModelStatus(config.judgeProvider, m) === 'deprecated' ? ' (superato)' : ''}
                  </option>
                ))}
              </select>
              <DeprecatedModelBadge provider={config.judgeProvider} model={config.judgeModel} />
              {canToggleDeprecated && (
                <IconButton
                  size="sm"
                  tone={showDeprecatedModels ? 'accent' : 'default'}
                  onClick={() => setShowDeprecatedModels(!showDeprecatedModels)}
                  title={t('pipeline.toggleDeprecatedModels')}
                  ariaPressed={showDeprecatedModels}
                >
                  <History size={13} />
                </IconButton>
              )}
            </div>
          ) : config.judgeProvider === 'ollama' ? (
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: `No errors found`

- [ ] **Step 9: Run the full frontend test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/components/models/DeprecatedModelBadge.tsx src/components/models/DeprecatedModelBadge.test.tsx src/components/pipeline/StageCard.tsx src/components/pipeline/AuditTabPanel.tsx src/i18n/it.json src/i18n/en.json
git commit -m "feat(models): warn on deprecated models, add per-picker override toggle"
```

---

### Task 6: Manual verification + PR

- [ ] **Step 1: Full verification pass**

Run:
```bash
npx tsc --noEmit -p .
npx vitest run
```
Expected: both clean.

- [ ] **Step 2: Manual check in the running app**

Start the dev app (see project's `run` skill/dev script), open a project, open "Configura pipeline":
- Header shows a single title, no duplicate subtitle.
- Hover the pipeline name: pencil appears; type a change: check/x appear; Esc reverts; Enter/check commits.
- Translation tab: context-memory card has a plain-language sentence before the automatic/override toggle (now labeled "Override manuale"); stage section titles (Traduzione, Refine, ecc.) match the same icon+uppercase style as the Impostazioni tab.
- Pick an OpenAI stage model: deprecated models (`gpt-4.1-mini`, `gpt-5`, etc.) are absent from the dropdown by default; clicking the new toggle button brings them back with a "(superato)" suffix and a warning triangle appears next to the select once one is chosen.
- Same check on the judge model picker in the Controllo qualità tab.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/pipeline-modal-style-and-model-deprecation
gh pr create --title "fix(pipeline): modal style cleanup + deprecated-model system" --body "$(cat <<'EOF'
## Summary
- Drop the pipeline-config modal's redundant header; make the editable pipeline-name field discoverable (pencil affordance + confirm/cancel icons)
- Explain the context-memory card in plain language; rename its toggle to "Override manuale" (it switches automatic/manual sizing, not memory on/off)
- Unify StageCard/TranslationTabPanel section titles on the shared SectionLabel primitive (AuditTabPanel/SettingsTabPanel already used it)
- Replace catalog-model deletion with a reversible `deprecated` status: pricing/context-window stay correct for existing projects, deprecated models are hidden from new-model pickers by default, a warning badge appears when one is selected, and a per-picker override button can bring them back

## Test plan
- [x] `tsc --noEmit` clean
- [x] Full vitest suite green
- [ ] Manual pass in the running app (modal header, name edit, context-memory copy, section-title consistency, deprecated-model picker/warning/override)
EOF
)"
```

Report the PR URL back to the user.
