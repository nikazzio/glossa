# Tasks

## 1. Schema dell'interfaccia (approvazione prima del codice)

- [x] 1.1 Proporre a Niki uno schema ASCII di: comando di importazione in Biblioteca (posizione, icona, suggerimento), finestra di importazione (campi, testi), scelta fra opera nuova e opera esistente, comando «Estrai le pagine» e suoi stati nella scheda dell'opera. Verifica: approvazione esplicita di Niki registrata in chat prima del gruppo 5.

## 2. Motore di disegno e lavoro di estrazione (backend)

- [x] 2.1 Aggiungere `hayro` 0.9 a `src-tauri/Cargo.toml` e una funzione di disegno di una pagina (scala dalla larghezza dell'immagine incorporata più grande, ripiego 300 dpi, sfondo bianco, JPEG). Verifica: test Rust su un PDF di prova piccolo generato nel test (dimensioni attese, JPEG valido).
- [x] 2.2 Lavoro `pdf_page_extraction` (`Cpu`, `Resumable`, id `extract:<versione pdf>`): staging, promozione atomica in `pages/<misura>/`, riga in `pages.jsonl`, miniatura, pausa/annullamento fra le pagine, ripresa dalle pagine mancanti, pagine non disegnabili elencate nell'esito senza fermare le altre. Verifica: test del gestore con ripresa dopo interruzione e pagina guasta.
- [x] 2.3 A fine lavoro: manifesto IIIF Presentation 3 generato nella cartella della copia a immagini, con etichette dal manifesto della biblioteca solo se i conteggi coincidono, e `expected_asset_count`. Verifica: test sul manifesto generato (canvas, dimensioni, etichette nei due casi).
- [x] 2.4 Guardia `has_active_version_work` estesa al nuovo lavoro e voce in `JOB_TYPES` dei Lavori. Verifica: test che impedisce di liberare spazio durante l'estrazione.

## 3. Importazione del file e cartella del deposito (backend)

- [x] 3.1 Chiave riservata `local_import` per la cartella delle opere importate senza manifesto, non registrata fra le biblioteche (non compare nella Ricerca). Verifica: test d'importazione nella cartella `local_import`.
- [x] 3.2 Comando `import_pdf_document`: copia in staging, validazione PDF, conteggio pagine, `document.pdf` + `document.json` con `importedFrom: "local_file"`. Verifica: test con PDF valido, file non PDF, PDF troncato.
- [x] 3.3 Lettura di un manifesto da file locale con il parser esistente, senza rete, e conservazione come `source-manifest.json`. Verifica: test con manifesto Presentation 2.1 e 3 e con file illeggibile.

## 4. Divieto di rete per le copie importate

- [x] 4.1 Nei punti elencati in design D3 (byte di pagina, miniature, rilettura manifesto, riallineamento, verifica di disponibilità) una copia `glossa-import:` o un PDF importato non contatta la rete e una pagina assente dà `page_not_local`. Verifica: test per ogni punto senza server raggiungibile.
- [x] 4.2 OCR: accettare la copia a immagini importata, leggere solo dal deposito, tradurre `page_not_local` nel messaggio della specifica; sulla sola copia PDF il comando spiega che servono le pagine estratte. Verifica: test Vitest del servizio OCR e test Rust del gestore.

## 5. Interfaccia (dopo l'approvazione del gruppo 1)

- [x] 5.1 Finestra di importazione (opera nuova): scelta del PDF e del manifesto, campi compilati dal manifesto, titolo obbligatorio, creazione in transazione con annullamento se il file non è valido, correzioni salvate come tali. Verifica: test Vitest del servizio e del dialogo.
- [x] 5.2 Importazione in un'opera esistente senza PDF sul computer (riempie la riga PDF dichiarata o ne crea una); comando assente se il PDF c'è già. Verifica: test Vitest dei due casi.
- [x] 5.3 Caricamento successivo del manifesto su un'opera importata, senza toccare le correzioni. Verifica: test Vitest.
- [x] 5.4 Comando «Estrai le pagine» e stati nella scheda dell'opera; visore sul PDF durante l'estrazione, immagini disponibili a fine lavoro; rilettura della scheda all'esito. Verifica: test Vitest del componente.
- [x] 5.5 Testi in `it.json` ed `en.json` per tutto quanto sopra. Verifica: `npm run lint:all` senza chiavi mancanti.

## 6. Documentazione

- [x] 6.1 Guida in-app: importazione del PDF ed estrazione delle pagine (`HelpGuide` e `help.*` IT/EN). Verifica: sezione visibile nella guida.
- [x] 6.2 Documentazione pubblica `docs/` e `docs/en/`: importazione, manifesto facoltativo, estrazione, limiti (nessuna rete, pagine di servizio non saltate). Verifica: `npx vitepress build docs` senza link rotti.
- [x] 6.3 `docs-dev/ARCHITECTURE.md`: opere importate, lavoro di estrazione, manifesto generato, divieto di rete, chiave `local_import`; roadmap aggiornata. Verifica: rilettura.

## 7. Verifica finale

- [x] 7.1 Una sola verifica completa a fine lavoro: `npm run lint:all`, `npm test`, `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test`. Verifica: tutto verde.
- [ ] 7.2 Prova dal vivo di Niki: importazione del PDF di Sanuto come opera nuova, estrazione, lettura automatica di una pagina. Verifica: conferma di Niki.

## Workflow follow-up

- Commit, PR e archivio del change solo su richiesta di Niki.
