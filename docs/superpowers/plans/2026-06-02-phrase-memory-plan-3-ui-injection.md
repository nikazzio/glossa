# Phrase Memory — Piano 3: Tab Memoria UI + Pipeline Injection + Estrai Termine

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Branching strategy:** Crea branch `feat/phrase-memory-plan-3` partendo da `feat/phrase-memory` aggiornato (dopo aver mergiato piano 2). Al termine, apri PR verso `feat/phrase-memory` (non verso `main`). Il branch `feat/phrase-memory` ha già una PR aperta su `main` (#205) per la review complessiva della feature.
>
> ```bash
> git checkout feat/phrase-memory
> git pull origin feat/phrase-memory
> git checkout -b feat/phrase-memory-plan-3
> ```

> **Nota Piano 2 — Shell gating già implementata:**
> `App.tsx` ha 3 stati: nessun workspace → `WorkspaceWizard`, workspace senza progetto → `WorkspaceHome`, progetto aperto → editor.
> Il `MemoryTab` vive nello stato 3 (editor con progetto aperto). Non esiste più un workspace ghost `ws_default`.

---

**Goal:** Implementare il layer UI completo della feature Phrase Memory: tab "Memoria" nel chunk panel, badge match nella lista chunk, iniezione delle coppie selezionate nel prompt al momento del re-run, e dialog "Estrai termine" per creare voci di glossario a partire da un match.

**Architecture:**
- `usePhraseMemoryMatches` — hook che interroga `phraseMemoryStore` (Piano 2) per il chunk corrente, gestisce lo stato locale di abilitazione per match, e tiene separato lo stato UI (checkbox, expand/collapse) dalla logica di ricerca
- `MemoryTab` — componente puro che riceve match + stato selezione + callbacks; non contiene logica di fetch
- `ExtractTermDialog` — dialog modale gestita con `confirmStore` o state locale; chiama l'LLM con structured output per suggerire il termine, poi inserisce in glossario via `glossaryService`
- Pipeline injection — `usePipeline` (o equivalente hook che avvia il re-run) riceve le coppie selezionate e le appende in coda a `stage-instructions`; static e blob non vengono mai toccati
- Pre-pipeline warning — prima del lancio completo la pipeline cerca match su tutti i chunk e avvisa se ci sono match trovati ma tutti disabilitati

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand, Vitest + Testing Library, Tauri v2 invoke per LLM structured output

---

## File Structure

```
src/
├── components/document/
│   ├── InsightsDrawer.tsx          (modificato — aggiungi tab 'memory')
│   ├── MemoryTab.tsx               (nuovo)
│   └── ExtractTermDialog.tsx       (nuovo)
├── hooks/
│   ├── usePhraseMemoryMatches.ts   (nuovo)
│   └── usePipeline.ts              (modificato — pre-search + inject)
├── stores/
│   └── uiStore.ts                  (modificato — 'memory' in ChunkDrawerTab)
└── services/
    └── glossaryService.ts          (modificato — addGlossaryEntry già esiste,
                                     verifica firma; altrimenti nessuna modifica)
```

---

## Types di riferimento

Questi tipi sono già definiti in Piano 2 (`phraseMemoryStore`). Il Piano 3 li importa, non li ridefinisce.

```typescript
// src/stores/phraseMemoryStore.ts (Piano 2 — solo lettura qui)
type PhraseMemoryMatch = {
  id: string
  sourcePhrase: string
  targetPhrase: string
  score: number
  author?: string
  work?: string
  createdAt: string
}

type ChunkPhraseMatches = {
  chunkId: string
  matches: PhraseMemoryMatch[]
  enabledMatchIds: Set<string>
}
```

---

## Tasks

### Task 1 — Aggiorna `uiStore`: aggiungi `'memory'` a `ChunkDrawerTab`

> TDD: modifica il tipo union + aggiorna i test esistenti di uiStore.

- [ ] **1.1** Leggi `src/stores/uiStore.test.ts` per capire la struttura dei test esistenti
- [ ] **1.2** Aggiungi il caso `'memory'` nei test: verifica che `setChunkDrawerTab('memory')` aggiorni `chunkDrawerTab` correttamente
- [ ] **1.3** In `src/stores/uiStore.ts`:
  - Cambia `export type ChunkDrawerTab = 'audit' | 'notes' | 'operations';` in `'audit' | 'notes' | 'operations' | 'memory'`
  - Non serve nessun'altra modifica allo store (la logica persist non salva `chunkDrawerTab`)
- [ ] **1.4** Esegui `rtk vitest src/stores/uiStore.test.ts` — deve passare
- [ ] **1.5** Commit: `feat(phrase-memory): add 'memory' to ChunkDrawerTab union`

---

### Task 2 — Aggiorna `InsightsDrawer`: registra il tab 'memory'

> TDD: il componente deve renderizzare il bottone tab "Memoria" e il pannello `MemoryTab` quando `chunkDrawerTab === 'memory'`.

- [ ] **2.1** Scrivi test in `src/components/document/InsightsDrawer.test.tsx` (crea il file se non esiste):

```typescript
// src/components/document/InsightsDrawer.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InsightsDrawer } from './InsightsDrawer'
import { useUiStore } from '../../stores/uiStore'

// mock phraseMemoryStore per evitare dipendenze Piano 2
vi.mock('../../stores/phraseMemoryStore', () => ({
  usePhraseMemoryStore: () => ({ matchesByChunk: new Map() }),
}))

describe('InsightsDrawer — chunk tabs', () => {
  it('renders the Memory tab button when chunk drawer is open', () => {
    useUiStore.setState({ showChunkDrawer: true, chunkDrawerTab: 'audit' })
    render(<InsightsDrawer onReauditChunk={vi.fn()} onRunCoherenceAudit={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /memoria/i })).toBeInTheDocument()
  })

  it('switches to MemoryTab panel on Memory tab click', async () => {
    useUiStore.setState({ showChunkDrawer: true, chunkDrawerTab: 'audit' })
    render(<InsightsDrawer onReauditChunk={vi.fn()} onRunCoherenceAudit={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /memoria/i }))
    expect(screen.getByRole('tabpanel', { name: /memoria/i })).toBeInTheDocument()
  })
})
```

- [ ] **2.2** Esegui il test — deve fallire (RED)
- [ ] **2.3** Modifica `src/components/document/InsightsDrawer.tsx`:

**2.3a** Aggiungi import:
```typescript
import { Brain } from 'lucide-react';
import { MemoryTab } from './MemoryTab';
```

**2.3b** Aggiungi `'memory'` a `CHUNK_TAB_ORDER`:
```typescript
const CHUNK_TAB_ORDER: ChunkDrawerTab[] = ['audit', 'notes', 'operations', 'memory'];
```

**2.3c** Aggiungi entry nelle mappe `CHUNK_TAB_BUTTON_IDS` e `CHUNK_TAB_PANEL_IDS`:
```typescript
const CHUNK_TAB_BUTTON_IDS: Record<ChunkDrawerTab, string> = {
  audit: 'chunk-tab-button-audit',
  notes: 'chunk-tab-button-notes',
  operations: 'chunk-tab-button-operations',
  memory: 'chunk-tab-button-memory',
};

const CHUNK_TAB_PANEL_IDS: Record<ChunkDrawerTab, string> = {
  audit: 'chunk-tab-panel-audit',
  notes: 'chunk-tab-panel-notes',
  operations: 'chunk-tab-panel-operations',
  memory: 'chunk-tab-panel-memory',
};
```

**2.3d** Aggiungi icon e label nelle mappe (dentro `InsightsDrawer`, dopo le altre):
```typescript
const CHUNK_TAB_ICON: Record<ChunkDrawerTab, React.ReactNode> = {
  audit: <ShieldCheck size={16} />,
  notes: <NotebookText size={16} />,
  operations: <TerminalSquare size={16} />,
  memory: <Brain size={16} />,
};
const CHUNK_TAB_LABEL: Record<ChunkDrawerTab, string> = {
  audit: t('document.insightsTabAudit'),
  notes: t('document.insightsTabNotes'),
  operations: t('document.insightsTabOperations'),
  memory: t('document.insightsTabMemory'),
};
```

**2.3e** Nel render del contenuto del chunk panel, aggiungi il branch `'memory'`:
```typescript
// Prima (ultimo else):
} : (
  <OperationsTab ... />
)

// Dopo:
} : chunkDrawerTab === 'memory' ? (
  <MemoryTab
    panelId={CHUNK_TAB_PANEL_IDS.memory}
    labelledBy={CHUNK_TAB_BUTTON_IDS.memory}
    currentChunkId={currentChunk?.id ?? null}
  />
) : (
  <OperationsTab ... />
)
```

- [ ] **2.4** Aggiungi la chiave i18n `document.insightsTabMemory` nei file di traduzione:
  - `src/i18n/locales/it.json` (o equivalente): `"insightsTabMemory": "Memoria"`
  - `src/i18n/locales/en.json`: `"insightsTabMemory": "Memory"`
- [ ] **2.5** Esegui `rtk vitest src/components/document/InsightsDrawer.test.tsx` — deve passare (GREEN)
- [ ] **2.6** Commit: `feat(phrase-memory): register Memory tab in InsightsDrawer`

---

### Task 3 — Crea `usePhraseMemoryMatches`: hook per match + selezione

> TDD: hook puro con logica di toggle enabled/disabled, senza side effects.

- [ ] **3.1** Scrivi test `src/hooks/usePhraseMemoryMatches.test.ts`:

```typescript
// src/hooks/usePhraseMemoryMatches.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePhraseMemoryMatches } from './usePhraseMemoryMatches'
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore'
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore'

const makeMatch = (id: string): PhraseMemoryMatch => ({
  id,
  sourcePhrase: `source ${id}`,
  targetPhrase: `target ${id}`,
  score: 0.9,
  createdAt: new Date().toISOString(),
})

vi.mock('../stores/phraseMemoryStore', () => ({
  usePhraseMemoryStore: vi.fn(),
}))

describe('usePhraseMemoryMatches', () => {
  beforeEach(() => {
    vi.mocked(usePhraseMemoryStore).mockReturnValue({
      matchesByChunk: new Map([
        ['chunk-1', {
          chunkId: 'chunk-1',
          matches: [makeMatch('m1'), makeMatch('m2')],
          enabledMatchIds: new Set(['m1', 'm2']),
        }],
      ]),
      toggleMatchEnabled: vi.fn(),
      setEnabledMatchIds: vi.fn(),
    } as unknown as ReturnType<typeof usePhraseMemoryStore>)
  })

  it('returns matches for the given chunkId', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'))
    expect(result.current.matches).toHaveLength(2)
  })

  it('returns empty array for unknown chunkId', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('unknown'))
    expect(result.current.matches).toHaveLength(0)
  })

  it('returns enabledMatchIds for the given chunkId', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'))
    expect(result.current.enabledMatchIds.has('m1')).toBe(true)
  })

  it('toggleEnabled calls store toggleMatchEnabled', () => {
    const mockToggle = vi.fn()
    vi.mocked(usePhraseMemoryStore).mockReturnValue({
      matchesByChunk: new Map([
        ['chunk-1', { chunkId: 'chunk-1', matches: [makeMatch('m1')], enabledMatchIds: new Set(['m1']) }],
      ]),
      toggleMatchEnabled: mockToggle,
      setEnabledMatchIds: vi.fn(),
    } as unknown as ReturnType<typeof usePhraseMemoryStore>)

    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'))
    act(() => result.current.toggleEnabled('m1'))
    expect(mockToggle).toHaveBeenCalledWith('chunk-1', 'm1')
  })

  it('selectedMatches returns only enabled matches', () => {
    vi.mocked(usePhraseMemoryStore).mockReturnValue({
      matchesByChunk: new Map([
        ['chunk-1', {
          chunkId: 'chunk-1',
          matches: [makeMatch('m1'), makeMatch('m2')],
          enabledMatchIds: new Set(['m1']), // m2 disabled
        }],
      ]),
      toggleMatchEnabled: vi.fn(),
      setEnabledMatchIds: vi.fn(),
    } as unknown as ReturnType<typeof usePhraseMemoryStore>)

    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'))
    expect(result.current.selectedMatches).toHaveLength(1)
    expect(result.current.selectedMatches[0].id).toBe('m1')
  })

  it('hasMatches is true when matches exist', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('chunk-1'))
    expect(result.current.hasMatches).toBe(true)
  })

  it('hasMatches is false when no matches', () => {
    const { result } = renderHook(() => usePhraseMemoryMatches('unknown'))
    expect(result.current.hasMatches).toBe(false)
  })
})
```

- [ ] **3.2** Esegui il test — deve fallire (RED)
- [ ] **3.3** Crea `src/hooks/usePhraseMemoryMatches.ts`:

```typescript
// src/hooks/usePhraseMemoryMatches.ts
import { useMemo } from 'react';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';

interface UsePhraseMemoryMatchesResult {
  matches: PhraseMemoryMatch[];
  enabledMatchIds: Set<string>;
  selectedMatches: PhraseMemoryMatch[];
  hasMatches: boolean;
  toggleEnabled: (matchId: string) => void;
}

export function usePhraseMemoryMatches(chunkId: string | null): UsePhraseMemoryMatchesResult {
  const matchesByChunk = usePhraseMemoryStore((s) => s.matchesByChunk);
  const toggleMatchEnabled = usePhraseMemoryStore((s) => s.toggleMatchEnabled);

  const chunkData = chunkId != null ? matchesByChunk.get(chunkId) : undefined;
  const matches = chunkData?.matches ?? [];
  const enabledMatchIds = chunkData?.enabledMatchIds ?? new Set<string>();

  const selectedMatches = useMemo(
    () => matches.filter((m) => enabledMatchIds.has(m.id)),
    [matches, enabledMatchIds],
  );

  const hasMatches = matches.length > 0;

  const toggleEnabled = (matchId: string) => {
    if (chunkId != null) {
      toggleMatchEnabled(chunkId, matchId);
    }
  };

  return { matches, enabledMatchIds, selectedMatches, hasMatches, toggleEnabled };
}
```

- [ ] **3.4** Esegui `rtk vitest src/hooks/usePhraseMemoryMatches.test.ts` — deve passare (GREEN)
- [ ] **3.5** Commit: `feat(phrase-memory): usePhraseMemoryMatches hook`

---

### Task 4 — Crea `MemoryTab`: lista match con checkbox + Applica + Rielabora

> TDD: renderizza cold start, lista match, gestione checkbox, bottone Applica (clipboard), bottone Rielabora.

- [ ] **4.1** Scrivi test `src/components/document/MemoryTab.test.tsx`:

```typescript
// src/components/document/MemoryTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryTab } from './MemoryTab'
import * as usePhraseMemoryMatchesModule from '../../hooks/usePhraseMemoryMatches'
import type { PhraseMemoryMatch } from '../../stores/phraseMemoryStore'

const makeMatch = (overrides: Partial<PhraseMemoryMatch> = {}): PhraseMemoryMatch => ({
  id: 'match-1',
  sourcePhrase: 'hello world',
  targetPhrase: 'ciao mondo',
  score: 0.92,
  author: 'Dante',
  work: 'Inferno',
  createdAt: new Date().toISOString(),
  ...overrides,
})

const defaultHookResult = {
  matches: [],
  enabledMatchIds: new Set<string>(),
  selectedMatches: [],
  hasMatches: false,
  toggleEnabled: vi.fn(),
}

vi.mock('../../hooks/usePhraseMemoryMatches', () => ({
  usePhraseMemoryMatches: vi.fn(),
}))

describe('MemoryTab', () => {
  const mockOnRerun = vi.fn()

  beforeEach(() => {
    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue(defaultHookResult)
    vi.clearAllMocks()
  })

  it('shows cold start placeholder when no matches', () => {
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    expect(screen.getByText(/la memoria si costruisce/i)).toBeInTheDocument()
  })

  it('renders match list when matches exist', () => {
    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
      ...defaultHookResult,
      matches: [makeMatch()],
      enabledMatchIds: new Set(['match-1']),
      selectedMatches: [makeMatch()],
      hasMatches: true,
    })
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(screen.getByText('ciao mondo')).toBeInTheDocument()
  })

  it('shows score as percentage', () => {
    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
      ...defaultHookResult,
      matches: [makeMatch({ score: 0.92 })],
      enabledMatchIds: new Set(['match-1']),
      selectedMatches: [makeMatch()],
      hasMatches: true,
    })
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('shows author and work when present', () => {
    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
      ...defaultHookResult,
      matches: [makeMatch({ author: 'Dante', work: 'Inferno' })],
      enabledMatchIds: new Set(['match-1']),
      hasMatches: true,
      selectedMatches: [makeMatch()],
    })
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    expect(screen.getByText(/Dante/)).toBeInTheDocument()
    expect(screen.getByText(/Inferno/)).toBeInTheDocument()
  })

  it('calls toggleEnabled on checkbox click', async () => {
    const mockToggle = vi.fn()
    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
      ...defaultHookResult,
      matches: [makeMatch()],
      enabledMatchIds: new Set(['match-1']),
      hasMatches: true,
      selectedMatches: [makeMatch()],
      toggleEnabled: mockToggle,
    })
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    const checkbox = screen.getByRole('checkbox')
    await userEvent.click(checkbox)
    expect(mockToggle).toHaveBeenCalledWith('match-1')
  })

  it('copies targetPhrase to clipboard on Applica click', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } })

    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
      ...defaultHookResult,
      matches: [makeMatch()],
      enabledMatchIds: new Set(['match-1']),
      hasMatches: true,
      selectedMatches: [makeMatch()],
    })
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    await userEvent.click(screen.getByRole('button', { name: /applica/i }))
    expect(mockWriteText).toHaveBeenCalledWith('ciao mondo')
  })

  it('calls onRerun with selectedMatches on Rielabora click', async () => {
    const match = makeMatch()
    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
      ...defaultHookResult,
      matches: [match],
      enabledMatchIds: new Set(['match-1']),
      hasMatches: true,
      selectedMatches: [match],
    })
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    await userEvent.click(screen.getByRole('button', { name: /rielabora/i }))
    expect(mockOnRerun).toHaveBeenCalledWith([match])
  })

  it('disables Rielabora when no matches are selected', () => {
    vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
      ...defaultHookResult,
      matches: [makeMatch()],
      enabledMatchIds: new Set(), // nessuno selezionato
      hasMatches: true,
      selectedMatches: [],
    })
    render(
      <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
    )
    expect(screen.getByRole('button', { name: /rielabora/i })).toBeDisabled()
  })
})
```

- [ ] **4.2** Esegui il test — deve fallire (RED)
- [ ] **4.3** Crea `src/components/document/MemoryTab.tsx`:

```typescript
// src/components/document/MemoryTab.tsx
import { Brain, Check, Clipboard, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePhraseMemoryMatches } from '../../hooks/usePhraseMemoryMatches';
import type { PhraseMemoryMatch } from '../../stores/phraseMemoryStore';

interface MemoryTabProps {
  panelId: string;
  labelledBy: string;
  currentChunkId: string | null;
  onRerun: (selectedMatches: PhraseMemoryMatch[]) => void;
}

export function MemoryTab({ panelId, labelledBy, currentChunkId, onRerun }: MemoryTabProps) {
  const { t } = useTranslation();
  const { matches, enabledMatchIds, selectedMatches, hasMatches, toggleEnabled } =
    usePhraseMemoryMatches(currentChunkId);

  if (!hasMatches) {
    return (
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={labelledBy}
        className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      >
        <Brain size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">
          {t('memory.coldStartTitle')}
        </p>
        <p className="text-xs leading-relaxed text-editorial-muted/70">
          {t('memory.coldStartBody')}
        </p>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col">
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            enabled={enabledMatchIds.has(match.id)}
            onToggle={() => toggleEnabled(match.id)}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-editorial-border px-4 py-3">
        <button
          type="button"
          onClick={() => onRerun(selectedMatches)}
          disabled={selectedMatches.length === 0}
          className="w-full flex items-center justify-center gap-2 rounded-full border border-editorial-accent bg-editorial-accent/10 px-4 py-2 text-sm font-medium text-editorial-accent transition-colors hover:bg-editorial-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('memory.rerunButton')}
        >
          <RefreshCcw size={14} />
          {t('memory.rerunButton')}
        </button>
      </div>
    </div>
  );
}

// ── MatchCard ──────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: PhraseMemoryMatch;
  enabled: boolean;
  onToggle: () => void;
}

function MatchCard({ match, enabled, onToggle }: MatchCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleApply = async () => {
    try {
      await navigator.clipboard.writeText(match.targetPhrase);
      setCopied(true);
      toast.success(t('memory.appliedToClipboard'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('errors.clipboardFailed'));
    }
  };

  const scorePct = Math.round(match.score * 100);

  return (
    <article className="rounded-2xl border border-editorial-border bg-editorial-bg p-4 space-y-3">
      {/* Header: score + checkbox */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggle}
            className="h-4 w-4 rounded border-editorial-border accent-editorial-accent"
            aria-label={t('memory.enableMatch')}
          />
          <span className="font-mono text-xs font-bold text-editorial-accent">{scorePct}%</span>
        </div>
        {(match.author ?? match.work) && (
          <span className="text-[10px] text-editorial-muted truncate max-w-[180px]">
            {[match.author, match.work].filter(Boolean).join(' — ')}
          </span>
        )}
      </div>

      {/* Source phrase */}
      <div className="rounded-xl bg-editorial-textbox/40 px-3 py-2 text-xs leading-relaxed text-editorial-ink font-mono">
        {match.sourcePhrase}
      </div>

      {/* Target phrase */}
      <div className="rounded-xl border border-editorial-border/60 bg-editorial-bg px-3 py-2 text-xs leading-relaxed text-editorial-ink">
        {match.targetPhrase}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleApply}
          className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-1 text-[11px] font-medium text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('memory.applyButton')}
        >
          {copied ? <Check size={12} className="text-editorial-success" /> : <Clipboard size={12} />}
          {t('memory.applyButton')}
        </button>
      </div>
    </article>
  );
}
```

- [ ] **4.4** Aggiungi le chiavi i18n necessarie:
  - `memory.coldStartTitle`: `"Nessun match trovato"`
  - `memory.coldStartBody`: `"La memoria si costruisce man mano che approvi le traduzioni."`
  - `memory.rerunButton`: `"Rielabora con match selezionati"`
  - `memory.applyButton`: `"Applica"`
  - `memory.appliedToClipboard`: `"Traduzione copiata negli appunti"`
  - `memory.enableMatch`: `"Abilita match"`
- [ ] **4.5** Esegui `rtk vitest src/components/document/MemoryTab.test.tsx` — deve passare (GREEN)
- [ ] **4.6** Commit: `feat(phrase-memory): MemoryTab component`

---

### Task 5 — Badge match nella lista chunk (IndexTab)

> TDD: nel tab Index del document drawer, ogni chunk con match deve mostrare un badge "N match".

- [ ] **5.1** Scrivi test per la logica del badge in `InsightsDrawer.test.tsx` (aggiungi alla suite esistente):

```typescript
it('shows match badge on chunk with memory matches', () => {
  // Arrange: 1 chunk con 2 match in store
  usePhraseMemoryStore.setState({
    matchesByChunk: new Map([
      ['chunk-abc', {
        chunkId: 'chunk-abc',
        matches: [makeMatch('m1'), makeMatch('m2')],
        enabledMatchIds: new Set(['m1', 'm2']),
      }],
    ]),
  })
  useChunksStore.setState({
    chunks: [{ id: 'chunk-abc', originalText: 'hello', status: 'ready', ... }],
  })
  useUiStore.setState({ showDocumentDrawer: true, documentDrawerTab: 'index' })

  render(<InsightsDrawer onReauditChunk={vi.fn()} onRunCoherenceAudit={vi.fn()} />)
  expect(screen.getByText('2 match')).toBeInTheDocument()
})
```

- [ ] **5.2** Modifica `IndexTab` dentro `InsightsDrawer.tsx` per leggere `matchesByChunk` dallo store e mostrare il badge:

```typescript
// All'inizio di IndexTab, dopo gli altri hooks:
const matchesByChunk = usePhraseMemoryStore((s) => s.matchesByChunk);

// Dentro il render di ogni chunk (dopo translationLocked badge):
{(() => {
  const chunkMatches = matchesByChunk.get(chunk.id);
  const matchCount = chunkMatches?.matches.length ?? 0;
  if (matchCount === 0) return null;
  return (
    <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] ${isActive ? 'text-white/80' : 'text-editorial-accent'}`}>
      <Brain size={11} />
      {matchCount} {matchCount === 1 ? 'match' : 'match'}
    </div>
  );
})()}
```

- [ ] **5.3** Aggiungi `import { usePhraseMemoryStore } from '../../stores/phraseMemoryStore';` e `Brain` a InsightsDrawer
- [ ] **5.4** Esegui `rtk vitest src/components/document/InsightsDrawer.test.tsx` — deve passare (GREEN)
- [ ] **5.5** Commit: `feat(phrase-memory): match badge in chunk index list`

---

### Task 6 — Pipeline injection: funzione `buildMemoryInjection`

> TDD: funzione pura che trasforma una lista di match nel blocco di testo da appendere a stage-instructions.

- [ ] **6.1** Scrivi test `src/services/phraseMemoryInjection.test.ts`:

```typescript
// src/services/phraseMemoryInjection.test.ts
import { describe, it, expect } from 'vitest'
import { buildMemoryInjection } from './phraseMemoryInjection'
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore'

