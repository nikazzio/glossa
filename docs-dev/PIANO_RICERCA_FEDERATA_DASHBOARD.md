# Ricerca federata e Dashboard operativa

Piano unico di implementazione · aggiornato il 12 settembre 2026.

Questo documento descrive funzionalità da implementare. Integra le decisioni
sui job per provider, il monitor delle ricerche, i risultati progressivi e la
Dashboard. Include biblioteche dirette, aggregatori e una visione dell'intero
software. Non occorrono documenti integrativi. Le capacità riportate distinguono
prove operative riferite dall'utente, codice osservato e documentazione pubblica:
non costituiscono una nuova verifica live di tutti gli endpoint.

La base esaminata era `feat/library-providers-verify`, commit `ce8b378`,
con le ultime modifiche alla ricerca singola integrate nel branch esaminato. Prima di implementare,
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
| Dashboard | Cosa contiene Glossa? Dove ero arrivato? Cosa richiede attenzione? |
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
| `src/components/dashboard/SourceDiscoveryPanel.tsx` | Riutilizzare risultati, anteprima, aggiunta al catalogo/workspace e riconoscimento delle fonti già presenti. Verificare il contratto integrato prima di estrarre componenti. |
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

### Biblioteche e aggregatori: base aggiornata

| Fonte | Evidenza disponibile | Conseguenza |
| --- | --- | --- |
| Internet Archive, Vaticana, Gallica, e-codices, Institut de France, Bodleian | Ricerca funzionante nelle prove riferite | Prima federazione sui provider già funzionanti |
| Estense | Ricerca funzionante; copertine non ancora disponibili | Risultati utilizzabili senza miniatura; problema immagini separato |
| Cambridge, Heidelberg | Ricerca libera non operativa; percorso diretto disponibile | Non selezionabili per testo finché un adapter supportato è verificato |
| Library of Congress | API JSON pubblica; il codice usa già `/search/` con `fo=json`, ma le prove non danno risposte utili | Diagnosticare risposta/rete/limiti, non progettare un'API mancante |
| Harvard | API LibraryCloud pubblica, già usata dal codice; problemi nelle prove | 429/blocco IP sono da diagnosticare, non cause dimostrate |
| Europeana | API di ricerca documentata con chiave; copertura IIIF variabile | Primo aggregatore candidato, con attivazione esplicita e prova di copertura |
| Biblissima | Documentazione IIIF e relazioni specialistiche | Candidato successivo: verificare prima accesso alla ricerca e completezza dei manifesti |

IIIF permette accesso/presentazione delle risorse; non garantisce una ricerca
testuale. OAI-PMH permette raccolta periodica di metadati; non equivale a una
API di ricerca interattiva. Non introdurre scraping o aggiramenti anti-bot
come fallback nascosto. Un errore occasionale non disabilita permanentemente
una biblioteca; distinguere capacità, configurazione e ultimo esito operativo.

