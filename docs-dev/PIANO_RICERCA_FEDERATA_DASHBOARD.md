# Ricerca federata e Dashboard operativa

Piano unico di implementazione · aggiornato il 12 settembre 2026.

Questo documento descrive funzionalità da implementare. Integra le decisioni
sui job per provider, il monitor delle ricerche, i risultati progressivi e la
Dashboard. Non occorrono documenti integrativi.

La base esaminata era `feat/library-providers-verify`, commit `4c1919c`,
con modifiche locali in corso alla ricerca singola. Prima di implementare,
rileggere i contratti attuali: il lavoro sui provider prosegue indipendentemente.
Non sovrascrivere parser, capacità o firme aggiornate usando questo snapshot.

Decisioni vincolanti: ogni invio crea una ricerca persistita e un job per
provider selezionato; più ricerche possono restare attive; i risultati arrivano
progressivamente; avviare B non cancella A; si può controllare e rilanciare un
solo provider. Riutilizzare la coda lavori e le primitive UI esistenti.

## 1. Risultato di prodotto

Tre destinazioni con responsabilità riconoscibili:

| Destinazione | Domanda a cui risponde |
| --- | --- |
| Dashboard | Dove ero arrivato? Cosa richiede attenzione? Cosa sta lavorando? |
| Biblioteca → Cerca nelle biblioteche | Quali fonti esistono nei cataloghi esterni? |
| Biblioteca → Catalogo personale | Quali fonti ho raccolto e quali pagine possiedo? |

La ricerca vive in una pagina completa della Biblioteca, raggiungibile anche
dal comando Cerca della Dashboard. Catalogo e ricerca mantengono stato separato.
La ricerca singola è la stessa pagina con una sola biblioteca selezionata.
Non creare due motori, due schede risultato o due procedure di aggiunta.

La Dashboard è globale per impostazione iniziale. Un suo filtro workspace
esplicito restringe i riepiloghi senza cambiare il workspace operativo. La
ricerca esterna resta globale: il workspace è una destinazione di aggiunta,
non un filtro dei cataloghi remoti.

## 2. Base effettivamente osservata

| Codice attuale | Conseguenza per il piano |
| --- | --- |
| `src/components/dashboard/AppDashboard.tsx` | La ricerca occupa la colonna principale; Riprendi, Attenzione e attività esistono già a lato. Redistribuire responsabilità, non rifare tutto. |
| `src/components/dashboard/SourceDiscoveryPanel.tsx` | Riutilizzare risultati, anteprima, aggiunta al catalogo/workspace e riconoscimento delle fonti già presenti. File attualmente in modifica. |
| `src/stores/discoverySearchStore.ts` | Conserva una ricerca singola in memoria fra navigazioni. Evolvere verso sessione federata, senza duplicare lo stato. |
| `src/services/iiifProviderService.ts` | Espone `listIIIFProviders` e `discoverIIIF(providerKey,input,page,fresh)`. Contratto singolo da preservare finché usato. |
| `src-tauri/src/iiif/mod.rs` | Registro con `supports_search`, risoluzione diretta, strategia e filtri dichiarati. È la fonte delle capacità; niente elenco parallelo in React. |
| `src-tauri/src/iiif/discovery.rs` | Risultati normalizzati, metadati, provenienza provider, `has_more`, `cached_at`; non contiene ancora un contratto federato completo. |
| `src/navigation/appLocation.ts` | Posizione tipizzata; workspace operativo e filtro sono già distinti. |
| `src/services/projectService.ts` | Query per progetti recenti, run, riepiloghi e attenzione già presenti; prevalentemente globali e centrate sulla traduzione. |
| `src/stores/jobsStore.ts` | Snapshot/eventi e classificazione lavori esistenti. Riutilizzarli anche nella Dashboard. |

Attenzione a due definizioni attuali: il conteggio di attenzione conta righe di
traduzione, non necessariamente singoli problemi; i progetti recenti sono
ordinati per modifica, non per ultima apertura. Non rinominare queste misure
senza cambiare anche il dato che le sostiene.

### Scriptoria: riferimento consultato

Checkout locale: `/home/niki/workspace/personal/scriptoria`.

- `src/universal_iiif_core/discovery/contracts.py`: esito normalizzato per provider.
- `src/universal_iiif_core/discovery/orchestrator.py`: dispatch dal registro,
  distinzione ricerca/risoluzione diretta, passaggio filtri.
- `src/universal_iiif_core/discovery/search_adapters.py`: adattamento di query,
  dimensione pagina e filtri alle singole implementazioni.

Adottare questi confini; adattare contratti e concorrenza a Rust/Tauri.
Le parti lette coordinano un provider selezionato: non sono prova di una
federazione completa pronta da copiare. La UI resta quella di Glossa.
Durante il lavoro sui singoli adapter, consultare i relativi moduli e fixture
di Scriptoria, verificando separatamente le capacità reali delle biblioteche.

## 3. Modello della ricerca e superfici UI

### Ricerca, esecuzione e risultato

| Livello | Esempio | Responsabilità |
| --- | --- | --- |
| Ricerca | «Erbario · manoscritti · 1500–1600» | Snapshot immutabile dei criteri, provider, riepilogo e risultati |
| Esecuzione provider | «Gallica nella ricerca Erbario» | Job indipendente, avanzamento, errori, pagine e comandi |
| Risultato | Scheda di un manoscritto | Provenienza dalla ricerca e dal provider, azioni bibliografiche |

