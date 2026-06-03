# Glossa — Navigation Redesign Spec

**Data:** 2026-06-03
**Branch:** feat/phrase-memory
**Stato:** Approvato

## Contesto

Glossa evolve da strumento di sola traduzione a piattaforma multi-area (traduzione, libreria, trascrizione). La UI attuale è pensata per un singolo flusso; questo spec ridisegna la navigazione per supportare la nuova architettura in modo fluido.

### Dominio reale

- **Workspace** = collana/serie (es. "Manuali di Scherma Storica Italiana")
- **Progetto** = libro singolo (es. "Flos Duellatorum" di Fiore dei Liberi, 1410)
- La **phrase memory** è scoped per workspace — sapere in quale workspace si è è informazione funzionale
- Quando si lavora su un libro non serve vedere gli altri: il cambio progetto è raro e intenzionale

---

## Decisioni di design

### Header — pattern H3

```
Glossa // Traduzione          ← dashboard: area nel brand-ctx
Manuali di Scherma Storica    ← workspace nel subtitle

Glossa // Flos Duellatorum    ← editor: titolo libro nel brand-ctx
Manuali di Scherma Storica    ← workspace invariato nel subtitle
```

- Brand: `text-xl italic` (ridotto da text-5xl)
- brand-ctx `// area|libro`: `text-[12px] italic` in `#a89f94` serif
- workspace subtitle: `text-[7.5px] uppercase tracking-[0.3em]` in `#9b8f83`
- Cluster destro: solo globale (libreria, impostazioni, lingua, aiuto)
- Rimosso: cluster documento, bottone sandbox, SaveStatusBadge, FolderX

### Sidebar — drill-down (stile A)

Stesso stile visivo (`w-36 bg-editorial-bg/60 border-r`), contenuto trasformato per contesto.

**Dashboard:**
```
AREA
● Traduzione •   (active + accent dot)
○ Libreria       (disabled, opacity 0.3)
○ Trascrizione   (disabled, opacity 0.3)
─────────────────
WORKSPACE
Manuali Scherma  (nome attivo)
─────────────────
[● Manuali Sch.] (pill attiva)
[  Corpus Latino] (pill inattiva)
[+ Nuovo ws    ]
```

**Editor:**
```
[📚 Manuali Sch. ←]   (chip cliccabile → closeProject)
─────────────────────
IT → EN · 68% · ✓
[📁][⬆][💾][📤]       (azioni documento)
─────────────────────
[controlli pipeline invariati]
[pannelli doc invariati]
```

### Dashboard — libreria a cards

Sostituisce tab bar a tre colonne con grid di carte-libro:

- Header collana: titolo, descrizione, chips (n libri, frasi memoria, embedding model)
- Grid 2 colonne: ogni card ha icona libro, titolo italic serif, autore·anno, barra progresso, percentuale + data
- Ultima card: "+ Nuovo libro" (bordo tratteggiato)

---

## Componenti da modificare

### Header.tsx

- Brand `text-xl` (da text-5xl)
- Aggiungere brand-ctx: `// [area | titolo libro]`
- Aggiungere ws-subtitle: nome workspace
- Rimuovere: cluster documento, sandbox button, SaveStatusBadge, FolderX
- Logica: se `currentProjectId` → brand-ctx = titolo progetto; altrimenti → brand-ctx = nome area

### WorkspaceHome.tsx

- Rimuovere AREA_TABS e tab bar
- Sostituire con: header collana + grid cards libro
- Cards: title, meta (author·year), progress bar, last-updated

### PipelineSidebar.tsx

Aggiungere in cima quando `mode === 'editor'`:
1. Workspace chip (click → closeProject)
2. Doc meta + 4 azioni (apri/importa/salva/esporta)
3. Divisore → poi controlli pipeline esistenti invariati

Riceve prop `mode: 'dashboard' | 'editor'`:
- `dashboard`: mostra solo area nav + workspace switcher, nessun pipeline
- `editor`: mostra chip + doc actions + pipeline (comportamento attuale)

### App.tsx

Dashboard layout:
```tsx
<Header />
<div className="flex flex-1 min-h-0">
  <PipelineSidebar mode="dashboard" />
  <WorkspaceHome />
</div>
```

Editor: invariato (PipelineSidebar ora `mode="editor"` con chip incluso).

---

## Invarianti (non si toccano)

- Larghezza sidebar: `w-36`
- Tutti i controlli pipeline (mode toggle, run, chunk counter, pills, cfg)
- Pannelli doc (Columns2, PanelLeft, PanelRight, Link2, Highlighter)
- ConfigDrawer, InsightsDrawer, DocumentView, MemoryTab

## Non in scope

- Area Libreria / Trascrizione (restano disabilitate)
- Animazioni di transizione elaborate
- Sidebar collassabile icon-only
- Cambio workspace dall'interno dell'editor

## File da toccare

| File | Azione |
|------|--------|
| `src/components/layout/Header.tsx` | Modifica |
| `src/components/layout/PipelineSidebar.tsx` | Modifica (prop mode, aggiunge sezioni) |
| `src/components/workspace/WorkspaceHome.tsx` | Modifica (libreria a cards) |
| `src/App.tsx` | Modifica (monta sidebar su dashboard) |
| `src/locales/it.json` + `en.json` | Aggiorna chiavi i18n |
