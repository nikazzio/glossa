# Phrase Memory — Piano 4: Preset Management UI + Pipeline Config

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Branching strategy:** Crea branch `feat/phrase-memory-plan-4` partendo da `feat/phrase-memory` aggiornato (dopo aver mergiato piano 3). Al termine, apri PR verso `feat/phrase-memory` (non verso `main`). Il branch `feat/phrase-memory` ha già una PR aperta su `main` (#205) per la review complessiva della feature.
>
> ```bash
> git checkout feat/phrase-memory
> git pull origin feat/phrase-memory
> git checkout -b feat/phrase-memory-plan-4
> ```

> **Nota Piano 2 — Shell gating già implementata:**
> La gestione preset avviene dall'editor (progetto aperto) o dalla `WorkspaceHome`. Non esiste più un workspace ghost. Piano 4 deve assicurarsi che il preset selezionato nella pipeline sia sempre associato a un workspace reale.

**Goal:** Esporre il sistema preset di Phrase Memory in due punti: (1) una sezione dedicata nel modale Settings per creare/modificare/eliminare preset custom e clonare quelli built-in; (2) una sezione collassabile nella tab Settings della PipelineConfig per attivare Phrase Memory sulla pipeline e scegliere/sovrascrivere preset. Infine aggiornare `pipelineService.ts` per persistere i tre nuovi campi DB (`use_phrase_memory`, `phrase_memory_preset_id`, `phrase_memory_overrides`).

**Architecture:** Nessun nuovo store Zustand — la selezione preset nella pipeline viaggia dentro `PipelineConfig` (già in `pipelineStore`). Il caricamento dei preset dal DB avviene con una chiamata diretta a `phraseMemoryPresetService.listPresets()` all'interno dei componenti che ne hanno bisogno. I preset built-in sono seed immutabili lato DB; la UI li mostra in sola lettura con un bottone "Clona".

**Tech Stack:** React 19, TypeScript, Tailwind v4, Zustand, Vitest + Testing Library, `phraseMemoryPresetService` (Piano 1), `pipelineService` (esistente)

---

## Piani correlati

| Piano | Cosa costruisce |
|-------|----------------|
| Piano 1 | DB schema, workspaceService, phraseMemoryPresetService CRUD |
| Piano 2 | embeddingService, phraseMemoryService (ricerca semantica) |
| Piano 3 | Tab Memoria UI, ExtractTermDialog |
| **Piano 4** (questo) | Preset Management UI, Pipeline Config sezione Phrase Memory |

---

## File Structure

**Nuovi file:**
- `src/components/settings/PhraseMemoryPresetManager.tsx` — lista e gestione preset (built-in + custom)
- `src/components/settings/PhraseMemoryPresetManager.test.tsx` — test componente
- `src/components/settings/PresetForm.tsx` — form crea/modifica preset custom
- `src/components/settings/PresetForm.test.tsx` — test form
- `src/components/pipeline/PhraseMemoryConfig.tsx` — sezione phrase memory nella pipeline config
- `src/components/pipeline/PhraseMemoryConfig.test.tsx` — test sezione pipeline

**File modificati:**
- `src/types.ts` — aggiunge `PhraseMemoryPreset`, `PhraseMemoryPresetConfig`, `PhraseMemorySplitter` a `PipelineConfig`
- `src/components/settings/SettingsModal.tsx` — aggiunge tab/sezione "Phrase Memory"
- `src/components/pipeline/SettingsTabPanel.tsx` — aggiunge `<PhraseMemoryConfig>` in fondo
- `src/services/pipelineService.ts` — salva/carica i tre campi phrase memory

---

## Task 1: Tipi TypeScript

**File:** `src/types.ts`

- [ ] **Step 1: Aggiungi tipi phrase memory**

In `src/types.ts`, prima di `PipelineConfig`:

```typescript
export type PhraseMemorySplitter = 'regex' | 'llm' | 'none';

export interface PhraseMemoryPresetConfig {
  splitter: PhraseMemorySplitter;
  similarityThreshold: number; // 0.5–1.0
  maxResults: number;
  minPhraseLength: number;
}

export interface PhraseMemoryPreset {
  id: string;
  name: string;
  isBuiltIn: boolean;
  config: PhraseMemoryPresetConfig;
}

export interface PhraseMemoryOverrides {
  splitter?: PhraseMemorySplitter;
  similarityThreshold?: number;
  maxResults?: number;
  minPhraseLength?: number;
}
```

- [ ] **Step 2: Estendi PipelineConfig**

In `src/types.ts`, dentro `PipelineConfig` dopo `chunkedWithContextWindow`:

```typescript
  usePhraseMemory?: boolean;
  phraseMemoryPresetId?: string | null;
  phraseMemoryOverrides?: PhraseMemoryOverrides | null;
```

- [ ] **Step 3: Commit tipi**

```bash
git add src/types.ts
git commit -m "feat(phrase-memory): tipi PhraseMemoryPreset + estensione PipelineConfig"
```

---

## Task 2: pipelineService — persistenza phrase memory

**File:** `src/services/pipelineService.ts`

- [ ] **Step 1: Scrivi il test prima dell'implementazione**

Crea `src/services/pipelineService.test.ts` (o aggiorna il file esistente aggiungendo):

```typescript
// src/services/pipelineService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dbService
vi.mock('./dbService', () => ({
  select: vi.fn(),
  execute: vi.fn(),
}));

import { select, execute } from './dbService';
import { savePipelineConfig, getPipelineConfig } from './pipelineService';
import type { PipelineConfig } from '../types';

const mockSelect = vi.mocked(select);
const mockExecute = vi.mocked(execute);

const baseDbRow = {
  id: 'pipe-1',
  project_id: 'proj-1',
  name: 'Test Pipeline',
  source_language: 'English',
  target_language: 'Italian',
  pipeline_mode: 'standard',
  stages: '[]',
  judge_prompt: '',
  judge_model: 'gpt-5.4-mini',
  judge_provider: 'openai',
  use_chunking: 1,
  words_per_chunk: 0,
  source_display_text: null,
  source_processing_text: null,
  source_footnotes: null,
  review_provider_options: null,
  persona: null,
  custom_source_language: null,
  custom_target_language: null,
  blob_budget_tokens: null,
  blob_overlap: null,
  coherence_prompt: null,
  run_status: null,
  last_run_config: null,
  created_at: '2026-06-02T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
  use_phrase_memory: 0,
  phrase_memory_preset_id: null,
  phrase_memory_overrides: null,
};

describe('pipelineService — phrase memory fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads use_phrase_memory=false when column is 0', async () => {
    mockSelect
      .mockResolvedValueOnce([baseDbRow])              // pipelines
      .mockResolvedValueOnce([])                        // project_glossaries
      .mockResolvedValueOnce([]);                       // glossary_entries
    const result = await getPipelineConfig('pipe-1');
    expect(result?.config.usePhraseMemory).toBe(false);
    expect(result?.config.phraseMemoryPresetId).toBeNull();
    expect(result?.config.phraseMemoryOverrides).toBeNull();
  });

  it('loads use_phrase_memory=true and preset when set', async () => {
    const row = {
      ...baseDbRow,
      use_phrase_memory: 1,
      phrase_memory_preset_id: 'preset-default',
      phrase_memory_overrides: '{"similarityThreshold":0.85}',
    };
    mockSelect
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const result = await getPipelineConfig('pipe-1');
    expect(result?.config.usePhraseMemory).toBe(true);
    expect(result?.config.phraseMemoryPresetId).toBe('preset-default');
    expect(result?.config.phraseMemoryOverrides).toEqual({ similarityThreshold: 0.85 });
  });

  it('savePipelineConfig persists phrase memory fields', async () => {
    mockExecute.mockResolvedValue(undefined);
    const config: PipelineConfig = {
      pipelineId: 'pipe-1',
      sourceLanguage: 'English',
      targetLanguage: 'Italian',
      stages: [],
      judgePrompt: '',
      judgeModel: 'gpt-5.4-mini',
      judgeProvider: 'openai',
      glossary: [],
      usePhraseMemory: true,
      phraseMemoryPresetId: 'preset-default',
      phraseMemoryOverrides: { maxResults: 5 },
    };
    await savePipelineConfig('pipe-1', config);
    const [query, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('use_phrase_memory');
    expect(query).toContain('phrase_memory_preset_id');
    expect(query).toContain('phrase_memory_overrides');
    // use_phrase_memory=1, preset id, overrides JSON
    expect(params).toContain(1);
    expect(params).toContain('preset-default');
    expect(params).toContain('{"maxResults":5}');
  });

  it('savePipelineConfig stores NULL overrides when not set', async () => {
    mockExecute.mockResolvedValue(undefined);
    const config: PipelineConfig = {
      pipelineId: 'pipe-1',
      sourceLanguage: 'English',
      targetLanguage: 'Italian',
      stages: [],
      judgePrompt: '',
      judgeModel: 'gpt-5.4-mini',
      judgeProvider: 'openai',
      glossary: [],
      usePhraseMemory: false,
    };
    await savePipelineConfig('pipe-1', config);
    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params).toContain(0);        // use_phrase_memory=0
    expect(params).toContain(null);     // preset_id null
  });
});
```

Run: `npm test -- pipelineService`
Expected: tutti i test falliscono (RED)

- [ ] **Step 2: Aggiungi i campi a DbPipeline**

In `src/services/pipelineService.ts`, dentro l'interfaccia `DbPipeline`:

```typescript
  use_phrase_memory: number;
  phrase_memory_preset_id: string | null;
  phrase_memory_overrides: string | null;
```

- [ ] **Step 3: Aggiorna rowToPipelineConfig**

In `rowToPipelineConfig`, dopo `coherencePrompt`:

```typescript
    usePhraseMemory: row.use_phrase_memory === 1,
    phraseMemoryPresetId: row.phrase_memory_preset_id ?? null,
    phraseMemoryOverrides: parseJson<PhraseMemoryOverrides>(row.phrase_memory_overrides) ?? null,
```

Aggiungi l'import di `PhraseMemoryOverrides` in testa al file:

```typescript
import type {
  // ... tipi esistenti ...
  PhraseMemoryOverrides,
} from '../types';
```

- [ ] **Step 4: Aggiorna savePipelineConfig**

Nella query UPDATE di `savePipelineConfig`, aggiungi tre colonne prima di `updated_at`:

```sql
use_phrase_memory        = $17,
phrase_memory_preset_id  = $18,
phrase_memory_overrides  = $19,
updated_at               = CURRENT_TIMESTAMP
WHERE id = $20
```

Aggiorna l'array params di conseguenza (lo `$17` corrente per `pipelineId` scorre a `$20`):

```typescript
    config.usePhraseMemory ? 1 : 0,
    config.phraseMemoryPresetId ?? null,
    config.phraseMemoryOverrides ? JSON.stringify(config.phraseMemoryOverrides) : null,
    pipelineId,
```

- [ ] **Step 5: Aggiorna saveFullState con gli stessi tre campi**

Stessa modifica alla query UPDATE in `saveFullState` — aggiunge le tre colonne e scorre il parametro `WHERE id` di conseguenza.

- [ ] **Step 6: Aggiorna duplicatePipeline**

Nell'INSERT di `duplicatePipeline`, aggiungi le tre colonne nella lista e nei valori:

```sql
use_phrase_memory, phrase_memory_preset_id, phrase_memory_overrides
```

```typescript
source.use_phrase_memory ?? 0,
source.phrase_memory_preset_id ?? null,
source.phrase_memory_overrides ?? null,
```

- [ ] **Step 7: Verifica test verdi**

Run: `npm test -- pipelineService`
Expected: tutti i test passano (GREEN)

- [ ] **Step 8: Commit**

```bash
git add src/services/pipelineService.ts src/services/pipelineService.test.ts
git commit -m "feat(phrase-memory): pipelineService salva/carica campi phrase memory"
```

---

## Task 3: PresetForm — form crea/modifica preset custom

**File:** `src/components/settings/PresetForm.tsx`, `src/components/settings/PresetForm.test.tsx`

- [ ] **Step 1: Scrivi il test**

Crea `src/components/settings/PresetForm.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PresetForm } from './PresetForm';
import type { PhraseMemoryPresetConfig } from '../../types';

const defaultConfig: PhraseMemoryPresetConfig = {
  splitter: 'regex',
  similarityThreshold: 0.75,
  maxResults: 10,
  minPhraseLength: 3,
};

describe('PresetForm', () => {
  it('renders with initial values', () => {
    render(
      <PresetForm
        initialName="My Preset"
        initialConfig={defaultConfig}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('My Preset')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /regex/i })).toBeChecked();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
  });

  it('calls onSubmit with updated values when form is submitted', () => {
    const onSubmit = vi.fn();
    render(
      <PresetForm
        initialName=""
        initialConfig={defaultConfig}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Nuovo preset' } });
    fireEvent.click(screen.getByRole('radio', { name: /llm/i }));
    fireEvent.click(screen.getByRole('button', { name: /salva/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      'Nuovo preset',
      expect.objectContaining({ splitter: 'llm' }),
    );
  });

  it('does not submit when name is empty', () => {
    const onSubmit = vi.fn();
    render(
      <PresetForm
        initialName=""
        initialConfig={defaultConfig}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /salva/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/nome obbligatorio/i)).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <PresetForm
        initialName="Test"
        initialConfig={defaultConfig}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('enforces similarityThreshold between 0.5 and 1.0', () => {
    const onSubmit = vi.fn();
    render(
      <PresetForm
        initialName="Test"
        initialConfig={defaultConfig}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    // slider è presente
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '0.5');
    expect(slider).toHaveAttribute('max', '1');
  });
});
```

Run: `npm test -- PresetForm`
Expected: fallisce (RED)

- [ ] **Step 2: Implementa PresetForm**

Crea `src/components/settings/PresetForm.tsx`:

```typescript
import { useState } from 'react';
import type { PhraseMemoryPresetConfig, PhraseMemorySplitter } from '../../types';

interface PresetFormProps {
  initialName: string;
  initialConfig: PhraseMemoryPresetConfig;
  onSubmit: (name: string, config: PhraseMemoryPresetConfig) => void;
  onCancel: () => void;
}

const SPLITTER_OPTIONS: Array<{ value: PhraseMemorySplitter; label: string }> = [
  { value: 'regex', label: 'Regex' },
  { value: 'llm',   label: 'LLM' },
  { value: 'none',  label: 'Nessuno' },
];

export function PresetForm({ initialName, initialConfig, onSubmit, onCancel }: PresetFormProps) {
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [config, setConfig] = useState<PhraseMemoryPresetConfig>(initialConfig);

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError('Nome obbligatorio');
      return;
    }
    onSubmit(name.trim(), config);
  };

  const update = <K extends keyof PhraseMemoryPresetConfig>(
    key: K,
    value: PhraseMemoryPresetConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-5">
      {/* Nome */}
      <div className="space-y-1.5">
        <label
          htmlFor="preset-name"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Nome
        </label>
        <input
          id="preset-name"
          type="text"
          value={name}
          aria-label="nome"
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(null);
          }}
          className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          placeholder="Es. Terminologia tecnica"
        />
        {nameError && (
          <p className="text-xs text-editorial-accent">{nameError}</p>
        )}
      </div>

      {/* Splitter */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
          Splitter frasi
        </p>
        <div className="flex gap-3" role="radiogroup" aria-label="splitter frasi">
          {SPLITTER_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="splitter"
                value={value}
                checked={config.splitter === value}
                onChange={() => update('splitter', value)}
                aria-label={label}
                className="accent-editorial-accent"
              />
              <span className="text-sm text-editorial-ink">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Similarity threshold */}
      <div className="space-y-1.5">
        <label
          htmlFor="preset-threshold"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Soglia similarità — {config.similarityThreshold.toFixed(2)}
        </label>
        <input
          id="preset-threshold"
          type="range"
          min="0.5"
          max="1"
          step="0.01"
          value={config.similarityThreshold}
          onChange={(e) => update('similarityThreshold', parseFloat(e.target.value))}
          className="w-full accent-editorial-accent"
        />
        <div className="flex justify-between text-[10px] text-editorial-muted">
          <span>0.50</span>
          <span>1.00</span>
        </div>
      </div>

      {/* Max results */}
      <div className="space-y-1.5">
        <label
          htmlFor="preset-max-results"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Risultati massimi
        </label>
        <input
          id="preset-max-results"
          type="number"
          min={1}
          max={50}
          value={config.maxResults}
          onChange={(e) => update('maxResults', Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>

      {/* Min phrase length */}
      <div className="space-y-1.5">
        <label
          htmlFor="preset-min-length"
          className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
        >
          Lunghezza minima frase (caratteri)
        </label>
        <input
          id="preset-min-length"
          type="number"
          min={1}
          value={config.minPhraseLength}
          onChange={(e) => update('minPhraseLength', Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>

      {/* Azioni */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-full bg-editorial-ink px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          Salva
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verifica test verdi**

Run: `npm test -- PresetForm`
Expected: tutti i test passano (GREEN)

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/PresetForm.tsx src/components/settings/PresetForm.test.tsx
git commit -m "feat(phrase-memory): PresetForm — form crea/modifica preset custom"
```

---

## Task 4: PhraseMemoryPresetManager — lista e gestione preset

**File:** `src/components/settings/PhraseMemoryPresetManager.tsx`, `src/components/settings/PhraseMemoryPresetManager.test.tsx`

- [ ] **Step 1: Scrivi il test**

Crea `src/components/settings/PhraseMemoryPresetManager.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/phraseMemoryPresetService', () => ({
  listPresets: vi.fn(),
  createCustomPreset: vi.fn(),
  updateCustomPreset: vi.fn(),
  deleteCustomPreset: vi.fn(),
  clonePreset: vi.fn(),
}));

import * as presetService from '../../services/phraseMemoryPresetService';
import { PhraseMemoryPresetManager } from './PhraseMemoryPresetManager';
import type { PhraseMemoryPreset } from '../../types';

const builtInPreset: PhraseMemoryPreset = {
  id: 'preset-default',
  name: 'Predefinito',
  isBuiltIn: true,
  config: { splitter: 'regex', similarityThreshold: 0.75, maxResults: 10, minPhraseLength: 3 },
};

const customPreset: PhraseMemoryPreset = {
  id: 'preset-custom-1',
  name: 'Mio preset',
  isBuiltIn: false,
  config: { splitter: 'llm', similarityThreshold: 0.8, maxResults: 5, minPhraseLength: 4 },
};

describe('PhraseMemoryPresetManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(presetService.listPresets).mockResolvedValue([builtInPreset, customPreset]);
  });

  it('mostra i preset caricati dal servizio', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => {
      expect(screen.getByText('Predefinito')).toBeInTheDocument();
      expect(screen.getByText('Mio preset')).toBeInTheDocument();
    });
  });

  it('mostra badge Built-in sul preset built-in', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => expect(screen.getByText('Built-in')).toBeInTheDocument());
  });

  it('mostra bottone Clona sul built-in, non Elimina', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clona/i })).toBeInTheDocument();
    });
    // il bottone elimina NON deve apparire per il built-in
    const deleteButtons = screen.queryAllByRole('button', { name: /elimina/i });
    // solo il preset custom ha il pulsante elimina
    expect(deleteButtons).toHaveLength(1);
  });

  it('clonare un preset built-in chiama clonePreset e ricarica la lista', async () => {
    vi.mocked(presetService.clonePreset).mockResolvedValue('preset-cloned');
    vi.mocked(presetService.listPresets)
      .mockResolvedValueOnce([builtInPreset, customPreset])
      .mockResolvedValueOnce([builtInPreset, customPreset, { ...customPreset, id: 'preset-cloned', name: 'Predefinito (copia)' }]);
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Predefinito'));
    fireEvent.click(screen.getByRole('button', { name: /clona/i }));
    await waitFor(() => expect(presetService.clonePreset).toHaveBeenCalledWith('preset-default'));
  });

  it('eliminare un preset custom chiama deleteCustomPreset e ricarica', async () => {
    vi.mocked(presetService.deleteCustomPreset).mockResolvedValue(undefined);
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Mio preset'));
    fireEvent.click(screen.getByRole('button', { name: /elimina/i }));
    await waitFor(() => expect(presetService.deleteCustomPreset).toHaveBeenCalledWith('preset-custom-1'));
  });

  it('mostra il form di creazione quando si clicca su "Nuovo preset"', async () => {
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Predefinito'));
    fireEvent.click(screen.getByRole('button', { name: /nuovo preset/i }));
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
  });

  it('crea un preset custom e ricarica la lista', async () => {
    vi.mocked(presetService.createCustomPreset).mockResolvedValue('preset-new');
    render(<PhraseMemoryPresetManager />);
    await waitFor(() => screen.getByText('Predefinito'));
    fireEvent.click(screen.getByRole('button', { name: /nuovo preset/i }));
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Tecnico' } });
    fireEvent.click(screen.getByRole('button', { name: /salva/i }));
    await waitFor(() =>
      expect(presetService.createCustomPreset).toHaveBeenCalledWith(
        'Tecnico',
        expect.objectContaining({ splitter: expect.any(String) }),
      ),
    );
  });
});
```

Run: `npm test -- PhraseMemoryPresetManager`
Expected: fallisce (RED)

- [ ] **Step 2: Implementa PhraseMemoryPresetManager**

Crea `src/components/settings/PhraseMemoryPresetManager.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { Plus, Copy, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  listPresets,
  createCustomPreset,
  updateCustomPreset,
  deleteCustomPreset,
  clonePreset,
} from '../../services/phraseMemoryPresetService';
import type { PhraseMemoryPreset, PhraseMemoryPresetConfig } from '../../types';
import { PresetForm } from './PresetForm';
import { IconButton } from '../ui';

const DEFAULT_PRESET_CONFIG: PhraseMemoryPresetConfig = {
  splitter: 'regex',
  similarityThreshold: 0.75,
  maxResults: 10,
  minPhraseLength: 3,
};

type FormMode =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; preset: PhraseMemoryPreset };

export function PhraseMemoryPresetManager() {
  const [presets, setPresets] = useState<PhraseMemoryPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>({ type: 'closed' });

  const reload = useCallback(async () => {
    try {
      const data = await listPresets();
      setPresets(data);
    } catch (err: unknown) {
      toast.error('Errore caricamento preset', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const handleClone = async (preset: PhraseMemoryPreset) => {
    try {
      await clonePreset(preset.id);
      await reload();
      toast.success(`"${preset.name}" clonato`);
    } catch (err: unknown) {
      toast.error('Clonazione fallita', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDelete = async (preset: PhraseMemoryPreset) => {
    try {
      await deleteCustomPreset(preset.id);
      await reload();
      toast.success(`"${preset.name}" eliminato`);
    } catch (err: unknown) {
      toast.error('Eliminazione fallita', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCreate = async (name: string, config: PhraseMemoryPresetConfig) => {
    try {
      await createCustomPreset(name, config);
      setFormMode({ type: 'closed' });
      await reload();
      toast.success(`Preset "${name}" creato`);
    } catch (err: unknown) {
      toast.error('Creazione fallita', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleEdit = async (name: string, config: PhraseMemoryPresetConfig) => {
    if (formMode.type !== 'edit') return;
    try {
      await updateCustomPreset(formMode.preset.id, name, config);
      setFormMode({ type: 'closed' });
      await reload();
      toast.success(`Preset "${name}" aggiornato`);
    } catch (err: unknown) {
      toast.error('Aggiornamento fallito', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Lista preset */}
      {isLoading ? (
        <p className="text-xs text-editorial-muted italic">Caricamento…</p>
      ) : (
        <div className="space-y-2">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between gap-3 rounded-[18px] border border-editorial-border bg-editorial-bg/60 px-4 py-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm font-display italic text-editorial-ink">
                  {preset.name}
                </span>
                {preset.isBuiltIn && (
                  <span className="shrink-0 rounded-full border border-editorial-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.25em] text-editorial-muted">
                    Built-in
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {preset.isBuiltIn ? (
                  <IconButton
                    size="sm"
                    title="Clona e personalizza"
                    onClick={() => handleClone(preset)}
                    aria-label="clona"
                  >
                    <Copy size={13} />
                  </IconButton>
                ) : (
                  <>
                    <IconButton
                      size="sm"
                      title="Modifica"
                      onClick={() => setFormMode({ type: 'edit', preset })}
                      aria-label="modifica"
                    >
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      tone="destructive"
                      title="Elimina"
                      onClick={() => handleDelete(preset)}
                      aria-label="elimina"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form crea/modifica */}
      {formMode.type !== 'closed' && (
        <div className="rounded-[20px] border border-editorial-border bg-editorial-textbox/20 px-5 py-5">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {formMode.type === 'create' ? 'Nuovo preset' : 'Modifica preset'}
          </p>
          <PresetForm
            initialName={formMode.type === 'edit' ? formMode.preset.name : ''}
            initialConfig={formMode.type === 'edit' ? formMode.preset.config : DEFAULT_PRESET_CONFIG}
            onSubmit={formMode.type === 'create' ? handleCreate : handleEdit}
            onCancel={() => setFormMode({ type: 'closed' })}
          />
        </div>
      )}

      {/* Bottone nuovo preset (nascosto mentre il form è aperto) */}
      {formMode.type === 'closed' && (
        <button
          type="button"
          onClick={() => setFormMode({ type: 'create' })}
          className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:border-editorial-accent/50 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label="nuovo preset"
        >
          <Plus size={13} />
          Nuovo preset
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verifica test verdi**

Run: `npm test -- PhraseMemoryPresetManager`
Expected: tutti i test passano (GREEN)

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/PhraseMemoryPresetManager.tsx src/components/settings/PhraseMemoryPresetManager.test.tsx
git commit -m "feat(phrase-memory): PhraseMemoryPresetManager — lista e gestione preset"
```

---

## Task 5: Integrazione in SettingsModal

**File:** `src/components/settings/SettingsModal.tsx`

- [ ] **Step 1: Aggiungi la tab "Phrase Memory"**

In `SettingsModal.tsx`:

1. Estendi il tipo `SettingsTab`:

```typescript
type SettingsTab = 'provider' | 'settings' | 'phraseMemory';
```

2. Aggiungi l'import dell'icona e del componente:

```typescript
import { Brain } from 'lucide-react';
import { PhraseMemoryPresetManager } from './PhraseMemoryPresetManager';
```

3. Aggiungi la voce nell'array `tabConfig`:

```typescript
{ id: 'phraseMemory', icon: <Brain size={14} />, label: 'Phrase Memory' },
```

4. Aggiungi il pannello di contenuto dopo il blocco `{activeTab === 'provider' && ...}`:

```typescript
{activeTab === 'phraseMemory' && (
  <div className="space-y-8">
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <Brain size={11} className="text-editorial-accent shrink-0" />
        <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
          Preset Phrase Memory
        </p>
      </div>
      <p className="text-xs leading-relaxed text-editorial-muted/80">
        I preset built-in sono di sola lettura. Clona un preset built-in per personalizzarlo,
        oppure crea un preset custom da zero.
      </p>
      <PhraseMemoryPresetManager />
    </div>
  </div>
)}
```

- [ ] **Step 2: Verifica visiva**

Avvia `npm run tauri dev`, apri Settings, verifica che la tab "Phrase Memory" sia presente e funzionante: lista preset, clona built-in, crea/modifica/elimina custom.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SettingsModal.tsx
git commit -m "feat(phrase-memory): tab Phrase Memory in SettingsModal"
```

---

## Task 6: PhraseMemoryConfig — sezione pipeline

**File:** `src/components/pipeline/PhraseMemoryConfig.tsx`, `src/components/pipeline/PhraseMemoryConfig.test.tsx`

- [ ] **Step 1: Scrivi il test**

Crea `src/components/pipeline/PhraseMemoryConfig.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/phraseMemoryPresetService', () => ({
  listPresets: vi.fn(),
}));

