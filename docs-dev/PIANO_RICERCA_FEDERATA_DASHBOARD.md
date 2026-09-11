# Ricerca federata e Dashboard operativa

Proposta di implementazione · 11 settembre 2026.

Questo documento è un piano, non descrive funzionalità già implementate.
Preparato sul branch `feat/library-providers-verify`, base `4c1919c`, mentre
sono in corso modifiche locali ai provider e alla ricerca singola. Prima di
implementare, rileggere quelle parti: firme e capacità possono essere cambiate.
Il piano non richiede di interrompere o riscrivere il lavoro sui provider.

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

## 3. Ricerca: composizione della schermata

Wireframe concettuale, non una prescrizione di pixel. Le parole fra parentesi
quadre spiegano icone con tooltip, non pulsanti testuali da introdurre.

```text
Biblioteca                           [Catalogo] [Cerca nelle biblioteche]
Cerca nelle biblioteche                          [Ricerche salvate]

Parole chiave [________________________________] [Cerca / Ferma]
6 biblioteche selezionate · 2 criteri             [Mostra criteri]
──────────────────────────────────────────────────────────────────
Risultati                               │ Criteri
42 ricevuti · 4/6 biblioteche risposte    │ Titolo     [___________]
2 ancora in ricerca                     │ Autore     [___________]
                                        │ Editore    [___________]
[copertina] Titolo dell'opera            │ Natura     [Tutte    v]
Autore · data · biblioteca               │ Anno da [____] a [____]
Manoscritto · 120 pagine   [Dettagli][+]  │ Lingua     [Tutte    v]
──────────────────────────────────────  │
[copertina] Seconda opera                │ Biblioteche
...                                     │ [x] Gallica
                                        │ [x] Vaticana
[Carica altri risultati]                 │ [ ] Internet Archive
                                        │ Copertura dei criteri
──────────────────────────────────────────────────────────────────
Barra di stato e pannello lavori esistenti
```

### Layout e interazioni

- Titolo grande editoriale; la destinazione attiva è scritta accanto alle icone.
- Risultati in elenco come vista iniziale: confronto di autore, data e origine
  prima delle copertine. Nessun mosaico come requisito della prima versione.
- Colonna destra ridimensionabile e richiudibile, sul modello dei filtri del
  catalogo. Campi e selezione provider nello stesso pannello, in sezioni.
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

## 5. Federazione: architettura proposta

```text
Form + selezione provider
          │ snapshot validato
          ▼
Servizio ricerca federata Rust
  ├─ pianifica copertura filtri
  ├─ limita concorrenza globale
  └─ adapter singoli + cortesia/cache già esistenti
          │ pagine parziali + errori indipendenti
          ▼
Sessione di ricerca → elenco, stato provider, dettaglio
          │ comando esplicito
          ▼
Aggiunta al catalogo/workspace esistente
```

Nuovo coordinatore sottile in Rust. Estrarre dal comando Tauri singolo il
servizio richiamabile senza invocare comandi IPC dall'interno del backend.
La rete resta nel backend, i parser restano negli adapter. Non inviare HTTP
direttamente dal browser e non introdurre un secondo client non regolato.

La ricerca è interattiva ed effimera: non creare un job persistente per ogni
query. Il servizio vive a livello app durante la sessione; cambiare schermata
non annulla, Ferma sì. Chiudere l'app termina la ricerca; risultati non promessi
al riavvio. Download e acquisizioni continuano a usare la coda persistente.

### Contratti orientativi, da allineare al lavoro provider

```ts
type SearchCriteria = {
  query?: string;
  title?: string;
  author?: string;
  publisher?: string;
  material?: 'manuscript' | 'printed' | 'other';
  yearFrom?: number;
  yearTo?: number;
  language?: string;
};
type SearchRequest = {
  requestId: string; // creato dal chiamante, prima della sottoscrizione
  providerKeys: string[];
  criteria: SearchCriteria;
  strictRemoteFilters: boolean;
  fresh: boolean;
};
type ProviderSearchState = {
  providerKey: string;
  state: 'queued' | 'searching' | 'ready' | 'empty' |
         'failed' | 'cancelled' | 'unsupported';
  hasMore: boolean;
  nextCursor?: string; // opaco; può rappresentare una pagina numerica
  received: number;
  cachedAt?: number;
  error?: { code: string; message: string; retryable: boolean };
};
type SearchEvent = {
  requestId: string;
  providerKey: string;
  attempt: number;
  sequence: number;
  kind: 'page' | 'status' | 'error';
  // payload discriminato e validato nella versione implementativa
};
```