Una ricerca è un contenitore persistito e osservabile, non un job padre che
occupa un worker in attesa dei figli. Ogni provider ha il suo job nel sistema
esistente. Non usare `dependsOnJobId` per rappresentare appartenenza: indica
una dipendenza di esecuzione e renderebbe seriale ciò che deve essere concorrente.

Tutti i job vengono accodati subito; il motore li avvia entro i limiti globali
e di cortesia delle biblioteche. Asincrono non significa senza limiti.

### Pagina ricerca: risultati al centro, monitor a destra

La colonna destra usa due schede: **Criteri** e **Esecuzione**. Prima dell'invio
si vede Criteri; dopo l'invio Esecuzione mostra i provider. La scheda attiva
ha etichetta visibile, secondo il design system. L'utente può tornare ai criteri
senza cambiare lo snapshot della ricerca in corso: modificare e inviare crea
una nuova ricerca, non riconfigura job già avviati.

```text
Cerca nelle biblioteche                   [Elenco ricerche] [Nuova]
Erbario · manoscritti · 1500–1600
In corso · 3/5 provider terminati · 48 risultati ricevuti
──────────────────────────────────────────────────────────────────
Risultati                                 │ Esecuzione
32 verificati · 16 non verificabili        │ Gallica       In corso
[Biblioteca: tutte v] [Ordine v]           │ 22 record · pagina 2
                                          │              [Pausa][Ferma]
[copertina] Titolo                         │ Vaticana      Completata
Autore · anno · biblioteca                 │ 18 record     [Ripeti]
Gallica · questa ricerca                   │ Archive       Fallita
[Dettaglio] [Aggiungi]                     │ 8 parziali    [Riprova]
                                          │ e-codices     In attesa
...                                       │ ...
──────────────────────────────────────────│ Statistiche
8 nuovi risultati disponibili [Mostra]     │ Ricevuti 48 · distinti 45
                                          │ Visibili 32 · esclusi 13
```

Parole tra parentesi quadre: descrizioni dei controlli, non pulsanti testuali
da introdurre. Riutilizzare `IconButton`, `TabStrip`/`InspectorShell`,
`StatRow`, `StatBlock`, `Select`, `Menu` e pannelli esistenti.
Su finestra stretta il monitor si apre nello stesso dialog dei criteri,
con le stesse schede; riepilogo compatto sempre visibile sopra i risultati.

### Elenco ricerche: tutte quelle lanciate

Destinazione interna alla ricerca, raggiungibile da un comando con conteggio
di ricerche attive. Elenco a righe: titolo/query, orario, stato, provider
terminati/selezionati, risultati distinti, errori e comando per aprire.
Filtri: Tutte, In corso, Con errori, Terminate; ordinamento per avvio recente.

L'espansione di una riga mostra i job provider con gli stessi controlli della
pagina risultati. Riusare una sola componente per queste righe. Da qualunque
ricerca si torna all'elenco senza interrompere nulla. La selezione della
ricerca visualizzata è distinta dalle ricerche attive nel motore.

### Pannello lavori e Dashboard

Nel pannello lavori esistente aggiungere il filtro per tipo Ricerca e
raggruppare i job per ricerca; una riga provider apre la ricerca e il relativo
filtro risultati. L'indicatore globale resta unico.

La Dashboard mostra «Ricerche: 2 in corso, 1 con errori» e poche ricerche
recenti, con accesso al monitor. Non incorpora l'intero elenco dei risultati.
Non duplicare logiche di stato o retry fra Dashboard, monitor e pannello lavori.

### Layout e interazioni

- Titolo grande editoriale; la destinazione attiva è scritta accanto alle icone.
- Risultati in elenco come vista iniziale: confronto di autore, data e origine
  prima delle copertine. Nessun mosaico come requisito della prima versione.
- Colonna destra ridimensionabile e richiudibile, sul modello dei filtri del
  catalogo, con schede Criteri ed Esecuzione. Campi e selezione provider sono
  sezioni della scheda Criteri.
- Su finestra stretta: pannello criteri in `Dialog`, con gli stessi campi e
  la stessa bozza. Una sola istanza accessibile; non duplicare form nascosti.
- Breakpoint proposto sullo spazio disponibile della vista: sotto circa 900 px
  usare dialog; sopra, pannello di circa 320 px con risultati flessibili.
  Verificare la misura nel layout reale con rail aperto, zoom 200% e testi lunghi.
- Invio dal form avvia; digitare non scatena richieste a molte biblioteche.
- Modifiche ai criteri sono una bozza. Risultati vecchi restano visibili con
  «Criteri modificati: esegui la ricerca». Una nuova esecuzione fissa uno snapshot.
- Nessuna selezione provider: comando disabilitato con motivo. Tutti i campi
  vuoti: chiedere almeno un criterio. Ricerca con soli campi strutturati ammessa
  solo per provider che la supportano, senza inventare una query universale.
- Aprire un dettaglio espande una sola riga, senza spostare il focus. Riprendere
  dal catalogo conserva query, risultati, espansione e posizione di scorrimento.
- Copertine caricate tramite il ponte/cache esistente, solo vicino alla viewport.
  L'errore della miniatura non rende inutilizzabile la scheda.

### Selezione biblioteche