import * as presetService from '../../services/phraseMemoryPresetService';
import { PhraseMemoryConfig } from './PhraseMemoryConfig';
import type { PhraseMemoryPreset, PhraseMemoryOverrides } from '../../types';

const preset: PhraseMemoryPreset = {
  id: 'preset-default',
  name: 'Predefinito',
  isBuiltIn: true,
  config: { splitter: 'regex', similarityThreshold: 0.75, maxResults: 10, minPhraseLength: 3 },
};

describe('PhraseMemoryConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(presetService.listPresets).mockResolvedValue([preset]);
  });

  it('mostra toggle disattivo per default', () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={false}
        presetId={null}
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('attivare il toggle chiama onChange con usePhraseMemory=true', () => {
    const onChange = vi.fn();
    render(
      <PhraseMemoryConfig
        usePhraseMemory={false}
        presetId={null}
        overrides={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ usePhraseMemory: true }),
    );
  });

  it('mostra dropdown preset quando il toggle è attivo', async () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  it('non mostra dropdown quando toggle è disattivo', () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={false}
        presetId={null}
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('mostra sezione Avanzate collassata', async () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /avanzate/i })).toBeInTheDocument();
    // il contenuto è nascosto
    expect(screen.queryByLabelText(/soglia similarità/i)).not.toBeInTheDocument();
  });

  it('espande la sezione Avanzate al click', async () => {
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={null}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /avanzate/i }));
    expect(screen.getByLabelText(/soglia similarità/i)).toBeInTheDocument();
  });

  it('mostra badge "modificato" quando c\'è un override', () => {
    const overrides: PhraseMemoryOverrides = { maxResults: 3 };
    render(
      <PhraseMemoryConfig
        usePhraseMemory={true}
        presetId="preset-default"
        overrides={overrides}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /avanzate/i }));
    expect(screen.getByText(/modificato/i)).toBeInTheDocument();
  });
});
```

Run: `npm test -- PhraseMemoryConfig`
Expected: fallisce (RED)

- [ ] **Step 2: Implementa PhraseMemoryConfig**

Crea `src/components/pipeline/PhraseMemoryConfig.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { listPresets } from '../../services/phraseMemoryPresetService';
import type { PhraseMemoryPreset, PhraseMemoryOverrides, PhraseMemorySplitter } from '../../types';
import { SectionLabel } from '../ui';

