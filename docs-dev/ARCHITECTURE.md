# Glossa — riferimento architetturale

Ultimo aggiornamento: 2026-09-13.

## Migrazioni: una volta applicate non si toccano

Il programma confronta l'impronta di ogni migrazione che ha eseguito: se il
file cambia, il database non si apre più e l'unico rimedio è ricostruirlo. Una
correzione a una migrazione già distribuita si scrive quindi in una migrazione
nuova, idempotente sui database che l'hanno già superata.

`src-tauri/migrations.lock` elenca nome e impronta di ogni migrazione; la prova
`migrations_are_frozen` confronta il lucchetto con i file e fallisce sia quando
una migrazione dichiarata è cambiata o sparita, sia quando ne compare una non
dichiarata. Aggiornare il lucchetto è legittimo solo per aggiungere una riga.

## Ricerca federata e Dashboard

Le tre viste vivono nella Dashboard (`DashboardArea`): `overview`, ricerca
federata e ricerca singola/identificativo. Si scelgono dalla barra a sinistra,
come voci sotto la Dashboard (`WorkspaceRailNext`), non da una fila di linguette
dentro la pagina; solo la vista corrente monta, così una ricerca nascosta non
continua a leggere. Contratto di navigazione: la variante `dashboard` di
`AppLocation` porta `view` e `searchId`; la variante `library` porta solo
`itemId` e `workspaceFilter` e non ha più concetto di linguetta. Navigare non
annulla lavori.

Nella ricerca federata le parole cercate stanno nella barra in cima, con avvio,
criteri avanzati, estensione e aggiornamento; gli altri criteri e la scelta
delle fonti sono la terza scheda della colonna di destra, insieme a esecuzione e
storico; l'elenco delle ricerche non è duplicato da una tendina. Il pannello di
esecuzione è una riga per fonte — segno di stato, nome, record ricevuti — che si
apre sui dati completi, i comandi e i tentativi precedenti.
La Dashboard legge patrimonio, oggetti modificati, attenzione e fatti locali in
sezioni indipendenti: una lettura fallita non diventa zero e non cancella le altre.
Ambito workspace esplicito; ricerche e riepilogo lavori restano globali.
Sezioni richiudibili con comandi condivisi; grafico a barre degli stati dei lavori,
non una percentuale di completamento fra operazioni eterogenee.

Il registro delle biblioteche (`iiif::PROVIDERS`) è un record per fonte: rete,
riconoscimento, gestore di ricerca, capacità dichiarate e `site_search`, cioè la
pagina di ricerca della biblioteca sul suo sito con `{query}` dove vanno le
parole. Serve da via d'uscita quando la ricerca interna non basta — quello che
una biblioteca espone a un programma quasi mai è tutto il suo catalogo — e si
apre dalla ricerca singola, dai risultati vuoti, dai risultati di una sola fonte
e dalla scheda di un'opera senza indirizzo proprio. Un solo componente
(`ProviderSiteLink`) per tutti e quattro i punti; l'assenza della pagina è
dichiarata dal record, non decisa dalla schermata.

I comandi sulla pagina vivono nella scheda (`OpenPageSection`), non nella barra
del visore: sono manovre sul deposito come lo scaricamento, e la barra resta per
la lettura. Il visore pubblica verso l'alto la posizione corrente con servizio
immagini e versione del formato, così la scheda costruisce da sé la richiesta a
qualunque misura.

**Di un'opera si tiene una copia a immagini sola, con un file per pagina.** Il
deposito resta strutturalmente capace di più cartelle di misura (`pages/<tag>/`),
ma nessun percorso ne crea più di una:

- riprendere una pagina a un'altra misura la **sovrascrive** nella cartella del
  libro — `keep_viewer_page` non rifiuta più un file già presente — e i pixel
  veri finiscono nella riga di lato, che è l'unica fonte onesta della misura di
  quella pagina;
- riscaricare il libro a un'altra misura sostituisce tutto: la conferma lo
  dichiara prima, e le cartelle vecchie si cancellano **a scaricamento
  riuscito** (`consolidate` in `CopiesSection`), non prima. `consolidate` scatta
  **solo** su un lavoro `download:<versionId>` arrivato a `completed` — non su
  `error`/`cancelled`, che prima cancellavano una copia buona già presente — e
  tiene la misura letta dalla **configurazione di quel lavoro specifico**
  (`sizeTagOfConfig`), non la preferenza corrente: cambiarla mentre il download
  era ancora in corso cancellava altrimenti la copia appena arrivata (17
  settembre);
- la ricompressione (`optimize`) riscrive le pagine **sul posto** a qualità più
  bassa senza toccare i pixel, e non produce più una copia in `derived/`. La
  ripresa non ricomprime due volte: la riga di lato porta
  `Note::Recompressed { quality }`. La promozione usa `std::fs::rename` anche
  quando il file di arrivo esiste già: su Windows lo standard di Rust passa
  `MOVEFILE_REPLACE_EXISTING`, quindi è già sicuro — nessun percorso alternativo
  necessario;
- togliere una pagina la **esclude** (`excluded_pages`, migrazione 0002): lo
  scaricamento la salta con l'esito `Excluded`, contato nell'avanzamento
  (`units.done` include le escluse: un libro con **tutte** le pagine escluse
  arriva al 100% e non fallisce, `finished()` distingue `present == 0` da
  «niente da chiedere perché è tutto escluso»), e chiederla di nuovo la
  riammette **solo a scaricamento riuscito** — prima veniva riammessa subito,
  lasciando la pagina segnata come tornata anche se la richiesta falliva. Un
  errore nel leggere le esclusioni dal database **ferma il lavoro**
  (`excluded_pages` propaga `JobError`): trattarlo come «nessuna esclusione»
  avrebbe riscaricato pagine tolte di proposito. `verify()` e il comando di
  scaricamento contano le escluse fra le pagine complete, con la stessa formula
  della riga di misura (`pages + missing + excluded >= expected`);
- una pagina può avere **più di una misura locale** sul disco — libri di prima
  del modello a copia unica — e `page_local_copies` le restituisce tutte:
  `OpenPageSection` le elenca ognuna con il proprio comando di eliminazione
  (`forget_page` con `sizeTag` esplicito), perché ometterlo cancella **tutte**
  le misure di quella pagina in un colpo solo (semantica del comando, non un
  bug: va passato sempre quando si intende una sola misura);
- la chiave di biblioteca passata ai comandi sulla pagina va **risolta**, non
  letta a caldo da `version.providerKey`: un'opera aggiunta prima che la chiave
  finisse nei metadati non ne ha una lì, e leggerla senza il ripiego su
  `versionProviderKey` (lettura dal deposito) fa leggere/scrivere sotto
  `generic` invece della cartella vera.

Il riallineamento con la biblioteca cancella le correzioni a mano **solo dei
campi che la biblioteca dichiara** in quella lettura: quelli che non dà — e le
note — restano.

La scheda dell'opera è un **template fisso**: tutti i campi di `SOURCE_FIELDS`
sono presenti sempre, vuoti compresi, e ognuno si corregge a mano con la stessa
riga (`SourceFieldRow`), che conserva il valore originale della biblioteca in
`source_field_overrides`. Il tipo di opera è una scelta fra valori fissi perché
i filtri del catalogo vi si appoggiano; i campi a più valori si scrivono su una
riga sola con `MULTI_VALUE_SEPARATOR`, la stessa costante con cui il servizio li
divide e li unisce. I gruppi oltre il primo sono richiudibili e il loro stato
sta in `uiStore.librarySourceGroups`, uno per tutta la Biblioteca.

La stessa regola vale per il riquadro «Biblioteca e catalogo»
(`SourceInfoSection`): biblioteca, identificativo, istituto che conserva,
pagina del libro e scheda di catalogo sono **cinque righe sempre presenti**, con
«—» dove la biblioteca non dà niente. Fino al 16 settembre 2026 le ultime tre
stavano in un blocco richiudibile chiamato «Dati tecnici» che compariva solo se
almeno una era piena: la sezione cambiava forma da una biblioteca all'altra —
esattamente ciò che il template fisso esiste per evitare — e il nome prometteva
più di quello che conteneva.

Dall'indirizzo del manifesto si torna alle pagine pubbliche della biblioteca
(`services/libraryLinks.ts`): scheda dell'opera e visore aperto su una pagina
precisa, oggi per Gallica — che numera le pagine da uno — e Internet Archive —
che conta i fogli da zero. È il percorso inverso del riconoscimento, e vale solo
dove la forma è stata verificata sul servizio vero: un indirizzo costruito per
analogia porta su una pagina che non esiste.

Il comando `read_iiif_manifest_text` restituisce il manifesto così com'è, con la
stessa cortesia di rete del resto e un tetto di 4 MB; `services/manifestSummary.ts`
lo legge nelle due versioni del formato (2: `sequences`/stringhe, 3:
`items`/etichette per lingua) e ne ricava titolo, descrizione, pagine, voci e
diritti. A schermo va quello, non il documento grezzo: il grezzo è a un click,
dal suo indirizzo.

La Biblioteca nazionale scozzese non ha un catalogo interrogabile utile: il suo
portale rifiuta le richieste automatiche, e il servizio del catalogo (Alma SRU)
risponde ma non collega i record alla copia digitalizzata. La ricerca gira
quindi sull'albero pubblico delle raccolte IIIF (`view.nls.uk/collections`),
letto una volta e tenuto in memoria per sei ore. L'Università di Glasgow
pubblica i manifesti (piattaforma Quartex) ma non offre né raccolta IIIF né
ricerca interrogabile: è dichiarata `DirectOnly`.

`federation/` riusa registry, adapter di ricerca, cache, cortesia e JobEngine.
Tabelle nella baseline (`0001_baseline_2_0.sql`): `search_runs`,
`search_executions`, `search_pages`. Una ricerca contiene criteri immutabili e provider; un job
`provider_search` acquisisce una pagina. Creazione ricerca/esecuzioni/job atomica
tramite `submit_transaction`; pagina e checkpoint si salvano nella stessa transazione.
Gli eventi `jobs:updated` invalidano gli snapshot solo dopo il commit.
Il client si sottoscrive prima di leggere; se arriva un evento durante la lettura,
la ripete. Snapshot di ricerca e risultati coerente nella stessa transazione.

