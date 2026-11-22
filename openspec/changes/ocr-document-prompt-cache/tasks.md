# Tasks

## 1. Prompt OCR senza istruzioni fisse

- [x] 1.1 In `llm/prompts.rs` rimuovere `OCR_SYSTEM_PERSONA` e il prefisso «Core Instructions:». `build_ocr_prompt` restituisce un solo blocco di sistema con il prompt, `cacheable: true`, e lascia invariati `OCR_USER_MESSAGE` e l'immagine nel messaggio utente. Verifica: test Rust che controlla un solo blocco, testo identico al prompt ricevuto, cacheable, immagine solo nel messaggio utente.
- [x] 1.2 Documentazione per sviluppatori: sezione OCR/HTR di `docs-dev/ARCHITECTURE.md` (livello LLM: un solo blocco cacheable, nessuna persona). Verifica: rilettura, nessun riferimento residuo alla persona.

## 2. Cache del prompt nella lettura OCR

- [x] 2.1 Verificare sulla documentazione ufficiale di Anthropic e OpenAI la soglia minima di cache, la durata di 1 ora su Anthropic e la durata della cache di OpenAI. Riportare l'esito in `design.md`. Verifica: fonti citate in `design.md`.
- [x] 2.2 In `ocr/handler.rs` passare alla richiesta una configurazione con la cache Anthropic attiva e la durata di 1 ora. Nessuna opzione per Gemini. Controllare che l'indirizzo di Ollama congelato nel lavoro resti usato come oggi. Verifica: test Rust sulla richiesta OCR (cache Anthropic attiva con durata di 1 ora, nessuna opzione OpenAI e Gemini) e test del provider Anthropic che mostra `cache_control` sul blocco del prompt.
- [x] 2.3 Test OpenAI: due prompt diversi producono `prompt_cache_key` diversi, lo stesso prompt la stessa chiave. Verifica: `cargo test` del modulo.
- [x] 2.4 Documentazione pubblica: sezione OCR di `docs/guides/context-and-caching.md` e `docs/en/guides/context-and-caching.md` (al modello partono solo il prompt del documento e l'immagine; il prompt è la parte in cache; i token in cache si vedono nel log della trascrizione). Verifica: `npx vitepress build docs` senza link rotti.
- [x] 2.5 Documentazione pubblica: nel paragrafo «Al modello partono…» di `docs/guides/transcription.md` e del suo corrispettivo in `docs/en/`, dire che nessuna istruzione si aggiunge al prompt. Verifica: rilettura dei due testi.

## 4. Costo stimato con la cache

- [x] 4.1 Catalogo modelli: rapporto facoltativo del prezzo dei token in cache, valorizzato per i modelli verificati (design, decisione 5). `costForEntry` applica il rapporto con la semantica di ogni servizio. Verifica: test Vitest per OpenAI (input con cache inclusa), Anthropic (cache esclusa dall'input), modello senza rapporto (nessuno sconto), prezzo personalizzato con il rapporto del catalogo.
- [x] 4.2 Passare i token in cache a tutti i calcoli: log della traduzione alla scrittura, statistiche, Riepilogo, log della trascrizione. Verifica: test esistenti verdi e un test di statistica con token in cache.
- [x] 4.3 Documentazione: guida in-app e `docs/` + `docs/en/` dove si spiega il costo stimato (lo sconto della cache entra nella stima; Gemini e scritture in cache Anthropic no); `docs-dev/ARCHITECTURE.md` sul calcolo. Verifica: rilettura e build VitePress.

## 5. Righe del log della trascrizione

- [x] 5.1 Riga su una sola linea in parole (design, decisione 6), stringhe in `it.json` ed `en.json`; togliere le stringhe non più usate. Verifica: test Vitest della riga con e senza cache, con e senza costo.
- [x] 5.2 Guida in-app e `docs/guides/transcription.md` + `docs/en/` dove descrivono la riga di esito. Verifica: rilettura.

## 6. Riepilogo della trascrizione

- [x] 6.1 Estendere i dati del Riepilogo: letture riuscite ed errori, pagine lette e rilette, token inviati, in cache e ricevuti, costo totale e per pagina, tempo medio, modelli; dati della pagina aperta (letture, ultima ora, costo). Verifica: test Vitest del servizio con letture ripetute, errori e cache.
- [x] 6.2 Scheda Riepilogo con le tre sezioni (spec), solo componenti condivisi esistenti, stringhe in `it.json` ed `en.json`. Verifica: test Vitest della scheda (pagina mai letta, documento con letture ripetute).
- [x] 6.3 Guida in-app e `docs/guides/transcription.md` + `docs/en/` sul Riepilogo. Verifica: rilettura.

## 3. Guida, roadmap e verifica finale

- [x] 3.1 Controllare se la guida in-app (`help.*` in `it.json` ed `en.json`) descrive cosa parte verso il modello nella lettura OCR. Se lo descrive, aggiornarla in entrambe le lingue. Verifica: ricerca nei due file, testi coerenti con la documentazione pubblica.
- [x] 3.2 `docs-dev/ROADMAP_2_0.md`: sostituire i riferimenti alle issue chiuse #220 e #388 con #499–#503 e indicare #501 come in corso. Verifica: nessun riferimento a #220 o #388 come lavoro aperto.
- [x] 3.3 Verifica finale, una volta sola, dopo i gruppi 4-6: `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `npm run lint:all`, `npm test`. Verifica: tutti verdi.
- [x] 3.4 Prova dal vivo del maintainer: due pagine lette di seguito con il prompt della trascrizione minuta. Nel log della trascrizione, prompt inviato senza istruzioni aggiunte e token in cache alla seconda pagina. Verifica: esito riportato dal maintainer.

## Workflow follow-up

- Dopo la prova dal vivo: commit e PR solo su richiesta del maintainer, poi archiviazione della modifica OpenSpec.
- Fuori da questa modifica, su richiesta del maintainer: nella traduzione, cache Anthropic con durata di 1 ora come impostazione predefinita (oggi 5 minuti, attivabile a mano con «Estendi a 1 ora»).