const makeMatch = (src: string, tgt: string): PhraseMemoryMatch => ({
  id: 'x',
  sourcePhrase: src,
  targetPhrase: tgt,
  score: 0.9,
  createdAt: new Date().toISOString(),
})

describe('buildMemoryInjection', () => {
  it('returns null for empty array', () => {
    expect(buildMemoryInjection([])).toBeNull()
  })

  it('returns formatted block for one match', () => {
    const result = buildMemoryInjection([makeMatch('hello', 'ciao')])
    expect(result).toContain('Translation memory references')
    expect(result).toContain('"hello" → "ciao"')
  })

  it('returns one line per match', () => {
    const result = buildMemoryInjection([
      makeMatch('a', 'A'),
      makeMatch('b', 'B'),
    ])
    expect(result).toContain('"a" → "A"')
    expect(result).toContain('"b" → "B"')
  })

  it('output starts with the header comment', () => {
    const result = buildMemoryInjection([makeMatch('x', 'y')])
    expect(result?.startsWith('Translation memory references')).toBe(true)
  })
})
```

- [ ] **6.2** Esegui il test — deve fallire (RED)
- [ ] **6.3** Crea `src/services/phraseMemoryInjection.ts`:

```typescript
// src/services/phraseMemoryInjection.ts
import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';