Mostrare tutte le biblioteche del registro: selezionabili quelle abilitate con
ricerca reale, non selezionabili quelle che accettano solo un collegamento,
con spiegazione «Apertura da collegamento disponibile». Queste ultime restano
raggiungibili nel percorso dedicato alla risoluzione diretta.

Al primo uso selezionare tutte le biblioteche idonee; in seguito ricordare la
selezione esplicita. Le nuove biblioteche vengono segnalate, non aggiunte di
nascosto alle preferenze salvate. Disponibili seleziona tutte/nessuna tramite
comandi neutri. Disabilitare in questa ricerca non cambia il registro né il
profilo di rete della biblioteca.

La riga provider mostra nome, stato e risultati ricevuti; errore e riprova
sono individuali. Il riepilogo generale non genera un toast per ogni errore.

### Collegamento o segnatura

La federazione testuale non deve inviare lo stesso URL a tutti i cataloghi.
Prevedere un comando distinto «Apri da collegamento o segnatura», che usa la
risoluzione singola esistente. Una segnatura ambigua richiede una biblioteca;
un URL riconosciuto può preselezionarla, sempre mostrando la scelta.
La ricerca federata invoca la strategia di ricerca, senza ripieghi automatici
sulla risoluzione diretta per ciascun provider.

## 4. Semantica dei filtri: contratto prima della grafica

| Campo | Regola comune proposta |
| --- | --- |
| Parole chiave | Ricerca libera secondo il catalogo; non promettere full text delle pagine |
| Titolo | Campo bibliografico, non parola generica riciclata in tutti i campi |
| Autore | Responsabile dichiarato; curatori/traduttori non diventano automaticamente autori |
| Editore | Editore dell'edizione, non biblioteca conservatrice né piattaforma digitale |
| Natura | Tutte, manoscritto, stampa, altro; PDF/IIIF non sono natura dell'originale |
| Anno da/a | Estremi inclusivi, riferiti a produzione/pubblicazione dell'originale |
| Lingua | Valori normalizzati con etichetta leggibile; mantenere il dato originale |
| Biblioteca | Insieme esplicito delle sorgenti interrogate |

Campi diversi si combinano in AND; più valori nello stesso filtro in OR.
Per la prima versione natura e lingua possono essere a scelta singola.
Non usare uno slider temporale: per ricerca filologica due campi precisi sono
più leggibili. Validare anni interi e `da <= a`; limite proposto -5000..anno
corrente, da confermare se il catalogo include pubblicazioni future. Definire
se gli anni negativi usano numerazione astronomica prima di abilitarli nella UI.
Prima versione: anni positivi 1..anno corrente, senza supporto a.C. implicito.

### Supporto dichiarato per campo, non solo booleano supportsSearch

Ogni adapter espone, per ciascun filtro:

1. `remote`: applicato al catalogo remoto, con semantica dichiarata.
2. `returned_metadata`: verificabile solo sui record ricevuti.
3. `unsupported`: non verificabile in modo affidabile.

La capacità deve specificare anche confronto (parole/frase/intervallo), valori
ammessi e disponibilità delle ricerche senza parole chiave. Se il provider
offre un confronto diverso, non dichiararlo equivalente senza test.

Il piano d'esecuzione restituisce la copertura prima dell'avvio. Esempio:
«Autore: applicato al catalogo in 3 biblioteche; verificato sui risultati in 2;
non verificabile in 1». Dettaglio nel pannello, riepilogo accanto ai criteri.

Comportamento predefinito: ricerca ampia, risultati con corrispondenza
verificata nell'elenco principale; risultati senza metadati sufficienti in un
gruppo separato «Criteri non verificabili», apribile. I non corrispondenti sono
esclusi. Non perdere silenziosamente i record incompleti e non presentarli come
risultati certi. Per provider incapace di applicare/verificare un campo, il suo
risultato resta non verificato per quel campo.

Un'opzione avanzata «Solo cataloghi che applicano tutti i criteri» esclude
prima dell'avvio gli adapter senza filtri remoti equivalenti; mostra quanti
rimangono. Non azzerare la selezione permanente dell'utente.

### Date e materiale incerti

Conservare data originale e intervallo normalizzato distinto, con precisione
e provenienza. «XVI secolo» può diventare 1501–1600 solo con parser testato;
«circa 1550» non diventa un anno esatto. Prima versione: normalizzare anni e
intervalli espliciti; le altre forme restano non verificate finché supportate.
Con filtro 1550–1600, l'intersezione di un intervallo è una corrispondenza
possibile, da segnalare come data approssimativa. Non usare la data di scansione.
Non dedurre manoscritto da assenza di editore o stampa dalla presenza di PDF.

### Totali e faccette

«42 risultati ricevuti», non «42 risultati in tutte le biblioteche».
Conteggi locali sempre etichettati «nei risultati caricati». Eventuali totali
remoti restano per provider, con `exact/estimate/unknown`; non sommarli come
opere uniche. Una pagina remota interamente esclusa dai filtri non è la fine:
rispettare `hasMore` e mostrare «Nessuna corrispondenza in questa pagina».

## 5. Risultati intelligibili mentre arrivano

Riutilizzare la scheda attuale: copertina, titolo, autore, data, metadati,
dettaglio, aggiunta al catalogo/workspace. Aggiungere:

