# Proposal

## Why

Oggi l'app si apre su una voce «Dashboard» che raccoglie tre viste diverse (Panoramica, Statistiche, Ricerca), mentre l'area Analisi è una pagina vuota. La ricerca nelle biblioteche, che è lo strumento per orientarsi fra le fonti, resta nascosta dentro la Dashboard; il collegamento al sito della biblioteca compare solo in due casi, e cinque biblioteche che Glossa non sa interrogare non compaiono affatto.

Le biblioteche rispondono male alle ricerche fatte da programmi esterni: la ricerca in Glossa deve quindi aiutare a orientarsi e portare subito al sito della biblioteca quando non basta. Origine: #485 (prossimo intervento concordato), #379 (Statistiche sotto Analisi), #210 (shell 2.0).

## What Changes

- La voce «Dashboard» diventa **Home**: l'app si apre lì e la Home è sempre raggiungibile dalla barra di sinistra. Le sue sotto-voci (Panoramica, Statistiche, Ricerca) spariscono.
- La Home conserva tutto il contenuto dell'attuale Panoramica (filtro per workspace, aggiorna, numeri del materiale, «Questo mese», riquadri A che punto sei, Riprendi, Richiede attenzione, In corso, colonna dei job), con in più una **casella di ricerca in cima**. Il titolo «Patrimonio» diventa «Il tuo materiale».
- Il riquadro «Ricerche» esce dalla Home: lo stesso elenco resta nella pagina Ricerca, linguetta Storico.
- La casella di ricerca della Home apre la pagina Ricerca con i risultati già presenti.
- **Ricerca** diventa una voce autonoma della barra, subito sotto Home, fuori dalle aree.
- Nella pagina Ricerca, il pannello Esecuzione mostra **in ogni riga** il collegamento «Cerca sul sito della biblioteca» con le parole cercate, anche quando la biblioteca non ha risposto. L'avviso «N fonti non hanno risposto» porta a quelle righe.
- Le biblioteche che Glossa non sa interrogare (oggi Heidelberg, Harvard, e-rara, e-manuscripta, Glasgow) compaiono nel menu «dove cercare» in un gruppo a parte; sceglierne una apre il suo sito con le parole scritte.
- **Analisi** ha sotto la voce **Statistiche**; cliccare Analisi apre le Statistiche. Le Statistiche restano identiche, con i loro filtri.
- Il collegamento di «Questo mese» porta ad Analisi → Statistiche; i collegamenti che oggi aprono una ricerca (colonna dei job, Storico) o la Dashboard (titolo in alto nella finestra) puntano ai posti nuovi.

Fuori dal perimetro: operatori e filtri avanzati della ricerca (#468), ricerca nel testo (#487), viste Esplora, Confronta e Dataset di Analisi (#379), ripensamento del collasso della barra (#485 C).

Scelte aperte da confermare con il maintainer durante il lavoro: il nome definitivo del gruppo di biblioteche nel menu «dove cercare» (proposta: «Solo sul sito della biblioteca»), il testo e la posizione esatta della casella di ricerca nella Home.

## Capabilities

### New Capabilities
- `navigation`: struttura della barra di sinistra, schermata di apertura e destinazione dei collegamenti fra le sezioni.
- `home`: contenuto della Home e suo punto di accesso alla ricerca.
- `search`: ricerca nelle biblioteche, scelta delle biblioteche, stato per biblioteca e uscita verso il sito della biblioteca.
- `analysis`: area Analisi e sua vista Statistiche.

### Modified Capabilities

Nessuna: non esistono ancora specifiche.

## Impact

- Interfaccia: barra di sinistra, Home (oggi Panoramica), pagina Ricerca, area Analisi; collegamenti nella colonna dei job e nell'intestazione della finestra.
- Navigazione interna: le posizioni dell'app che oggi indicano le viste della Dashboard vanno ridefinite (Home, Ricerca, Analisi con Statistiche); vanno gestite le posizioni salvate o riaperte che puntano alle vecchie viste.
- Nessun cambio di database, di comandi del backend o di dipendenze. L'elenco delle biblioteche non interrogabili esiste già con il loro indirizzo di ricerca.
- Documentazione: guida in-app, documentazione pubblica IT/EN, documentazione per sviluppatori (architettura, design system se cambia una regola visiva).