/**
 * Builds the translation memory block to append at the end of stage-instructions.
 * Returns null if the match list is empty (nothing to inject).
 *
 * IMPORTANT: This block must be appended ONLY to stage-instructions.
 * Never modify the static block or the blob — that would break prefix caching.
 */
export function buildMemoryInjection(matches: PhraseMemoryMatch[]): string | null {
  if (matches.length === 0) return null;

  const lines = matches.map((m) => `- "${m.sourcePhrase}" → "${m.targetPhrase}"`);
  return [
    'Translation memory references (use for terminology consistency only, do not copy verbatim):',
    ...lines,
  ].join('\n');
}
```

- [ ] **6.4** Esegui `rtk vitest src/services/phraseMemoryInjection.test.ts` — deve passare (GREEN)
- [ ] **6.5** Commit: `feat(phrase-memory): buildMemoryInjection pure function`

---

### Task 7 — `usePipeline`: integra pre-search warning e re-run con injection

> TDD: testa il comportamento del hook al momento del lancio della pipeline e del re-run singolo chunk.

**Nota architetturale:** Questo task modifica il hook (o servizio) che gestisce il lancio della pipeline. Leggi prima `src/hooks/usePipeline.ts` per capire i punti di integrazione. I due punti da toccare sono:

1. **Pre-pipeline warning** (lancio completo): dopo aver eseguito la ricerca su tutti i chunk, se un chunk ha match ma tutti sono disabilitati, mostra un warning con `toast.warning`.
2. **Re-run con injection** (MemoryTab → "Rielabora"): il chunk viene rielaborato con le coppie selezionate appese in coda a `stage-instructions`.

- [ ] **7.1** Leggi `src/hooks/usePipeline.ts` per identificare:
  - La funzione che lancia la pipeline completa (es. `runPipeline`)
  - La funzione che ri-processa un singolo chunk (es. `rerunChunk` o `reprocessChunk`)
  - Il punto dove viene costruito il prompt per `stage-instructions`

- [ ] **7.2** Scrivi test per `buildMemoryInjection` già completato in Task 6 — non serve un test aggiuntivo su `usePipeline` per la funzione pura. Per il warning pre-lancio, scrivi uno unit test isolato:

```typescript
// src/hooks/usePipeline.preLaunchMemoryCheck.test.ts
import { describe, it, expect, vi } from 'vitest'
import { checkAllChunksHaveEnabledMatches } from '../utils/memoryPreLaunchCheck'
import type { ChunkPhraseMatches } from '../stores/phraseMemoryStore'

