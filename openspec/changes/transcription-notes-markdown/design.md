# Design

## Context

Vedi proposal.md per motivazione e decisioni; i requisiti sono in `specs/transcription/spec.md`.

Stato attuale rilevante:

- La lettura automatica gira nel motore Rust come lavoro in coda, una pagina per lavoro (`OcrPageConfig`, con prompt, servizio e modello risolti al momento della messa in coda). Continua anche con lo Studio chiuso, quindi la conversione delle note non può stare nell'interfaccia.
- Il prompt OCR è un solo blocco di sistema in cache (`build_ocr_prompt`); l'immagine sta nel messaggio utente. Anthropic mette `cache_control` su ogni blocco `cacheable`.
- La risposta diventa una revisione con `write_ocr_revision`, che non crea una revisione se il testo è identico.
- Le note della traduzione stanno in `annotations`, legate a frammento e pipeline: non riusabili per le pagine di trascrizione.
- L'editor condiviso (`MarkdownEditor`, 690 righe) è una textarea trasparente sopra uno strato HTML evidenziato (`HighlightedText`); l'anteprima Markdown non mostra evidenziazioni. Le utilità di formattazione (`markdownEditorUtils`) sono funzioni pure.
- Nel motore Rust non c'è un lettore Markdown; nell'interfaccia c'è la catena unified/remark-gfm/rehype-sanitize (`services/markdown.ts`).
- Il backup elenca le tabelle a mano (`backupService.ts`), con l'ordine delle chiavi esterne.

## Goals / Non-Goals

**Goals:**
- Conversione delle note nel motore, nella stessa scrittura della revisione.
- Un solo modo di calcolare l'aggancio (normalizzazione e occorrenza), con gli stessi casi di prova in Rust e TypeScript.
- Editor nuovo autonomo, senza dipendere dal vecchio, così che il vecchio si possa cancellare in una modifica successiva.

**Non-Goals:**
- Migrare traduzione e pagina della fonte all'editor nuovo; unificare `annotations` con le note della trascrizione.
- Annullare una lettura in corso dallo Studio.
- Versionare le note.

## Decisions

### 1. Blocco di formato: costante Rust, non cacheable, prima del prompt

`build_ocr_prompt` riceve un flag `separate_notes`. Se vero, il primo blocco di sistema è il testo fisso del formato (costante `OCR_NOTES_FORMAT` in `prompts.rs`, accanto a `OCR_USER_MESSAGE`: le voci di `prompt_texts.rs` sono testi della pipeline di traduzione, modificabili per pipeline), con `cacheable: false`; segue il prompt del documento con `cacheable: true`. Ordine statico → documento, come vuole l'invariante della cache. Il segno di cache sul secondo blocco copre tutto il prefisso, quindi anche il formato; marcare cacheable anche il primo spenderebbe un punto di cache Anthropic per un blocco sotto la lunghezza minima.

Il flag viaggia in `OcrPageConfig` (`separate_notes: bool`, con `#[serde(default)]` falso), risolto dall'interfaccia al momento della messa in coda, come prompt e modello. Alternativa scartata: leggere l'impostazione del workspace nel motore al momento della lettura; cambierebbe il comportamento di lavori già in coda.

Il prompt mostrato nel log (`readable_prompt`) include già tutti i blocchi: nessun cambiamento.

### 2. Lettore delle note a piè di pagina scritto a mano in Rust

Modulo nuovo `ocr/notes.rs`, funzione pura `extract_notes(text) -> ExtractedNotes { clean_text, notes, stats }`:

- Definizioni: righe che iniziano con `[^id]:`; le righe successive rientrate (almeno due spazi o un tab) proseguono la definizione. Le definizioni sono tolte dal testo, con le righe vuote in eccesso alla fine.
- Segni: `[^id]` nel testo, tolti. Un segno senza definizione si toglie e basta; una definizione senza segno diventa una nota della pagina.
- Contenuto: `Tipo «passaggio» — testo`. Il tipo è la prima parola (confronto senza maiuscole con nomi inglesi e italiani, incluso «Resa grafica» su due parole). Il passaggio è il primo testo fra `«»`; accetta anche `"..."`. Il separatore è `—`, `–`, `-` o `:`. Senza tipo riconosciuto → `note`, conteggio in `stats.unknown_type`.
- Aggancio: il passaggio si cerca nel testo pulito, all'indietro a partire dalla posizione del segno; l'occorrenza è il numero d'ordine di quella corrispondenza fra tutte le corrispondenze del passaggio nel testo pulito. Non trovato → nota con passaggio e occorrenza nulla («da riagganciare»).