interface PhraseMemoryConfigValue {
  usePhraseMemory: boolean;
  phraseMemoryPresetId: string | null;
  phraseMemoryOverrides: PhraseMemoryOverrides | null;
}

interface PhraseMemoryConfigProps {
  usePhraseMemory: boolean;
  presetId: string | null;
  overrides: PhraseMemoryOverrides | null;
  onChange: (value: PhraseMemoryConfigValue) => void;
  disabled?: boolean;
}

const SPLITTER_LABELS: Record<PhraseMemorySplitter, string> = {
  regex: 'Regex',
  llm: 'LLM',
  none: 'Nessuno',
};

export function PhraseMemoryConfig({
  usePhraseMemory,
  presetId,
  overrides,
  onChange,
  disabled = false,
}: PhraseMemoryConfigProps) {
  const [presets, setPresets] = useState<PhraseMemoryPreset[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedPreset = presets.find((p) => p.id === presetId) ?? presets[0] ?? null;
  const hasOverrides = overrides !== null && Object.keys(overrides).length > 0;

  const load = useCallback(async () => {
    try {
      const data = await listPresets();
      setPresets(data);
    } catch (err: unknown) {
      toast.error('Errore caricamento preset', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const emit = (patch: Partial<PhraseMemoryConfigValue>) =>
    onChange({
      usePhraseMemory,
      phraseMemoryPresetId: presetId,
      phraseMemoryOverrides: overrides,
      ...patch,
    });

  const handleToggle = () => emit({ usePhraseMemory: !usePhraseMemory });

  const handlePresetChange = (id: string) =>
    emit({ phraseMemoryPresetId: id, phraseMemoryOverrides: null });

  const patchOverride = <K extends keyof PhraseMemoryOverrides>(
    key: K,
    value: PhraseMemoryOverrides[K] | undefined,
  ) => {
    const next = { ...overrides, [key]: value };
    // se il valore coincide con quello del preset, rimuovi l'override
    if (selectedPreset && selectedPreset.config[key] === value) {
      delete next[key];
    }
    const cleaned = Object.keys(next).length > 0 ? next : null;
    emit({ phraseMemoryOverrides: cleaned });
  };

  // Valori effettivi: override ha precedenza sul preset
  const effective = {
    splitter: overrides?.splitter ?? selectedPreset?.config.splitter ?? 'regex',
    similarityThreshold: overrides?.similarityThreshold ?? selectedPreset?.config.similarityThreshold ?? 0.75,
    maxResults: overrides?.maxResults ?? selectedPreset?.config.maxResults ?? 10,
    minPhraseLength: overrides?.minPhraseLength ?? selectedPreset?.config.minPhraseLength ?? 3,
  };

  return (
    <div className="space-y-3">
      <SectionLabel icon={Brain} label="Phrase Memory" />

      {/* Toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={usePhraseMemory}
          disabled={disabled}
          onClick={handleToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${usePhraseMemory ? 'bg-editorial-accent' : 'bg-editorial-border'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${usePhraseMemory ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>
        <span className="text-xs text-editorial-muted">
          {usePhraseMemory ? 'Attiva' : 'Non attiva'}
        </span>
      </div>

      {/* Contenuto visibile solo se attivo */}
      {usePhraseMemory && (
        <div className="space-y-3 rounded-[16px] border border-editorial-border/60 bg-editorial-textbox/10 px-4 py-4">
          {/* Dropdown preset */}
          <div className="space-y-1.5">
            <label
              htmlFor="phrase-memory-preset"
              className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
            >
              Preset
            </label>
            <select
              id="phrase-memory-preset"
              value={selectedPreset?.id ?? ''}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={disabled || presets.length === 0}
              className="w-full rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none disabled:opacity-40"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.isBuiltIn ? ' (built-in)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sezione Avanzate collassabile */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-expanded={showAdvanced}
              aria-label="avanzate"
            >
              {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              Avanzate
              {hasOverrides && (
                <span className="ml-1 rounded-full bg-editorial-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-editorial-accent">
                  modificato
                </span>
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-1">
                {/* Splitter */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                    Splitter frasi
                    {overrides?.splitter !== undefined && (
                      <span className="ml-2 rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] text-editorial-accent">
                        modificato
                      </span>
                    )}
                  </p>
                  <div className="flex gap-3">
                    {(['regex', 'llm', 'none'] as PhraseMemorySplitter[]).map((v) => (
                      <label key={v} className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name={`pm-splitter-${presetId}`}
                          value={v}
                          checked={effective.splitter === v}
                          onChange={() => patchOverride('splitter', v)}
                          disabled={disabled}
                          className="accent-editorial-accent"
                        />
                        <span className="text-xs text-editorial-ink">{SPLITTER_LABELS[v]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Soglia similarità */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="pm-threshold"
                    className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
                    aria-label="soglia similarità"
                  >
                    Soglia similarità — {effective.similarityThreshold.toFixed(2)}
                    {overrides?.similarityThreshold !== undefined && (
                      <span className="ml-2 rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] text-editorial-accent">
                        modificato
                      </span>
                    )}
                  </label>
                  <input
                    id="pm-threshold"
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.01"
                    value={effective.similarityThreshold}
                    onChange={(e) => patchOverride('similarityThreshold', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="w-full accent-editorial-accent disabled:opacity-40"
                    aria-label="soglia similarità"
                  />
                </div>

                {/* Max results */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="pm-max-results"
                    className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
                  >
                    Risultati massimi
                    {overrides?.maxResults !== undefined && (
                      <span className="ml-2 rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] text-editorial-accent">
                        modificato
                      </span>
                    )}
                  </label>
                  <input
                    id="pm-max-results"
                    type="number"
                    min={1}
                    max={50}
                    value={effective.maxResults}
                    onChange={(e) =>
                      patchOverride('maxResults', Math.max(1, parseInt(e.target.value) || 1))
                    }
                    disabled={disabled}
                    className="w-32 rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </div>

                {/* Min phrase length */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="pm-min-length"
                    className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
                  >
                    Lunghezza minima frase
                    {overrides?.minPhraseLength !== undefined && (
                      <span className="ml-2 rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] text-editorial-accent">
                        modificato
                      </span>
                    )}
                  </label>
                  <input
                    id="pm-min-length"
                    type="number"
                    min={1}
                    value={effective.minPhraseLength}
                    onChange={(e) =>
                      patchOverride('minPhraseLength', Math.max(1, parseInt(e.target.value) || 1))
                    }
                    disabled={disabled}
                    className="w-32 rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verifica test verdi**

Run: `npm test -- PhraseMemoryConfig`
Expected: tutti i test passano (GREEN)

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline/PhraseMemoryConfig.tsx src/components/pipeline/PhraseMemoryConfig.test.tsx
git commit -m "feat(phrase-memory): PhraseMemoryConfig — sezione pipeline toggle + preset + override"
```

---

## Task 7: Integrazione in SettingsTabPanel

**File:** `src/components/pipeline/SettingsTabPanel.tsx`

- [ ] **Step 1: Aggiungi PhraseMemoryConfig in fondo al pannello**

In `SettingsTabPanel.tsx`:

1. Aggiungi l'import:

```typescript
import { PhraseMemoryConfig } from './PhraseMemoryConfig';
```

2. Estendi `SettingsTabPanelProps`:

```typescript
interface SettingsTabPanelProps {
  // ... props esistenti ...
  usePhraseMemory: boolean;
  phraseMemoryPresetId: string | null | undefined;
  phraseMemoryOverrides: import('../../types').PhraseMemoryOverrides | null | undefined;
  onPhraseMemoryChange: (value: {
    usePhraseMemory: boolean;
    phraseMemoryPresetId: string | null;
    phraseMemoryOverrides: import('../../types').PhraseMemoryOverrides | null;
  }) => void;
}
```

3. Aggiungi le props nella firma della funzione e in fondo al JSX, dopo il blocco "Refine keys status":

```typescript
<PhraseMemoryConfig
  usePhraseMemory={usePhraseMemory}
  presetId={phraseMemoryPresetId ?? null}
  overrides={phraseMemoryOverrides ?? null}
  onChange={onPhraseMemoryChange}
  disabled={isProcessing}
/>
```

- [ ] **Step 2: Collegare le props in PipelineConfig.tsx**

In `src/components/pipeline/PipelineConfig.tsx`, passare le props a `<SettingsTabPanel>`:

```typescript
<SettingsTabPanel
  // ... props esistenti ...
  usePhraseMemory={config.usePhraseMemory ?? false}
  phraseMemoryPresetId={config.phraseMemoryPresetId ?? null}
  phraseMemoryOverrides={config.phraseMemoryOverrides ?? null}
  onPhraseMemoryChange={({ usePhraseMemory, phraseMemoryPresetId, phraseMemoryOverrides }) =>
    setConfig((prev) => ({ ...prev, usePhraseMemory, phraseMemoryPresetId, phraseMemoryOverrides }))
  }
/>
```

- [ ] **Step 3: Verifica TypeScript**

```bash
npm run typecheck
```

Expected: nessun errore di tipo

- [ ] **Step 4: Verifica visiva**

Avvia `npm run tauri dev`, apri una pipeline, vai alla tab Settings, verifica la sezione Phrase Memory in fondo: toggle, dropdown preset, sezione Avanzate collassabile con badge "modificato".

- [ ] **Step 5: Commit**

```bash
git add src/components/pipeline/SettingsTabPanel.tsx src/components/pipeline/PipelineConfig.tsx
git commit -m "feat(phrase-memory): PhraseMemoryConfig integrata in SettingsTabPanel"
```

---

## Task 8: Aggiornamento indici e lint finale

- [ ] **Step 1: Aggiorna src/components/settings/index.ts**

Aggiungi i due nuovi export:

```typescript
export { PhraseMemoryPresetManager } from './PhraseMemoryPresetManager';
export { PresetForm } from './PresetForm';
```

- [ ] **Step 2: Aggiorna src/components/pipeline/index.ts**

Aggiungi:

```typescript
export { PhraseMemoryConfig } from './PhraseMemoryConfig';
```

- [ ] **Step 3: Lint e type check**

```bash
npm run lint && npm run typecheck
```

Expected: nessun errore

- [ ] **Step 4: Suite test completa**

```bash
npm test
```

Expected: tutti i test passano

- [ ] **Step 5: Commit finale**

```bash
git add src/components/settings/index.ts src/components/pipeline/index.ts
git commit -m "feat(phrase-memory): piano 4 completato — preset UI + pipeline config"
```

---

## Riepilogo task

| # | Task | File principali | Dipendenze |
|---|------|-----------------|------------|
| 1 | Tipi TypeScript | `types.ts` | — |
| 2 | pipelineService persistenza | `pipelineService.ts` | Task 1 |
| 3 | PresetForm | `PresetForm.tsx` | Task 1 |
| 4 | PhraseMemoryPresetManager | `PhraseMemoryPresetManager.tsx` | Task 3, Piano 1 |
| 5 | Integrazione SettingsModal | `SettingsModal.tsx` | Task 4 |
| 6 | PhraseMemoryConfig | `PhraseMemoryConfig.tsx` | Task 1, Piano 1 |
| 7 | Integrazione SettingsTabPanel | `SettingsTabPanel.tsx`, `PipelineConfig.tsx` | Task 6 |
| 8 | Indici + lint finale | `index.ts` x2 | Tutti |

**Prerequisiti:** Piano 1 completato (`phraseMemoryPresetService` con `listPresets`, `createCustomPreset`, `updateCustomPreset`, `deleteCustomPreset`, `clonePreset`; colonne DB `use_phrase_memory`, `phrase_memory_preset_id`, `phrase_memory_overrides` presenti nella tabella `pipelines`).
