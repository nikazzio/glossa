# Unificazione resa note — pagine SORGENTE e TRADUZIONE

Data: 2026-06-12
Branch: feat/issue-23-annotations

## Problema

La visualizzazione delle note nelle due pagine principali del testo
(SORGENTE e TRADUZIONE) è incoerente e contiene più bug. I dati delle note
sono di due tipi distinti e devono restare separati; ciò che va unificato è
**solo la resa visiva** nelle due pagine, in modalità *scrivi* e *anteprima*.

### Sorgenti dati (invariate)

- **Note sorgente**: `chunk.footnotes` (`{ id, marker, text }`), reference
  immutabile estratta dal testo originale. Mostrate nel tab Note, sezione
  sorgente, così come sono.
- **Note utente**: annotazioni nel DB (`annotationsStore`). Mostrate come card
  nel tab Note.

### Bug attuali

1. **TRADUZIONE / write** — la sottolineatura della nota colpisce *tutte* le
   occorrenze della parola (regex globale in `useGlossaryHighlight`), non solo
   l'occorrenza ancorata. Inoltre usa uno sfondo (`hl-annot-*`), non una
   sottolineatura, e non mostra alcun marker `¹`.
2. **SORGENTE / anteprima** — le footnote spariscono e il marker `[¹]` appare
   nel colore del testo: i marker inline sono superscript Unicode `[¹]`, che
   non sono sintassi GFM, quindi le definizioni `[^id]:` restano orfane e
   `remark-gfm` non genera né i riferimenti né il footer.
3. **TRADUZIONE / anteprima** — l'anchor/backref GFM (`data-footnote-backref`,
   href del ref) provoca un salto che scasina orizzontalmente la pagina.

## Obiettivo

Resa visiva **identica** nelle due pagine:

| | SORGENTE | TRADUZIONE |
|---|---|---|
| **Write** | `[¹]` rosso (già ok) | `¹` rosso **+ sottolineatura della sola occorrenza ancorata** (colore da impostazioni) |
| **Anteprima** | markdown → refs rosse `¹` + footer note in fondo | identico, footer in fondo |

Vincolo: la resa nella pagina TRADUZIONE è **non-distruttiva** — il marker è
mostrato solo a video, il draft memorizzato non viene mai modificato.

## Design

### A. Pagina SORGENTE

- **Write**: invariato. `[¹]` rosso via `.hl-footnote-marker`
  (`highlightSuperscriptMarkersHtml`).
- **Anteprima** (fix bug 2): ricostruire markdown GFM valido prima del render.
  - Convertire ogni marker inline `[¹]` → `[^id]` usando il mapping
    marker→id derivato da `chunk.footnotes` (inverso di
    `replaceMarkersWithSuperscripts`).
  - Appendere le definizioni `[^id]: testo`.
  - `remark-gfm` genera refs `¹` rosse (CSS `.footnote-ref` già presente) e il
    footer `<section data-footnotes>`.

### B. Pagina TRADUZIONE

- **Write** (fix bug 1):
  - Sottolineare **solo l'occorrenza ancorata**, non tutte. L'ancoraggio passa
    da ricerca-testo globale a posizione: si memorizza l'offset di selezione al
    momento della creazione della nota.
  - **Schema**: nuova colonna `anchor_offset` (INTEGER, nullable) sulla tabella
    `annotations`, popolata dalla selezione. Risoluzione dello span a
    quell'offset; fallback al primo `indexOf(anchorText)` per note esistenti
    senza offset.
  - Marker `¹` rosso mostrato **senza modificare il textarea**: pseudo-elemento
    CSS `::after` in `position: absolute` sullo span sottolineato → larghezza
    zero → l'allineamento overlay/textarea resta intatto.
  - **Rischio noto**: se il marker assoluto risultasse fragile
    sull'allineamento, fallback = solo sottolineatura in write mode (il marker
    `¹` resta comunque visibile in anteprima). Da segnalare se si verifica.
- **Anteprima** (fix bug 3): GFM footnotes + footer, ma **senza anchor/backref**.
  - In `markdown.ts`: rimuovere/neutralizzare gli anchor dei footnote
    (`data-footnote-ref` href e `data-footnote-backref`) così il `¹` resta un
    superscript rosso non cliccabile → niente salto/scasinamento orizzontale.

### C. Colore (impostazioni)

- Una **sola** sottolineatura per tutte le note nel testo (la distinzione di
  tipo — commento/dubbio/problema/approvato — resta nelle card del tab).
- Aggiungere voce **"Note"** al color-picker esistente in `SettingsModal`:
  - nuova chiave `highlightColors.annotation` in `uiStore`;
  - CSS var `--hl-annot-underline-color`;
  - injection runtime in `App.tsx`;
  - label i18n.
- Rimuovere i 4 sfondi `hl-annot-comment|doubt|problem|approved`, sostituiti da
  un'unica regola di sottolineatura che usa `--hl-annot-underline-color`
  (stile coerente con `.hl-source-term`: `text-decoration: underline`).

### D. Tab note (migliorie)

- Mostrare la frase ancorata **in alto** nella card (non in fondo).
- Pulsante **"vai alla nota"** in stile `AuditPanel` (icona `Crosshair`,
  `rounded-full border px-2 py-1`), che riusa `focusIssueInChunk` per
  scrollare ed evidenziare l'occorrenza ancorata nel testo.

## File coinvolti (mappa)

- `src/utils/annotationMarkdown.ts` — composizione note traduzione (anteprima);
  uso dell'offset.
- `src/utils/footnoteExtractor.ts` — inverso marker `[¹]`→`[^id]` per sorgente.
- `src/services/markdown.ts` — strip anchor/backref footnote in anteprima.
- `src/hooks/useGlossaryHighlight.ts` — ancoraggio per offset; sottolineatura
  invece di sfondo per le note.
- `src/components/document/hooks/useDocumentViewState.ts` — wiring offset/anchor.
- `src/components/document/DocumentView.tsx` — `sourcePreviewValue`
  (ricostruzione GFM), `translationPreviewValue`.
- `src/components/document/tabs/NotesTab.tsx` — frase in alto + pulsante locate.
- `src/components/document/AnnotationContextMenu.tsx` — cattura offset selezione.
- `src/stores/uiStore.ts` — `highlightColors.annotation`,
  `pendingAnnotationAnchor` con offset.
- `src/stores/annotationsStore.ts` + Rust/SQL — colonna `anchor_offset`.
- `src/components/settings/SettingsModal.tsx` — voce colore "Note".
- `src/App.tsx` — injection CSS var.
- `src/index.css` — regola sottolineatura note; var; rimozione sfondi.
- i18n — label "Note".

## Testing

- `composeAnnotatedMarkdown`: ancoraggio per offset, occorrenze multiple,
  fallback senza offset.
- Ricostruzione GFM sorgente: `[¹]`→`[^id]` + definizioni → footer presente.
- `markdown.ts`: anchor/backref rimossi, footer presente, `¹` non cliccabile.
- `useGlossaryHighlight`: sottolineatura sulla sola occorrenza all'offset dato.
- Settings: nuova chiave colore persistita e applicata via CSS var.

## Fuori scope

- Modifica della rappresentazione delle note nelle card del tab (a parte frase
  in alto + pulsante locate).
- Sistema audit/cerca esistente.
- Distinzione colore per tipo nel testo (resta solo nelle card).