Comandi: `create_search`, `list_searches`, `get_search_snapshot`,
`list_search_results`, `relaunch_provider_search`, `export_search_history`.
Pausa/ripresa/annullamento usano la coda esistente. Retry manuale, restart e
continuazione creano nuove generazioni; confronto sulla generazione corrente
impedisce doppi rilanci. I comandi generici non possono creare o ritentare questi
job senza il dominio. Le ricerche accodate/interrotte si recuperano in pausa,
anche se l’autoripresa degli scaricamenti è abilitata. Nessuna esecuzione ad app chiusa.

Solo le parole chiave vengono inviate ai cataloghi. Gli altri criteri sono
post-filtri espliciti sui metadati: assenza/approssimazione resta `unknown`, non
una corrispondenza inventata. Materiale generico «text» non prova manoscritto
o stampato. Un match deve appartenere a una singola occorrenza completa.
Deduplicazione esclusivamente per manifesto identico; le occorrenze originali
restano conservate. Risultati virtualizzati; ordinamento per titolo su snapshot
integrato esplicitamente, distinto dal flusso in ordine di arrivo.

Raccolte escluse dalla selezione iniziale. L’estensione crea una ricerca sorella
con criteri identici e sole raccolte non già incluse. Nessuna importazione nel
catalogo senza azione esplicita. Le prove di consultabilità esistenti restano
limitate alle righe visibili.

Log strutturati `domain=federation`: creazione, avvio, cache, pagina salvata,
recupero, pausa, annullamento, errore e richiesta di rilancio, correlati da
searchId/executionId/provider/page. Mai criteri, URL o chiavi nei nuovi log.
Durata, conteggio e stato cache stanno nei dettagli del job; i fatti semantici
del suo ciclo di vita sono registrati dal motore. Console generale ancora #413.

Copertura di un'esecuzione (record ricevuti, pagine ulteriori) dalle colonne
`received`/`has_more` di `search_pages`, scritte quando la pagina arriva: elencare le ricerche non riapre nessun
payload. Gli eventi ravvicinati del motore si raggruppano in una sola lettura
(250 ms); le pagine di storico già lette non si rileggono a ogni evento, solo
la prima. Ogni comando di ricerca lascia una riga di log con comando, durata ed
esito, senza criteri né indirizzi.

La Biblioteca è tornata un'area unica con il solo catalogo
(`LibraryCatalogArea`): nessuna linguetta. Le colonne
ridimensionabili hanno larghezze minime in pixel: sotto la loro somma la
colonna dei filtri si richiude da sola e si riapre quando lo spazio torna,
mentre una chiusura decisa dall'utente resta. Ogni contenitore intermedio di
un'area porta `min-w-0`: senza, le colonne non possono stringersi e comparivano
barre di scorrimento orizzontali.

Il quadro d'insieme della Dashboard è fatto di cinque riquadri con la stessa
cornice (`DashboardSection`), distribuiti su due colonne: ripresa, ricerche
recenti, attività, attenzione e lavori. Apertura e chiusura di ciascuno vivono
in `uiStore.dashboardSections`, persistito. Il filtro workspace della Dashboard è
stato locale del componente e restringe solo patrimonio, ripresa e attenzione;
lavori e ricerche restano globali.

Backup dati versione 5: oltre alle ricerche, include annotazioni, provider
personalizzati, storico delle operazioni ed elenco degli artefatti. Le colonne
che citano righe assenti (frammento di un registro, lavoro di un artefatto) si
riscrivono a fine ripristino solo quando la riga esiste. Restano fuori i file
del deposito e le chiavi, che vivono nel portachiavi del sistema.

Backup dati versione 4: snapshot atomico delle quattro tabelle correlate,
inclusi soltanto i job di ricerca. Il ripristino richiede ricerche ferme e mette
in pausa quelle non terminali; azzera dipendenze e riferimenti locali dei job.
Pulire lavori terminati non elimina i job referenziati dalle ricerche.
Lo storico si carica 50 ricerche alla volta; risultati delle vecchie esecuzioni
consultabili separatamente. Limiti residui elencati nella roadmap, non impliciti.

Questo documento descrive struttura corrente e invarianti tecniche. Decisioni di
prodotto in `PRODUCT_ARCHITECTURE_2_0.md`; regole visive in
`UI_DESIGN_SYSTEM.md`; lavoro residuo in `ROADMAP_2_0.md`.

## Stack e confini

| Livello | Tecnologia | Responsabilità |
|---|---|---|
| Interfaccia | React 19, TypeScript, Tailwind v4 | viste, interazione, stato locale |
| Stato globale | Zustand | stato condiviso tra viste; nessun dato canonico |
| Bridge | servizi TypeScript + comandi Tauri | validazione e conversione dei contratti |
| Dominio | Rust | rete, file, lavori, backup, LLM |
| Persistenza | SQLite, SQLx/rusqlite | dati canonici e stato dei lavori |

Le viste orchestrano i casi d'uso. La logica che accede a rete, filesystem,
credenziali o database risiede nel backend. I percorsi scelti dall'utente non
attraversano la webview: i dialoghi nativi vengono aperti dal backend.

## Avvio e database

1. `storage_config` risolve la cartella dati e il database.
2. SQLx applica le migrazioni prima della creazione dell'interfaccia.
3. `DbWriteCoordinator` serializza le scritture runtime che passano da moduli
   diversi.
4. Il frontend apre la stessa posizione tramite il plugin SQL per le letture e
   le operazioni già protette dai servizi esistenti.

SQLite usa chiavi esterne, WAL, `synchronous=NORMAL` e un timeout di 10 secondi.
La baseline della beta definisce lo schema completo per i database nuovi. Le
migrazioni applicate non si modificano: ogni cambiamento successivo riceve un
file nuovo.

Eccezione valida durante la beta privata, indipendente dal numero di versione:
senza dati distribuiti a terzi, i cambi di schema di questa fase vengono
consolidati direttamente nella baseline invece di aprire un file di migrazione
incrementale (coerente con «zero legacy» — vedi
`docs-dev/PRODUCT_ARCHITECTURE_2_0.md`).

Un cambio di baseline richiede di ricreare il database locale: si cancella
`glossa.db` con i suoi sidecar WAL/SHM, con backup automatico prima
dell'eliminazione, e si reimportano i progetti da un backup applicativo. Non è
un'autorizzazione a cancellazioni automatiche non annunciate, e non garantisce
che un backup prodotto da una baseline precedente sia importabile: prima di
consolidare si verifica di avere una copia dei dati e la strada per rimetterli
dentro.

**Condizione di uscita:** alla prima distribuzione destinata a utenti esterni la
baseline si fissa e vale di nuovo la regola sopra — ogni cambiamento riceve un
file di migrazione nuovo, la baseline non si tocca più.

## Modello di prodotto

Biblioteca, Trascrizioni, Traduzioni e Analisi sono cataloghi globali. Un
workspace è un contesto operativo, non una copia dei dati.

Esistono due forme di appartenenza:

- traduzioni e trascrizioni hanno una casa unica, indicata sulla loro riga;
- fonti, dizionari e memoria importata possono essere collegati a più workspace
  tramite `workspace_items`.

Le collezioni (`source_collections`, `source_collection_items`) sono etichette
sulle opere: appartenenza multipla, sempre reversibile, nessuna fusione di
schede. Le viste salvate (`library_saved_views`) conservano i filtri come JSON,
riletti in modo difensivo: una vista scritta quando i filtri erano altri resta
valida, i campi che non si riconoscono tornano neutri.

Le correzioni a mano ai dati di un'opera vivono in `source_field_overrides`,
come le correzioni locali ai dizionari: il valore della biblioteca resta intatto
in `sources` e nei metadati della copia, e la lettura del catalogo applica la
correzione restituendo anche l'originale. Correggere con lo stesso valore
dell'originale non lascia una riga di correzione.

Il vincolo su `source_field_overrides.field` accetta tutti i **20 campi
anagrafici** (`SOURCE_FIELDS` in `src/types.ts`), non solo i 5 storici: motore
e database sono generici su ognuno, `getLibrarySourceDetail` li applica tutti
in un solo passaggio (`effectiveFieldValues`/`baseFieldValue` in
`libraryService.ts`). Quali campi abbiano davvero un comando di modifica a
schermo è una scelta separata, oggi limitata a titolo/autore/data/lingua — gli
altri sono in tab Info come sola lettura. I campi che arrivano come più valori
insieme (contributori, diritti, soggetti, provenienza, genere/forma, copertura,
opere collegate) si salvano come testo unico separato da ` · `, la stessa forma
già usata in visualizzazione.

`sources.kind` è solo la **natura fisica dell'originale** (manoscritto/stampa/
altro): il formato del file (IIIF/PDF/pagina web) vive per copia su
`source_versions.version_kind`, non è un fatto anagrafico dell'opera. Il campo
resta semi-libero (ogni biblioteca lo dichiara a modo suo, nessun enum chiuso a
livello di dato) e oggi non ha un comando di modifica a schermo: è un fatto
della biblioteca, non un dato che Niki corregge.

Un'opera della Biblioteca vive in due stati: `active` o `archived`. Archiviare
non tocca il deposito; rimuovere cancella subito la riga e le sue cascate.
Non esiste uno stato di cestino per le fonti: l'archivio copre il ripensamento,
una terza vista sarebbe solo da mantenere. Il catalogo legge tutte le opere in
una volta e nasconde le archiviate nei filtri di vista, non con una seconda
query.

`workspace_items.is_origin` registra dove nasce una risorsa condivisa. Le
correzioni locali ai dizionari vivono in `glossary_entry_overrides`; non
modificano il dizionario degli altri workspace. Archiviare un workspace nasconde
il contesto senza eliminare ciò che contiene. L'eliminazione applica una scelta
esplicita di spostamento o rimozione e non elimina le fonti condivise.

La posizione dell'interfaccia usa `AppLocation`, un'unione tipizzata distinta
dallo stato dei dati. Il workspace attivo non filtra implicitamente i cataloghi
globali. La scheda di un'opera è una posizione, non uno stato di pannello:
`library` con `itemId` apre la pagina dell'opera e conserva il filtro workspace
attivo, così tornare indietro non perde la vista da cui si veniva.