const makeChunkMatches = (enabled: string[]): ChunkPhraseMatches => ({
  chunkId: 'c1',
  matches: [
    { id: 'm1', sourcePhrase: 's', targetPhrase: 't', score: 0.9, createdAt: '' },
    { id: 'm2', sourcePhrase: 's2', targetPhrase: 't2', score: 0.85, createdAt: '' },
  ],
  enabledMatchIds: new Set(enabled),
})

describe('checkAllChunksHaveEnabledMatches', () => {
  it('returns empty array when all chunks with matches have at least one enabled', () => {
    const map = new Map([['c1', makeChunkMatches(['m1'])]])
    expect(checkAllChunksHaveEnabledMatches(map)).toEqual([])
  })

  it('returns chunkIds where matches exist but all are disabled', () => {
    const map = new Map([['c1', makeChunkMatches([])]])
    expect(checkAllChunksHaveEnabledMatches(map)).toEqual(['c1'])
  })

  it('returns empty array when no chunks have matches', () => {
    expect(checkAllChunksHaveEnabledMatches(new Map())).toEqual([])
  })
})
```

- [ ] **7.3** Crea `src/utils/memoryPreLaunchCheck.ts`:

```typescript
// src/utils/memoryPreLaunchCheck.ts
import type { ChunkPhraseMatches } from '../stores/phraseMemoryStore';

