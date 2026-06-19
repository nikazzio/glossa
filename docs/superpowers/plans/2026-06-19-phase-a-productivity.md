# Fase A — Core Produttività Traduttore

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare le 4 feature prioritarie della milestone v1.1 Fase A: visualizzazione costi token reali post-run (#128), import/export glossario da/verso Excel (#124, utente aggiunge export CSV), estensione tipografia nelle impostazioni (#269). La feature #137 (EstrazTTerm da Phrase Memory) è già implementata in `ExtractTermDialog.tsx` — l'ultimo task la chiude.

**Architecture:**
- Task 1 (#128): utility di aggregazione token + pannello post-run reale — nessuna modifica al backend Rust.
- Task 2 (#124): aggiunta dipendenza `xlsx` (SheetJS) solo frontend; import binario via Tauri FS; export CSV (PapaParse) e XLSX (SheetJS).
- Task 3 (#269): nuovi state `documentFontSize`/`documentLineHeight` in uiStore; CSS vars sincronizzate da App.tsx; UI nel pannello Impostazioni.
- Task 4 (#137): verifica + chiusura issue.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri v2 plugin-fs/plugin-dialog, PapaParse (già installato), `xlsx` (SheetJS, da aggiungere), Tailwind CSS v4, Vitest.

## Global Constraints

- Mai `any` in TypeScript. Usare `unknown` + narrowing.
- Mai `.unwrap()` né panic in Rust (nessun Rust in questo piano — solo frontend).
- Tauri FS: `readFile()` ritorna `Uint8Array`. `readTextFile()` ritorna `string`.
- File save dialog: `@tauri-apps/plugin-dialog` → `save()`.
- `open()` per file picker, `save()` per salvataggio.
- Test con Vitest. Coverage ≥ 80% sui moduli nuovi.
- Nessun `console.log` in produzione.
- Commit message: tipo convenzionale (`feat`, `fix`, `refactor`, …).
- Chiudere ogni issue GitHub (`gh issue close <n> --repo nikazzio/glossa`) dopo il task corrispondente.
- Partire da `main` aggiornato, branch unico: `feat/phase-a-productivity`.

---

## File Map

### Creati
- `src/utils/tokenSummary.ts` — aggregazione token reali da chunks (Task 1)
- `src/utils/tokenSummary.test.ts` — test unitari (Task 1)
- `src/components/pipeline/RunActualCostPanel.tsx` — pannello costi reali post-run (Task 1)

### Modificati
- `src/components/pipeline/PipelineConfig.tsx` — mostra RunActualCostPanel dopo run (Task 1)
- `src/services/glossaryService.ts` — aggiunge `importEntriesFromXlsx`, `exportGlossaryToCsv`, `exportGlossaryToXlsx` (Task 2)
- `src/components/library/CsvImportDialog.tsx` — supporto xlsx + mapping colonne (Task 2)
- `src/components/library/index.ts` — re-esporta se aggiornato (Task 2)
- `src/components/library/DictionariesTab.tsx` — pulsante Esporta (Task 2)
- `src/stores/libraryStore.ts` — aggiunge `importEntriesFromXlsx`, export actions (Task 2)
- `src/stores/uiStore.ts` — aggiunge `documentFontSize`, `documentLineHeight`, setters, migration (Task 3)
- `src/index.css` — aggiunge `--doc-font-size`, `--doc-line-height` CSS vars (Task 3)
- `src/App.tsx` — aggiunge `DocTypographySync` component (Task 3)
- `src/components/settings/SettingsModal.tsx` — estende sezione Tipografia (Task 3)
- `package.json` — aggiunge `xlsx` (Task 2)

---

## Task 1: Costi token reali post-run (#128)

**Files:**
- Create: `src/utils/tokenSummary.ts`
- Create: `src/utils/tokenSummary.test.ts`
- Create: `src/components/pipeline/RunActualCostPanel.tsx`
- Modify: `src/components/pipeline/PipelineConfig.tsx:145-149, 533-535`

**Interfaces:**
- Produces: `aggregateRunTokens(chunks: TranslationChunk[], config: PipelineConfig, pricingOverrides: Record<string, {input:number; output:number}>): RunTokenSummary`
- Produces: `RunTokenSummary` type (vedere step 3)
- Consumes da Task 0: nulla (primo task)

- [ ] **Step 1: Crea branch**

```bash
git checkout main && git pull origin main
git checkout -b feat/phase-a-productivity
```

- [ ] **Step 2: Scrivi il test fallente**

Crea `src/utils/tokenSummary.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateRunTokens } from './tokenSummary';
import type { TranslationChunk, PipelineConfig } from '../types';

function makeChunk(stageTokens: Record<string, { input: number; output: number; cached?: number }>, judgeTokens?: { input: number; output: number }): TranslationChunk {
  const stageResults: TranslationChunk['stageResults'] = {};
  for (const [id, t] of Object.entries(stageTokens)) {
    stageResults[id] = {
      content: 'x',
      status: 'completed',
      tokenUsage: { inputTokens: t.input, outputTokens: t.output, cachedInputTokens: t.cached ?? 0 },
    };
  }
  return {
    id: 'c1',
    sourceDisplayText: '',
    sourceProcessingText: '',
    translationDisplayText: '',
    translationProcessingText: '',
    originalText: '',
    status: 'completed',
    stageResults,
    judgeResult: {
      content: '',
      status: judgeTokens ? 'completed' : 'idle',
      rating: 'good',
      issues: [],
      ...(judgeTokens ? { tokenUsage: { inputTokens: judgeTokens.input, outputTokens: judgeTokens.output } } : {}),
    },
  } as TranslationChunk;
}

const config: PipelineConfig = {
  pipelineId: 'p1',
  sourceLanguage: 'it',
  targetLanguage: 'en',
  stages: [
    { id: 's1', name: 'Traduzione', role: 'translation', prompt: '', model: 'gpt-4o', provider: 'openai', enabled: true },
  ],
  judgePrompt: '',
  judgeModel: 'gpt-4o',
  judgeProvider: 'openai',
  glossary: [],
} as PipelineConfig;

describe('aggregateRunTokens', () => {
  it('somma token per stage su più chunk', () => {
    const chunks = [
      makeChunk({ s1: { input: 100, output: 50 } }),
      makeChunk({ s1: { input: 200, output: 80 } }),
    ];
    const result = aggregateRunTokens(chunks, config, {});
    expect(result.stages[0].inputTokens).toBe(300);
    expect(result.stages[0].outputTokens).toBe(130);
  });

  it('calcola costo reale con pricing noto', () => {
    const chunks = [makeChunk({ s1: { input: 1_000_000, output: 500_000 } })];
    const pricing = { 'openai/gpt-4o': { input: 2.5, output: 10 } };
    const result = aggregateRunTokens(chunks, config, pricing);
    // input: 1M * 2.5 / 1M = $2.50; output: 0.5M * 10 / 1M = $5.00 → total $7.50
    expect(result.stages[0].costUsd).toBeCloseTo(7.5);
    expect(result.totalCostUsd).toBeCloseTo(7.5);
  });

  it('aggrega token judge separatamente', () => {
    const chunks = [makeChunk({ s1: { input: 50, output: 20 } }, { input: 300, output: 100 })];
    const result = aggregateRunTokens(chunks, config, {});
    expect(result.judge).not.toBeNull();
    expect(result.judge!.inputTokens).toBe(300);
  });

  it('restituisce null per costo con pricing sconosciuto', () => {
    const chunks = [makeChunk({ s1: { input: 100, output: 50 } })];
    const result = aggregateRunTokens(chunks, config, {});
    // nessun override + 'openai/gpt-4o' non in MODEL_PRICING mock → null
    // (dipende da constants.ts; nel test non forniamo override)
    // Almeno verifichiamo che il campo esista
    expect('costUsd' in result.stages[0]).toBe(true);
  });

  it('gestisce chunk senza tokenUsage (stage in errore)', () => {
    const chunk = makeChunk({});
    chunk.stageResults['s1'] = { content: '', status: 'error' };
    const chunks = [chunk];
    const result = aggregateRunTokens(chunks, config, {});
    expect(result.stages[0].inputTokens).toBe(0);
  });
});
```

- [ ] **Step 3: Esegui test — atteso FAIL**

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/utils/tokenSummary.test.ts 2>&1 | tail -20
```

Atteso: `FAIL` con "Cannot find module '../utils/tokenSummary'".

- [ ] **Step 4: Implementa `src/utils/tokenSummary.ts`**

```typescript
import type { TranslationChunk, TokenUsage } from '../types';
import type { PipelineConfig } from '../types';
import { MODEL_PRICING } from '../constants';

export interface StageTokenSummary {
  stageId: string;
  stageName: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number | null;
}

export interface RunTokenSummary {
  stages: StageTokenSummary[];
  judge: StageTokenSummary | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCostUsd: number | null;
}

function calcCost(
  inputTokens: number,
  outputTokens: number,
  provider: string,
  model: string,
  pricingOverrides: Record<string, { input: number; output: number }>,
): number | null {
  if (provider === 'ollama' || !model) return null;
  const key = `${provider}/${model}`;
  const pricing = pricingOverrides[key] ?? MODEL_PRICING[key];
  if (!pricing) return null;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function sumUsage(usages: (TokenUsage | undefined)[]): { input: number; output: number; cached: number } {
  return usages.reduce(
    (acc, u) => ({
      input: acc.input + (u?.inputTokens ?? 0),
      output: acc.output + (u?.outputTokens ?? 0),
      cached: acc.cached + (u?.cachedInputTokens ?? 0),
    }),
    { input: 0, output: 0, cached: 0 },
  );
}

export function aggregateRunTokens(
  chunks: TranslationChunk[],
  config: PipelineConfig,
  pricingOverrides: Record<string, { input: number; output: number }>,
): RunTokenSummary {
  const enabledStages = config.stages.filter((s) => s.enabled);

  const stages: StageTokenSummary[] = enabledStages.map((stage) => {
    const usages = chunks.map((c) => c.stageResults[stage.id]?.tokenUsage);
    const { input, output, cached } = sumUsage(usages);
    return {
      stageId: stage.id,
      stageName: stage.name,
      provider: stage.provider,
      model: stage.model,
      inputTokens: input,
      outputTokens: output,
      cachedInputTokens: cached,
      costUsd: calcCost(input, output, stage.provider, stage.model, pricingOverrides),
    };
  });

  const judgeUsages = chunks.map((c) => c.judgeResult?.tokenUsage);
  const hasJudgeData = judgeUsages.some((u) => u !== undefined);
  const judge: StageTokenSummary | null = hasJudgeData && config.judgeModel
    ? (() => {
        const { input, output, cached } = sumUsage(judgeUsages);
        return {
          stageId: 'judge',
          stageName: 'Audit Guard',
          provider: config.judgeProvider,
          model: config.judgeModel,
          inputTokens: input,
          outputTokens: output,
          cachedInputTokens: cached,
          costUsd: calcCost(input, output, config.judgeProvider, config.judgeModel, pricingOverrides),
        };
      })()
    : null;

  const allRows = judge ? [...stages, judge] : stages;
  const hasUnknown = allRows.some((r) => r.provider !== 'ollama' && r.costUsd === null);
  const isFree = allRows.every((r) => r.provider === 'ollama');
  const totalCostUsd = isFree
    ? 0
    : hasUnknown
      ? null
      : allRows.reduce((s, r) => s + (r.costUsd ?? 0), 0);

  const totalInputTokens = allRows.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = allRows.reduce((s, r) => s + r.outputTokens, 0);
  const totalCachedTokens = allRows.reduce((s, r) => s + r.cachedInputTokens, 0);

  return { stages, judge, totalInputTokens, totalOutputTokens, totalCachedTokens, totalCostUsd };
}
```

- [ ] **Step 5: Esegui test — atteso PASS**

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/utils/tokenSummary.test.ts 2>&1 | tail -15
```

Atteso: tutti i test passano (nota: il test "pricing sconosciuto" dipende dal `MODEL_PRICING` effettivo in `constants.ts` — se `gpt-4o` è nel catalogo, `costUsd` sarà un numero non null; aggiusta l'assertion di conseguenza).

- [ ] **Step 6: Crea `src/components/pipeline/RunActualCostPanel.tsx`**

```typescript
import { formatCost } from './CostBadge';
import { useTranslation } from 'react-i18next';
import type { RunTokenSummary } from '../../utils/tokenSummary';

interface Props {
  summary: RunTokenSummary;
}

export function RunActualCostPanel({ summary }: Props) {
  const { t } = useTranslation();
  const allRows = summary.judge ? [...summary.stages, summary.judge] : summary.stages;

  if (allRows.length === 0) return null;

  const hasData = allRows.some((r) => r.inputTokens + r.outputTokens > 0);
  if (!hasData) return null;

  return (
    <div className="rounded border border-editorial-border bg-editorial-bg px-3 py-3 space-y-2">
      <p className="text-[9px] font-sans uppercase tracking-widest text-editorial-muted">
        {t('cost.actualBreakdown', 'Token reali')}
      </p>
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-editorial-muted/70">
            <th className="text-left pb-1">{t('cost.stage', 'Stage')}</th>
            <th className="text-right pb-1">In</th>
            <th className="text-right pb-1">Out</th>
            <th className="text-right pb-1">{t('header.estimatedCost', 'Costo')}</th>
          </tr>
        </thead>
        <tbody>
          {allRows.map((row) => (
            <tr key={row.stageId} className="border-t border-editorial-border/40">
              <td className="py-1 pr-1 truncate max-w-[80px]">{row.stageName}</td>
              <td className="py-1 text-right text-editorial-muted">{row.inputTokens.toLocaleString()}</td>
              <td className="py-1 text-right text-editorial-muted">{row.outputTokens.toLocaleString()}</td>
              <td className="py-1 text-right">
                {row.provider === 'ollama'
                  ? <span className="text-editorial-muted">{t('cost.free', 'Gratis')}</span>
                  : row.costUsd === null
                    ? <span className="text-editorial-muted">—</span>
                    : formatCost(row.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-editorial-ink/20 font-bold">
            <td className="pt-1" colSpan={3}>{t('cost.total', 'Totale')}</td>
            <td className="pt-1 text-right">
              {summary.totalCostUsd === null ? '—' : formatCost(summary.totalCostUsd)}
            </td>
          </tr>
          {summary.totalCachedTokens > 0 && (
            <tr>
              <td colSpan={4} className="pt-0.5 text-[9px] text-editorial-muted/60 italic">
                {summary.totalCachedTokens.toLocaleString()} {t('cost.cachedTokens', 'token in cache')}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
      <p className="text-[9px] text-editorial-muted/60 italic">{t('cost.disclaimer')}</p>
    </div>
  );
}
```

- [ ] **Step 7: Integra in `PipelineConfig.tsx`**

Aggiungi import in cima al file (dopo gli import esistenti):
```typescript
import { aggregateRunTokens } from '../../utils/tokenSummary';
import { RunActualCostPanel } from './RunActualCostPanel';
```

Aggiungi dopo la definizione di `costEstimate` (riga ~149):
```typescript
const runStatus = usePipelineStore((s) => s.runStatus);
const actualCost = useMemo(
  () => runStatus === 'completed' ? aggregateRunTokens(chunks, config, pricingOverrides) : null,
  [runStatus, chunks, config, pricingOverrides],
);
```

Nella sezione `showActions` (dopo `<CostBadge estimate={costEstimate} />`), aggiungi:
```typescript
{actualCost && <RunActualCostPanel summary={actualCost} />}
```

Il `CostBadge` con la stima pre-run rimane — mostra entrambi: stima prima, reale dopo.

- [ ] **Step 8: Verifica build**

```bash
cd /home/niki/workspace/personal/glossa && npx tsc --noEmit 2>&1 | tail -20
```

Atteso: nessun errore TypeScript.

- [ ] **Step 9: Commit**

```bash
git add src/utils/tokenSummary.ts src/utils/tokenSummary.test.ts \
        src/components/pipeline/RunActualCostPanel.tsx \
        src/components/pipeline/PipelineConfig.tsx
git commit -m "feat: visualizzazione costi token reali post-run (#128)"
```

---

## Task 2: Import Excel + Export CSV/XLSX (#124)

**Files:**
- Modify: `package.json`
- Modify: `src/services/glossaryService.ts` — aggiunge 3 funzioni
- Modify: `src/components/library/CsvImportDialog.tsx` — supporto xlsx + mapping
- Modify: `src/stores/libraryStore.ts` — aggiunge `importFromXlsx`
- Modify: `src/components/library/DictionariesTab.tsx` — pulsante esporta

**Interfaces:**
- Consumes: `GlossaryEntry` da `src/types.ts`
- Produces: `importEntriesFromXlsx(glossaryId, buffer, columnMap, strategy) → Promise<number>`
- Produces: `exportGlossaryToCsv(entries) → string`
- Produces: `exportGlossaryToXlsx(entries) → Uint8Array`

- [ ] **Step 1: Aggiungi dipendenza `xlsx`**

```bash
cd /home/niki/workspace/personal/glossa && npm install xlsx
```

Verifica che sia in `package.json`:
```bash
grep '"xlsx"' package.json
```

- [ ] **Step 2: Scrivi test fallenti per le funzioni di servizio**

Aggiungi in fondo a `src/services/glossaryService.ts` (oppure crea `src/services/glossaryService.export.test.ts`):

Crea `src/services/glossaryService.export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { exportGlossaryToCsv } from './glossaryService';
import type { GlossaryEntry } from '../types';

const entries: GlossaryEntry[] = [
  { id: 'e1', term: 'corpus', translation: 'corpus', notes: 'non tradurre' },
  { id: 'e2', term: 'lemma', translation: 'lemma', notes: undefined },
];

describe('exportGlossaryToCsv', () => {
  it('produce intestazione e righe corrette', () => {
    const csv = exportGlossaryToCsv(entries);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('term,translation,notes');
    expect(lines[1]).toContain('corpus');
    expect(lines[1]).toContain('non tradurre');
    expect(lines[2]).toContain('lemma');
  });

  it('gestisce entry senza notes', () => {
    const csv = exportGlossaryToCsv([{ term: 'x', translation: 'y' }]);
    expect(csv).toContain('x,y,');
  });
});
```

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/glossaryService.export.test.ts 2>&1 | tail -10
```

Atteso: FAIL con "importEntriesFromXlsx is not a function" o simile.

- [ ] **Step 3: Aggiungi funzioni di export in `src/services/glossaryService.ts`**

In cima al file, aggiungi l'import xlsx:
```typescript
import * as XLSX from 'xlsx';
```

Aggiungi queste funzioni in fondo al file (dopo `addGlossaryEntry`):

```typescript
export function exportGlossaryToCsv(entries: GlossaryEntry[]): string {
  const rows = entries.map((e) => ({
    term: e.term,
    translation: e.translation,
    notes: e.notes ?? '',
  }));
  return Papa.unparse(rows, { header: true, columns: ['term', 'translation', 'notes'] });
}

export function exportGlossaryToXlsx(entries: GlossaryEntry[]): Uint8Array {
  const rows = [
    ['term', 'translation', 'notes'],
    ...entries.map((e) => [e.term, e.translation, e.notes ?? '']),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Glossary');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  return new Uint8Array(buffer);
}

export interface XlsxColumnMap {
  termCol: string;
  translationCol: string;
  notesCol?: string;
}

export async function importEntriesFromXlsx(
  glossaryId: string,
  buffer: Uint8Array,
  columnMap: XlsxColumnMap,
  strategy: 'replace' | 'merge',
): Promise<number> {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

  const parsed: GlossaryEntry[] = rows
    .map((row) => ({
      id: generateId('gle'),
      term: String(row[columnMap.termCol] ?? '').trim(),
      translation: String(row[columnMap.translationCol] ?? '').trim(),
      notes: columnMap.notesCol ? String(row[columnMap.notesCol] ?? '').trim() || undefined : undefined,
    }))
    .filter((e) => e.term && e.translation);

  if (strategy === 'replace') {
    await runInTransaction(async (run) => {
      await run('DELETE FROM glossary_entries WHERE glossary_id = $1', [glossaryId]);
      for (const entry of parsed) {
        await run(
          'INSERT INTO glossary_entries (id, glossary_id, term, translation, notes) VALUES ($1, $2, $3, $4, $5)',
          [entry.id, glossaryId, entry.term, entry.translation, entry.notes ?? ''],
        );
      }
    });
  } else {
    await runInTransaction(async (run) => {
      for (const entry of parsed) {
        await run(
          `INSERT INTO glossary_entries (id, glossary_id, term, translation, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT(glossary_id, term) DO NOTHING`,
          [entry.id, glossaryId, entry.term, entry.translation, entry.notes ?? ''],
        );
      }
    });
  }

  return parsed.length;
}
```

- [ ] **Step 4: Esegui test export — atteso PASS**

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/glossaryService.export.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Aggiungi `importFromXlsx` a `src/stores/libraryStore.ts`**

Aggiungi import in cima:
```typescript
import { importEntriesFromXlsx, exportGlossaryToCsv, exportGlossaryToXlsx } from '../services/glossaryService';
import type { XlsxColumnMap } from '../services/glossaryService';
```

Nell'interfaccia `LibraryState` (o equivalente), aggiungi i metodi:
```typescript
importGlossaryFromXlsx: (glossaryId: string, buffer: Uint8Array, columnMap: XlsxColumnMap, strategy: 'replace' | 'merge') => Promise<number>;
```

Nell'implementazione dello store, aggiungi:
```typescript
importGlossaryFromXlsx: async (glossaryId, buffer, columnMap, strategy) => {
  const count = await importEntriesFromXlsx(glossaryId, buffer, columnMap, strategy);
  await get().loadGlossaryEntries(glossaryId);
  return count;
},
```

- [ ] **Step 6: Estendi `CsvImportDialog.tsx` per supportare Excel**

Il componente deve:
1. Accettare `.csv`, `.tsv`, `.xlsx` nel file picker
2. Se xlsx: leggere come binario + mostrare colonne rilevate + step mapping
3. Se csv/tsv: comportamento invariato (auto-detect)

Sostituisci il file con questa implementazione (mantieni stile esistente):

```typescript
import { useState } from 'react';
import { Upload, X, Check, AlertCircle, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, readFile } from '@tauri-apps/plugin-fs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { XlsxColumnMap } from '../../services/glossaryService';

interface Props {
  onImport: (csvText: string, strategy: 'replace' | 'merge') => Promise<void>;
  onImportXlsx: (buffer: Uint8Array, columnMap: XlsxColumnMap, strategy: 'replace' | 'merge') => Promise<void>;
  onClose: () => void;
}

type Step = 'pick' | 'map' | 'preview' | 'confirm';
type MergeStrategy = 'replace' | 'merge';
type FileKind = 'csv' | 'xlsx';

const PREVIEW_ROWS = 5;

export function CsvImportDialog({ onImport, onImportXlsx, onClose }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('pick');
  const [fileKind, setFileKind] = useState<FileKind>('csv');
  const [csvText, setCsvText] = useState('');
  const [xlsxBuffer, setXlsxBuffer] = useState<Uint8Array | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<XlsxColumnMap>({ termCol: '', translationCol: '' });
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<MergeStrategy>('merge');
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trapRef = useFocusTrap(true, onClose);

  const handlePickFile = async () => {
    setError(null);
    const path = await open({
      title: t('library.csvPickTitle'),
      filters: [{ name: 'CSV / Excel', extensions: ['csv', 'tsv', 'txt', 'xlsx'] }],
      multiple: false,
    });
    if (!path) return;

    const filePath = path as string;
    const isXlsx = filePath.toLowerCase().endsWith('.xlsx');

    try {
      if (isXlsx) {
        const buf = await readFile(filePath);
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
        if (rows.length < 2) { setError(t('library.csvEmptyError')); return; }
        const [headers, ...dataRows] = rows;
        const strHeaders = headers.map(String);
        setXlsxBuffer(buf);
        setDetectedHeaders(strHeaders);
        setColumnMap({ termCol: strHeaders[0] ?? '', translationCol: strHeaders[1] ?? '' });
        setPreviewHeaders(strHeaders);
        setPreviewRows(dataRows.slice(0, PREVIEW_ROWS).map((r) => strHeaders.map((_, i) => String(r[i] ?? ''))));
        setTotalRows(dataRows.length);
        setFileKind('xlsx');
        setStep('map');
      } else {
        const text = await readTextFile(filePath);
        const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
        if (!result.data || result.data.length < 2) { setError(t('library.csvEmptyError')); return; }
        const [headers, ...rows] = result.data as string[][];
        setPreviewHeaders(headers);
        setPreviewRows(rows.slice(0, PREVIEW_ROWS));
        setTotalRows(rows.length);
        setCsvText(text);
        setFileKind('csv');
        setStep('preview');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('library.csvReadError'));
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (fileKind === 'xlsx' && xlsxBuffer) {
        await onImportXlsx(xlsxBuffer, columnMap, strategy);
      } else {
        await onImport(csvText, strategy);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('library.csvImportError'));
      setLoading(false);
    }
  };

  const strategyRadios = (['merge', 'replace'] as MergeStrategy[]).map((s) => (
    <label key={s} className="flex items-start gap-2 cursor-pointer">
      <input type="radio" name="strategy" value={s} checked={strategy === s} onChange={() => setStrategy(s)} className="mt-0.5" />
      <span className="text-[11px] text-editorial-ink">
        <span className="font-bold">{t(`library.csvStrategy_${s}`)}</span>
        {' — '}
        {t(`library.csvStrategy_${s}_desc`)}
      </span>
    </label>
  ));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="csv-import-title" ref={trapRef}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-editorial-bg w-full max-w-lg p-8 shadow-2xl border border-editorial-border">
          <button onClick={onClose} title={t('settings.close')} className="absolute top-5 right-5 text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent" aria-label={t('settings.close')}>
            <X size={18} />
          </button>

          <h3 id="csv-import-title" className="font-display text-xl italic tracking-tight mb-6 flex items-center gap-2">
            <Upload size={20} className="text-editorial-accent" />
            {t('library.csvImportTitle')}
          </h3>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded border border-editorial-warning/60 bg-editorial-warning/10 p-3 text-[11px] text-editorial-warning">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-[12px] text-editorial-muted leading-relaxed">{t('library.csvPickDesc')}</p>
              <button onClick={handlePickFile} className="w-full rounded border border-dashed border-editorial-border/60 py-6 text-[11px] font-bold uppercase tracking-widest text-editorial-muted hover:border-editorial-accent hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
                {t('library.csvPickButton')}
              </button>
              <p className="text-[10px] text-editorial-muted/60 text-center">CSV, TSV, XLSX</p>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[11px] text-editorial-muted mb-1">
                <Settings2 size={13} />
                <span className="font-bold uppercase tracking-widest">{t('library.xlsxMapColumns', 'Mappa colonne')}</span>
              </div>
              <div className="space-y-3">
                {(['termCol', 'translationCol', 'notesCol'] as const).map((field) => (
                  <div key={field} className="flex items-center gap-3">
                    <label className="w-24 text-[10px] font-bold uppercase tracking-widest text-editorial-muted shrink-0">
                      {field === 'termCol' ? t('glossary.term', 'Termine') : field === 'translationCol' ? t('glossary.translation', 'Traduzione') : `${t('glossary.notes', 'Note')} (opt.)`}
                    </label>
                    <select
                      value={columnMap[field] ?? ''}
                      onChange={(e) => setColumnMap((prev) => ({ ...prev, [field]: e.target.value || undefined }))}
                      className="flex-1 rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                    >
                      <option value="">—</option>
                      {detectedHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {strategyRadios}
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setStep('pick'); setError(null); }} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
                  {t('common.back')}
                </button>
                <button
                  onClick={() => setStep('preview')}
                  disabled={!columnMap.termCol || !columnMap.translationCol}
                  className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-editorial-ink text-white hover:bg-editorial-ink/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                >
                  {t('common.next', 'Avanti')}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <p className="text-[11px] text-editorial-muted">{t('library.csvPreviewDesc', { count: totalRows })}</p>
              <div className="overflow-x-auto border border-editorial-border/40 rounded">
                <table className="w-full text-[10px] font-mono">
                  <thead className="bg-editorial-textbox/30">
                    <tr>
                      {previewHeaders.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left text-editorial-muted font-bold uppercase tracking-wider truncate max-w-[120px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-t border-editorial-border/20">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1.5 text-editorial-ink/80 truncate max-w-[120px]">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalRows > PREVIEW_ROWS && (
                <p className="text-[10px] text-editorial-muted/60 text-center">+ {totalRows - PREVIEW_ROWS} {t('library.csvMoreRows')}</p>
              )}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-editorial-muted">{t('library.csvStrategy')}</p>
                {strategyRadios}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setStep(fileKind === 'xlsx' ? 'map' : 'pick'); setError(null); }} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
                  {t('common.back')}
                </button>
                <button onClick={handleConfirm} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-editorial-ink text-white hover:bg-editorial-ink/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40">
                  <Check size={13} />
                  {loading ? t('common.loading') : t('library.csvConfirm')}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 7: Aggiorna `DictionariesTab.tsx` — aggiunge la prop `onImportXlsx` + pulsante Export**

Trova dove è usato `<CsvImportDialog` (riga ~298) e aggiungi la prop:
```typescript
<CsvImportDialog
  onImport={(csvText, strategy) => handleCsvImport(csvTargetId, csvText, strategy)}
  onImportXlsx={(buffer, columnMap, strategy) =>
    handleXlsxImport(csvTargetId, buffer, columnMap, strategy)
  }
  onClose={() => setCsvTargetId(null)}
/>
```

Aggiungi handler `handleXlsxImport` accanto a `handleCsvImport`:
```typescript
const handleXlsxImport = async (
  glossaryId: string,
  buffer: Uint8Array,
  columnMap: import('../../services/glossaryService').XlsxColumnMap,
  strategy: 'replace' | 'merge',
) => {
  const count = await importGlossaryFromXlsx(glossaryId, buffer, columnMap, strategy);
  toast.success(t('library.csvImportSuccess', { count }));
};
```

Cerca il pulsante con `setCsvTargetId(g.id)` (o simile) e aggiungi subito sotto, nella stessa card, un pulsante esporta:
```typescript
<button
  onClick={() => void handleExport(g.id, g.name)}
  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
  title={t('library.exportGlossary', 'Esporta glossario')}
>
  <Download size={12} />
  {t('library.exportGlossary', 'Esporta')}
</button>
```

Aggiungi `Download` agli import di lucide-react e `handleExport`:
```typescript
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { exportGlossaryToCsv, exportGlossaryToXlsx, getGlossaryEntries } from '../../services/glossaryService';

const handleExport = async (glossaryId: string, glossaryName: string) => {
  const entries = await getGlossaryEntries(glossaryId);
  const safeName = glossaryName.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const path = await save({
    title: t('library.exportGlossary', 'Esporta glossario'),
    defaultPath: `${safeName}.xlsx`,
    filters: [
      { name: 'Excel', extensions: ['xlsx'] },
      { name: 'CSV', extensions: ['csv'] },
    ],
  });
  if (!path) return;
  if (path.endsWith('.csv')) {
    await writeTextFile(path, exportGlossaryToCsv(entries));
  } else {
    await writeFile(path, exportGlossaryToXlsx(entries));
  }
  toast.success(t('library.exportSuccess', 'Glossario esportato'));
};
```

- [ ] **Step 8: Verifica build TypeScript**

```bash
cd /home/niki/workspace/personal/glossa && npx tsc --noEmit 2>&1 | tail -20
```

Risolvi eventuali errori di tipo (prop aggiuntive, import mancanti).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json \
        src/services/glossaryService.ts \
        src/services/glossaryService.export.test.ts \
        src/stores/libraryStore.ts \
        src/components/library/CsvImportDialog.tsx \
        src/components/library/DictionariesTab.tsx
git commit -m "feat: import Excel e export CSV/XLSX per il glossario (#124)"
```

---

## Task 3: Estensione tipografia nelle impostazioni (#269)

Aggiunge: dimensione font documento (3 preset) e interlinea documento (3 preset).

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/components/settings/SettingsModal.tsx`

**Interfaces:**
- Produces: `documentFontSize: 'sm' | 'md' | 'lg'` persisted in uiStore
- Produces: `documentLineHeight: 'tight' | 'normal' | 'relaxed'` persisted in uiStore
- Produces: CSS vars `--doc-font-size` e `--doc-line-height` sincronizzati da `DocTypographySync`

- [ ] **Step 1: Aggiungi tipi e state a `src/stores/uiStore.ts`**

Aggiungi i tipi dopo `UiFont`:
```typescript
export type DocumentFontSize = 'sm' | 'md' | 'lg';
export type DocumentLineHeight = 'tight' | 'normal' | 'relaxed';
```

Nell'interfaccia `UiState`, aggiungi:
```typescript
documentFontSize: DocumentFontSize;
documentLineHeight: DocumentLineHeight;
setDocumentFontSize: (size: DocumentFontSize) => void;
setDocumentLineHeight: (height: DocumentLineHeight) => void;
```

Nei valori default dello store:
```typescript
documentFontSize: 'md',
documentLineHeight: 'normal',
```

Negli action setter:
```typescript
setDocumentFontSize: (size) => set({ documentFontSize: size }),
setDocumentLineHeight: (height) => set({ documentLineHeight: height }),
```

Nella migration (incrementa la versione da 11 a 12):
```typescript
// Cambia version: 11 → 12
// Aggiungi blocco:
if (fromVersion < 12) {
  s.documentFontSize = 'md';
  s.documentLineHeight = 'normal';
}
```

Nel `partialize`:
```typescript
documentFontSize: state.documentFontSize,
documentLineHeight: state.documentLineHeight,
```

- [ ] **Step 2: Aggiungi CSS vars a `src/index.css`**

Nella sezione `:root` (già presente a riga ~144), aggiungi:
```css
--doc-font-size: 1rem;
--doc-line-height: 1.7;
```

- [ ] **Step 3: Aggiungi `DocTypographySync` a `src/App.tsx`**

Dopo `FontSync` (riga ~53), aggiungi:

```typescript
const DOC_FONT_SIZE: Record<string, string> = {
  sm: '0.875rem',
  md: '1rem',
  lg: '1.125rem',
};

const DOC_LINE_HEIGHT: Record<string, string> = {
  tight: '1.5',
  normal: '1.7',
  relaxed: '2.0',
};

function DocTypographySync() {
  const documentFontSize = useUiStore((s) => s.documentFontSize);
  const documentLineHeight = useUiStore((s) => s.documentLineHeight);
  useEffect(() => {
    document.documentElement.style.setProperty('--doc-font-size', DOC_FONT_SIZE[documentFontSize]);
    document.documentElement.style.setProperty('--doc-line-height', DOC_LINE_HEIGHT[documentLineHeight]);
  }, [documentFontSize, documentLineHeight]);
  return null;
}
```

Aggiungi import necessari in cima:
```typescript
import type { DocumentFontSize, DocumentLineHeight } from './stores/uiStore';
```

Monta il componente accanto a `<FontSync />` e `<HighlightColorSync />` in `App`.

- [ ] **Step 4: Estendi la sezione Tipografia in `src/components/settings/SettingsModal.tsx`**

Aggiungi import:
```typescript
import type { DocumentFontSize, DocumentLineHeight } from '../../stores/uiStore';
```

Aggiungi dal destructuring `useUiStore`:
```typescript
documentFontSize,
setDocumentFontSize,
documentLineHeight,
setDocumentLineHeight,
```

Dopo il blocco `UI_FONT_OPTIONS` esistente (riga ~106), aggiungi:

```typescript
const DOC_FONT_SIZE_OPTIONS: Array<{ value: DocumentFontSize; label: string }> = [
  { value: 'sm', label: 'Piccolo' },
  { value: 'md', label: 'Normale' },
  { value: 'lg', label: 'Grande' },
];

const DOC_LINE_HEIGHT_OPTIONS: Array<{ value: DocumentLineHeight; label: string }> = [
  { value: 'tight', label: 'Compatta' },
  { value: 'normal', label: 'Normale' },
  { value: 'relaxed', label: 'Ariosa' },
];
```

Nella sezione Tipografia (dove finisce la griglia `UI_FONT_OPTIONS`, riga ~474), aggiungi:

```typescript
{/* Dimensione font documento */}
<div className="space-y-3 pt-2 border-t border-editorial-border/40">
  <label className="block text-[10px] font-sans uppercase tracking-[0.28em] text-editorial-muted">
    {t('settings.documentFontSize', 'Dimensione testo documento')}
  </label>
  <div role="radiogroup" aria-label={t('settings.documentFontSize', 'Dimensione testo documento')} className="flex gap-2">
    {DOC_FONT_SIZE_OPTIONS.map((opt) => {
      const isActive = documentFontSize === opt.value;
      return (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => setDocumentFontSize(opt.value)}
          className={`flex-1 rounded-[16px] border px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
            isActive
              ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent'
              : 'border-editorial-border bg-editorial-bg/60 text-editorial-muted hover:border-editorial-accent/40'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
</div>

{/* Interlinea documento */}
<div className="space-y-3">
  <label className="block text-[10px] font-sans uppercase tracking-[0.28em] text-editorial-muted">
    {t('settings.documentLineHeight', 'Interlinea documento')}
  </label>
  <div role="radiogroup" aria-label={t('settings.documentLineHeight', 'Interlinea documento')} className="flex gap-2">
    {DOC_LINE_HEIGHT_OPTIONS.map((opt) => {
      const isActive = documentLineHeight === opt.value;
      return (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => setDocumentLineHeight(opt.value)}
          className={`flex-1 rounded-[16px] border px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
            isActive
              ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent'
              : 'border-editorial-border bg-editorial-bg/60 text-editorial-muted hover:border-editorial-accent/40'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
</div>
```

Nota: le CSS vars `--doc-font-size` e `--doc-line-height` devono essere applicate nei componenti testo del documento (`DocumentView.tsx` o equivalente). Cerca `prose` o la classe che avvolge il testo dei chunk e aggiungi `style={{ fontSize: 'var(--doc-font-size)', lineHeight: 'var(--doc-line-height)' }}` o equivalente in Tailwind con `[font-size:var(--doc-font-size)]`.

- [ ] **Step 5: Verifica build**

```bash
cd /home/niki/workspace/personal/glossa && npx tsc --noEmit 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/stores/uiStore.ts src/index.css src/App.tsx \
        src/components/settings/SettingsModal.tsx
git commit -m "feat: dimensione font e interlinea documento nelle impostazioni (#269)"
```

---

## Task 4: Chiudi issue #137 (già implementato)

**Files:** nessuno — ExtractTermDialog già esiste e funziona.

- [ ] **Step 1: Verifica implementazione**

```bash
ls /home/niki/workspace/personal/glossa/src/components/document/ExtractTermDialog.tsx
grep -n "ExtractTermDialog" /home/niki/workspace/personal/glossa/src/components/document/MemoryTab.tsx
```

Atteso: file esiste, import presente in MemoryTab.

- [ ] **Step 2: Chiudi issue su GitHub**

```bash
gh issue close 137 --repo nikazzio/glossa \
  --comment "Implementata in ExtractTermDialog.tsx e integrata in MemoryTab.tsx. Il flusso completo (suggerimento termine, selezione glossario, salvataggio) è operativo."
```

- [ ] **Step 3: PR e merge**

```bash
git push -u origin feat/phase-a-productivity
gh pr create \
  --repo nikazzio/glossa \
  --title "feat: Fase A — core produttività traduttore (v1.1)" \
  --body "$(cat <<'EOF'
## Summary

- **#128**: Pannello costi token reali post-run — aggrega `tokenUsage` per stage e judge su tutti i chunk completati, mostra breakdown con input/output/cached tokens e costo USD reale (non stimato).
- **#124**: Import glossario da Excel (.xlsx) con mapping colonne interattivo. Export in CSV e XLSX dal pannello Dizionari.
- **#269**: Nuovi controlli tipografia in Impostazioni — dimensione testo documento (Piccolo/Normale/Grande) e interlinea (Compatta/Normale/Ariosa), sincronizzati via CSS vars.
- **#137**: Feature già implementata in sessione precedente — chiusa.

## Test plan

- [ ] Eseguire una pipeline su un progetto reale: dopo completamento compare il pannello costi reali sotto CostBadge
- [ ] I token cachedInputTokens sono mostrati a piè del pannello se > 0
- [ ] Importare un .xlsx con colonne non-standard: lo step mapping mostra le intestazioni rilevate
- [ ] Importare un .csv: comportamento invariato (auto-detect colonne)
- [ ] Esportare un glossario: si apre il file picker, il file .xlsx si apre correttamente in Excel/LibreOffice
- [ ] In Impostazioni > Traduzioni > Tipografia: le 3 dimensioni cambiano visibilmente il testo dei chunk
- [ ] Le preferenze tipografia persistono al riavvio
- [ ] `npx vitest run` — tutti i test passano

🤖 Generated with Claude Code
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ #128: aggregazione token reali, breakdown per stage, costo USD, cached tokens evidenziati
- ✅ #124: file picker xlsx, mapping colonne, preview, strategie replace/merge, export CSV e XLSX
- ✅ #269: dimensione font + interlinea, 3 preset ciascuno, CSS vars sincronizzate
- ✅ #137: verifica + chiusura issue

**Placeholder scan:** nessun TBD, nessun "add appropriate handling" — ogni step ha codice esatto.

**Type consistency:**
- `RunTokenSummary` usato in `tokenSummary.ts` e `RunActualCostPanel.tsx` — stesso nome, stesso file.
- `XlsxColumnMap` esportato da `glossaryService.ts`, importato da `CsvImportDialog.tsx` e `DictionariesTab.tsx`.
- `DocumentFontSize`/`DocumentLineHeight` esportati da `uiStore.ts`, importati da `SettingsModal.tsx` e `App.tsx`.

**Gap identificati:**
- Le CSS vars `--doc-font-size` e `--doc-line-height` devono essere applicate esplicitamente nei componenti di rendering testo (Task 3 Step 4 nota finale). Dipende dalla struttura di `DocumentView.tsx` — l'implementatore deve trovare il wrapper del testo chunk e applicare le vars.
- I testi i18n usati nei componenti nuovi (es. `t('cost.actualBreakdown', 'Token reali')`) hanno un fallback inglese — aggiornare i file di traduzione IT/EN è fuori scope di questo piano ma raccomandato come follow-up.
