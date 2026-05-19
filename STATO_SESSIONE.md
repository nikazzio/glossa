# Stato sessione — roadmap verso la 1.0

**Data ultimo aggiornamento**: 2026-05-20  
**Branch corrente**: `feat/translation-workflow` (PR aperta su `main`)

RICORDATI: NO LEGACY, NO PEZZE, NO CODICE MORTO O RETROCOMPATIBILITA'. SOLO CODICE LOGICO, LEGGIBILE, PULITO E MANUTENIBILE.

---

## Lavoro in corso — `feat/translation-workflow`

### Cosa è stato fatto in questa sessione

**#175 — Flusso 4 fasi + stato `preview`** (commit `2fa82cd`, `7c41c00`) ✅  
- Nuovo stato chunk `preview` (non blocca la config, non è `completed`)
- `runDryRun`: esegue la pipeline sul primo chunk `ready`, segna come `preview`
- `runSingleChunk` accetta `finalStatus: 'completed' | 'preview'`
- `resetAllChunks` resetta tutto tranne `ready`, `resetPreviewChunks` solo i preview
- 9 test nuovi, 332 test totali verdi

**Redesign UI run panel e nav bar** (commit `b162095`→`c657aae`) ✅  
- Toggle Test/Produzione: striscia orizzontale, icone-only (FlaskConical/Zap), tooltip, disabilitato quando ci sono chunk completati, reset generale lo riporta a `test`
- Run bar orizzontale compatta (54px cerchio, scala ~25%), affiancata alla nav bar
- Colore `editorial-charcoal` → `#2C4A5C` (slate-teal, sostituisce il nero/marrone sugli elementi interattivi)
- Nav bar: 3 gruppi (`← counter →` | pannelli | stage indicators destra), rimossa "Unità"
- Badge `preview`: solo icona circle (FlaskConical), niente testo
- Pulsante Rivaluta spostato nella run bar accanto a Riesegui
- Pulsante Evidenzia glossario rimosso (già presente in InsightsDrawer)
- Valutazione qualità rimossa dal footer traduzione
- CopyButton spostato accanto al sottotitolo stage (in rosso)
- Toolbar markdown: `ToolbarButton` attivo usa `editorial-accent` (rosso) per coerenza
- InsightsDrawer: colore card chunk attiva → `editorial-charcoal`
- Format stage prompt: elimina esplicitamente i marker footnote dalla traduzione

### Cosa rimane da fare / da valutare in questa sessione

- [ ] Review UI da parte dell'utente — in corso
- [ ] Eventuali aggiustamenti post-review
- [ ] Chiusura PR #176 su `main` se la review va bene

---

## Roadmap issue per la 1.0

### Priorità 1 — bloccanti per la release

| Issue | Titolo | Note |
|-------|--------|------|
| #175 | Flusso traduzione: preview, dry run, reset | In corso — branch feat/translation-workflow |

### Priorità 2 — da fare prima della 1.0

| Issue | Titolo | Note |
|-------|--------|------|
| #107 | Provider hardening: client HTTP condiviso + backend tracing | Branch separato. Timeout/error già ok, manca riuso client e tracing Rust |
| #144 | Refactor editor markdown | Non blocca il flusso principale |
| #139 | Backup e ripristino snapshot workspace | |

### Priorità 3 — desiderabili ma non bloccanti

| Issue | Titolo |
|-------|--------|
| #128 | Visualizzazione costi reali post-run |
| #126 | Rerun da stage N per singolo chunk |
| #123 | Dry run su 1-2 chunk |
| #23  | Note per chunk |
| #129 | Accessibility audit WCAG 2.1 AA |
| #140 | Search globale |

### Post-1.0

| Issue | Titolo |
|-------|--------|
| #162 | Pipeline multiple per progetto |
| #167 | Traduzione parallela chunk multipli |
| #156 | UI dedicata modifica chunk |
| #141 | History e rollback |
| #68  | Integrazione DeepL |

---

## Stato tecnico corrente

- 332 test frontend — tutti verdi
- Zero warning TypeScript, zero warning clippy
- Catalogo modelli maggio 2026, OpenAI su Responses API, streaming solo Ollama
- `pipelineMode` in uiStore (non persistito, reset a `test` al reload e dopo reset generale)

## Gap tecnici non-issue

- G1: Anthropic extended thinking — non necessario per 1.0. NON TIRARLO FUORI.