/**
 * Returns chunkIds where phrase memory matches exist but ALL are disabled.
 * Used to show a pre-launch warning to the user.
 */
export function checkAllChunksHaveEnabledMatches(
  matchesByChunk: Map<string, ChunkPhraseMatches>,
): string[] {
  const blocked: string[] = [];
  for (const [chunkId, data] of matchesByChunk) {
    if (data.matches.length > 0 && data.enabledMatchIds.size === 0) {
      blocked.push(chunkId);
    }
  }
  return blocked;
}
```

- [ ] **7.4** Esegui `rtk vitest src/utils/memoryPreLaunchCheck` — deve passare (GREEN)

- [ ] **7.5** Integra in `usePipeline.ts` (punti esatti da adattare dopo aver letto il file in 7.1):

**Pre-launch warning** (aggiunto nella funzione che avvia la pipeline completa, prima del lancio):
```typescript
// Importa in cima a usePipeline.ts:
import { checkAllChunksHaveEnabledMatches } from '../utils/memoryPreLaunchCheck';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';

// Dentro la funzione di lancio:
const matchesByChunk = usePhraseMemoryStore.getState().matchesByChunk;
const blockedChunks = checkAllChunksHaveEnabledMatches(matchesByChunk);
if (blockedChunks.length > 0) {
  toast.warning(t('memory.prelaunchWarning', { count: blockedChunks.length }));
  // Non blocca il lancio — è solo un avviso
}
```

**Re-run singolo chunk con injection** (aggiunto nella funzione di re-run):
```typescript
import { buildMemoryInjection } from '../services/phraseMemoryInjection';