## Stato frontend

| Store | Contenuto globale |
|---|---|
| `uiStore` | posizione, pannelli, preferenze visuali |
| `workspaceStore` | elenco e workspace operativo |
| `projectStore` | progetti e pipeline |
| `pipelineStore` | configurazione ed esecuzione della pipeline |
| `chunksStore` | frammenti, risultati degli stadi, contatore ridondante di consumo (token/costo/durata) per frammento |
| `operationLogStore` | log strutturato delle chiamate ai modelli (in memoria + persistenza) |
| `pricingStore` | override del listino prezzi, usati sia per la stima pre-traduzione sia per congelare il costo reale al momento della scrittura |
| `jobsStore` | snapshot della coda ricevuto dagli eventi backend |
| `sourceLibraryStore` | catalogo e dettaglio delle fonti |
| `libraryStore` | dizionari e ambito di lettura |
| `transcriptionStore` | documento di trascrizione aperto (solo per il breadcrumb dell'header, stesso schema di `sourceLibraryStore.detail`) |

Gli store non duplicano il database. Oggetti e collezioni vengono aggiornati in
modo immutabile. Stato confinato a un componente resta locale.

`sourceLibraryStore.loadDetail` conserva l'identificativo dell'ultima opera
chiesta e scarta le risposte più lente: aprendo A e poi B, la risposta di A
sostituiva il dettaglio di B e l'attesa non finiva più.

**Impostazioni.** `uiStore.settingsTab` ha una sola linguetta per la Biblioteca
(`library`), che al suo interno si divide in tre sotto-linguette — ritmi di
rete, biblioteche, immagini — tenute in stato locale. Le vecchie `download` e
`libraries` non esistono più; la linguetta disattivata «in arrivo» resta solo per
le Trascrizioni. La bozza di un profilo di rete vive nella finestra e non nella
scheda, perché la scheda si smonta cambiando linguetta, e il profilo in modifica
si ritrova dalla bozza al rientro.

## Trascrizioni

Schema in `transcription_documents` → `transcription_segments` →
`transcription_revisions` (baseline #211, non un modulo Rust: nessun comando
backend dedicato, come `translation_revisions`). `transcriptionService.ts`
scrive e legge direttamente via `dbService` (`execute`/`select`), stesso
pattern di `translationRevisionsService.ts`: revisioni append-only,
deduplicate per impronta del contenuto (`content_hash`), un segmento senza
`approved_revision_id` è in bozza, valorizzato è verificato — nessuna colonna
di stato propria.

**Un segmento per pagina, non per documento.** `transcription_segments.position`
è l'indice di pagina del visore (0-based, lo stesso `currentIndex` che
`PageViewer`/`DocumentViewer` tengono già), non un contatore interno: cambiare
pagina nel visore cambia il segmento mostrato. Il segmento nasce solo al primo
salvataggio davvero (`transcriptionService.ensureSegment`) — sfogliare pagine
mai trascritte non lascia righe vuote nella tabella;
`getSegmentByPosition` è la sola lettura, senza crearne uno. La colonna
`source_page_id` resta **non collegata** per ora: quella riga esiste solo dopo
uno scaricamento (`record_pages` in Rust, dentro il lavoro di scaricamento),
mentre il visore mostra pagine anche senza aver mai scaricato nulla — legarsi
a `source_page_id` avrebbe reso la trascrizione dipendente da uno
scaricamento che l'utente potrebbe non voler mai fare. Un documento senza
visore (nato da zero, non da una digitalizzazione) resta su un solo blocco di
testo, in posizione 0 — lo stesso codice, solo che la pagina non cambia mai.

**Studio di trascrizione** (`TranscriptionsCatalogArea` + `TranscriptionStudio`,
#388): stessa convenzione della scheda opera in Biblioteca, non quella dello
Studio di traduzione — `AppLocation` porta `{ area: 'transcriptions',
documentId }`, e l'area stessa decide se mostrare il catalogo o la vista
concentrata, invece di un flag globale come `projectStore.currentProjectId`.

**Intestazione**, quando il documento è legato a un'opera: stessa riga della
scheda opera in Biblioteca (icona, titolo e autore dell'opera, uscita verso
la biblioteca) — non il titolo scelto per la trascrizione, che identifica il
documento nel catalogo e nel breadcrumb ma non qui, per non mostrare due
titoli nella stessa schermata. Letta una volta per opera
(`getLibrarySourceDetail` + `listIIIFProviders`, tenuti in `bookInfo`), non a
ogni cambio pagina. Il menu a tre puntini è **volutamente più povero** di
quello della scheda opera: solo "Rimuovi trascrizione", perché scaricare,
verificare, archiviare sono azioni sull'opera, non sul suo studio di
trascrizione — vivono già nella scheda opera. Un documento senza opera
collegata mostra il proprio titolo, come prima.

**Visore a sinistra** (#221, solo la parte zoom/pan — filtri visuali, preset
e cambio fonte restano aperti): riusa `PageViewer`/`DocumentViewer`, già
scritti per la scheda opera in Biblioteca, invece di un componente nuovo.
`libraryService.getVersionForViewer(sourceVersionId)` legge `source_versions`
per sapere che tipo di copia mostrare (manifest IIIF o documento unico) senza
rileggere l'intera scheda dell'opera. Un documento senza
`source_version_id` — creato da zero, non da una digitalizzazione — mostra un
avviso al posto del visore: non è un caso di errore, è un documento che non
ha mai avuto una pagina da mostrare. `DocumentViewer` ha un `onPageChange`
in più (non serviva finché lo usava solo la scheda opera, che non tiene
niente per pagina): entrambi i visori lo chiamano solo a pagina disegnata
davvero, non alla sola richiesta.

Cambiare pagina con del testo non ancora salvato lo salva subito, prima del
debounce: aspettare l'timer normale lo perderebbe cambiando pagina in fretta.
Un salvataggio ancora in corso quando la pagina cambia di nuovo non scrive il
suo risultato sullo stato della pagina arrivata nel frattempo — confrontato
con un riferimento alla pagina che si sta salvando, non con lo stato letto a
scrittura ultimata.

A destra `InspectorShell` condiviso con lo Studio di traduzione e la scheda
opera, con schede Assistenza (disattivata, in attesa dell'OCR), Storico e
Metadati — quest'ultima mostra i campi grezzi che il segmento porta oggi
(posizione, etichetta, stato, numero di revisioni, `source_page_id`), utile
finché non si decide una presentazione definitiva.

**Cambio fonte immagini/PDF.** Un'opera può avere entrambe le letture; la
copia con cui il documento nasce (`source_version_id`) resta "principale"
per sempre, l'altra — se c'è — è "secondaria". Le due non promettono la
stessa numerazione di pagina, quindi il calcolo in
`transcriptionSync.computeSyncState` (funzione pura, con le sue prove in
`transcriptionSync.test.ts`) decide se restano agganciate:

- sulla principale, sempre agganciate;
- sulla secondaria, solo se dichiarano lo stesso numero di pagine — per le
  immagini è `expectedPages` (già in `LibrarySourceVersion`, nessuna lettura
  in più), per il PDF è `versionInventory(...).document.pages`, il conteggio
  vero letto al momento dello scaricamento;
- un interruttore manuale stacca l'aggancio a prescindere, anche sulla
  principale — utile per curiosare una pagina senza spostare il punto in cui
  si scrive.

Staccati, il visore sfoglia per conto suo (i suoi eventi di cambio pagina
non toccano più `pageIndex`) e il testo si sfoglia con due frecce proprie,
sempre presenti nell'intestazione ma attive solo fuori sincronia — stessa
numerazione di sempre (0..N-1 del documento), comandata da altro. Tornando
in sincronia, il visore riceve un comando di salto
(`requestedIndex`/`requestToken`/`onRequestedIndexHandled`, stessa forma di
`focusQuery`/`focusRequestId` di `MarkdownEditor`) per riallinearsi alla
pagina che il testo sta mostrando. Il comando del cambio fonte vive nella
barra del visore stessa (`ViewerToolbar.extraControls`, proprietà opzionale
e retrocompatibile — nessun effetto sugli usi in Biblioteca).

**Scelta della copia alla creazione**: il documento creato dalla scheda di
un'opera prendeva sempre la copia primaria del catalogo (quasi sempre le
immagini, il PDF non è mai primario). `CreateTranscriptionDialog`, con un
`sourceId` in più, legge ora tutte le copie leggibili dell'opera e — solo se
ce n'è più di una — lascia scegliere da quale iniziare.

**Collegare un'opera creando da zero**: senza `sourceId` (comando "Nuovo
documento" in Trascrizioni) il dialogo mostrava solo il titolo, senza alcun
modo di legare il documento a un'opera dopo — un documento nato così restava
per sempre senza visore. Aggiunta una ricerca per titolo inline
(`listLibraryCatalog()`, filtrata lato finestra: lo stesso catalogo che la
Biblioteca tiene già tutto in memoria), facoltativa; scegliendo un'opera si
comporta come se `sourceId` fosse stato passato dal chiamante.

**Il cambio fonte non deve mai lasciare senza uscita**: se la copia scelta
non si apre (chiave della biblioteca mancante nei metadati della copia,
indirizzo non valido), i comandi del cambio fonte restano visibili anche
sulla schermata di errore — prima sparivano insieme al visore, perché
vivevano solo dentro la sua barra (`extraControls`), e non c'era modo di
tornare indietro. La risoluzione della copia secondaria usa ora
`getVersionForViewer`, la stessa della principale (letta dal deposito, non
dai soli metadati della copia — più affidabile).

**Pagina in caricamento o fallita**: `onPageStatusChange` (già di
`PageViewer`, aggiunto ora anche a `DocumentViewer`) segnala una pagina
richiesta ma non ancora mostrata, o appena fallita — stesso segnale che il
pannello Digitalizzazioni della Biblioteca usa già. Il numero di pagina in
alto segue subito quella richiesta; testo e storico restano quelli della
pagina precedente ma coperti da un velo con rotellina (o triangolo
sull'errore) e disattivati, finché il visore non conferma la nuova pagina.

`InspectorShell` ha due proprietà nuove, opzionali e retrocompatibili
(`headerHeightClassName`, `tabRowHeightClassName`, default gli stessi valori
di sempre): qui impostate a `h-12` per allineare intestazione e barra tab
alla stessa altezza della barra comandi del visore e dell'intestazione del
testo. Applicate anche alla scheda opera in Biblioteca (`LibrarySourcePage`),
approvato l'esito qui — non ancora allo Studio di traduzione.

## Pipeline di traduzione

Il motore frontend coordina:

1. controllo di provider e modelli;
2. salvataggio dello stato;
3. assegnazione dei blob di contesto;
4. esecuzione degli stadi per frammento;
5. giudizio ed eventuale ciclo di riscrittura;
6. controllo di coerenza, quando richiesto;
7. salvataggio finale e registrazione dei fatti.

Ollama usa lo streaming. I provider cloud usano richieste non streaming con
timeout e gestione errori propri. DeepL segue un percorso dedicato.

Ogni prompt mantiene questo ordine:

1. regole statiche comuni;
2. blob di contesto assegnati al frammento;
3. istruzioni dello stadio corrente.

Il prefisso statico deve restare byte-per-byte stabile tra richieste compatibili:
spostare dati dinamici prima dei blob interrompe il prefix caching dei provider.
Gli stadi chiedono risposte strutturate e validano i campi prima di aggiornare lo
stato. Anteprima e registrazione mostrano il prompt effettivo, senza introdurre
una seconda sorgente di verità rispetto ai costruttori usati a runtime.

## Log operazioni e costi

`operation_logs` è un log strutturato per chiamata (traduzione/audit/coerenza),
distinto da `provenance_events` (fatti immutabili a più ampio raggio, vedi
sezione Provenienza). Provider, modello, token, costo e tentativi sono colonne
tipizzate — non un blob JSON libero — per permettere aggregazioni SQL dirette
(costi per modello/provider nel tempo, tasso di errore/retry per fase,
efficacia della cache).

Il costo di ogni chiamata viene calcolato e scritto una sola volta, al momento
in cui la chiamata finisce, con il listino prezzi (`pricingStore`) in vigore in
quel momento. Non va ricalcolato in lettura: un'analisi storica che usasse il
listino attuale per chiamate passate produrrebbe numeri sbagliati.

`translations` porta un contatore ridondante (token/costo/durata totali per
frammento), aggiornato in incremento — mai sovrascritto — nella STESSA
transazione della riga di log corrispondente (`saveOperationLogEntry` accetta
un `chunkUsageBump` opzionale). Le due scritture sono atomiche di proposito:
prima erano indipendenti, e un fallimento silenzioso di una sola delle due
disallineava il numero mostrato in UI dal dettaglio nei log senza nessun
segnale — trovato con una revisione avversariale dopo il primo giro di questo
refactor. L'aggiornamento del contatore avviene anche in memoria (store
`chunksStore`), non solo su disco, perché l'interfaccia lo mostra subito senza
attendere un ricaricamento del progetto.

`operation_logs.chunk_id` referenzia `translations(id)` con `ON DELETE SET
NULL`, non `CASCADE`: il salvataggio dei frammenti esegue di routine una
pulizia dei chunk non più presenti, e un `CASCADE` cancellerebbe con essa
tutta la cronologia log del frammento rimosso. Con `SET NULL` il log resta
disponibile per analisi a livello progetto/modello, perde solo il riferimento
al frammento specifico che non esiste più.

## Jobs: viste e retention

Tre superfici distinte, due nature diverse. Il **System log** è log vero: righe
append-only su file, si filtrano, non si riscrivono dall'interfaccia. Il tab
**Jobs** e il tab **Log traduzione** sono viste su record di dominio (`jobs`,
`operation_logs`): righe di database che cambiano nel tempo, dove «svuota»
significa retention, non filtro di vista.

- `list_active_jobs`: vista operativa del panel — job non terminali più quelli
  conclusi nelle ultime 24 ore. Il panel nasconde in più i job che l'utente ha
  tolto dalla vista (`jobsStore.dismissed`): è stato di sessione, non retention,
  e un job che torna non terminale rientra da solo.
- `list_jobs`: storico completo, filtrato per stato, tipo e testo del messaggio
  e paginato, con il totale. Vive nella colonna destra della Panoramica
  (`JobsHistoryList` dentro `InspectorShell`, larghezza e collasso persistiti in
  `uiStore`); la lettura analitica degli stessi dati (durate, tassi di errore,
  throughput) è materiale dell'area Analisi quando nascerà (#379), non un
  secondo elenco.
- `clear_finished_jobs`: elimina i job terminali, tutti o uno solo.
- `clear_matching_jobs`: elimina i job terminali che soddisfano gli **stessi**
  filtri dell'elenco (`store::JobFilter`, condiviso da elenco, conteggio ed
  eliminazione): «elimina quello che vedo» non può divergere da quello che si
  vede.