- biblioteca di origine sempre leggibile;
- stato «Già in Biblioteca», indipendente dalla ricerca che l'ha trovata;
- indicazione di criteri non verificabili quando pertinente;
- provenienza completa nel dettaglio: ricerca, provider, esecuzione, orario
  di ricezione, eventuale cache. Non mostrare UUID o dettagli tecnici nella riga;
- se il risultato è presentato fuori dalla sua ricerca, titolo della ricerca
  e comando per aprirla. Dentro la pagina il titolo nell'intestazione evita
  di ripetere la stessa informazione su cinquanta righe.

### Regola di stabilità visiva

1. La prima pagina ricevuta compare subito, senza aspettare gli altri provider.
2. Gli arrivi successivi aggiornano subito contatori e monitor.
3. In ordine d'arrivo, appendere in fondo senza cambiare le righe precedenti,
   la posizione di scorrimento o l'espansione selezionata.
4. Se l'utente sta leggendo una parte lontana dalla fine, mostrare «N nuovi
   risultati» con comando per raggiungere il primo nuovo elemento. Non scorrere da soli.
5. Con ordinamento titolo/data, congelare l'ordine visibile: i nuovi record
   entrano in un gruppo «Nuovi risultati». Il comando Aggiorna ordinamento
   li integra conservando come ancora l'id della riga in lettura.
6. Nessun ordinamento globale per rilevanza ricavato da punteggi non confrontabili.
7. Selezione e focus basati su identità stabile, non sull'indice nell'elenco.

Filtro rapido per biblioteca sopra i risultati: filtra quanto già ricevuto,
non ferma i job. Distinguere questo comando dalla scelta dei provider nel form.
Gli errori sono righe nel monitor; non sostituiscono l'intera lista e non
generano una raffica di toast. Aggiornamenti accessibili raggruppati per pagina.

### Cache e identità

Cache per provider + query normalizzata + criteri remoti + pagina/cursor +
versione adapter. La cache può memorizzare pagine remote; i filtri locali vanno
ricalcolati. Non riusare pagine filtrate come se fossero risposte complete.
`fresh` bypassa la cache della ricerca, non svuota il deposito né le immagini.

Chiave risultato: providerKey + id remoto. Riconoscimento del già acquisito:
manifesto normalizzato secondo il comportamento esistente. Niente fusione
automatica per titolo/autore: due edizioni o digitalizzazioni restano distinte.
Duplicati certi nella stessa pagina o fra pagine non vengono ripetuti; mantenere
origini multiple se si raggruppa lo stesso manifesto. Non normalizzare URL
eliminando parametri che potrebbero distinguere una copia o una risorsa.

## 6. Job, stati e monitoraggio

### Stati: esecuzione e copertura sono due cose diverse

Riusare gli stati già presenti: queued, running, pausing, paused, cancelling,
cancelled, completed, error. Attesa di cortesia/retry è una ragione dello stato
esistente, con orario del prossimo tentativo quando noto; non un errore definitivo.

| Stato mostrato della ricerca | Regola aggregata |
| --- | --- |
| In corso | Almeno un job sta eseguendo o completando pausa/annullamento |
| In attesa | Nessuno esegue, ma esistono job accodati o in attesa di retry |
| In pausa | Nessuno esegue/attende automaticamente e almeno uno è in pausa |
| Completata | Tutte le esecuzioni correnti dei provider sono completed |
| Con errori | Tutte ferme e almeno una error; indicare i risultati parziali disponibili |
| Interrotta | Nessun job attivo, almeno uno cancelled e nessuno error |

Durante l'attività un contatore «1 errore» resta visibile accanto a In corso:
la precedenza dello stato non nasconde i guasti. Zero risultati è un successo
vuoto se il provider ha risposto correttamente, non un fallimento.

Una ricerca completata significa che è finito il lavoro richiesto, non che è
stato esaminato l'intero catalogo. Mostrare anche una copertura distinta:
esaurita, altre pagine disponibili, limite raggiunto, interrotta o sconosciuta.
Se un provider restituisce 20 risultati con hasMore, può aver completato il
budget richiesto e avere ancora pagine da cercare.

### Statistiche della ricerca

Riepilogo compatto sempre visibile; dettaglio nel monitor.

| Misura | Definizione |
| --- | --- |
| Provider | Selezionati, accodati, attivi, riusciti, falliti, interrotti |
| Ricevuti | Record delle pagine uniche acquisite nelle esecuzioni correnti |
| Distinti | Ricevuti dopo deduplicazione per identità certa |
| Corrispondenze | Distinti verificati rispetto ai criteri |
| Non verificabili | Distinti con metadati insufficienti, mostrabili separatamente |
| Esclusi | Distinti che non soddisfano almeno un criterio |
| Tempo trascorso | Avvio ricerca → adesso/fine, non somma delle durate concorrenti |
| Primo risultato | Avvio → primo record ricevuto |
| Per provider | Pagine lette, record, tempo, retry, stato cache e copertura |

Invariante: distinti = corrispondenze + non verificabili + esclusi, con
classificazione esclusiva. Filtri puramente visivi hanno un conteggio a parte.
Retry automatici che rigiocano una pagina non gonfiano i record ricevuti.
Statistiche delle esecuzioni precedenti sono consultabili nello storico,
non sommate ai risultati correnti della ricerca.

Non mostrare percentuali o tempo residuo dell'intero catalogo senza un totale
affidabile. «3 provider terminati su 5» è progresso di esecuzione, non «60%
delle opere trovate». Totali dichiarati dalle biblioteche rimangono separati
e marcati stimati/esatti/sconosciuti.