// Dentro il re-run del chunk (quando chiamato da MemoryTab):
// `selectedMatches` vengono passati come parametro opzionale
async function rerunChunkWithMemory(chunkId: string, selectedMatches: PhraseMemoryMatch[]) {
  const memoryBlock = buildMemoryInjection(selectedMatches);
  // memoryBlock viene passato al builder del prompt come `extraStageInstructions`
  // Il builder lo appende DOPO il contenuto di stage-instructions, PRIMA della chiusura
  await rerunChunk(chunkId, { extraStageInstructions: memoryBlock });
}
```

**NOTA CRITICA — ordine blocchi prompt:**
Il blocco `memoryBlock` va appendito **solo** a `stage-instructions`. Non modificare mai l'ordine `static → blob → stage-instructions`. Il blocco memory viene concatenato come suffisso all'interno di `stage-instructions` e non altera la struttura del prefix cache.

Esempio di come il builder del prompt deve gestire `extraStageInstructions`:
```typescript
// Nel builder del system prompt (promptTemplateService o equivalente):
// PRIMA:
stageInstructions = buildStageInstructions(stage, config);
// DOPO:
stageInstructions = extraStageInstructions
  ? `${buildStageInstructions(stage, config)}\n\n${extraStageInstructions}`
  : buildStageInstructions(stage, config);
```

- [ ] **7.6** Aggiungi chiave i18n `memory.prelaunchWarning`:
  - IT: `"{{count}} chunk hanno match di memoria non abilitati"`
  - EN: `"{{count}} chunks have disabled memory matches"`

- [ ] **7.7** Log dell'injection in `operation_logs` con `detail_kind: 'prompt_structure'`:
```typescript
// Dopo il re-run, logga la struttura del prompt con l'injection:
operationLogStore.addEntry({
  chunkId,
  stageId: stage.id,
  detailKind: 'prompt_structure',
  detail: `Memory injection: ${selectedMatches.length} pairs injected into stage-instructions`,
});
```

- [ ] **7.8** Esegui `rtk vitest` — tutti i test devono passare
- [ ] **7.9** Commit: `feat(phrase-memory): pre-launch warning + pipeline injection in usePipeline`

---

### Task 8 — Collega `MemoryTab.onRerun` alla pipeline

> Integra il bottone "Rielabora" di `MemoryTab` col hook `usePipeline`.

- [ ] **8.1** In `InsightsDrawer.tsx`, importa il hook e la funzione di re-run:
```typescript
import { usePipeline } from '../../hooks/usePipeline'; // verifica nome esatto
```

- [ ] **8.2** Recupera la funzione `rerunChunkWithMemory` (o equivalente) dal hook e passala a `MemoryTab`:
```typescript
// Nella parte chunk del render:
const { rerunChunkWithMemory } = usePipeline();

// Nel branch 'memory':
<MemoryTab
  panelId={CHUNK_TAB_PANEL_IDS.memory}
  labelledBy={CHUNK_TAB_BUTTON_IDS.memory}
  currentChunkId={currentChunk?.id ?? null}
  onRerun={(selectedMatches) => {
    if (currentChunk?.id) {
      rerunChunkWithMemory(currentChunk.id, selectedMatches);
    }
  }}
/>
```

- [ ] **8.3** Esegui `rtk vitest` — tutto verde
- [ ] **8.4** Commit: `feat(phrase-memory): wire MemoryTab rerun to pipeline hook`

---

### Task 9 — Crea `ExtractTermDialog`: estrazione termine in glossario

> TDD: dialog che chiama LLM per suggerire un termine, permette editing, e inserisce in glossario.

- [ ] **9.1** Scrivi test `src/components/document/ExtractTermDialog.test.tsx`:

```typescript
// src/components/document/ExtractTermDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExtractTermDialog } from './ExtractTermDialog'
import * as glossaryService from '../../services/glossaryService'

vi.mock('../../services/glossaryService', () => ({
  listGlossaries: vi.fn().mockResolvedValue([
    { id: 'g1', name: 'Glossario principale', sourceLanguage: 'en', targetLanguage: 'it', createdAt: '' },
  ]),
  addGlossaryEntry: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../services/llmService', () => ({
  extractTermFromPhrase: vi.fn().mockResolvedValue({ term: 'hello', confidence: 0.95 }),
}))

describe('ExtractTermDialog', () => {
  const defaultProps = {
    sourcePhrase: 'hello world',
    targetPhrase: 'ciao mondo',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  beforeEach(() => vi.clearAllMocks())

  it('renders with source and target phrase', async () => {
    render(<ExtractTermDialog {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('hello')).toBeInTheDocument() // suggested term
    })
    expect(screen.getByDisplayValue('ciao mondo')).toBeInTheDocument()
  })

  it('allows editing the suggested term', async () => {
    render(<ExtractTermDialog {...defaultProps} />)
    await waitFor(() => screen.getByDisplayValue('hello'))
    await userEvent.clear(screen.getByLabelText(/termine/i))
    await userEvent.type(screen.getByLabelText(/termine/i), 'salve')
    expect(screen.getByDisplayValue('salve')).toBeInTheDocument()
  })

  it('calls addGlossaryEntry on confirm', async () => {
    render(<ExtractTermDialog {...defaultProps} />)
    await waitFor(() => screen.getByDisplayValue('hello'))
    // Seleziona glossario
    await userEvent.selectOptions(screen.getByLabelText(/glossario/i), 'g1')
    await userEvent.click(screen.getByRole('button', { name: /conferma/i }))
    expect(glossaryService.addGlossaryEntry).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ term: 'hello', translation: 'ciao mondo' }),
    )
  })

  it('calls onClose on cancel', async () => {
    render(<ExtractTermDialog {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /annulla/i }))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('disables confirm when no glossary selected', async () => {
    render(<ExtractTermDialog {...defaultProps} />)
    await waitFor(() => screen.getByDisplayValue('hello'))
    // Nessun glossario selezionato di default
    expect(screen.getByRole('button', { name: /conferma/i })).toBeDisabled()
  })
})
```

- [ ] **9.2** Esegui il test — deve fallire (RED)

- [ ] **9.3** Crea il servizio LLM per l'estrazione termine. Prima leggi la firma di `llmService.ts` per capire come fare chiamate LLM:

```typescript
// src/services/llmService.ts (aggiungi questa funzione al file esistente)