Comandi proposti: `plan_federated_search`, `start_federated_search`,
`load_more_search_results`, `retry_search_provider`, `cancel_federated_search`,
`get_search_snapshot`. Riutilizzare nomi/contratti già introdotti nel frattempo.
Il piano deve verificare di nuovo le capacità all'avvio; una versione del
registro impedisce di eseguire uno snapshot pianificato su capacità superate.

Sottoscrivere prima di start; snapshot con numero sequenza per recuperare eventi
persi o rimontaggi. Ignorare requestId vecchi, tentativi superati e sequenze già
viste. La cancellazione raggiunge richieste HTTP, attese e coda; nessun evento
tardivo riporta una richiesta cancellata a searching. Se resta in corso una
pagina di un provider, non programmarne un'altra per la stessa sessione.

Budget iniziali proposti: massimo 3 provider attivi, una pagina per provider
per giro, al massimo 20 risultati per pagina se supportato. Gli adapter possono
avere pagine fisse: non scartare record per forzare 20 e poi saltare il resto.
Riutilizzare timeout e attese di cortesia; una fonte lenta non blocca le altre.
Non aumentare i limiti già misurati per soddisfare questi valori proposti.

Ogni pressione di «Carica altri» programma un giro dei provider con hasMore;
nessuna scansione automatica dell'intero catalogo. Per filtri locali selettivi,
dire che altre pagine potrebbero contenere corrispondenze. Budget sessione
proposto 1000 record ricevuti; al limite chiedere di affinare, senza troncare
silenziosamente una pagina. Virtualizzazione sopra una soglia misurata.

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

### Ordinamento progressivo

Prima versione: ordine stabile d'arrivo delle pagine, ordine remoto all'interno
di ogni pagina. Etichetta «Ordine di arrivo», nessuna falsa rilevanza globale.
Appendere senza spostare righe già lette; provider veloci non possono caricare
altre pagine da soli. Ordinamento alternativo titolo/data/biblioteca disponibile
a ricerca ferma o giro terminato, sui soli risultati caricati. Record con data
ignota in fondo. Ranking aggregato e raggruppamenti bibliografici sono successivi.

## 6. Dashboard: centro di lavoro

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

## 7. Componenti e accessibilità

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

## 8. Stato, navigazione e persistenza

Estensione proposta della posizione Biblioteca: discriminare catalogo, ricerca
e dettaglio. Mantenere validi i vecchi `libraryLocation({ itemId })` attraverso
helper di compatibilità, oppure migrare tutte le chiamate in un task dedicato.
Aggiornare confronto, breadcrumb, evidenziazione rail e test insieme. Non
introdurre una quinta area globale solo per la ricerca.

Un solo store di ricerca conserva bozza, richiesta inviata, snapshot provider,
risultati, selezione ed espansione. Stato HTTP non dentro uiStore. Nel backend
una sessione attiva con snapshot limitato; frontend osserva, non duplica la
macchina di retry. La nuova ricerca cancella la precedente dopo validazione.

Ricerche salvate: seconda iterazione, query e criteri versionati, provider
selezionati e nome; non salvare risultati come patrimonio acquisito. Caricare
una ricerca salvata riempie il form, non avvia rete. Provider rimossi/filtri
cambiati richiedono un avviso; non alterare silenziosamente la richiesta.
Preferenze selezione provider persistibili già nella prima iterazione.

## 9. Integrazione col lavoro parallelo sui provider

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

## 10. Sequenza implementativa in task verificabili