Fonti primarie: [LoC](https://www.loc.gov/apis/json-and-yaml/requests/endpoints/),
[Harvard](https://library.harvard.edu/services-tools/harvard-library-apis-datasets),
[Heidelberg](https://www.ub.uni-heidelberg.de/helios/kataloge/datenschnittstellen.html),
[Europeana API](https://api.europeana.eu/en),
[chiavi Europeana](https://www.europeana.eu/en/how-to-register-for-and-manage-an-api-key),
[Biblissima](https://doc.biblissima.fr/api/api-presentation/).
Esistenza delle API e affidabilità dalla rete dell'utente sono verifiche diverse.

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
32 verificati · 8 non verificabili         │ Gallica       In corso
[Tutti/Diretti/Aggregatori] [Ordine v]     │ 22 record · pagina 2
                                          │              [Pausa][Ferma]
[copertina] Titolo                         │ Vaticana      Completata
Autore · anno · biblioteca                 │ 18 record     [Ripeti]
Gallica · questa ricerca                   │ Archive       Fallita
[Dettaglio] [Aggiungi]                     │ 8 parziali    [Riprova]
                                          │ e-codices     In attesa
...                                       │ ...
──────────────────────────────────────────│ Statistiche
8 nuovi risultati disponibili [Mostra]     │ Ricevuti 48 · distinti 45
                                          │ Verificati 32 · ignoti 8
                                          │ Esclusi 5
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

### Biblioteche e aggregatori: una pagina, due gruppi

Non creare due prodotti di ricerca. Nel pannello Criteri separare:

- **Biblioteche e archivi diretti**: adapter che interrogano il catalogo della
  fonte. Internet Archive resta qui come archivio interrogato direttamente,
  pur raccogliendo materiali di molte istituzioni.
- **Aggregatori**: servizi di scoperta che indicizzano altre istituzioni,
  inizialmente Europeana se configurata. Non sono biblioteche conservatrici.

Al primo uso selezionare i provider diretti abilitati e idonei; aggregatori
disattivati, con spiegazione della possibile sovrapposizione. In seguito
ricordare la selezione esplicita; nuovi provider solo segnalati.
Comandi tutte/nessuna agiscono sul gruppo dichiarato, non su entrambi di nascosto.
Consentire ricerca diretta, solo aggregatori o mista nello stesso form.

Ogni riga mostra capacità e disponibilità: Pronta, Chiave richiesta, Solo
collegamento, Disabilitata. L'ultimo errore è un'informazione separata, datata.
La chiave si configura nelle impostazioni secondo il deposito sicuro esistente:
mai dentro snapshot, eventi, log o URL mostrati. Non promettere attivazione
immediata delle chiavi di progetto Europeana. Se la configurazione cambia
fra anteprima e invio, rivalidare e chiedere di confermare le fonti rimaste;
nessuna esclusione silenziosa.

**Estendi agli aggregatori** apre la bozza con criteri copiati e aggregatori
disponibili da confermare. L'invio crea una ricerca sorella collegata tramite
`searchGroupId` e `derivedFromSearchId`: non modifica la ricerca iniziale,
non rilancia le biblioteche già interrogate e non parte automaticamente a zero
risultati. Funziona anche mentre la prima ricerca è attiva.

L'elenco ricerche può espandere il gruppo «Erbario» nelle ricerche «Biblioteche»
e «Estensione aggregatori», ciascuna con stato e statistiche proprie.
La vista combinata del gruppo è una proiezione, non una terza esecuzione:
mostra quali ricerche include e consente di tornare a ciascuna.
Un normale cambio di criteri crea invece una nuova ricerca indipendente;
nessun raggruppamento automatico basato sulla somiglianza del testo.

**Un job per servizio selezionato**: Europeana produce un job Europeana, non
centinaia di job per istituzioni indicizzate. Nessuna espansione automatica
verso i siti trovati. Monitor, pause, retry e cortesia restano gli stessi.

Distinguere due scelte:
1. **Dove cercare**: servizi interrogati, fissati nello snapshot.
2. **Istituzione conservatrice**: criterio bibliografico, se supportato.
   Togliere Gallica dai servizi non esclude record BnF trovati via Europeana.
   Per questo serve un criterio esplicito sull'istituzione, con copertura
   remota/locale/non verificabile dichiarata come per gli altri campi.

Le fonti senza ricerca restano visibili ma non selezionabili, con accesso
al percorso diretto. Non modificare il registro per una preferenza della ricerca.
Errori e riprova sono individuali, senza un toast per ogni fonte.

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
| Dove cercare | Servizi selezionati nei gruppi diretti/aggregatori |
| Istituzione conservatrice | Identità bibliografica distinta dal servizio interrogato; alias e dato originale conservati |

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

Controlli sopra i risultati: Tutti / Diretti / Aggregatori, istituzione,
Solo fonti leggibili in Glossa e ordinamento. Filtrano quanto già ricevuto,
non fermano i job. Distinguere questo comando dalla scelta dei provider nel form.
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

### Provenienza e accessibilità: tre identità, non una sola etichetta

Ogni occorrenza conserva separatamente servizio di scoperta, istituzione
conservatrice e risorsa digitale/host delle immagini. Esempio di riga:
«Bibliothèque nationale de France · trovata tramite Europeana».
Nel dettaglio: record originale, eventuale collegamento alla biblioteca,
manifesti disponibili, ricerca/esecuzione e data di acquisizione. Se
l'istituzione non è nota, scrivere «Istituzione non indicata», non Europeana.

Il contratto corrente orientato a IIIF richiede un manifesto: **prima di
accettare record solo bibliografici occorre estenderlo**, senza URL inventati.
Proposta: identificatore record e URL catalografico, istituzione nullable,
lista di risorse digitali con tipo/URL/provenienza e stato di verifica.
Una risorsa può avere più digitalizzazioni: selezione esplicita, non prima
voce presa automaticamente. Un manifesto parziale non rappresenta l'opera intera.

Due dimensioni indipendenti:
- corrispondenza ai criteri: verificata / non verificabile / esclusa;
- accesso: IIIF da verificare / leggibile / solo catalogo esterno /
  accesso fallito nell'ultima verifica, con istante e motivo.

La prima versione mostra tutti i record utili, con filtro «Solo fonti
leggibili in Glossa» che include soltanto risorse validate. I non verificati
non sono «senza IIIF». Per un record esterno mostrare Apri nel catalogo;
non abilitare aggiunta al lettore finché non esiste una risorsa supportata.
Non introdurre implicitamente un nuovo catalogo locale di segnalibri.

L'arricchimento del dettaglio è lazy, in coda limitata per host, cancellabile
e memorizzato in cache; una miniatura non giustifica scaricare tutti i manifesti.
La ricerca può riuscire mentre immagini o manifesto della biblioteca sono
bloccati: l'aggregatore non aggira il problema di accesso all'originale.

### Duplicati fra diretti e aggregatori

Persistenza per occorrenza: provider + record remoto, esecuzione e risorse.
Raggruppare nella vista soltanto la stessa risorsa digitale dimostrata da
manifesto identico o alias verificato. Titolo/autore/segnatura simili non bastano:
esemplari diversi, edizioni e manifesti sintetici restano separati.

Una riga può indicare «Trovato in 2 fonti» ed espandere entrambe le occorrenze.
Campi discordanti conservano provenienza; non sovrascrivere il record diretto
con quello aggregato. Se almeno un'occorrenza verifica tutti i criteri, il
gruppo è una corrispondenza; altrimenti è non verificabile se almeno una lo è,
oppure escluso. Non costruire una corrispondenza combinando campi di record
che singolarmente non soddisfano i criteri.

I contatori per provider contano occorrenze, quelli combinati gruppi distinti:
non sono sommabili. Un nuovo duplicato aggiorna l'origine della riga esistente
senza spostarla; un raggruppamento scoperto dopo arricchimento viene applicato
con Aggiorna risultati, preservando l'ancora. Niente fusioni distruttive.

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
| Distinti | Gruppi di risorse con identità certa; record senza identità condivisa restano singoli |
| Corrispondenze | Distinti verificati rispetto ai criteri |
| Non verificabili | Distinti con metadati insufficienti, mostrabili separatamente |
| Esclusi | Distinti che non soddisfano almeno un criterio |
| Tempo trascorso | Avvio ricerca → adesso/fine, non somma delle durate concorrenti |
| Primo risultato | Avvio → primo record ricevuto |
| Per provider | Pagine lette, record, tempo, retry, stato cache e copertura |

Invariante: distinti = corrispondenze + non verificabili + esclusi, con
classificazione esclusiva. Filtri puramente visivi hanno un conteggio a parte.
Per i gruppi usare la regola sulle occorrenze della sezione 5; non valutare
criteri su un record sintetico composto da metadati discordanti. Il riepilogo
indica sempre se riguarda una ricerca o il gruppo di ricerche collegato.
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

- `search_runs`: id, titolo, searchGroupId, derivedFromSearchId nullable,
  snapshot criteri/provider/ambito istituzioni, versione contratto,
  avvio, archiviazione. Stato aggregato derivato, non aggiornato a mano da ogni worker.
- `search_provider_executions`: id, ricerca, provider, jobId, generazione,
  predecessore, modalità first/retry/restart/continue, versione adapter,
  insieme risultati e checkpoint. Vincolo contro due esecuzioni attive.
- `search_result_pages`: insieme, provider, chiave pagina/cursore, ordine,
  stato cache, istante acquisizione, payload normalizzato e riferimenti.
- occorrenze indicizzate per insieme + provider + id remoto, risorse digitali
  e alias verificati separati; raggruppamento come proiezione non distruttiva;
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

## 8. Dashboard: visione d'insieme di Glossa

La Dashboard risponde a quattro domande: cosa possiedo, dove proseguire, cosa
sta lavorando, cosa richiede intervento. Non è una ricerca travestita né una
seconda schermata di impostazioni. Ricerca e monitor restano raggiungibili
con comandi contestuali, senza form o risultati nella Dashboard.

```text
Dashboard                      [Tutti i workspace v] [Cerca fonti]
─────────────────────────────────────────────────────────────────
Patrimonio
Fonti raccolte · Trascrizioni · Progetti di traduzione · Workspace
─────────────────────────────────────────────────────────────────
Riprendi                              │ Richiede attenzione
Opera / progetto · workspace          │ Operazione fallita [Apri]
Ultima modifica · destinazione        │ Frammenti da rivedere [Apri]
──────────────────────────────────────│
Workspace                             │ In esecuzione
Nome · fonti · progetti · attenzione  │ Lavori · stato e avanzamento
[Apri workspace]                       │ Ricerche · 2 attive, 1 errore
──────────────────────────────────────│ [Apri monitor]
Attività recente                      │
Fonte aggiunta · traduzione conclusa  │
─────────────────────────────────────────────────────────────────
Stato locale · dati aggiornati alle … · [Dettagli]
```

Comandi fra parentesi quadre indicano azioni da rendere con primitive esistenti.
Quattro livelli visivi: riepilogo compatto, Riprendi/Attenzione predominanti,
workspace/attività, stato locale secondario. Niente griglia di dieci KPI,
grafici ornamentali, punteggio di produttività o widget trascinabili.
Liste limitate con Apri elenco; dimensioni stabili durante gli aggiornamenti.

### Copertura funzionale e significato dei dati

| Area | Cosa mostrare | Destinazione e limiti |
| --- | --- | --- |
| Biblioteca | Fonti distinte raccolte; disponibilità locale solo se nota | Catalogo; non contare risultati di ricerca non aggiunti |
| Trascrizioni | Documenti presenti e lavori pertinenti, se interrogabili | Documento concreto; l'area catalogo è attualmente placeholder, nessun collegamento morto |
| Traduzioni | Progetti, completamento dei frammenti correnti, revisione | Progetto o elenco filtrato; revisioni storiche non gonfiano i totali |
| Workspace | Elenco breve con patrimonio e attività associati | Workspace preciso; fonti condivise contate una volta nel totale globale |
| Ricerche e lavori | Ricerche attive/errori, job e ultimo esito | Monitor unico; una ricerca con tre job non è quattro lavori |
| Analisi | Solo funzionalità e dati realmente disponibili | L'area attuale è placeholder: non presentare statistiche o avanzamento fittizi |
| Risorse ed esportazioni | Ultime operazioni concluse, disponibilità dei dati locali | Artefatto apribile se esiste; evitare scansione disco a ogni apertura |

Se una misura manca, ometterla oppure indicare «Non ancora disponibile» nel
dettaglio pertinente; non usare zero. La Dashboard non deve aspettare che tutte
le aree siano complete per essere utile. Una sezione futura non diventa un
invito cliccabile a una schermata vuota.

**Riprendi.** Prima versione: progetti modificati recentemente, con etichetta
esatta. Per ultima apertura di fonte/documento serve un dato dedicato affidabile:
una pagina memorizzata non prova quando il libro è stato letto. Eventuale
registro locale minimale separato dalla provenienza semantica, non clickstream.
Aprire conserva workspace, documento e punto di ripresa disponibili.

**Attenzione.** Solo situazioni azionabili: job falliti, frammenti da rivedere,
problemi di salvataggio effettivamente rilevati. Separare revisione editoriale
da errori tecnici; una pausa volontaria non è un problema. I conteggi attuali
di righe con valutazioni negative non sono conteggi di singoli problemi:
definire revisioni correnti e regole di risoluzione prima di pubblicare il dato.
Raggruppare errori della stessa ricerca, con dettaglio per provider.

**In esecuzione.** Stessi stati e comandi della coda; riepilogo ricerca separato
ma riferito agli stessi job, non sommato. Aprire una ricerca seleziona il monitor.
Non mostrare percentuali aggregate fra download, traduzioni e ricerche.
I lavori globali restano dichiarati globali anche filtrando un workspace.

**Attività.** Esiti semantici: fonte aggiunta, trascrizione prodotta, traduzione
conclusa, esportazione terminata, ricerca conclusa. Riutilizzare i fatti di
provenienza locali già esistenti dove coprono l'evento; completare solo i fatti
mancanti necessari. Nessun evento per token, click o percentuale. Esplicitare la
finestra temporale, per esempio ultimi 7 giorni, distinta dai totali del patrimonio.

**Stato locale.** Dettaglio su lavori bloccati, configurazioni necessarie e,
solo con dati persistiti affidabili, ultimo backup riuscito e spazio occupato.
L'esistenza di `exported_at` in un backup non prova che l'app conosca l'ultimo
backup riuscito. Eventuali misure disco sono cache datate, aggiornabili a richiesta.
Non interrogare continuamente biblioteche o modelli per mostrare pallini verdi.
Mostrare «Ultimo esito noto», non «Servizio online» senza verifica corrente.
Credenziali LLM mancanti non sono un allarme per chi legge soltanto libri.
Costi eventuali: intervallo e valuta espliciti, stime distinte da addebiti;
nessuna somma di valute o dato sconosciuto trasformato in zero. Non sono un
requisito bloccante della prima Dashboard.

### Layout, ambito e robustezza

Su spazio stretto: Patrimonio → Riprendi → Attenzione → In esecuzione →
Workspace → Attività → Stato locale. Su desktop mantenere Attenzione visibile
senza dover cercare in fondo. Dettagli operativi progressivamente espandibili,
nessun riordino automatico dei blocchi mentre si leggono.

- Dashboard globale all'apertura; filtro workspace esplicito, senza cambiare
  il workspace operativo. Applicarlo a tutte le query con legame dimostrabile.
  Ricerca esterna, configurazione e spazio disco sono globali e dichiarati tali.
- Ogni blocco ha loading/ready/empty/error indipendente: niente unico
  Promise.all che annulla tutti i risultati se una query fallisce.
- Separare totali del patrimonio, stato corrente e attività nel periodo.
  Ogni query documenta unità, ambito, deduplicazione e istante di aggiornamento.
- Query/read-model derivati dal database e dai fatti esistenti; nessuna nuova
  tabella di contatori canonici aggiornata manualmente dai worker.
- Eventi dominio e rientro nella pagina invalidano soltanto i blocchi pertinenti,
  con aggiornamenti raggruppati. Nessun polling rapido né query per token.
- Oggetto rimosso: messaggio e refresh del blocco, non navigazione casuale.
  Stato vuoto utile con una singola azione coerente; errori con riprova locale.
- Preferenze visive persistibili; dati derivati riletti. Limiti e paginazione
  impediscono di caricare tutto l'archivio per mostrare cinque righe.

## 9. Componenti e accessibilità

| Necessità | Primitiva da riutilizzare |
| --- | --- |
| Cerca, ferma, riprova, aggiorna, aggiungi | `IconButton` neutro con tooltip e nome accessibile |
| Catalogo / ricerca e dettaglio a schede | `TabStrip` / `InspectorShell`, etichetta della scheda attiva visibile |
| Servizi diretti e aggregatori, in gruppi distinti | `ToggleRow`, non pill create per questa schermata |
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

Nel nucleo da implementare, ricerche lanciate e risultati devono persistere.
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
| F0 Contratti | Registro e adapter; tipi ricerca/gruppo/esecuzione/pagina, occorrenze e risorse opzionali, capacità e configurazione | Fixture diretta, aggregata e solo bibliografica; niente manifesti inventati |
| F1 Navigazione | appLocation, App, shell e area ricerca; riuso del pannello singolo | Ricerca dalla Biblioteca, elenco ricerche e ritorno con stato conservato |
| F2 Persistenza e job | Schema ricerca, creazione batch atomica, handler provider e checkpoint | Successo parziale, crash, cancel e due ricerche concorrenti isolati |
| F3 Form e copertura | Gruppi diretti/aggregatori, istituzione distinta, configurazione, bozza e piano filtri | Invio validato; nessun criterio ignorato né job riconfigurato |
| F4 Normalizzazione | Date, natura, autore/editore e valutazione locale | Remote/local/ignoto distinti, conteggi esclusivi verificati |
| F5 Risultati e monitor | Eventi, pagine, storico, provenienza, raggruppamenti certi e accessibilità digitale | Arrivi stabili, retry selettivo; occorrenze/gruppi distinti e nessuna fusione falsa |
| A1 Aggregatore pilota | Europeana dietro configurazione; fixture, limiti, paginazione, record/manifesti e filtri verificati | Un job Europeana; nessun fan-out alle istituzioni; errore immagini separato |
| A2 Estensione collegata | Ricerca sorella, elenco gruppi e vista combinata | Criteri originali immutabili, nessun rilancio dei diretti, statistiche riconciliabili |
| D1 Dati Dashboard | Query/read-model per patrimonio, workspace, attività e attenzione; contratti per ambito e unità | Dati reali, errori isolati, placeholder esclusi, deduplicazione verificata |
| D2 Dashboard UI | Gerarchia panoramica, Riprendi, Attenzione, lavori/ricerche e attività; primitive esistenti | Destinazioni valide, layout adattivo, nessuna duplicazione di coda o ricerca |
| F6 Preferenze | Selezione provider persistibile; poi preset di ricerca versionati | Riapertura senza rete automatica; capacità cambiate segnalate |
| Q1 Consolidamento | Test, prova desktop, guide IT/EN e help | Scenari sotto verificati, ricerca singola senza regressioni |

Ordine consigliato: F0 → F2 → F1/F3/F4 → F5 → A1 → A2 → Q1.
F1/F3/F4 possono essere divisi in piccoli task dopo contratti stabili.
D1 è indipendente dai nuovi provider; D2 segue D1 e si collega a F2/F5 per
i riepiloghi delle ricerche. F6 segue il form stabile; i preset sono successivi.
Storico, risultati persistiti e monitor sono nel nucleo, non rimandati a F6.

Prima consegna utile: federazione dei diretti già funzionanti, monitor persistito
e Dashboard con dati reali. Seconda: Europeana con provenienza e record
bibliografici gestiti correttamente. Terza: estensione collegata e vista combinata.
Una chiave o un endpoint aggregatore indisponibile non blocca la prima consegna.

### Nuove fonti: ordine proposto, non promessa di supporto

| Priorità | Fonte | Porta di ingresso e condizione |
| --- | --- | --- |
| Alta | Wellcome Collection | API catalogo pubblica senza autenticazione; verificare mapping filtri, `items` e manifesti su campioni pertinenti |
| Alta per contenuto storico | e-rara, e-manuscripta | IIIF e interfacce documentate; distinguere harvesting da ricerca live; percorso diretto prima se necessario |
| Successiva | MDZ / Bayerische Staatsbibliothek | IIIF documentato; validare separatamente ricerca, copertura e limiti immagini/OCR |
| Specialistica | Biblissima | Verificare endpoint di ricerca utilizzabile e manifesti completi/parziali prima di abilitare il provider |

Fonti: [Wellcome catalogo](https://developers.wellcomecollection.org/api/catalogue),
[Wellcome API repository](https://github.com/wellcomecollection/catalogue-api),
[e-rara interfacce](https://www.e-rara.ch/wiki/apiinfo),
[e-manuscripta](https://www.e-manuscripta.ch/wiki/aboutEmanuscripta),
[MDZ interfacce](https://www.digitale-sammlungen.de/de/schnittstellen),
[Biblissima vademecum](https://doc.biblissima.fr/vademecum-biblissima/).

Per ogni candidato richiedere fixture e prova manuale controllata: query,
paginazione, filtri, istituzione, risorsa apribile, limiti/condizioni e errori.
Wellcome ignora parametri query sconosciuti: una risposta HTTP riuscita non
dimostra che il filtro sia applicato. Europeana va campionata sulle collezioni
utili all'utente: non presumere copertura completa di Bodleian, BnF o Estense.
Non rendere queste aggiunte un prerequisito del coordinatore federato.


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

24. Stesso manifesto via diretto ed Europeana: due occorrenze, una riga combinata,
    statistiche provider conservate; stesso titolo con manifesti diversi resta distinto.
25. Deselezionare Gallica non esclude BnF via aggregatore; filtro istituzione
    distinto e copertura non verificabile dichiarata.
26. Aggregatore riuscito ma immagini bloccate; metadati visibili, nessun falso
    fallimento del job di ricerca e nessuna falsa aggiunta al lettore.
27. Record senza manifesto, manifesto non verificato e manifesto parziale:
    stati/azioni diversi; niente URL fittizi né eliminazione silenziosa.
28. Chiave mancante/scaduta o capacità cambiata fra piano e avvio: validazione,
    nessuna credenziale nei log e nessuna fonte saltata senza conferma.
29. Estensione mentre i diretti girano: nuova ricerca collegata, job indipendenti,
    nessuna mutazione dello snapshot; vista combinata senza doppi conteggi.
30. Dashboard con fonte condivisa fra workspace, ricerca globale, area placeholder
    e attività fuori periodo: unità/ambiti corretti e nessun collegamento morto.
31. Arricchimento che scopre un duplicato: aggiornamento esplicito stabile,
    provenienze conservate e conteggi ricalcolati con la stessa regola.
32. Dashboard con tre job appartenenti a una ricerca: tre lavori e una ricerca,
    mai quattro lavori; dati mancanti distinti da zero.

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