/**
 * Calls the LLM with structured output to extract a key term (1-3 words)
 * from the given source phrase. Uses the configured translation pipeline model.
 */
export async function extractTermFromPhrase(
  sourcePhrase: string,
  provider: string,
  model: string,
): Promise<{ term: string; confidence: number }> {
  // Usa invoke Tauri per chiamare l'LLM con structured output
  // Il prompt chiede esplicitamente un termine breve (1-3 parole) e un valore di confidence
  const result = await invoke<{ term: string; confidence: number }>('extract_key_term', {
    phrase: sourcePhrase,
    provider,
    model,
  });
  return result;
}
```

**Nota:** Il comando Rust `extract_key_term` è implementato nel Piano 2. Se non è ancora disponibile, mocka la chiamata con un fallback che restituisce le prime 3 parole della `sourcePhrase`.

- [ ] **9.4** Crea `src/components/document/ExtractTermDialog.tsx`:

```typescript
// src/components/document/ExtractTermDialog.tsx
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { listGlossaries, addGlossaryEntry } from '../../services/glossaryService';
import { extractTermFromPhrase } from '../../services/llmService';
import { usePipelineStore } from '../../stores/pipelineStore';
import type { Glossary } from '../../types';
import { generateId } from '../../utils';

interface ExtractTermDialogProps {
  sourcePhrase: string;
  targetPhrase: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ExtractTermDialog({ sourcePhrase, targetPhrase, onClose, onSuccess }: ExtractTermDialogProps) {
  const { t } = useTranslation();
  const config = usePipelineStore((s) => s.config);

  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState(targetPhrase);
  const [notes, setNotes] = useState('');
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(null);
  const [glossaries, setGlossaries] = useState<Glossary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load glossaries and suggest term on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [gl, suggested] = await Promise.all([
          listGlossaries(),
          extractTermFromPhrase(
            sourcePhrase,
            config.stages[0]?.provider ?? 'openai',
            config.stages[0]?.model ?? 'gpt-4o',
          ).catch(() => ({ term: sourcePhrase.split(' ').slice(0, 3).join(' '), confidence: 0 })),
        ]);
        if (cancelled) return;
        setGlossaries(gl);
        setTerm(suggested.term);
        // Pre-select assigned glossary if present
        if (config.assignedGlossaryId) {
          setSelectedGlossaryId(config.assignedGlossaryId);
        }
      } catch (err) {
        if (!cancelled) toast.error(t('errors.loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void init();
    return () => { cancelled = true; };
  }, [sourcePhrase, config, t]);

  const handleConfirm = async () => {
    if (!selectedGlossaryId || !term.trim()) return;
    setIsSaving(true);
    try {
      await addGlossaryEntry(selectedGlossaryId, {
        id: generateId('ge'),
        term: term.trim(),
        translation: translation.trim(),
        notes: notes.trim() || undefined,
      });
      toast.success(t('memory.termExtracted'));
      onSuccess();
      onClose();
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extract-term-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-editorial-border bg-editorial-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-editorial-border px-6 py-4">
          <h2 id="extract-term-title" className="font-display text-base italic text-editorial-ink">
            {t('memory.extractTermTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('header.closeDrawer')}
            className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Source phrase (readonly reference) */}
          <div>
            <label className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('memory.sourcePhraseLabel')}
            </label>
            <div className="rounded-xl bg-editorial-textbox/40 px-3 py-2 text-xs text-editorial-muted font-mono leading-relaxed">
              {sourcePhrase}
            </div>
          </div>

          {/* Suggested term (editable) */}
          <div>
            <label
              htmlFor="extract-term-input"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
            >
              {t('memory.termLabel')}
            </label>
            <input
              id="extract-term-input"
              type="text"
              value={isLoading ? '…' : term}
              onChange={(e) => setTerm(e.target.value)}
              disabled={isLoading}
              aria-label={t('memory.termLabel')}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-50"
            />
          </div>

          {/* Translation (editable, pre-filled with targetPhrase) */}
          <div>
            <label
              htmlFor="extract-translation-input"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
            >
              {t('glossary.translation')}
            </label>
            <input
              id="extract-translation-input"
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>

          {/* Notes (optional) */}
          <div>
            <label
              htmlFor="extract-notes-input"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
            >
              {t('glossary.notes')} ({t('common.optional')})
            </label>
            <input
              id="extract-notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>

          {/* Glossary selector */}
          <div>
            <label
              htmlFor="extract-glossary-select"
              className="mb-1 block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted"
            >
              {t('glossary.selectGlossary')}
            </label>
            <select
              id="extract-glossary-select"
              value={selectedGlossaryId ?? ''}
              onChange={(e) => setSelectedGlossaryId(e.target.value || null)}
              aria-label={t('glossary.selectGlossary')}
              className="w-full rounded-xl border border-editorial-border bg-editorial-textbox/60 px-3 py-2 text-sm text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <option value="">{t('glossary.noGlossarySelected')}</option>
              {glossaries.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-editorial-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="rounded-full border border-editorial-border px-4 py-2 text-sm text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedGlossaryId || !term.trim() || isSaving}
            aria-label={t('common.confirm')}
            className="rounded-full border border-editorial-accent bg-editorial-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-editorial-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? '…' : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **9.5** Aggiungi chiavi i18n:
  - `memory.extractTermTitle`: `"Estrai termine"`
  - `memory.sourcePhraseLabel`: `"Frase sorgente"`
  - `memory.termLabel`: `"Termine"`
  - `memory.termExtracted`: `"Termine aggiunto al glossario"`
  - `glossary.selectGlossary`: `"Seleziona glossario"` (verifica se già esiste)
  - `glossary.noGlossarySelected`: `"— Nessun glossario —"` (verifica se già esiste)
  - `common.optional`: `"opzionale"` (verifica se già esiste)
  - `common.cancel`: `"Annulla"` (verifica se già esiste)
  - `common.confirm`: `"Conferma"` (verifica se già esiste)

- [ ] **9.6** Esegui `rtk vitest src/components/document/ExtractTermDialog.test.tsx` — deve passare (GREEN)
- [ ] **9.7** Commit: `feat(phrase-memory): ExtractTermDialog with LLM term suggestion`

---

### Task 10 — Aggiungi bottone "Estrai termine" in `MatchCard`

> Collega il bottone nella card match all'apertura di `ExtractTermDialog`.

- [ ] **10.1** In `src/components/document/MemoryTab.tsx`, aggiungi lo stato di controllo del dialog:

```typescript
// Dentro MemoryTab (a livello del componente genitore):
const [extractingMatch, setExtractingMatch] = useState<PhraseMemoryMatch | null>(null);
```

- [ ] **10.2** Aggiorna `MatchCard` per ricevere `onExtractTerm` come prop:

```typescript
interface MatchCardProps {
  match: PhraseMemoryMatch;
  enabled: boolean;
  onToggle: () => void;
  onExtractTerm: () => void;  // nuovo
}
```

- [ ] **10.3** Aggiungi il bottone "Estrai termine" nelle azioni di `MatchCard`:

```typescript
// Dentro il div actions, dopo il bottone Applica:
<button
  type="button"
  onClick={onExtractTerm}
  className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-1 text-[11px] font-medium text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
  aria-label={t('memory.extractTermButton')}
>
  <BookPlus size={12} />
  {t('memory.extractTermButton')}
</button>
```

- [ ] **10.4** Nel render di `MemoryTab`, passa `onExtractTerm` e renderizza il dialog condizionalmente:

```typescript
// Nel JSX di MemoryTab:
{matches.map((match) => (
  <MatchCard
    key={match.id}
    match={match}
    enabled={enabledMatchIds.has(match.id)}
    onToggle={() => toggleEnabled(match.id)}
    onExtractTerm={() => setExtractingMatch(match)}
  />
))}

{/* Dialog Estrai termine */}
{extractingMatch && (
  <ExtractTermDialog
    sourcePhrase={extractingMatch.sourcePhrase}
    targetPhrase={extractingMatch.targetPhrase}
    onClose={() => setExtractingMatch(null)}
    onSuccess={() => setExtractingMatch(null)}
  />
)}
```

- [ ] **10.5** Aggiungi import `BookPlus` da lucide-react e `ExtractTermDialog`
- [ ] **10.6** Aggiungi chiave i18n `memory.extractTermButton`: `"Estrai termine"`
- [ ] **10.7** Aggiungi test in `MemoryTab.test.tsx`:

```typescript
it('opens ExtractTermDialog when Estrai termine is clicked', async () => {
  vi.mocked(usePhraseMemoryMatchesModule.usePhraseMemoryMatches).mockReturnValue({
    ...defaultHookResult,
    matches: [makeMatch()],
    enabledMatchIds: new Set(['match-1']),
    hasMatches: true,
    selectedMatches: [makeMatch()],
  })
  render(
    <MemoryTab panelId="panel" labelledBy="tab" currentChunkId="chunk-1" onRerun={mockOnRerun} />
  )
  await userEvent.click(screen.getByRole('button', { name: /estrai termine/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
```

- [ ] **10.8** Esegui `rtk vitest src/components/document/MemoryTab.test.tsx` — deve passare (GREEN)
- [ ] **10.9** Commit: `feat(phrase-memory): Estrai termine button in MatchCard`

---

### Task 11 — Lint, type-check, test suite completa

- [ ] **11.1** Esegui `rtk npm run lint` — zero errori
- [ ] **11.2** Esegui `rtk tsc --noEmit` — zero errori di tipo
- [ ] **11.3** Esegui `rtk vitest --run` — tutti i test verdi
- [ ] **11.4** Verifica coverage: `rtk vitest --coverage` — minimo 80%
- [ ] **11.5** Commit finale se necessario: `chore(phrase-memory): lint and typecheck clean`

---

## Dipendenze da Piano 2

Questo piano assume che i seguenti elementi siano già disponibili dopo il Piano 2:

| Elemento | Tipo | Usato in |
|---|---|---|
| `usePhraseMemoryStore` con `matchesByChunk`, `toggleMatchEnabled` | Zustand store | Task 3, 5, 7 |
| `PhraseMemoryMatch`, `ChunkPhraseMatches` (tipi) | TypeScript types | Task 3, 6, 9 |
| Comando Tauri `extract_key_term` | Rust command | Task 9 (LLM term) |
| `addGlossaryEntry(glossaryId, entry)` | glossaryService | Task 9 |

Se uno di questi non è disponibile all'inizio del Piano 3, mockalo con un'implementazione stub e lascia un commento `// TODO(piano-2): sostituire con implementazione reale`.

---

## Checklist finale

- [ ] `ChunkDrawerTab` union include `'memory'`
- [ ] Tab "Memoria" visibile e navigabile via tastiera in `InsightsDrawer`
- [ ] Cold start placeholder visibile quando nessun match
- [ ] Lista match con score %, source phrase, target phrase, autore/opera
- [ ] Checkbox abilita/disabilita ogni match
- [ ] Bottone "Applica" copia target negli appunti
- [ ] Bottone "Rielabora" disabilitato senza selezione, attivo con almeno 1 match
- [ ] "Rielabora" inietta le coppie in coda a `stage-instructions` (static + blob intatti)
- [ ] Log injection in `operation_logs` con `detail_kind: 'prompt_structure'`
- [ ] Warning pre-lancio se chunk hanno match tutti disabilitati
- [ ] Badge "N match" nella lista chunk dell'IndexTab
- [ ] Dialog "Estrai termine" si apre dal bottone in `MatchCard`
- [ ] LLM suggerisce termine (1-3 parole), editabile
- [ ] Dialog permette selezione glossario e note opzionali
- [ ] Inserimento glossario reversibile (entry rimovibile dal glossario UI)
- [ ] Tutti i test passano (coverage ≥ 80%)
- [ ] Zero errori lint e typecheck
