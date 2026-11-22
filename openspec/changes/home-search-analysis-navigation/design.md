# Design

## Context

La posizione corrente dell'app è un valore tipizzato (`AppLocation` in `src/navigation/appLocation.ts`). Oggi la Dashboard è `{ area: 'dashboard'; view?: 'search' | 'stats'; searchId? }`: la stessa area mostra Panoramica, Statistiche o Ricerca (`DashboardArea`). Da questa forma dipendono la barra (`WorkspaceRailNext`, con `DashboardViews`), l'intestazione (`Header`, breadcrumb e clic sul titolo), la barra di stato (`AppStatusBar`), la chiave di animazione in `App.tsx`, la colonna dei job (`JobRow`) e la pagina Ricerca stessa (`FederatedSearchArea`).

`location` non è persistita fra un avvio e l'altro: all'avvio vale `dashboardLocation()`. È persistito invece l'ordine dei riquadri della Home (`dashboardSectionColumns`, che contiene `searches`); `DashboardBoard` scarta già gli id che non corrispondono a un riquadro presente.

L'area Analisi (`AnalysisArea`) è un segnaposto vuoto. Le biblioteche hanno `supportsSearch` e `siteSearch` nel catalogo dei provider del backend (`src-tauri/src/iiif/mod.rs`); `ProviderSiteLink`/`providerSiteUrl` costruiscono già l'indirizzo con o senza parole e aprono il sito tramite il gestore dei link esterni.

## Goals / Non-Goals

**Goals:**
- Una posizione distinta per Home, Ricerca e Analisi → Statistiche, così barra, intestazione e barra di stato derivano lo stato attivo senza casi speciali.
- Riusare i componenti esistenti (Panoramica, pagina Ricerca, Statistiche, collegamento al sito) spostandoli, non riscrivendoli.

**Non-Goals:**
- Nessun cambio al backend, al database o al catalogo dei provider.
- Nessuna nuova vista di Analisi oltre alle Statistiche.

## Decisions

**1. Tre posizioni al posto delle viste della Dashboard.** `AppLocation` diventa:
`{ area: 'home' }`, `{ area: 'search'; searchId?; query? }`, `{ area: 'analysis'; view?: 'stats'; workspaceFilter? }` (con `view` assente = Statistiche), e scompaiono `DashboardView` e `dashboardLocation`. Alternativa scartata: tenere `area: 'dashboard'` con le viste e cambiare solo la barra; lascerebbe Ricerca e Statistiche «dentro» la Home in intestazione, barra di stato e chiavi di animazione, contraddicendo la nuova struttura. Il compilatore TypeScript segnala ogni punto che usa ancora la forma vecchia, quindi nessun collegamento resta indietro.

**2. Analisi resta un'area globale**, con `view` opzionale per le viste future (Esplora, Confronta). `AnalysisArea` mostra `StatsDashboard`. Le Statistiche tengono il loro filtro per workspace interno, come oggi; il `workspaceFilter` della posizione resta inutilizzato come oggi. Alternativa scartata: collegare i due filtri, fuori perimetro.

**3. Barra di sinistra.** In cima due voci singole, Home e Ricerca, fuori da `AreaSection`. Il componente delle sotto-voci (oggi `DashboardViews`) viene riusato sotto la voce Analisi con la sola voce Statistiche; Analisi e Statistiche risultano entrambe attive come oggi Dashboard e la sua vista.

**4. Casella della Home.** La Home ha un campo di testo in cima che, alla conferma, naviga a `{ area: 'search', query }`. La pagina Ricerca, ricevendo `query`, la mette nella casella e la tratta come un invio dell'utente con l'ambito predefinito («tutte»): parole → ricerca avviata; indirizzo o identificativo → solo riconoscimento, con la proposta di apertura già esistente. Dopo l'uso, `query` viene tolta dalla posizione (sostituendola con `searchId` della ricerca creata) così tornare sulla pagina non rilancia la ricerca. Alternativa scartata: avviare la ricerca dalla Home e poi navigare; duplicherebbe la logica di invio che oggi vive nella pagina Ricerca.

**5. Collegamento al sito nel pannello Esecuzione.** `SearchExecutionPanel` riceve le parole della ricerca e mostra `ProviderSiteLink` in ogni riga. Il componente già non mostra nulla quando manca `siteSearch`. L'avviso «N fonti non hanno risposto» diventa un comando che apre la linguetta Esecuzione (oggi è solo un suggerimento al passaggio del mouse).

**6. Biblioteche solo sul sito nel menu «dove cercare».** `SearchScopeSelect` aggiunge un gruppo con i provider `kind === 'library'`, `!supportsSearch`, `siteSearch` non vuoto (esclude così «Direct IIIF URL»). Scegliere una di queste voci apre `providerSiteUrl(siteSearch, parole)` con il gestore dei link esterni e lascia invariato l'ambito selezionato. Alternativa scartata: un elenco separato fuori dal menu; il maintainer ha scelto il menu.

**7. Riquadro Ricerche.** Si toglie dalla Home e dal valore predefinito di `dashboardSectionColumns`. Gli ordini salvati che contengono ancora `searches` sono già gestiti da `DashboardBoard`; basta un test che lo fissi. Le chiavi dei testi e i nomi interni restano `dashboard*` dove non si vedono, per non toccare dati persistiti.

## Risks / Trade-offs

- [Collegamenti dimenticati verso le viste vecchie] → la rimozione di `DashboardView` e `dashboardLocation` rende ogni uso un errore di compilazione; elenco noto: barra, intestazione, barra di stato, `App.tsx`, `JobRow`, Panoramica, pagina Ricerca.
- [`query` nella posizione rilancia la ricerca a ogni ritorno] → si sostituisce con `searchId` appena la ricerca è creata; test dedicato.
- [Il menu «dove cercare» mescola voci che cercano e voci che aprono un sito] → gruppo separato con titolo esplicito e icona di link esterno; il nome del gruppo si conferma con il maintainer.
- [Indirizzo di Heidelberg senza segnaposto per le parole] → si apre la pagina di partenza del sito; comportamento già previsto da `providerSiteUrl`.

## Migration Plan

Nessuna migrazione di dati: la posizione non è persistita e gli ordini dei riquadri salvati restano validi. Il ritorno indietro coincide con il revert della PR.

## Open Questions

- Testo segnaposto della casella della Home e nome inglese di «Il tuo materiale»: si decidono con il maintainer durante l'implementazione, senza effetti su specifiche o compiti.