- La regola di cancellazione è data-driven — si tenta la `DELETE` e si salta chi
  viola una foreign key — non un elenco di `job_type` scritto a mano, che
  sarebbe rimasto indietro al primo tipo nuovo (traduzione #469, OCR #220). Oggi
  l'unico caso che resiste è il job di ricerca, referenziato da
  `search_executions`: morirà con la sua ricerca quando arriverà
  l'archiviazione delle ricerche.

La Panoramica tiene in `uiStore` anche la disposizione dei riquadri
(`dashboardSectionColumns`: due elenchi, sinistra e destra) e la geometria della
colonna dei lavori (`dashboardJobsWidth`, `dashboardJobsCollapsed`). Il riordino
usa `@dnd-kit/core` e `@dnd-kit/sortable`; un riquadro nuovo nel codice che
l'ordine salvato non conosce compare in fondo alla colonna sinistra invece di
sparire.

La riga di un job è un solo componente (`JobRow`): pannello in basso ed elenco
completo la condividono, e cambia solo cosa fa il comando in coda — togliere la
riga dalla vista nel pannello, eliminarla dal deposito nell'elenco.

Nessuna cancellazione automatica e nessun tetto di righe, come per lo storico
delle operazioni.

## Log tecnico (debug, non i log operazioni)

Distinto da "Log operazioni e costi" sopra: quello è specifico per le chiamate
ai modelli linguistici (costi/token, visibile nel pannello Operazioni), questo
è il log tecnico generico per diagnosticare guasti. Finisce nel file scritto da
`tauri-plugin-log` (cartella log dell'app, rotazione a tre file da 5 MB) e si
consulta dentro Glossa nella scheda **Sistema** del pannello in basso (#413).

La scheda Sistema legge il file, non una seconda coda in memoria: comando
`read_app_log`, che scorre i file dal più recente all'indietro e applica alla
lettura livelli, testo cercato, prefissi di target e salto delle righe già
mostrate. Le righe delle dipendenze (`sqlx`, `keyring`, `hyper`, `reqwest`) sono
l'87% del file e restano fuori finché non si chiedono. Le origini del programma
(`federation`, `glossa_lib::*`, `webview`) si raggruppano in quattro aree lato
interfaccia (`src/components/console/logAreas.ts`): Biblioteca, Traduzione,
Lavori, Interfaccia. «Svuota la vista» agisce solo su ciò che è a schermo: il
file non si riscrive mai dall'interfaccia.

I messaggi del frontend arrivano nello stesso file solo da quando `log:default`
sta fra i permessi in `capabilities/default.json`: senza quel permesso le
chiamate del `logger` venivano rifiutate e restavano nella sola console del
browser.

- **Frontend**: `logger` in `src/utils/logger.ts` (`debug/info/warn/error`).
  `errorMessage(error)` legge il messaggio da un errore intercettato in un
  `catch` — stesso schema già in uso a mano in gran parte dell'app
  (`error instanceof Error ? error.message : String(error)`), incluso il caso
  dei comandi Tauri, che rifiutano con una stringa nuda, non un `Error`.
- **Backend**: crate `log` (`log::info!/warn!/error!`), stessa convenzione.
- **Convenzione**: il motivo tecnico vero va sempre in log, mai a schermo; il
  messaggio a schermo resta un testo tradotto fisso e generico, uguale per
  ogni causa tecnica (es. la ricerca in Biblioteca: qualunque libreria fallisca
  e qualunque sia lo stadio — richiesta, risposta, lettura — l'utente vede
  sempre lo stesso `dashboard.discovery.searchFailed`, il log riceve libreria,
  stadio e l'errore vero).

## Backend Rust

| Modulo | Responsabilità |
|---|---|
| `llm/` | prompt, provider, schema strutturato, streaming e cancellazione |
| `iiif/` | registry delle biblioteche, discovery, profili di rete e cortesia |
| `download/` | manifesto, calcolo misura, pagine, inventario e progresso |
| `httpcache/` | cache delle risposte remote e delle immagini mostrate |
| `vault/` | layout, validazione, verifica e cancellazione del deposito |
| `optimize/` | riduzione locale delle pagine già scaricate |
| `jobs/` | coda persistente e limiti per classe di risorsa |
| `provenance.rs` | eventi, revisioni e metriche derivate |
| `backup.rs` | backup completo del database e ripristino |
| `documents/` | import ed export dei documenti |
| `vector/` | ricerca vettoriale e memoria di frasi |
| `images.rs` | trasformazioni pure JPEG/PNG |

## Lavori persistenti

Un lavoro dichiara tipo, classe di risorsa e strategia di ripresa. Gli stati
sono `queued`, `running`, `pausing`, `paused`, `cancelling`, `cancelled`,
`completed` ed `error`.

Invarianti:

- gli stati terminali non accettano aggiornamenti tardivi;
- pausa e annullamento prevalgono su un nuovo tentativo;
- riaprire l'app non riavvia automaticamente un lavoro, salvo gli scaricamenti
  quando l'impostazione dedicata è attiva;
- il progresso viene pubblicato al massimo una volta al secondo;
- i limiti sono distinti per rete, CPU, disco, servizi linguistici e documenti;
- ogni avvio ed esito produce un evento di provenienza.

I lavori di scaricamento e ottimizzazione identificano la digitalizzazione nel
campo di configurazione. Operazioni che cancellano le sue pagine interrogano il
backend immediatamente prima di agire e vengono rifiutate se uno di questi lavori
è ancora attivo.

**Un lavoro per digitalizzazione, con la configurazione della richiesta corrente.**
Lo scaricamento usa l'identificativo `download:<versione>`, l'ottimizzazione
`optimize:<versione>:<misura>`: non se ne aprono due sullo stesso libro. Un
lavoro già in elenco viene quindi ritrovato, e qui la configurazione conta:

- se non è terminale e la misura chiesta è la stessa, si restituisce il lavoro in
  corso;
- se non è terminale e la misura chiesta è diversa, il comando **fallisce** con
  `download_in_progress:<misura in corso>`, che l'interfaccia traduce in un
  avviso leggibile;
- se è terminale, si usa `relaunch_with_config`, che riscrive la configurazione
  prima di rimettere in coda e azzera progresso e tentativi.

`relaunch_with_config` esiste perché `retry` riparte dalla configurazione
salvata: chiedere 3000 dopo aver scaricato a 2000 rilanciava il vecchio 2000
senza dirlo, e il comando sembrava non fare niente. Lo stesso vale per
l'ottimizzazione, dove un tentativo fallito lasciava la sua riga in elenco e la
nuova messa in coda urtava contro l'identificativo già in uso. Controllo e cancellazione mantengono lo stesso coordinamento
delle scritture usato dalla messa in coda, evitando nuove partenze nel mezzo
dell'operazione.

## Ricerca nelle biblioteche

Ogni risultato conserva **tutto** quello che la biblioteca ha risposto. I dati
con un significato stabile hanno un campo proprio in `DiscoveryResult`; il resto
va in `raw: BTreeMap<String, Vec<String>>`, con la chiave così come la nomina la
biblioteca e i valori sempre in elenco perché molti campi si ripetono. È un
deposito, non una struttura su cui costruire logica: quando un dato serve
davvero gli si dà un campo suo. `raw` viaggia fino a `source_versions.metadata`
quando l'opera entra in Biblioteca; risincronizzare dal manifesto **non** lo
sovrascrive, perché il manifesto non è una risposta di catalogo.

**Gallica** dichiara il numero di immagini dentro `dc:format`, in chiaro
(«Nombre total de vues : 588»), verificato coincidere con il servizio di
paginazione ufficiale. Misurato su 135 schede reali: 105 lo dichiarano, e i
manoscritti non lo dichiarano mai — per loro `dc:format` porta la descrizione
fisica, dove un numero di fogli non è un numero di vedute. Dello stesso blocco
si leggono ora anche i soggetti e `srw:extraRecordData`, da cui vengono
miniatura e collegamento **dichiarati** invece di quelli indovinati dall'ARK: per
i periodici il collegamento vero finisce in `/date`.

**Internet Archive** accetta `fl[]=*` e restituisce ogni campo indicizzato.
Misurato a regime su venti risultati: i venti campi di prima costavano 0,68 s e
12,6 KB, tutti costano 0,86 s e 43 KB. Si preferisce +0,24 s una volta per
ricerca a una richiesta per opera il giorno in cui serve un dato che non avevamo
chiesto.

Vaticana ed e-codices si leggono raschiando la pagina web: non c'è una risposta
strutturata da conservare, e `raw` resta vuoto.

## Scaricamento IIIF

Il flusso di una digitalizzazione è:

1. leggere o acquisire il manifesto;
2. determinare la regola di dimensionamento una volta per libro;
3. per ogni pagina, scegliere la misura dal manifesto e dalle capacità IIIF;
4. rispettare il profilo di rete dell'host;
5. validare il file in transito;
6. promuoverlo atomicamente nel deposito;
7. aggiornare file laterale, miniatura e progresso.

La misura richiesta è il dimezzamento dichiarato più vicino al tetto, sopra o
sotto. Se la misura viene rifiutata, la pagina a piena risoluzione viene
conservata senza ricompressione. Un errore di rete non diventa una pagina “non
servita”; solo i rifiuti definitivi 404/410 producono quella nota.

Il disco è la fonte di verità per le pagine. Ogni cartella
`pages/<misura>/` contiene `pages.jsonl`, dove l'ultima riga per indice registra
etichetta, dimensioni, byte, impronta e note. Un file senza riga resta valido ma
ha impronta ignota, quindi la verifica completa non lo dichiara corrotto.

Lo schema distingue tre livelli: copia digitale,
pagina logica e rappresentazione file. La pagina conserva posizione, etichetta
e canvas IIIF; il file conserva URL o percorso relativo, formato, dimensioni,
impronta, risoluzione e provenienza. Il file laterale resta l'inventario
operativo del disco; l'indice non sostituisce la verifica del deposito.

Manifest e PDF appartengono alla copia; immagini, miniature e derivati possono
appartenere a una pagina. La disponibilità complessiva resta sulla copia.
Trascrizioni e annotazioni future puntano alla pagina logica, non al file.

La riga di pagina logica (`source_pages`) è l'unica eccezione al principio
"nessuna riga per file": registra solo l'identità della pagina (ordine,
etichetta, canvas), letta dal manifesto a ogni lavoro di scaricamento e scritta
in modo idempotente (id derivato da copia e posizione). Non registra file: la
rappresentazione fisica resta solo su disco e nel file laterale, com'è per
tutto il resto del deposito. Riscaricare o ottimizzare una pagina non tocca
questa riga.

`getLibrarySourceDetail` espone ora anche `description` (colonna `sources`,
scritta all'aggiunta ma prima mai riletta), `pageUrl` e `providerKey` (nel
blob `metadata` di `source_versions`, stesso trattamento già in uso per
`catalogUrl`/`holdingInstitution`/ecc.): nessuna nuova colonna, solo campi
già scritti e non ancora selezionati/tipizzati sul lato di lettura.

Layout:

```text
<deposito>/
  .glossa-vault
  providers/<biblioteca>/<versione>/
    manifest.json
    document.pdf
    document.json
    pages/<misura>/0001.jpg
    pages/<misura>/pages.jsonl
    thumbnails/0001.jpg
  derived/<biblioteca>/<versione>/<misura>/
    0001.jpg
    pages.jsonl
  staging/<lavoro>/
```

Il deposito usa percorsi relativi e componenti convalidati. File parziali non
entrano nelle cartelle definitive.

`derived/` (2 settembre 2026) contiene le copie ricavate in locale
dall'ottimizzazione: stessa forma di `providers/.../pages/`, ma **mai** dentro
`providers/`, apposta — "libera spazio" cancella solo `pages/`, e una copia
compressa deve poter sopravvivere alla cancellazione dell'originale da cui è
nata (o viceversa). Il lavoro di ottimizzazione (`optimize::ImageOptimizationJob`)
legge una cartella di misura già scaricata e ne scrive una **nuova** sotto
`derived/`, mai in-place: la fonte non cambia mai. La "misura principale"
(`VersionInventory::principal`, usata per dire se un libro è completo) sceglie
sempre una cartella scaricata davvero quando ce n'è una, anche a parità di
pagine con una copia derivata — altrimenti un pareggio alfabetico
mostrerebbe come "scaricata" una copia che non lo è mai stata. Solo se
l'originale è stato liberato e resta solo la copia, quella diventa principale.
`vault::commands::free_version_size` libera **una sola** cartella di misura
(scaricata o derivata); `delete_version_files` (rimozione dell'opera) e lo
spazzino delle cartelle orfane coprono ora anche `derived/`.

### Il documento unico (#462, 16 settembre 2026)

Una digitalizzazione di tipo `pdf` è **una copia a sé**, non una misura della
copia a immagini: `document.pdf` sta nella cartella della versione, accanto a
`manifest.json` e a `pages/`, e se ne va solo con il proprio comando.
`document.json` tiene quello che il file di sistema non dice — indirizzo di
origine, byte, pagine contate, impronta, momento dell'arrivo — e vive accanto al
file invece che nel database, così cancellare la cartella non lascia righe che
parlano di un file che non c'è più.

Catena: `download::pdf::enqueue_pdf_download` (comando) mette in coda
`source_pdf_download`, gestito da `download::pdf::PdfDownloadJob` con la stessa
cortesia per host dello scaricamento a immagini. Il ciclo tiene il posto in
corsia per tutto il trasferimento — è una richiesta sola e lunga — scrive in
`staging/<versione>/`, valida con `integrity::FileKind::Pdf` (firma `%PDF-`,
`%%EOF` nella coda), sposta atomicamente e solo allora scrive la scheda.
`Recovery::Restart`: mezzo documento non serve a niente, e riprendere significa
rifare. La guardia `has_active_version_work` conosce anche questo tipo, così
eliminare file mentre arrivano resta impossibile.

Le pagine si contano dal file con `lopdf` (`count_pages`), a documento appena
promosso e fuori dal filo del runtime. Un documento protetto, malformato o oltre
i 512 MB resta senza conteggio: `pages: None`, dichiarato come tale
nell'interfaccia. **Quello che la biblioteca dichiara non vince mai** sul
conteggio del file, e la differenza non produce avvisi a schermo (decisione del
16 settembre 2026).

`VersionInventory` porta ora `document: Option<DocumentCopy>` letto dal disco;
`inventoryBytes` lo somma allo spazio della copia. `free_version_document`
cancella file e scheda e nient'altro. La verifica del deposito
(`vault::verification`) include il documento fra i file registrati, con
l'impronta della scheda.

**Da dove nasce la copia PDF.** Il manifesto della biblioteca dichiara le
rappresentazioni alternative dell'opera in `rendering` (stesso nome in
Presentation 2.1 e 3, cambia solo `@id`/`id` e la forma dell'etichetta).
`download::manifest` le legge in `Manifest::renderings`; `Rendering::is_pdf`
decide sul tipo dichiarato e, quando manca, sull'estensione dell'indirizzo.
Solo il `rendering` **di manifesto** conta: uno dichiarato su un canvas riguarda
quella pagina, e confonderli farebbe passare per «il libro in PDF» il PDF di una
carta sola.

Attenzione alla **posizione** del `rendering`: in Presentation 2.1 quasi nessuna
biblioteca lo dichiara sulla radice — sta sulla sequenza, che in quella versione
è l'oggetto «libro intero» (Wellcome, e-codices). Leggere solo la radice le
perdeva tutte, ed è il motivo per cui la prima versione non trovava mai un PDF.
Gallica non dichiara nessun `rendering`: lì lo stato è «non disponibile», e
resta tale finché non lo dichiara, perché indovinare l'indirizzo del PDF è
esattamente quello che questo modulo non fa.

`iiif::discovery::inspect_manifest` (che ha sostituito `probe_manifest`) fa un
GET con tetto di 2 MB e restituisce `ManifestFacts`: `openable`, `pages`,
`sample_pixels` (i pixel del primo canvas) e `document`. Una lettura sola
risponde alle tre domande che prima erano due richieste e una assenza. Oltre il
tetto resta `openable: Some(true)` con il resto ignoto. `facts_of` è la parte
senza rete, ed è dove stanno le prove.

**Nessuna attesa senza scadenza (16 settembre 2026).** Era il difetto peggiore
di questa catena, e si vedeva: una verifica partiva e non finiva più, e dietro
di lei si accodava tutto quello che riguardava quella biblioteca — aggiunta di
opere compresa. Due cause, entrambe corrette:

- `Gate::wait_in` aspettava il turno con `stop = || false`, cioè per sempre. Il
  raffreddamento di una biblioteca dura minuti (Gallica ne chiede dieci dopo un
  rifiuto). Adesso l'attesa ha una scadenza — `WATCHED_DEADLINE` 20 s per quello
  che l'utente sta guardando, `BACKGROUND_DEADLINE` 8 s per i controlli di
  sfondo — e chi non ottiene il turno **rinuncia**: `inspect_manifest` risponde
  «non verificato» invece di bussare senza turno.
- `Courtesy::take_seat` faceva `acquire_owned().await` senza mai riguardare i
  segnali: un posto tenuto da una richiesta lunga metteva in fila tutti, e
  nemmeno una pausa o un annullamento li liberava. Adesso il posto si aspetta a
  fette di `POLL_SLICE`, controllando fra una e l'altra se chi aspetta ha
  smesso. Vale anche per i lavori di scaricamento, che prima non rispondevano a
  «pausa» finché non ottenevano il posto.

Nella finestra la lettura passa da `useManifestFacts`, che ne fa **una per
biblioteca e manifesto per sessione**, condivisa fra le righe e con al massimo
due richieste insieme; `readManifestFacts` è la stessa cosa fuori da un
componente, con `fresh` per «rileggi davvero». Le righe di ricerca la usano solo
quando entrano nello schermo, e mai per un risultato che il catalogo dichiara
già senza riproduzione. Tre invarianti, e sono tutta la robustezza di quel file:
ogni richiesta finisce (scadenza di 35 s come rete di sicurezza sopra quelle del
motore), il posto in coda si rilascia una volta sola, e **solo una risposta
verificata si ricorda** — un guasto non marchia un'opera per tutta la sessione.

L'aggiunta di un'opera **non aspetta** la verifica: la lettura del manifesto
parte per conto suo e il catalogo si rilegge quando arriva. Aspettarla
significava tenere fermo un comando riuscito dietro a una fila di rete.

La copia si registra con `registerDeclaredDocument`: una riga `source_versions`
con `version_kind = 'pdf'`, l'indirizzo del documento e la chiave della
biblioteca nei metadati. La chiama l'aggiunta dalla ricerca, il riallineamento
(`resyncSource`) e il comando «chiedi alla biblioteca» nella scheda. È
idempotente sull'indirizzo, quindi ripeterla non crea doppioni. Finché la
biblioteca non dichiara niente, la riga del PDF resta con il suo stato («non
disponibile», «disponibilità non verificata»): un'assenza va detta, non taciuta.
Lo stesso vale nei risultati di ricerca, dove lo stato è sempre una delle tre
parole, mai il silenzio.

**Dove sta il PDF nell'interfaccia.** Non è una voce dell'elenco delle copie: è
una riga dentro la sezione del libro della copia a immagini (`DocumentBlock`
dentro `CopiesSection`), sotto le misure locali, perché è lì che si sceglie se
visualizzare le immagini o il PDF. La scelta arriva al visore con
`onShowVersion`, che cambia la copia selezionata in `LibrarySourcePage`; i
comandi di visualizzazione delle misure fanno la stessa cosa al contrario.

Rimozione dell'opera: `delete_source_files` cancella le cartelle di **tutte** le
copie del lavoro (le legge da `source_versions`), perché `delete_version_files`
sulla sola copia di catalogo lasciava il documento sul disco fino al passaggio
dello spazzino delle cartelle orfane.

Lettura: `document_bytes` serve i byte grezzi (`tauri::ipc::Response`) con un
tetto di 256 MB, `open_document_externally` apre il file con il lettore del
sistema. Nella finestra, `DocumentViewer` disegna la pagina con pdf.js e la
mostra con OpenSeadragon, riusando `ViewerToolbar` — estratta da `PageViewer`
in questo giro, con le parti solo-immagini (miniature, solo-locale, uscita verso
la pagina della biblioteca) rese facoltative. Il percorso del deposito non
arriva mai alla finestra: si compone nel motore da chiave e identificativo,
entrambi convalidati come componenti di percorso.

**Pagine disegnate vuote, con i byte corretti** (si aprivano bene col lettore
del sistema): pdf.js decodifica JPEG2000/JBIG2 — compressioni frequenti nelle
scansioni — solo con moduli WASM dedicati (OpenJPEG, JBIG2); senza l'opzione
`wasmUrl` non li cerca nemmeno, cade su un ripiego JS che qui non risolve, e
la pagina non ha niente da disegnare. Console del browser: errore di
inizializzazione del decoder OpenJPEG. Fix: `wasmUrl: '/pdfjs/'` in
`pdfjs.getDocument()`, con i tre file `.wasm` copiati in `public/pdfjs/`
invece che importati con `?url` — quel percorso li comprimerebbe ognuno con
un nome diverso, mentre pdf.js li cerca con nomi esatti in una sola cartella.
La build di rilascio ha bisogno in più di `'wasm-unsafe-eval'` nel
`script-src` della CSP (`tauri.release.conf.json`), perché l'istanziazione
WASM lo richiede e quella build non ha la `'unsafe-eval'` più ampia della
build di sviluppo.

(Prima ipotesi, scartata dal test dal vivo: `page.cleanup()` dopo ogni
disegno, in conflitto con la doppia chiamata di `StrictMode` in sviluppo. La
rimozione non risolveva niente — la pagina restava bianca anche fuori
sviluppo — perché non era la causa.)

### Riconoscimento e ricerca per biblioteca

Il riconoscimento (`iiif/resolvers/`) porta segnatura, identificativo o
indirizzo al manifesto senza toccare la rete, e dichiara quanto è sicuro:
`Strong` quando la forma è inequivocabile, `Weak` quando somiglia a un testo di
ricerca. Le biblioteche `SearchFirst` usano solo i riconoscimenti sicuri, e il
riconoscimento incerto resta come ultima risorsa quando la ricerca non trova
niente.

La ricerca (`iiif/search/`, un file per biblioteca) è per biblioteca: Gallica
dal suo servizio SRU, Vaticana ed e-codices dalle loro pagine di ricerca. Gli indirizzi dei servizi
sono un valore iniettabile, così le prove li puntano a un server finto. Il
riferimento di comportamento è Scriptoria
(`resolvers/{vatican,gallica,ecodices}.py` e i rispettivi `search/`), adattato:
niente librerie di regex né di parsing HTML.

### Se un risultato si apre davvero

Un catalogo elenca anche materiale che non ha una riproduzione. `DiscoveryResult`
porta `openable: Option<bool>` con tre stati non intercambiabili: `None` è «non
controllato», `Some(true)` è un manifesto letto, `Some(false)` si scrive **solo**
quando la biblioteca risponde 404 o 410. Qualunque altro esito — 429, 503, rete
caduta, JSON illeggibile — è `ManifestFailure::Unknown` e lascia il valore
com'era: un servizio fermo riguarda oggi, non l'opera.

L'arricchimento dei risultati (`iiif/discovery/manifest.rs`) registra l'esito
gratis, perché il manifesto lo apre comunque per prendere copertina, titolo e
autore mancanti. Per i risultati già completi il manifesto non si apre, quindi
resta `None`: lì interviene il comando `probe_manifest`, una richiesta HEAD in
corsia `Lane::Thumbnail` tramite `Gate::wait_aside`, che non ruba mai il posto
alla pagina che l'utente sta guardando.

Il frontend lo chiede solo per le righe entrate nello schermo, due alla volta,
senza ritentare, e tiene gli esiti per tutta la sessione. Un esito negativo
**segna la riga, non la nasconde**: la scheda bibliografica resta un dato vero.

## Risultati delle prove di rete

Questi valori derivano da prove reali svolte nell'agosto 2026 e dal confronto
con Scriptoria di settembre 2026:

- un 403 sui servizi misurati indica spesso eccesso di richieste; viene
  ritentato con raffreddamento condiviso per host;
- attesa esponenziale: base 20 secondi, massimo 300 secondi;
- `info.json` ha impiegato circa 4,3 secondi nei casi misurati e può fallire su
  una singola pagina;
- una misura generata sul momento ha richiesto 26,6 secondi contro 2,3 secondi
  per una misura già pronta;
- alcuni file troncati dichiarano comunque la dimensione HTTP attesa, quindi la
  validazione deve controllare il formato;
- il preriscaldamento tramite pagina del lettore dichiarato per la Biblioteca
  Vaticana non è ancora stato verificato.

### Cortesia: due classi, un solo tetto

**Non esiste pausa fra due richieste riuscite.** È la scelta verificata nel
client HTTP di Scriptoria: i freni sono la concorrenza per host, la finestra a
raffica e il raffreddamento dopo un rifiuto. Una pausa per richiesta si
moltiplicava per ogni tassello del visore e rendeva illeggibile una pagina che
il servizio serviva in un secondo.

Tre classi, un solo tetto. `Lane::Page` è la pagina che si sta guardando,
`Lane::Thumbnail` sono le miniature del rail e le copertine, `Lane::Bulk` è uno
scaricamento. Tutte passano dallo **stesso** semaforo per host
(`host_concurrency`); chi non è la pagina prende prima un permesso di
`behind_the_page = host_concurrency - 1`, e gli scaricamenti anche uno di
`bulk_workers = workers_per_job.clamp(1, host_concurrency.max(2) - 1)`.

Ne segue l'invariante: **la pagina aperta ha sempre un posto**. Due miniature
che occupavano gli unici due posti di una biblioteca severa lasciavano la pagina
ad aspettare finché non scadeva. I permessi si prendono sempre nello stesso
ordine — `bulk_seats`, `behind_the_page`, `seats` — così due richieste non
possono tenersi a vicenda quello che serve all'altra.

La finestra a raffica e il raffreddamento valgono per tutte e tre.

Tentativi e scadenze per classe: pagina un tentativo a 90 secondi, miniatura un
tentativo a 20 secondi, scaricamento tre tentativi con la scadenza del profilo.
Una miniatura che tiene un posto per un minuto e mezzo rallenta tutto il resto e
in cambio riempie un riquadro.

I profili predefiniti si riscrivono dal registro quando cambia
`BUILTIN_PROFILES_VERSION`; i profili creati dall'utente non vengono toccati.

## Cache remota

La cache contiene materiale riproducibile: copertine, immagini remote e
risultati di ricerca. Vive nella cartella dati, non nel deposito, non entra nei
backup e può essere eliminata senza perdita.

La chiave deriva dalla richiesta canonica. Ogni valore ha un file di metadati;
una voce incompleta non viene servita. I risultati di ricerca scadono, le
immagini sono regolate dal limite complessivo. L'accesso aggiorna la data del
file, usata per eliminare prima le voci meno recenti.

### Prima quello che è sul computer

Ogni immagine di una pagina — pagina grande, miniatura del rail, copertina
dell'elenco — si chiede con **una sola forma**: `CacheRequest::Page` con numero
di pagina, misura e l'indirizzo remoto come ripiego. `size` è il lato lungo in
pixel oppure `thumb`. L'ordine è fisso:

1. il file nel deposito a quella misura (`thumb` guarda la cartella
   `thumbnails/`, che «libera spazio» non cancella);
2. la cache;
3. una copia più grande nel deposito. **Per una pagina si serve com'è**: se la
   pagina esiste sul computer a una misura migliore di quella chiesta, è quella
   che si vede, e non entra in cache (sarebbero byte di un file già sul disco,
   registrati sotto la chiave di un'altra misura). Per `thumb` la riduzione
   resta e finisce in cache — è anche il modo in cui nasce la miniatura di un
   libro scaricato prima che le miniature esistessero;
4. `remote_url`, con la cortesia del profilo della biblioteca.

**La misura scelta nelle impostazioni dice cosa chiedere alla biblioteca, non
come mostrare quello che si possiede.** Fra due copie locali vince sempre la
migliore, senza preferenze da salvare per opera: è la regola decisa il
9 settembre 2026 al posto dell'apertura preferita persistita.

**La provenienza a schermo: due parole, tre pallini.** La scritta dice solo se
il file è dell'utente («File locale») o no («File online»); il colore del
pallino dice quale dei tre rami della scala ha risposto — neutro deposito,
giallo cache, verde biblioteca. Il pallino **non** dipende più da un orologio:
l'indicatore vecchio si accendeva solo entro 30 s dall'ultima risposta, e
`lastAnswerAt` conta le risposte di *qualunque* provenienza, quindi su un libro
tutto online restava spento quasi sempre. La misura nel suggerimento è il lato
lungo dell'immagine aperta letto da OpenSeadragon, non la misura chiesta: da
quando una copia locale più grande viene servita com'è, le due divergono.

**Leggere solo i file locali** non è un ramo nuovo di questa scala: il visore
omette `remote_url` dalla richiesta, quindi il punto 4 non esiste e il motore
risponde che la pagina non è disponibile in locale. La scelta vale per il libro
aperto e non viene salvata.

L'indirizzo remoto **non** entra nella chiave di cache: dice dove andarla a
prendere, non quale immagine è. Un deposito irraggiungibile vale come «qui non
c'è niente», non come errore: la pagina si chiede alla biblioteca invece di
lasciare il visore vuoto.

**Una richiesta per volta per la stessa risorsa**, su entrambi i lati. Due
richieste identiche che si sovrappongono mancano entrambe la cache — la prima
non ha ancora finito di scriverla — e vanno entrambe a disturbare la
biblioteca. Succede di continuo: il rail rimonta una riga, si torna su una
pagina già vista, e in sviluppo React fa partire ogni effetto due volte. Chi
arriva secondo aspetta: nel motore su un turno per chiave (`one_at_a_time`),
nella finestra su una mappa delle promesse ancora aperte.

### Il visore

Il manifesto lo legge il motore in un passaggio solo (`iiif_viewer_manifest`):
portarlo alla finestra per rimandarlo indietro da leggere lo trasformava due
volte in un elenco di numeri, e su un libro di ottocento pagine era buona parte
dell'attesa all'apertura.

**Libro sul computer** → pagine lette dal deposito, senza rete. È il
comportamento di Scriptoria, che per un libro locale toglie del tutto il
riferimento al servizio della biblioteca. Per un libro scaricato a metà la
pagina mancante si chiede alla biblioteca **alla misura della cartella**, non a
una misura fissa: altrimenti finirebbe in cache sotto un nome che promette una
risoluzione che non ha.

**Ogni pagina si apre con una sola richiesta**, l'immagine intera, locale o
remota. Lo zoom a tasselli chiede una quindicina di immagini per schermata, e
ognuna attraversa il motore e occupa un posto in corsia: dove le immagini
vengono ricavate al momento — Internet Archive, Gallica — quella schermata non
arrivava mai.

La prima immagine **non aspetta `info.json`**. Se il servizio immagini include
già `sizes` nel manifesto, il parser le porta fino al visore e si usa la più
piccola misura pronta il cui lato lungo basta; se nessuna basta, la maggiore.
Quando `sizes` non è nel manifesto, si usa subito il dimezzamento calcolato
dalle dimensioni del canvas; senza dimensioni resta il tetto fisso. La stessa
scelta costruisce le miniature prive di un indirizzo esplicito. `info.json`
viene chiesto solo passando allo zoom a tasselli: aggiungerlo prima della pagina
pagherebbe fino a 4,3 secondi per scoprire una misura che spesso il
dimezzamento individua già.

**I tasselli si chiedono solo quando servono davvero**, cioè quando lo zoom
supera i pixel dell'immagine intera (`TILE_UPGRADE_FACTOR`, 1,2). Allora il
visore riapre la stessa pagina con la sorgente a tasselli, rimettendo dov'era la
posizione. Se i tasselli non arrivano, l'immagine intera resta a schermo.

**Il tetto dello zoom è nostro, non di OpenSeadragon.** Il valore predefinito
della libreria, `maxZoomPixelRatio: 1.1`, è **più basso** di
`TILE_UPGRADE_FACTOR`: la soglia dei tasselli era quindi irraggiungibile, e la
nitidezza vera non arrivava mai. Sui libri letti dal disco lo stesso tetto
lasciava uno zoom quasi inesistente, perché lì l'immagine è quella che è stata
scaricata e non c'è nessuna piramide dietro. Ora `MAX_MAGNIFICATION` vale 6:
ingrandire oltre i pixel sgrana, ma su una scansione serve, e chi legge in rete
supera intanto la soglia e riceve il dettaglio vero. Un libro locale a bassa
risoluzione resta sgranato: passare ai tasselli remoti per una pagina locale
poco definita è la scelta per pagina del Blocco 2, non una regolazione.

Un tassello perso non dichiara guasta una pagina che si vede già.

Per la miniatura di una pagina non posseduta si usa **quella dichiarata dal
manifesto**: è già pronta sul server della biblioteca, mentre ordinare una
misura piccola al servizio immagini la fa ricavare al momento e su Internet
Archive costa quanto la pagina intera.

La virtualizzazione smonta le righe fuori schermo. Copertine e miniature usano
lo stesso piccolo deposito di indirizzi locali, limitato alle 128 immagini usate
più di recente: tornando al catalogo o riaprendo un libro ricompaiono senza
decodifica e senza nuovo passaggio dal motore. Le richieste residue non più
visibili vengono tolte dalla coda, così non precedono la pagina aperta.

Le pagine grandi non restano duplicate nella memoria della finestra: tornando
su una pagina, `CacheRequest::Page` usa la stessa chiave stabile e `resolve`
legge i byte dalla cache **prima** di considerare la rete. L'indirizzo remoto
non partecipa alla chiave. Questo evita un secondo download senza trattenere in
RAM tutte le pagine visitate.

### Biblioteche che ricavano l'immagine su richiesta

`buildsImagesOnDemand` (oggi solo `archive_org`) cambia tre comportamenti del
visore, tutti misurati il 4 settembre 2026 su un libro di 308 pagine:

- **l'indice si richiede una seconda volta.** Il primo tentativo fa partire la
  costruzione e scade a 60 secondi con un errore del loro gateway; il secondo
  trova il lavoro fatto e risponde in 1,3 s. Altrove non si ritenta:
  raddoppierebbe l'attesa di un indirizzo davvero rotto.
- **la pagina si chiede in più forme, in fila** (`wholePageAttempts`: `max`, poi
  il dimezzamento, poi la larghezza nativa in numero). Il guasto è **per coppia
  pagina+misura** e deterministico: la stessa richiesta ripetuta identica
  fallisce ancora (due volte su due), mentre la stessa pagina a un'altra misura
  arriva in circa 3 secondi. Vale in tutte le direzioni — la pagina 21 fallisce
  a 1312 e arriva a piena risoluzione, la 42 fallisce a piena risoluzione e
  arriva chiedendo `2623,`. Non è la misura a essere sbagliata: è un loro
  derivato guasto, e cambiare forma lo aggira. Fuori da queste biblioteche si
  tenta una volta sola: un secondo tentativo raddoppierebbe l'attesa di un
  guasto vero senza aggirare niente. La misura del deposito non ammette
  ripieghi, o i byte finirebbero in cache sotto un nome che promette una
  risoluzione che non hanno. Le miniature restano piccole: alla misura che
  chiediamo rispondono sempre, sotto il secondo.
- **il messaggio sull'attesa lunga si mostra solo qui.** Prima compariva dopo
  otto secondi con qualunque biblioteca, spiegando un comportamento che altrove
  non esiste.

### L'indice di un libro scaricato si legge dal disco

`iiif_viewer_manifest` accetta anche `version_id` e, quando c'è insieme alla
biblioteca, prova prima il manifesto conservato nel deposito — quello che
«libera spazio» non cancella. Cercandolo solo in rete, un libro tutto sul disco
non si apriva a computer scollegato se la memoria di lavoro era stata svuotata,
pur avendo ogni pagina presente. Un deposito assente, un file mancante o un
manifesto illeggibile non sono un errore da mostrare: si prosegue dalla rete.

### Provenienza di una pagina

`resolve` sa già da dove ha preso i byte (`Source::Vault | Cache | Network`), ma
i byte tornano alla finestra grezzi: non c'è un posto dove infilare anche
questo. La cache ricorda quindi la provenienza **per chiave**, per le ultime 64
immagini (`note_source` / `source_of`), e il comando `image_source` la
restituisce. Chi ha appena ricevuto una pagina la chiede subito dopo: è una
lettura in memoria, non tocca né disco né rete, e riguarda la stessa chiave,
quindi non può raccontare la provenienza di un'altra immagine.

Il visore mostra tre stati distinti — **File locale**, **Memoria temporanea**,
**Biblioteca online** — con la misura chiesta nel suggerimento. Il verde acceso
vale solo per la biblioteca. Se il libro risultava locale e la pagina è invece
arrivata dalla rete, il visore rilegge l'inventario: qualcuno ha cancellato
quella copia mentre si leggeva, e le pagine successive non devono continuare a
essere chieste come se il libro fosse ancora tutto in casa.

### Le pagine mancanti entrano nel deposito da sole

Quando una pagina arriva dalla rete e quell'opera ha **già** una cartella per la
misura chiesta, i byte vanno nel deposito invece che nella memoria di lavoro
(`keep_in_vault`): sfogliando un libro scaricato a metà, i buchi si riempiono
senza che nessuno lanci uno scaricamento. Vale solo a colpo sicuro — pagina
intera chiesta per numero, cartella della misura già esistente, file non ancora
presente — e riusa la catena dello scaricamento (transito, validazione,
spostamento atomico, riga nell'inventario laterale con impronta e dimensioni),
ricavando anche la miniatura. Se qualcosa non riesce, la pagina si vede comunque
e finisce in cache come prima.

Il comando **Scarica questa pagina** usa `keep_viewer_page`: prende gli stessi
byte già aperti dal visore, li convalida e li promuove atomicamente nel
deposito, aggiungendo impronta e miniatura. Se un lavoro sulla stessa
digitalizzazione è attivo, il comando si ferma invece di scrivere sullo stesso
file in concorrenza.

La misura è quindi **quella con cui la pagina è arrivata**, non il tetto delle
impostazioni: il comando non fa una seconda richiesta, e su un libro non ancora
scaricato la misura mostrata nasce dal formato pronto più vicino alla larghezza
leggibile. Il suggerimento del comando la dichiara, in entrambi gli stati, così
non nasce una versione locale a una misura non scelta. La scelta esplicita della
misura per la singola pagina resta nella #459.

Il comando ha tre stati, non due: da prendere, in corso (icona che gira) e già
in casa — quest'ultimo è uno stato con il proprio colore, non un pulsante
disabilitato, perché disabilitato non distingue «non si può» da «è già fatto».
L'esito si applica alla pagina a schermo solo se è ancora quella: si confronta
digitalizzazione, indice e misura, perché la promessa può risolversi dopo un
cambio pagina. A pagina conservata il visore avvisa chi lo ospita
(`onPageKept`), e la scheda delle digitalizzazioni rilegge il deposito: non
esiste un lavoro in coda al cui termine aggiornarsi.

### Quale versione locale legge il visore

`preferredLocalSize` dice al visore quale cartella di misura preferire; se quella
misura non ha pagine si torna alla più fornita, che è il comportamento di
sempre. Il visore dichiara a sua volta la misura che sta davvero leggendo
(`onLocalSizeChange`): la scheda dell'opera segna quella riga come «in lettura»
senza indovinarla, anche quando di versioni locali ce n'è una sola. Scelta
dell'utente e versione letta restano due dati distinti — la prima scende al
visore, la seconda risale da lui.

### Il conteggio delle pagine attese

`iiif_viewer_manifest` registra `expected_asset_count` sulla digitalizzazione,
non solo lo scaricamento del libro: il manifesto è la stessa fonte in entrambi i
casi, e prima chi conservava una pagina sola dal visore lasciava in piedi il
conteggio dichiarato dalla ricerca — a volte uno — con la scheda che diceva
«1 di 1 · completa» su un manoscritto intero. La scrittura passa dal
coordinatore delle scritture e non tocca la riga quando il valore coincide. La
finestra, informata dal visore del totale del manifesto, rilegge la scheda una
volta sola per digitalizzazione.

### Rimozione di un'opera e cache dei byte

Togliere un'opera dalla biblioteca esegue `delete_version_files` (manifesto,
miniature, pagine e copie ricavate spariscono dal deposito) e poi `DELETE FROM
sources`, con cascata sulle righe collegate, e infine `forget_version_cache`.

Quest'ultimo è **l'unico caso in cui una voce di cache se ne va prima del
tempo**: tutto il resto sono pixel di libri storici, che non cambiano. Senza di
esso lo spazio non si liberava come l'utente si aspetta, e riaggiungendo la
stessa opera le pagine tornavano dalla cache senza che la biblioteca venisse
ricontattata. La chiave è un'impronta e non si può interrogare per opera: si
guarda la richiesta registrata nel file di lato di ogni voce (`CacheMeta.request`
contiene il `version_id` per le richieste `Page`). Costa una camminata sulla
cache, che per un'azione fatta a mano una volta va benissimo. Le voci `Remote` —
manifesto, copertine chieste per indirizzo — non portano il `version_id` e
restano: escono per sfratto.

## Ottimizzazione locale

L'ottimizzazione è un lavoro CPU avviato **dalla riga della versione locale**
nella scheda della fonte: la fonte è quella riga, non una scelta dentro il
pannello — nell'intestazione della sezione non si capiva su quale versione si
stesse agendo. Legge una cartella di misura e ne **produce una nuova**
(`derived/<chiave>/<versione>/<misura>/`), senza toccare l'originale; le due
convivono, ognuna con il proprio comando per cancellare solo lei e per leggerla
nel visore. Una copia già ricavata non si ricomprime: il motore la rifiuta, e
l'interfaccia non offre il comando su quelle righe.

L'inventario del deposito è **la sola fonte di verità** per le versioni locali:
la scheda lo rilegge sempre dal motore, e non usa la fotografia che la riga di
catalogo porta dall'apertura della Biblioteca — con quella, una versione ridotta
appena creata non compariva. Un lavoro di scaricamento o ottimizzazione arrivato
a termine fa rileggere le cartelle da sé.

La stima usa gli stessi parametri e la stessa codifica del lavoro, quindi conta
solo le pagine che liberano davvero spazio. Le dimensioni originarie registrate
nel file laterale sopravvivono a passaggi successivi. Pagine non leggibili o non
riscrivibili vengono contate nel dettaglio e lasciano il lavoro in errore, senza
annullare le pagine già completate.

## Verifica del deposito

La verifica rapida controlla la presenza. Quella completa convalida il formato e
confronta le impronte disponibili. Entrambe percorrono il deposito; non usano un
inventario duplicato nel database.

Una cartella di digitalizzazione sconosciuta al database è orfana. Se l'elenco
delle versioni note è vuoto, la verifica non classifica l'intero deposito come
orfano. La cancellazione degli orfani ricalcola la situazione al momento del
comando.

## Provenienza

`provenance_events` è append-only e conserva fatti relativi a lavori, chiamate
ai modelli, approvazioni, spostamenti e rigenerazioni. Gli eventi registrano
workspace, modello, token, costo, durata, lingue, impronte ed esito quando
pertinenti.

Le revisioni di traduzione e trascrizione sono immutabili. Approvare o ritirare
produce un evento; il puntatore sulla traduzione o sul segmento indica la
revisione corrente. Le metriche calcolate vivono in `derived_metrics` con
versione dell'algoritmo e impronte degli input.

## Backup

Il backup riguarda l'intera applicazione e contiene il database, non le immagini
del deposito. L'archivio compresso include versione, dimensione e impronta del
contenuto. Il ripristino conserva le pagine presenti, avvia una verifica del
deposito e propone solo gli scaricamenti mancanti.

Le chiavi dei provider restano nel portachiavi di sistema. Il backup offre un
formato solo Glossa, dichiarato come offuscamento, e un formato cifrato con
password. Ogni backup cifrato genera un codice di recupero casuale equivalente
alla password: è mostrato una sola volta, non viene conservato da Glossa e può
aprire lo stesso archivio. I backup precedenti non sono supportati.

## Sicurezza

- la CSP della build distribuita non consente script inline o `eval`;
- le risorse remote passano dal backend e dalla cache;
- componenti di percorso provenienti da dati esterni vengono convalidati;
- le API key non vengono salvate nel database o nei backup;
- i log non contengono prompt o risposte, ma possono contenere provider,
  modelli e tempi;
- `RUST_LOG=debug` o `trace` aumenta i metadati esposti nei log di supporto.

## Verifica

- Frontend: Vitest e Testing Library.
- Backend: test Rust, inclusi servizi HTTP simulati.
- E2E: smoke test Chromium sul primo avvio e sul flusso progetto.
- CI: TypeScript/ESLint, test frontend, E2E, `cargo check`, `cargo fmt`,
  `cargo clippy -D warnings`, test Rust e audit dipendenze.