### Controlli per un solo provider

| Comando | Semantica |
| --- | --- |
| Pausa | Sospende cooperativamente il job; conserva pagine e checkpoint |
| Riprendi | Continua l'esecuzione in pausa dal checkpoint valido |
| Annulla | Arresta questo job; conserva risultati parziali, non tocca gli altri |
| Riprova | Per un errore: nuova esecuzione collegata, riprende la pagina non completata se il cursore è riutilizzabile |
| Ripeti da capo | Per errore, successo o annullamento: nuova esecuzione dalla prima pagina, stessi criteri |
| Carica altri | Per successo con hasMore: nuova esecuzione di continuazione, dal cursore successivo |

Il retry automatico di trasporto resta interno allo stesso job, con contatore
e attesa gestiti dal motore. Il rilancio manuale crea un nuovo job/esecuzione
per conservare storia e identità, invece di riscrivere il vecchio esito.
L'API generica attuale può riaccodare lo stesso id: per la ricerca non usare
quel comportamento senza uno storico separato verificabile.

Vincolo: una sola esecuzione non terminale per coppia ricerca/provider.
Comandi idempotenti, protetti nel backend: doppio clic non crea due lavori.
Ripeti su job attivo richiede prima di fermarlo; non sovrapporre generazioni.

Ripeti da capo non cambia criteri: per cambiarli creare una nuova ricerca.
Può offrire «Aggiorna dal catalogo» per bypassare la cache, chiarendo la scelta.
Il vecchio insieme di risultati resta visibile come precedente durante il
rilancio; il nuovo flusso lo sostituisce a livello di intera esecuzione, senza
mescolare vecchie e nuove pagine. Se fallisce, conservare entrambi gli insiemi
distinti e scegliere esplicitamente quale visualizzare. Lo stato deve dire
che il nuovo tentativo è fallito anche se si stanno leggendo i risultati vecchi.

Riprendi e Carica altri possono invece ereditare pagine già acquisite nello
stesso insieme logico: riferimenti alle pagine, non copie dei record. Un cursore
scaduto richiede Ripeti da capo, senza unione silenziosa di cataloghi cambiati.

Comandi globali: Pausa attive, Riprendi in pausa, Annulla attive, Riprova fallite.
Mostrare quanti job saranno interessati. Riprova fallite non rilancia successi
o provider annullati volontariamente. Consentire retry automatico disattivabile
per esecuzione con limiti validati, mantenendo comunque la cortesia di rete.

### Paginazione e durata del lavoro

Prima versione: un job provider acquisisce una pagina remota e termina. I job
partono insieme e pubblicano ciascuno la sua pagina appena pronta. Carica altri
crea una continuazione solo per i provider richiesti con hasMore.
Questo mantiene un limite esplicito senza trasformare una ricerca in crawler.

Estensione prevista: budget di più pagine per job, con checkpoint/pubblicazione
dopo ogni pagina. «Successo» riguarda il budget richiesto. Non cambiare questo
budget mentre il job gira. La UI deve mostrare quante pagine sono state richieste.
Un provider con dimensione pagina fissa conserva la pagina intera.

Molte ricerche simultanee condividono limiti per host/provider e classe Network.
Serve equità: evitare che una ricerca lunga occupi tutti i posti. Nessun pool
per ricerca che moltiplica il limite globale; riusare la cortesia del lettore
e degli scaricamenti e la precedenza della pagina aperta.

## 7. Architettura, persistenza ed eventi

Il coordinatore Rust pianifica la copertura dei filtri e crea atomicamente
ricerca, esecuzioni e job. Gli handler riusano i servizi di ricerca singoli,
gli adapter, la cache e la cortesia; niente richieste HTTP dalla webview.
Estrarre il servizio richiamabile dal comando singolo se necessario, senza
invocare comandi IPC da altri comandi backend.

Comandi proposti: plan_search, create_search, list_searches,
get_search_snapshot, list_search_results, retry_provider_search,
restart_provider_search, continue_provider_search. Pause/resume/cancel usano
il motore esistente. Il piano di copertura filtri è rivalidato all'avvio
contro la versione del registro provider. Richieste con chiave idempotente
non producono due ricerche per un doppio clic.

```text
Form → piano filtri → ricerca persistita
                          ├─ job provider A → pagine persistite
                          ├─ job provider B → pagine persistite
                          └─ job provider C → errore / retry
                                      │
                         eventi + snapshot dal database
                                      │
                    risultati / monitor / Dashboard
```

Estensioni proposte del modello dati, da tradurre in migrazione secondo le
regole del repo al momento dell'implementazione:

- `search_runs`: id, titolo, snapshot criteri/provider, versione contratto,
  avvio, archiviazione. Stato aggregato derivato, non aggiornato a mano da ogni worker.
- `search_provider_executions`: id, ricerca, provider, jobId, generazione,
  predecessore, modalità first/retry/restart/continue, versione adapter,
  insieme risultati e checkpoint. Vincolo contro due esecuzioni attive.
- `search_result_pages`: insieme, provider, chiave pagina/cursore, ordine,
  stato cache, istante acquisizione, payload normalizzato e riferimenti.
- risultati indicizzati/deduplicati per insieme + provider + id remoto;
  non creare una fonte della Biblioteca finché l'utente non la aggiunge.

