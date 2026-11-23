# Tasks

## 1. Dati

- [x] 1.1 Aggiungere la migrazione `0002_transcription_notes.sql` (tabella `transcription_notes`, indice, colonna `workspaces.ocr_separate_notes` acceso all'inizio) e la sua riga in `migrations.lock`; verificare con `cargo test` (test del lock delle migrazioni).
- [x] 1.2 Aggiungere `transcription_notes` all'elenco e all'ordine delle chiavi esterne del backup; verificare con un test del backup che salva e ripristina una nota.
- [x] 1.3 Servizio TypeScript delle note della pagina (leggere, creare, modificare, eliminare; modificare una nota del modello la rende dell'utente) e campo `ocrSeparateNotes` del workspace; verificare con test Vitest del servizio.

## 2. Aggancio comune

- [x] 2.1 Scrivere il file di casi comune `src-tauri/src/ocr/note_anchor_cases.json` (spazi, maiuscole, punteggiatura, parola ripetuta, passaggio assente).
- [x] 2.2 Normalizzazione e ricerca dell'occorrenza in TypeScript, con i test Vitest che leggono il file di casi.
- [x] 2.3 Normalizzazione e ricerca dell'occorrenza in Rust, con i test che leggono lo stesso file di casi; verificare con `cargo test`.

## 3. Lettura automatica

- [x] 3.1 Testo fisso `ocr.notes-format` e composizione del prompt con il flag: blocco di formato non in cache prima del prompt del documento in cache; aggiornare il test di equivalenza dei prompt e aggiungere i test acceso/spento.
- [x] 3.2 Campo `separate_notes` nella configurazione della pagina in coda, risolto dall'impostazione del workspace al momento dell'avvio; verificare con un test che una pagina in coda mantiene il valore di partenza.
- [x] 3.3 Lettore delle note a piè di pagina (`extract_notes`): definizioni su più righe, segni, nota senza segno, tipi inglesi e italiani, tipo sconosciuto, passaggio fra «» o "", occorrenza; test per ogni scenario della specifica.
- [x] 3.4 Scrittura nella stessa transazione: revisione con il testo pulito e sostituzione delle note del modello, note dell'utente intatte, anche con testo identico; riga di log con note arrivate, non agganciate e tipo non riconosciuto; test sul database in memoria.
- [x] 3.5 Documentare il flusso (blocco di formato, conversione, tabella) in `docs-dev/ARCHITECTURE.md`.

## 4. Editor nuovo della pagina

- [x] 4.1 Componente `PageEditor` con modalità Scrivi/Leggi, comandi in colonna nel margine destro (formattazione, dimensione del testo, copia, nota sulla selezione), variante compatta senza margine; test Vitest su modalità, comandi e tastiera.
- [x] 4.2 Evidenziazioni in Scrivi (strato con il colore delle note, suggerimento con tipo e inizio della nota) e in Leggi (plugin remark sui nodi di testo, `mark` consentito dal sanitizer); test sulla resa con passaggio semplice, ripetuto e dentro un'enfasi.
- [x] 4.3 Sostituire il vecchio editor nella pagina di trascrizione e togliere l'icona del menu dalla barra sopra il testo; verificare con i test dello Studio aggiornati.
- [x] 4.4 Al salvataggio di un testo modificato a mano, aggiornare l'occorrenza delle note tramite il diff; test con frase aggiunta prima del passaggio e passaggio cancellato.
- [x] 4.5 Documentare l'editor della pagina in `docs-dev/UI_DESIGN_SYSTEM.md` e annotare in `docs-dev/ROADMAP_2_0.md` il passaggio di traduzione e pagina della fonte all'editor nuovo.

## 5. Scheda Note e Studio

- [x] 5.1 Scheda Note: gruppi Pagina / Nel testo / Da riagganciare, filtro per tipo con conteggi, stato vuoto, icone e nomi dei sette tipi; test Vitest sui gruppi e sul filtro.
- [x] 5.2 Comandi delle note (trova nel testo, modifica con l'editor compatto, elimina, aggancio alla selezione) e creazione dalla scheda o dalla selezione con scorciatoia; clic su un passaggio evidenziato che apre la nota; test per ogni scenario dei comandi.
- [x] 5.3 Ordine delle schede Note, Storico, OCR, Riepilogo, apertura su Note, icona della scheda OCR uguale al comando di lettura; test dell'ispettore.
- [x] 5.4 Blocco di lettura sopra le schede con comando grande, servizio e modello, costo dell'ultima lettura; tolto dall'intestazione del riquadro Modello; test che il comando è visibile da ogni scheda e spento con motivo senza immagine.
- [x] 5.5 Conferma prima di rileggere una pagina già letta, con il numero di note del modello da sostituire; test con prima lettura, conferma e annullamento.
- [x] 5.6 Interruttore «Note separate dal testo» nella scheda OCR delle impostazioni del workspace, con suggerimento; test che salva il valore.
- [x] 5.7 Testi in `it.json` e `en.json` per scheda, tipi, comandi, conferma, interruttore e log; verificare che le due lingue abbiano le stesse chiavi.

## 8. Pannello del prompt e scheda OCR

- [x] 8.1 Pannello del prompt riusabile (bozza con salva e scarta, Ctrl+Invio, Esc, provenienza con modello di partenza, bozza controllabile dall'esterno) e menu dei modelli (cerca, usa, aggiorna, elimina con conferma, salva come nuovo); test per ogni scenario della specifica.
- [x] 8.2 Usarlo nella scheda OCR dello Studio (bozza tenuta per documento) e nelle impostazioni OCR del workspace; eliminare il vecchio editor del prompt e i suoi test; verificare con i test aggiornati.
- [x] 8.3 Scheda OCR asciutta: «personalizza per questo documento» al posto del lucchetto con la riga di provenienza, immagine con i soli pallini nell'intestazione, servizio e modello del blocco di lettura che aprono la scheda OCR; test dell'ispettore.
- [x] 8.4 Testi IT/EN, guida in-app, docs IT/EN, design system e roadmap (unificazione con l'editor della traduzione).

## 6. Documentazione per l'utente

- [x] 6.1 Guida in-app: sezione della trascrizione aggiornata (note separate, tipi, scheda Note, rilettura, comando di lettura) in `HelpGuide` e nei testi `help.*` delle due lingue.
- [x] 6.2 Documentazione pubblica: `docs/guides/transcription.md` e `docs/en/guides/transcription.md`; verificare con `npx vitepress build docs`.

## 7. Verifica finale

- [x] 7.1 Una sola verifica completa: `npm run lint:all`, `npm test`, `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.
- [x] 7.2 Prova dal vivo di Niki: lettura di una pagina della minuta con le note accese, controllo di scheda Note, evidenziazioni, rilettura con conferma.

## Workflow follow-up

- Aggiornare a mano il prompt della minuta, togliendo le istruzioni sui segni `==...==` e `{COMMENT: ...}`.
- Archiviare la modifica dopo la prova dal vivo e l'unione.