Ogni task deve mantenere utilizzabile la ricerca singola. I percorsi nuovi qui
indicati sono suggerimenti, non file già esistenti. Nessun taglio unico di
migliaia di righe necessario.

| Task | Intervento e punti di contatto | Criterio di chiusura |
| --- | --- | --- |
| F0 Contratti | `types.ts`, registro provider e servizio singolo dopo il lavoro parallelo; nuovo modulo tipi di ricerca | Fixture per almeno 3 provider con capacità diverse; errori/filtri/pagine concordati |
| F1 Destinazione ricerca | `appLocation.ts`, `App.tsx`, shell, nuova area ricerca; spostare composizione del pannello attuale | Ricerca singola funziona dalla Biblioteca, ritorno conserva stato; Dashboard ha comando d'accesso |
| F2 Coordinatore | Nuovo `iiif/federated.rs` e bridge; servizio singolo estratto se necessario | Due esiti positivi e un errore arrivano indipendenti; stop e nuova query non contaminano risultati |
| F3 Form e provider | Nuovi componenti `components/discovery/`; evoluzione store | Selezione, bozza, invio, copertura criteri e modalità singola coerenti |
| F4 Filtri e date | Nuovo modulo normalizzazione/valutazione con fixture | Remote/local/ignoto distinti; date e natura non inventate; nessun filtro perso |
| F5 Risultati progressivi | Riutilizzo righe e aggiunta; paging/dedup/cache | Più pagine senza duplicati; nessun falso totale; riprova solo fonte fallita |
| D1 Dashboard | Ridistribuire `AppDashboard`, componenti di blocco; query esistenti | Nessun modulo di ricerca incorporato; Riprendi, Attenzione, Lavori, Attività funzionano |
| D2 Dati Dashboard | Servizio read-model dedicato, query/filtri e invalidazioni | Scope coerente; errore di un blocco isolato; dati non confondono revisioni e frammenti |
| F6 Preferenze e salvataggi | Preferenze provider, poi ricerche salvate versionate | Riapertura non scatena rete; provider spariti gestiti esplicitamente |
| Q1 Consolidamento | Test integrazione, prova desktop, guide IT/EN e help | Tutti gli scenari sotto verificati; nessuna regressione ricerca singola |

D1 può iniziare dopo F1, mentre F2–F5 avanzano. D2 non dipende da nuove
capacità dei provider. Le ricerche salvate possono seguire il primo rilascio
della federazione; selezione provider e filtri richiesti fanno parte del nucleo.

### Scenari obbligatori

1. Tre provider: rapido, lento e fallito; risultati immediatamente utilizzabili.
2. Query A, poi B; risposta tardiva di A ignorata anche dopo retry.
3. Stop durante richiesta, attesa di cortesia e caricamento pagina successiva.
4. Tutti falliti distinto da zero risultati; un errore non cancella i successi.
5. Titolo/autore/editore combinati, filtro non supportato, data assente o incerta.
6. Pagina con zero corrispondenze locali ma hasMore vero.
7. Stesso id in due provider non collide; stesso titolo non fonde opere.
8. Stesso manifesto già in catalogo: collegamento workspace senza nuova copia.
9. Cache fresca/vecchia, refresh esplicito e cambio criteri non riusano risultati errati.
10. Cambio schermata durante ricerca e ritorno; listener non duplicati.
11. Nessun provider selezionato; provider nuovo, rimosso o senza ricerca.
12. Dashboard vuota, filtro workspace, oggetto eliminato, query fallita singolarmente.
13. Dashboard con soli libri e nessuna chiave LLM: nessun falso blocco.
14. Tastiera, zoom 200%, tema scuro, titoli lunghi, risultati virtualizzati e focus.

Backend con fixture HTTP deterministiche; frontend con eventi simulati fuori
ordine; prove vive mirate dopo stabilizzazione degli adapter. Non mettere
cataloghi esterni variabili come requisito dei test CI. Misurare tempo al
primo risultato, richieste per provider, annullamento, memoria e fluidità lista:
le latenze delle biblioteche non diventano SLA inventati per l'interfaccia.

## 11. Istruzioni per chi implementa con un LLM

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