Creazione ricerca + esecuzioni + job accodati atomica: un errore di inserimento
non lascia metà provider avviati. Riutilizzare il coordinamento delle scritture;
può servire un'operazione batch di creazione nella coda esistente.

Commit di pagina + risultati + checkpoint nella stessa transazione; evento
dopo il commit. Gli eventi sono invalidazioni/delta piccoli, non l'unica copia
dei risultati. Snapshot paginabile dal database per apertura, riavvio e recupero.
Non inserire tutte le schede nel campo detail del job.

Ogni evento contiene searchId, executionId, jobId, generazione e sequenza.
Il frontend filtra per ricerca selezionata; gli altri eventi aggiornano il
monitor globale. Una risposta vecchia non può aggiornare il nuovo tentativo.
Sottoscrivere prima dello snapshot, poi applicare solo eventi successivi alla
versione letta. Pagina ripetuta dopo crash: inserimento idempotente.

La navigazione non ferma i job. Alla chiusura applicare le regole esistenti di
pausa e recupero; al riavvio mostrare ricerche e risultati persistiti, senza
ripartire automaticamente di default. Non promettere esecuzione con app chiusa.
Per cursor/sessioni remote non durevoli segnalare la necessità di ricominciare.

Archiviare una ricerca la nasconde dall'elenco principale; non cancella fonti
acquisite. Eliminazione storia: consentita solo senza job attivi, con conferma
del perimetro e senza cancellare opere/immagini. «Pulisci lavori terminati»
non deve distruggere lo storico delle ricerche: conservarne gli esiti o impedire
la rimozione dei job referenziati. Definire la stessa politica per backup:
prima implementazione include ricerche persistite nel backup dati e invalida
la ripresa automatica dopo restore; i cursori non sono garanzia di riprendibilità.

### Riutilizzo verificato e lavoro necessario

Il sistema corrente espone JobStatus, ResourceClass.Network, configurazione,
checkpoint, attemptCount, errorKind, attese di retry ed eventi `jobs:updated`.
Il motore registra handler per tipo. JobsPanel, JobsIndicator, jobsStore e
AppStatusBar costituiscono la superficie comune da estendere.

Non risultano sufficienti da soli per storico ricerca, risultati persistiti
e relazione ricerca/provider: questi sono contratti nuovi del dominio ricerca.
`listActiveJobs` e la finestra dei lavori recenti non sostituiscono l'elenco
storico. `dependsOnJobId` non è una parentela. Il controllo di cancel attuale
è cooperativo: verificare esplicitamente il passaggio ai client HTTP/attese.

## 8. Dashboard: centro di lavoro

```text
Dashboard                  [Tutti i workspace v] [Cerca fonti] [Nuovo]
──────────────────────────────────────────────────────────────────
Riprendi                                  │ Richiede attenzione
Opera / progetto · workspace              │ Scaricamento fallito [Apri]
Ultima modifica · punto di ripresa [Apri]  │ Frammenti da rivedere [Apri]
...                                       │
──────────────────────────────────────────│ Lavori
Attività recente                          │ 1 in corso · 2 in pausa
Fonte conservata · 10:24                   │ Nome · progresso [Pannello]
Traduzione completata · ieri              │
──────────────────────────────────────────────────────────────────
Riepilogo: fonti raccolte · progetti · frammenti completati
```

Riprendi è il blocco principale, non un contatore. Prima versione mostra
progetti modificati di recente con etichetta esatta; aggiungere fonti solo se
esiste un timestamp affidabile di apertura. Un numero di pagina memorizzato
non dimostra quando il libro è stato letto. Se necessario introdurre un piccolo
registro locale di ultima apertura, non un clickstream.

Attenzione raccoglie situazioni azionabili, con una destinazione precisa:
errori di lavori, revisione di traduzioni e problemi di salvataggio realmente
conosciuti. Un lavoro in pausa non è un errore. Un giudizio negativo non è
automaticamente un guasto: distinguere «Da rivedere» da «Operazione fallita».
Niente obbligo di configurare chiavi LLM per consultare fonti; eventuale avviso
credenziali compare nel contesto di una traduzione che ne ha bisogno.

Lavori è un riepilogo del pannello già esistente, con gli stessi comandi e stati.
Non creare una seconda coda, una console alternativa o retry con logica propria.
Le attività recenti riportano esiti utili, non ogni evento tecnico.

Il riepilogo ricerche del monitor compare accanto al riepilogo lavori, con
accesso a ricerche attive, recenti e con errori. Nessuna lista risultati nella
Dashboard.

Niente grafici ornamentali, punteggi di produttività, widget trascinabili o
feed illimitato. Quattro blocchi stabili, liste brevi e comandi «Apri elenco».
Su spazio stretto: Riprendi → Attenzione → Lavori → Attività → riepilogo.
Nel layout ampio Attenzione resta visibile sopra la piega. Non riordinare
automaticamente le sezioni mentre l'utente le sta leggendo.

### Stato e dati della Dashboard

- Ogni blocco ha loading/ready/empty/error indipendente; il guasto di un
  riepilogo non cancella tutti gli altri come può accadere con un unico Promise.all.
- Totali null/errore non diventano zero. Distinguere caricamento da «Nessun progetto».
- Filtro workspace applicato a TUTTE le query pertinenti. Lavori senza legame
  dimostrabile restano globali e dichiarati, non attribuiti per supposizione.
