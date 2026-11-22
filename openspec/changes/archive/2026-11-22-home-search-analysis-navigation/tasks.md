# Tasks

## 1. Posizioni dell'app

- [x] 1.1 Sostituire in `AppLocation` la Dashboard con `home`, `search` (`searchId`, `query`) e `analysis` con `view` opzionale; togliere `DashboardView` e `dashboardLocation`, aggiungere i costruttori nuovi; posizione di avvio = Home. Verifica: typecheck senza errori dopo il punto 1.2 e test di `uiStore` aggiornati.
- [x] 1.2 Aggiornare ogni punto segnalato dal compilatore: `App.tsx` (resa e chiave di animazione), `Header` (breadcrumb e clic sul titolo), `AppStatusBar`, `JobRow` (apri ricerca), `FederatedSearchArea` (navigazione dopo creazione e dallo Storico). Verifica: `npm run lint:all` pulito e test mirati di intestazione e colonna dei job.

## 2. Barra di sinistra

- [x] 2.1 Home e Ricerca come voci singole in cima, fuori dalle aree; rimuovere le sotto-voci della Dashboard. Verifica: test della barra con ordine delle voci e stato attivo su Home e Ricerca, anche a barra chiusa.
- [x] 2.2 Sotto-voce Statistiche sotto Analisi, riusando il componente delle sotto-voci; Analisi e Statistiche attive insieme. Verifica: test della barra su clic di Analisi e di Statistiche.
- [x] 2.3 Aggiornare testi e suggerimenti della barra in `it.json` e `en.json` (Home, Ricerca, Statistiche). Verifica: nessuna chiave mancante nei test i18n.

## 3. Home

- [x] 3.1 Rendere la Panoramica la Home: togliere il riquadro Ricerche e la lente in alto, togliere `searches` dall'ordine predefinito dei riquadri. Verifica: test che un ordine salvato con `searches` apre la Home senza errori e con gli altri riquadri al loro posto.
- [x] 3.2 Casella di ricerca in cima alla Home che apre la pagina Ricerca con le parole; casella vuota non fa nulla. Verifica: test di navigazione con parole, con indirizzo e con casella vuota.
- [x] 3.3 Rinominare «Patrimonio» in «Il tuo materiale» (IT) con equivalente EN concordato; il comando di «Questo mese» apre Analisi → Statistiche. Verifica: test del comando e controllo dei testi in entrambe le lingue.
- [x] 3.4 Documentare la Home: guida in-app (`HelpGuide.tsx`, `help.*` IT/EN), guide pubbliche che citano Dashboard/Panoramica in `docs/` e `docs/en/`. Verifica: `npx vitepress build docs` senza link rotti.

## 4. Ricerca

- [x] 4.1 La pagina Ricerca gestisce `query` dalla posizione: riempie la casella, avvia la ricerca con l'ambito «tutte» o mostra il riconoscimento per un indirizzo, poi sostituisce `query` con `searchId`. Verifica: test che il ritorno sulla pagina non rilancia la ricerca.
- [x] 4.2 Collegamento al sito in ogni riga del pannello Esecuzione, con le parole della ricerca, in ogni stato; nessun comando dove manca l'indirizzo. Verifica: test del pannello con righe in errore, completate e senza indirizzo.
- [x] 4.3 L'avviso «N fonti non hanno risposto» apre la linguetta Esecuzione. Verifica: test del clic sull'avviso.
- [x] 4.4 Gruppo separato nel menu «dove cercare» per le biblioteche non interrogabili con indirizzo del sito; la scelta apre il sito con le parole e non cambia l'ambito né avvia ricerche; escluse da «tutte». Verifica: test del menu con apertura del link esterno e ambito invariato. Nome del gruppo confermato dal maintainer.
- [x] 4.5 Documentare la Ricerca come voce autonoma, il collegamento al sito e il gruppo di biblioteche: guida in-app IT/EN, `docs/guides/source-search.md`, `docs/guides/library-discovery.md` e corrispondenti in `docs/en/`. Verifica: `npx vitepress build docs` senza link rotti.

## 5. Analisi

- [x] 5.1 `AnalysisArea` mostra le Statistiche al posto della pagina vuota; rimuovere i testi del segnaposto non più usati. Verifica: test che Analisi apre le Statistiche con periodo e ordine dei riquadri salvati.
- [x] 5.2 Documentare Analisi → Statistiche: guida in-app IT/EN e pagine pubbliche che citano le Statistiche. Verifica: `npx vitepress build docs` senza link rotti.

## 6. Documentazione per sviluppatori e verifica finale

- [x] 6.1 Aggiornare `docs-dev/ARCHITECTURE.md` (posizioni dell'app e navigazione) e, se cambia una regola visiva, `docs-dev/UI_DESIGN_SYSTEM.md`; aggiornare in `docs-dev/ROADMAP_2_0.md` la voce del prossimo intervento. Verifica: nessun riferimento residuo a viste della Dashboard (`grep` su «dashboardLocation», «Panoramica»).
- [x] 6.2 Verifica finale unica: `npm run lint:all`, `npm test`, `npx vitepress build docs`. Prova dal vivo del maintainer su Home, Ricerca, Analisi.

## Workflow follow-up

- Aprire la PR da un ramo creato da `main`; base e unione decise dal maintainer.
- Aggiornare #485, #379 e #210 con quanto consegnato.
- Archiviare la change dopo l'unione, così le specifiche diventano quelle ufficiali.