Alternativa scartata: `pulldown-cmark` (dipendenza nuova). Restituisce i segni come eventi senza la posizione nel testo pulito, che è proprio il dato che serve; un lettore riga per riga è più corto e testabile.

Con il lettore nel motore, il dubbio della proposta («il lettore Markdown dell'app legge una nota senza segno?») non serve più: la nota senza segno la gestisce `extract_notes`.

### 3. Normalizzazione condivisa con casi di prova comuni

Regola unica: minuscole, spazi consecutivi ridotti a uno, punteggiatura tolta (classi Unicode P*), confronto sul testo così ridotto con una mappa delle posizioni verso il testo originale. Implementata due volte: Rust (`ocr/notes.rs`) e TypeScript (`utils/noteAnchors.ts`, usata da scheda Note, evidenziazioni e note create a mano). Un file di casi comune `src-tauri/src/ocr/note_anchor_cases.json` è letto dai test di entrambi (Rust con `include_str!`, Vitest con un import JSON). Alternativa scartata: calcolare l'aggancio solo in TypeScript; il motore deve salvare le note anche a Studio chiuso.

### 4. Tabella `transcription_notes`, migrazione 0002

```sql
CREATE TABLE transcription_notes (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES transcription_segments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('emendation','doubt','addition','correction','typography','abbreviation','note')),
  content TEXT NOT NULL DEFAULT '',
  passage TEXT,
  occurrence INTEGER CHECK (occurrence IS NULL OR occurrence >= 1),
  origin TEXT NOT NULL CHECK (origin IN ('model','user')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_transcription_notes_segment ON transcription_notes(segment_id);
ALTER TABLE workspaces ADD COLUMN ocr_separate_notes INTEGER NOT NULL DEFAULT 1;
```

Nuova migrazione `0002_transcription_notes.sql` con la riga in `migrations.lock`; nessun `DROP TABLE`. Lo stato «agganciata / da riagganciare / pagina» non si salva: si calcola dal testo corrente (passaggio nullo → pagina; passaggio presente ma occorrenza non trovata → da riagganciare). `sort_order` dà l'ordine delle note della pagina. Tabella aggiunta all'elenco del backup, dopo `transcription_segments` nell'ordine delle chiavi esterne.

### 5. Scrittura nella stessa transazione della revisione

Nel lavoro di lettura, se `separate_notes`: `extract_notes` sul testo della risposta, poi in un'unica chiusura sul database `write_ocr_revision(clean_text)` e sostituzione delle note `origin = 'model'` della pagina con quelle nuove. La sostituzione avviene anche quando il testo è identico (revisione non creata): la lettura è stata rifatta. Le note `user` non si toccano. Il log della lettura riceve una riga «N note, M non agganciate, K tipo non riconosciuto» (voci a zero omesse).

### 6. Note che seguono il testo modificato a mano

Al salvataggio di un testo modificato a mano, l'interfaccia ricalcola l'occorrenza delle note agganciate: posizione vecchia del passaggio → posizione nuova tramite il diff fra testo vecchio e nuovo (`diff`, già fra le dipendenze); se alla posizione nuova c'è ancora il passaggio, si salva la sua occorrenza aggiornata; altrimenti l'occorrenza resta e la nota risulta da riagganciare. Lo stesso vale per un ripristino dallo Storico, che scrive una versione `user`. Dopo una rilettura le note `user` tengono passaggio e occorrenza così come sono. Modificare una nota `model` la fa diventare `user`.

### 7. Editor nuovo: `components/editor/PageEditor`

Componente nuovo, non una variante del vecchio: textarea trasparente sopra uno strato evidenziato (stessa tecnica, che è la più semplice compatibile con una textarea nativa e quindi con annulla, incolla, correttore), modalità Scrivi/Leggi, comandi in colonna nel margine destro con `IconButton` e suggerimento. Riusa le funzioni pure di `markdownEditorUtils` e i passi della dimensione del testo; niente varianti di barra, niente menu comandato dall'esterno. Variante compatta per il testo della nota: stessa componente senza margine di comandi.

Evidenziazioni in Leggi: plugin remark che, usando le posizioni dei nodi di testo, divide i nodi alle estremità dei passaggi e li avvolge in `<mark class="hl-annot" data-note-id>`; `rehype-sanitize` consente `mark` con classe e `data-note-id`. Alternativa scartata: segni invisibili nel Markdown prima della resa, fragili dentro link ed enfasi.

Evidenziazioni in Scrivi: strato HTML costruito da `noteAnchors` sul testo corrente, con il colore `--hl-annot-bg` già esistente. Suggerimento al passaggio con il tooltip CSS già usato per il glossario (lo strato è HTML iniettato, non componenti React).

### 8. Studio

- `TranscriptionInspector`: nuova scheda `notes` prima di `history`, scheda iniziale `notes`; icona della scheda OCR uguale al comando di lettura.
- Blocco di lettura in `beforeTabs` di `InspectorShell`, come `PipelineSidebarRunSection` nella traduzione: `OcrStartButton` in taglia grande, servizio e modello risolti, costo dell'ultima lettura della pagina (stessa fonte del Riepilogo). Esce dall'intestazione del riquadro «Modello».
- Prima di avviare: se la pagina ha una revisione `ocr`, `confirm()` con il numero di note `model` della pagina.
- `StudioTextHeader`: tolta l'icona del menu dell'editor.
- Scheda Note: `PanelSection` per gruppo, filtro con `ChoiceDots` e conteggi, comandi delle note come `IconButton` al passaggio, stato vuoto con `EmptyState`.
- Interruttore: `ToggleRow` nella scheda OCR delle impostazioni del workspace, dopo il prompt predefinito.

### 9. Pannello del prompt riusabile

Componente nuovo `components/prompt/PromptPanel` con il modello a bozza già usato dall'editor della traduzione (`PipelinePromptEditor`: bozza locale, conferma, annulla, Ctrl+Invio, Esc), più: bozza controllabile dall'esterno (lo Studio la tiene per documento, così sopravvive al cambio di scheda), provenienza con il modello di partenza ricordato (applicato o riconosciuto all'apertura), menu `PromptTemplateLibrary` con usa / aggiorna / elimina (conferma in riga) / salva come nuovo, sopra `updateTemplate` e `deleteTemplate` già nello store. Sostituisce `AuditPromptEditor`, usato solo dalla lettura automatica, che si elimina. L'editor della traduzione passa al pannello nel suo riordino (roadmap): oggi i due menu dei modelli convivono.

La scheda OCR perde la riga «Invio» e le spiegazioni fisse (in `ChoiceDots` nell'intestazione della sezione Immagine); il lucchetto diventa `IconButton` «personalizza per questo documento» con `ariaPressed`, e una riga `text-xs` dice la provenienza.

## Risks / Trade-offs

- [Il modello non rispetta la forma delle note] → tipo ripiega su Nota, passaggio non trovato va in «Da riagganciare», il log lo dice; si valuta l'output strutturato solo se succede spesso.
- [Normalizzazione diversa fra Rust e TypeScript] → file di casi comune letto da entrambe le suite.
- [Occorrenza sbagliata dopo rilettura o ripristino, se il testo nuovo ha più o meno ripetizioni prima del passaggio] → la nota resta visibile e si riaggancia in un clic; accettato per non salvare posizioni legate a una versione.
- [Passaggio che attraversa formattazione Markdown in Leggi] → il plugin evidenzia i soli pezzi di testo dentro il passaggio; se non riesce a dividere i nodi, il passaggio resta senza evidenziazione in Leggi e la nota resta agganciata in Scrivi.
- [Due editor nell'app fino alla modifica successiva] → la migrazione della traduzione è annotata nella roadmap come lavoro previsto.

## Migration Plan

Migrazione additiva (tabella nuova, colonna con valore iniziale acceso). Nessun dato esistente da convertire: i segni `==...==` e `{COMMENT}` già presenti nei testi restano testo. Il prompt della minuta di Niki si aggiorna a mano, togliendo le istruzioni sui segni.