- Un'origine condivisa non si moltiplica nei totali globali. Definire esplicitamente
  se il conteggio è di progetti, traduzioni, frammenti o revisioni correnti.
- Attenzione: contare frammenti da rivedere, con regole sui problemi risolti;
  non mostrare COUNT delle righe come numero di problemi individuali.
- Aggiornamento su eventi dominio e rientro nella pagina; invalidazioni aggregate,
  niente polling rapido né query a ogni token di streaming.
- Riprendi apre il corretto workspace/progetto con il percorso già disponibile.
  Oggetto eliminato: messaggio e refresh del blocco, senza crash o destinazione casuale.
- Preferenze visive e filtro possono persistere; dati derivati si rileggono.
  Nessuna nuova tabella di contatori canonici mantenuti manualmente.

## 9. Componenti e accessibilità

| Necessità | Primitiva da riutilizzare |
| --- | --- |
| Cerca, ferma, riprova, aggiorna, aggiungi | `IconButton` neutro con tooltip e nome accessibile |
| Catalogo / ricerca e dettaglio a schede | `TabStrip` / `InspectorShell`, etichetta della scheda attiva visibile |
| Biblioteche abilitate | `ToggleRow`, non pill create per questa schermata |
| Natura, lingua, ordinamento | `Select` o `SegmentedControl` secondo spazio e numero opzioni |
| Criteri e campi | `SettingRow`, `FIELD_CLASSNAME`, `FIELD_NUMBER_CLASSNAME` |
| Informazioni bibliografiche | `StatRow` / `StatBlock` |
| Azioni secondarie | `Menu`, `MenuActionRow`, `ClickPopover`, `PopoverItem` |
| Pannello ridimensionabile | Pattern `react-resizable-panels` già usato in Biblioteca |
| Workspace | `WorkspaceIdentity` |
| Copertine | `CachedThumbnail` e ponte esistente |
| Liste lunghe | `@tanstack/react-virtual` già dipendenza; misurare altezza righe espanse |
| Stato vuoto/caricamento | `EmptyState`, `Spinner` e pattern esistenti |

I nomi elencati sono componenti esistenti, non garanzia che tutte le props
necessarie esistano: controllare API prima di scrivere JSX. Comandi solo icone;
etichette testuali di dati e filtri restano visibili. Nessun colore grezzo,
nuova libreria UI, classe ad hoc per copiare una primitiva.

Icona più parola per stati provider; colore solo rinforzo. Focus sempre visibile;
ordine tab stabile; Enter nel form, Escape nei dialog. Annunci `aria-live=polite`
raggruppati per pagina/giro, non per ogni risultato. Nessun focus rubato dagli
arrivi di rete. Riga risultato non diventa un pulsante contenente altri pulsanti:
area informativa e comandi sono elementi fratelli. Ritorno al chiamante dopo
chiusura pannello o aggiunta. Verificare tastiera, screen reader, temi e zoom.

## 10. Navigazione e stato frontend

Estendere la posizione Biblioteca per distinguere catalogo, ricerca selezionata,
elenco ricerche e dettaglio fonte. Conservare helper compatibili con gli accessi
esistenti, oppure migrare tutte le chiamate in un task dedicato. Aggiornare
insieme breadcrumb, confronto delle posizioni, rail e test.

La ricerca selezionata nella UI non è la sola ricerca attiva. Uno store conserva
bozza, searchId selezionato, snapshot e preferenze di presentazione; il database
è la fonte dei risultati e il motore governa esecuzione/retry. Evitare di caricare
in memoria tutti i risultati di tutte le ricerche per mostrare il monitor.

Ritorno a una ricerca: ripristinare filtri visivi, espansione e ancora di scroll.
Le impostazioni visive stanno nello stato UI; gli stati dei job non vengono
ricostruiti da spinner locali. Nuovo invio crea un nuovo snapshot immutabile;
modificare il form non riconfigura job già accodati.

Le ricerche lanciate e i loro risultati persistono già nel nucleo del progetto.
I preset di criteri salvati sono una funzione separata e successiva: nome,
versione, criteri e provider, senza risultati. Aprire un preset riempie il form
senza avviare rete. Provider rimossi e filtri cambiati richiedono un avviso.

## 11. Integrazione col lavoro parallelo sui provider

Prima del coordinatore concordare questo minimo, senza imporre subito refactor:

- input strutturato canonico separato dal testo libero;
- descrizione capacità per campo;
- paginazione e hasMore corretti, senza fabbricare manifesti;
- metadati originali conservati e nullable;
- errori distinguibili da zero risultati;
- cancellazione e cortesia condivise;
- entry point di ricerca puro, distinto dalla risoluzione diretta.

Se il lavoro corrente introduce già questi contratti, adottarli. L'adapter
federato traduce nel contratto singolo finale; non riscrive parser o endpoint.
I nuovi moduli di coordinamento, normalizzazione e UI possono essere preparati
con fixture. Toccare i file provider in modifica solo dopo integrazione del
lavoro corrente. Non promettere titolo/autore/editore remoti per tutti solo
perché l'interfaccia contiene quei campi.

## 12. Task implementativi e dipendenze

Ogni task mantiene utilizzabile la ricerca singola. I percorsi nuovi sono
suggerimenti da adattare al codice integrato; non sono componenti già esistenti.

