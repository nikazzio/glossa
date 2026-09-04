# Glossa — riferimento architetturale

Ultimo aggiornamento: 2026-09-04.

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
La baseline 2.0/1.5 definisce lo schema completo per i database nuovi. Le
migrazioni applicate non si modificano: ogni cambiamento successivo riceve un
file nuovo.

Eccezione valida solo fino al rilascio 1.0: senza dati reali distribuiti, i
cambi di schema di questa fase vengono consolidati direttamente nella baseline
invece di aprire un file di migrazione incrementale (coerente con "zero
legacy" di questa fase — vedi `docs-dev/PRODUCT_ARCHITECTURE_2_0.md`). Un
cambio di baseline richiede di ricreare il database locale (si cancella
`glossa.db` e i suoi sidecar WAL/SHM, con backup automatico prima
dell'eliminazione) e di reimportare i progetti da un backup applicativo. Dal
rilascio 1.0 in avanti vale di nuovo la regola sopra: ogni cambiamento riceve
un file di migrazione nuovo, la baseline non si tocca più.

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

## Log tecnico (debug, non i log operazioni)

Distinto da "Log operazioni e costi" sopra: quello è specifico per le chiamate
ai modelli linguistici (costi/token, visibile nel pannello Operazioni), questo
è il log tecnico generico per diagnosticare guasti — non ha ancora una vista
in-app (finisce nel log di sistema/OS via `tauri-plugin-log`; unificarlo in
una console generale consultabile è #413, non ancora fatto).

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

### Riconoscimento e ricerca per biblioteca

Il riconoscimento (`iiif/resolvers.rs`) porta segnatura, identificativo o
indirizzo al manifesto senza toccare la rete, e dichiara quanto è sicuro:
`Strong` quando la forma è inequivocabile, `Weak` quando somiglia a un testo di
ricerca. Le biblioteche `SearchFirst` usano solo i riconoscimenti sicuri, e il
riconoscimento incerto resta come ultima risorsa quando la ricerca non trova
niente.

La ricerca (`iiif/search.rs`) è per biblioteca: Gallica dal suo servizio SRU,
Vaticana ed e-codices dalle loro pagine di ricerca. Gli indirizzi dei servizi
sono un valore iniettabile, così le prove li puntano a un server finto. Il
riferimento di comportamento è Scriptoria
(`resolvers/{vatican,gallica,ecodices}.py` e i rispettivi `search/`), adattato:
niente librerie di regex né di parsing HTML.

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
3. una copia più grande nel deposito, rimpicciolita sul momento e messa in
   cache — è anche il modo in cui nasce la miniatura di un libro scaricato
   prima che le miniature esistessero;
4. `remote_url`, con la cortesia del profilo della biblioteca.

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
