# Pipeline strip e config refactor — Design

**Data:** 2026-05-27  
**Branch:** feat/ui-style-unification-26-129 (o nuovo branch da main)

---

## Contesto

Due problemi correlati da risolvere insieme:

1. **UI**: la `PipelineBar` orizzontale in cima alla document view è ingombrante, spesso vuota (1 pipeline), e ruba spazio verticale prezioso.

2. **Architettura**: `Pipeline` (lista, in `projectStore`) e `PipelineConfig` (config, in `pipelineStore`) sono tipi TypeScript separati senza link esplicito. Il collegamento esiste solo nell'imperativo di `switchPipeline()` — se la load fallisce o viene interrotta, la config in memoria può non corrispondere all'`activePipelineId`. Nessuna garanzia nel type system.

---

## Design UI

### Struttura finale (document mode)

```
┌─ Header ──────────────────────────────────────────────────────────────┐
├─ Body ─────────────────────────────────────────────────────────────────┤
│ ┌Strip┐ ┌ Config drawer (se aperto) ──┐ ┌ DocumentView ┐ ┌Insights┐  │
│ │ [1] │ │  Config — Bozza IT      ✕  │ │  RunBar      │ │        │  │
│ │ [2] │ │  Lingua _______________  │ │  Doc content │ │        │  │
│ │ [+] │ │  Stage  _______________  │ │              │ │        │  │
│ │ ── │ │  Persona ______________  │ │              │ │        │  │
│ │ [⚙]│ └─────────────────────────┘ └──────────────┘ └────────┘  │
│ └─────┘                                                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Strip sinistra (sempre visibile, 32px)

Contenuto dall'alto verso il basso:
- Icone pipeline (una per pipeline, clic = switch)
- Bottone `+` (nuova pipeline)
- Divisore `1px`
- Icona `⚙` fissa in fondo (toggle config drawer)

Stati delle icone pipeline:
- Idle: `bg-#ddd8ce`, testo `#888`
- Attiva: `bg-editorial-accent` (rosso), testo white
- In esecuzione: rosso + spinner `border-top-color: white` (CSS animation)

`title` su ogni icona mostra il nome pipeline (tooltip nativo).

### Run-bar

Badge con nome pipeline attiva sempre visibile nella run-bar. Quando la pipeline gira: badge scurito + testo progress `"● 7/24 chunk"`.

### Config drawer (sinistra, affianca la strip)

- Si apre a **fianco** della strip — la strip rimane visibile
- `⚙` nella strip diventa active (rosso) quando il drawer è aperto
- Switchare pipeline con drawer aperto: il drawer si aggiorna sulla nuova pipeline **senza chiudersi**
- Animazione: spring `damping: 28, stiffness: 280` — stessa dei drawer destra
- Larghezza: invariata rispetto all'attuale ConfigDrawer
- Chiusura: `✕` nel drawer, o ri-clic su `⚙`

### Cosa sparisce

- `PipelineBar.tsx` — rimosso
- Bottone `SlidersHorizontal` in `Header.tsx` — rimosso
- `ConfigDrawer` come overlay da destra — sostituito

---

## Design architetturale

### Il gap attuale

```
DB: pipelines row = { id, name, source_language, stages, ... }  ← tutto in una riga, 1:1

TypeScript:
  projectStore → Pipeline[] = { id, name, runStatus, ... }         ← NO config
  pipelineStore → PipelineConfig = { sourceLanguage, stages, ... } ← NO id

Collegamento: solo runtime in switchPipeline() — nessuna garanzia nel tipo
```

### Soluzione: `pipelineId` in `PipelineConfig`

```typescript
// PRIMA
interface PipelineConfig {
  sourceLanguage: string;
  targetLanguage: string;
  stages: PipelineStageConfig[];
  // ...
}

// DOPO
interface PipelineConfig {
  pipelineId: string;   // link esplicito — config non può flottare senza identità
  sourceLanguage: string;
  targetLanguage: string;
  stages: PipelineStageConfig[];
  // ...
}
```

`setConfig()` in pipelineStore non deve poter sovrascrivere `pipelineId`. `switchPipeline()` può verificare prima del save che `config.pipelineId === activePipelineId`.

Nessuna migrazione DB necessaria. La modifica è solo nei tipi TypeScript e in `rowToPipelineConfig` in `pipelineService.ts`:

```typescript
function rowToPipelineConfig(row: DbPipeline, ...): PipelineConfig {
  return {
    pipelineId: row.id,   // aggiunto
    sourceLanguage: row.source_language,
    // ... resto invariato
  };
}
```

---

## File da modificare

### UI
| File | Modifica |
|------|----------|
| `src/App.tsx` | Rimuovere `PipelineBar`; aggiungere `PipelineStrip` |
| `src/components/layout/Header.tsx` | Rimuovere bottone `SlidersHorizontal` |
| `src/components/layout/PipelineBar.tsx` | **Eliminare** |
| `src/components/document/ConfigDrawer.tsx` | Riscrivere: apre a sinistra, affianca strip |
| `src/components/document/DocumentView.tsx` | Badge pipeline nella run-bar |
| `src/stores/uiStore.ts` | `showPipelineConfig: boolean` + setter |
| **`src/components/layout/PipelineStrip.tsx`** | **Nuovo** — strip sinistra |

### Architettura
| File | Modifica |
|------|----------|
| `src/types.ts` | `pipelineId: string` in `PipelineConfig` |
| `src/services/pipelineService.ts` | `rowToPipelineConfig` aggiunge `pipelineId: row.id` |
| `src/stores/pipelineStore.ts` | `setConfig` preserva `pipelineId`; init con placeholder |
| `src/stores/projectStore.ts` | `switchPipeline` verifica `config.pipelineId` prima di save |

---

## Verifica

1. Avviare `tauri dev`
2. Strip visibile a sinistra, icone pipeline cliccabili — badge nella run-bar si aggiorna
3. Clic su `⚙` → drawer aperto a fianco della strip; strip visibile; `⚙` diventa rosso
4. Switchare pipeline con drawer aperto → drawer si aggiorna senza chiudersi
5. Avviare run → spinner sull'icona della pipeline in esecuzione
6. Invariante type safety: `pipelineStore.config.pipelineId === projectStore.activePipelineId`
7. Pannelli destra (InsightsDrawer, ChunkDrawer) invariati
8. `npm run lint` e `tsc --noEmit` senza errori