| Task | Intervento | Criterio di chiusura |
| --- | --- | --- |
| F0 Contratti | Registro e adapter dopo il lavoro parallelo; tipi ricerca/esecuzione/pagina, capacità filtri e idempotenza | Fixture di tre provider con capacità diverse; semantiche concordate |
| F1 Navigazione | appLocation, App, shell e area ricerca; riuso del pannello singolo | Ricerca dalla Biblioteca, elenco ricerche e ritorno con stato conservato |
| F2 Persistenza e job | Schema ricerca, creazione batch atomica, handler provider e checkpoint | Successo parziale, crash, cancel e due ricerche concorrenti isolati |
| F3 Form e copertura | Componenti discovery, selezione provider, bozza e piano filtri | Invio crea una ricerca; nessun criterio ignorato o job riconfigurato |
| F4 Normalizzazione | Date, natura, autore/editore e valutazione locale | Remote/local/ignoto distinti, conteggi esclusivi verificati |
| F5 Risultati e monitor | Righe esistenti, eventi, pagine, storico e comandi provider | Arrivi stabili, retry selettivo, continuazione e statistiche coerenti |
| D1 Dashboard | Redistribuire AppDashboard e riusare blocchi/jobsStore | Riprendi, Attenzione, Lavori, Attività e riepilogo ricerche operativi |
| D2 Dati Dashboard | Query/read-model, filtri workspace e invalidazioni | Errori isolati e conteggi corretti senza polling continuo |
| F6 Preferenze | Selezione provider persistibile; poi preset di ricerca versionati | Riapertura senza rete automatica; capacità cambiate segnalate |
| Q1 Consolidamento | Test, prova desktop, guide IT/EN e help | Scenari sotto verificati, ricerca singola senza regressioni |

D1 può iniziare dopo F1; il riepilogo ricerche si collega dopo F2.
D2 non dipende da nuove capacità dei provider. Storico delle ricerche, risultati
persistiti e monitor fanno parte del nucleo, non sono rinviati a F6.


### Scenari obbligatori

1. A e B attive insieme; aprire B non perde o annulla risultati di A.
2. Cinque job accodati; tre rispondono, uno fallisce, uno aspetta cortesia.
3. Riprova di un solo provider: altri successi e job non cambiano.
4. Evento tardivo del tentativo vecchio non altera il nuovo o i suoi conteggi.
5. Zero risultati completato distinto da errore senza risultati.
6. Errore dopo una pagina: parziali leggibili, checkpoint ripetibile senza duplicati.
7. Ripeti da capo: vecchi e nuovi risultati distinti; errore nuovo non nascosto.
8. Doppio invio/retry/continua: un solo job per chiave idempotente.
9. Scroll, focus e riga espansa stabili mentre arrivano pagine da altri provider.
10. Ordinamento alfabetico attivo: nuovi record non spostano il testo in lettura.
11. Riavvio fra commit pagina ed evento: snapshot ricostruisce risultati corretti.
12. Rimozione storia/pulizia job/restore: nessuna fonte acquisita viene eliminata.
13. Statistiche distinguono record, duplicati, filtri, tentativi ed esiti correnti.
14. Carica altri dopo completed con hasMore: stato torna attivo per la continuazione,
    senza cancellare la storia della pagina precedente.
15. Titolo/autore/editore combinati; data assente/incerta; filtro non supportato.
16. Pagina senza corrispondenze locali ma hasMore vero: continuazione possibile.
17. Stesso id in due provider non collide; stesso titolo non fonde edizioni.
18. Manifesto già acquisito: collegamento workspace senza nuova copia.
19. Cache, aggiornamento esplicito e cambio criteri mantengono identità corrette.
20. Nessun provider selezionato; provider nuovo/rimosso/senza ricerca gestito.
21. Dashboard vuota, filtro workspace, oggetto eliminato ed errore di un blocco.
22. Solo libri e nessuna chiave LLM: nessun falso blocco.
23. Tastiera, temi, zoom 200%, titoli lunghi e virtualizzazione con focus stabile.

Backend con fixture HTTP deterministiche; frontend con eventi fuori ordine.
Le prove vive seguono la stabilizzazione degli adapter, non sostituiscono i
test ripetibili. Misurare tempo al primo risultato, annullamento, memoria,
richieste per provider e fluidità. Non promettere latenze delle biblioteche.
Non eseguire build o suite durante la sola scrittura del piano.

## 13. Istruzioni per chi implementa con un LLM

Affidare un task della tabella per volta. Nel prompt indicare task, contratti
già integrati, file in scope e scenari di accettazione. Prima leggere codice
corrente e istruzioni del repository; non usare questo snapshot per sovrascrivere
il lavoro sui provider. Chiedere un riepilogo di cambiamenti, verifiche e residui.

Esempio: «Implementa F2 sul contratto F0 già integrato. Riusa adapter e cortesia;
non modificare le schermate. Verifica successo parziale, cancel e risposta
tardiva. Se manca una capacità del contratto, descrivi il punto prima di
introdurre un secondo sistema. Aggiorna solo documenti pertinenti al task».

Prima di considerare completo il progetto: controllare che la ricerca singola
continui a essere una selezione di un provider, che i filtri abbiano copertura
esplicita e che la Dashboard aiuti ad aprire un lavoro concreto. Le schermate
non devono dipendere dall'arrivo futuro di OCR, Analisi o altre aree.
