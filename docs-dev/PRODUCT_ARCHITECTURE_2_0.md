# Architettura di prodotto Glossa 2.0

Stato: decisione architetturale per #180  
Ultimo aggiornamento: 2026-08-22

## 1. Scopo

Glossa 2.0 evolve da editor di traduzione a workbench locale per:

1. trovare e catalogare fonti;
2. acquisire e consultare i relativi asset;
3. trascrivere e correggere testi;
4. tradurre e revisionare;
5. esportare risultati;
6. analizzare processi e risultati e produrre dataset riproducibili.

Questo documento definisce l'architettura di prodotto, non lo schema SQLite
definitivo. I nomi fisici di tabelle, chiavi e migrazioni spettano a #211 e
#212, ma devono rispettare i confini e le invarianti qui stabiliti.

## 2. Decisione principale: cataloghi globali e workspace operativi

Glossa usa entrambi i modelli, senza duplicare gli oggetti.

### Aree globali

- **Biblioteca**: tutte le fonti e tutti i libri conosciuti da Glossa.
- **Trascrizioni**: tutti i documenti di trascrizione.
- **Traduzioni**: tutti i progetti di traduzione.
- **Analisi**: metriche, confronti, dataset, esperimenti e modelli registrati.

Le aree sono inventari per tipo. Permettono di sapere sempre quali oggetti
esistono, cercarli globalmente e filtrarli per workspace, stato, origine,
lingua, data e altri metadati.

### Workspace

Un workspace è una raccolta operativa di oggetti eterogenei legati a una
ricerca o a un'attività: per esempio fonti, trascrizioni e traduzioni relative
alla scherma storica. Offre contesto, risorse condivise, attività recente,
stato di avanzamento e accesso rapido al lavoro.

Un workspace non è un contenitore fisico esclusivo e non possiede copie degli
oggetti mostrati nelle aree globali.

### Invarianti

1. Ogni oggetto ha una sola identità canonica.
2. Una fonte può essere collegata a zero, uno o più workspace.
3. Una trascrizione ha un workspace operativo principale.
4. Un progetto di traduzione ha un workspace operativo principale.
5. Creare un oggetto dentro un workspace lo rende visibile anche nella
   corrispondente area globale.
6. Scollegare una fonte da un workspace non la elimina dalla Biblioteca.
7. Eliminare un workspace non elimina implicitamente gli oggetti.
8. La ricerca globale trova un oggetto indipendentemente dal workspace aperto.

Questo modello ibrido è intenzionale: fonti e libri sono materiali riusabili;
trascrizioni e traduzioni dipendono invece da glossari, memorie, pipeline,
configurazioni e responsabilità operative che devono avere uno scope non
ambiguo.

## 3. Mappa delle superfici

```text
Glossa
├── Dashboard
│   ├── Riprendi
│   ├── Richiede attenzione
│   ├── Attività e job
│   └── Riepilogo globale
├── Biblioteca
│   ├── Catalogo globale
│   ├── Discovery
│   ├── Scheda fonte
│   └── Consultazione / asset
├── Trascrizioni
│   ├── Catalogo globale
│   └── Studio di trascrizione
├── Traduzioni
│   ├── Catalogo globale
│   └── Studio di traduzione
├── Analisi
│   ├── Dashboard
│   ├── Esplorazione dati
│   ├── Confronti
│   ├── Dataset
│   └── Modelli / adapter
└── Workspace
    ├── Panoramica mista
    ├── Fonti collegate
    ├── Trascrizioni operative
    ├── Traduzioni operative
    ├── Attività e job
    └── Risorse condivise
```

Le sezioni di un workspace sono viste filtrate degli stessi cataloghi. Non
introducono un secondo albero di dati.

## 4. Modello concettuale

| Concetto | Identità e scope | Relazioni principali |
|---|---|---|
| Workspace | Globale | Collega fonti; è home operativa di trascrizioni e traduzioni; possiede risorse condivise |
| Fonte | Globale, anche non assegnata | Può appartenere a più workspace; espone versioni, metadati e asset |
| Versione/manifestazione | Parte di una fonte | Edizione, copia, manifest IIIF, PDF o altro accesso alla stessa fonte |
| Asset | Globale, gestito dal vault | Immagine, PDF, manifest, thumbnail, derivato; registra origine e stato locale/remoto |
| Documento di trascrizione | Globale con home workspace | Deriva normalmente da una fonte; contiene pagine/segmenti e revisioni |
| Progetto di traduzione | Globale con home workspace | Deriva da trascrizione approvata, testo di una fonte o import autonomo |
| Artifact | Globale, prodotto da un workflow | Export, dataset, report, indice o output intermedio |
| Job | Globale, attribuito al suo oggetto | Download, OCR/HTR, elaborazione, export, calcolo analitico |
| Evento di provenance | Append-only | Registra trasformazione, input, output, attore, configurazione e tempi |

### Origine del testo

Il testo usato da una traduzione deve dichiarare una delle origini:

- revisione approvata di una trascrizione;
- livello testuale disponibile su una fonte;
- file o testo importato direttamente.

L'import autonomo resta supportato: la migrazione non forza tutti i progetti
1.x a inventare retroattivamente una fonte o una trascrizione.

Una trascrizione può eccezionalmente nascere da un import senza fonte
catalogata. Glossa deve proporre, non imporre, la successiva creazione o
associazione della fonte.

### Stato e cancellazione

- Una fonte non collegata compare nel filtro **Non assegnate** della Biblioteca.
- Trascrizioni e traduzioni richiedono un workspace principale al momento
  della creazione; gli elementi legacy non assegnati restano visibili e
  ricevono un percorso esplicito di assegnazione.
- La rimozione di una fonte da un workspace elimina solo il collegamento.
- La cancellazione reale avviene dal catalogo globale, passa dal cestino e
  mostra l'impatto su workspace, derivati e job.
- Prima di eliminare un workspace, trascrizioni e traduzioni operative devono
  essere riassegnate, archiviate o eliminate esplicitamente. Le fonti vengono
  soltanto scollegate.
- Asset condivisi o ancora referenziati non vengono rimossi automaticamente.

## 5. Flusso principale

```text
Discovery / import
        ↓
Fonte in Biblioteca ───────→ consultazione remota
        │
        ├── collega a uno o più workspace
        ├── acquisisci asset con job persistente
        ↓
Documento di trascrizione
        ↓ revisione approvata
Progetto di traduzione
        ↓ pipeline + revisione
Artifact / export
        ↓
Analisi, dataset, valutazione e riuso
```

Ogni passaggio crea o collega oggetti; non sovrascrive silenziosamente
l'oggetto a monte. Provenienza e configurazione rendono il risultato
ricostruibile.

## 6. Navigazione e stato

La **posizione corrente** e il **workspace operativo** sono concetti distinti.
Aprire il workspace `Scherma` non trasforma la Biblioteca in una biblioteca
privata: applica, quando richiesto, un filtro visibile e rimovibile.

Il contratto logico di navigazione è:

```ts
type AppLocation =
  | { area: 'dashboard' }
  | { area: 'workspace'; workspaceId: string; section?: WorkspaceSection }
  | { area: 'library'; itemId?: string; workspaceFilter?: string }
  | { area: 'transcriptions'; documentId?: string; workspaceFilter?: string }
  | { area: 'translations'; projectId?: string; workspaceFilter?: string }
  | { area: 'analysis'; view?: AnalysisView; workspaceFilter?: string };
```

È un contratto di dominio, non la scelta obbligatoria di una libreria di
routing. Per la desktop app è sufficiente introdurre prima uno stato tipizzato
e testabile. URL interne o deep link possono essere aggiunte quando producono
un beneficio reale.

Regole:

- nessun fallback a un documento o workspace aperto “a caso”;
- un filtro workspace è sempre visibile nel contenuto e cancellabile;
- apertura di un risultato globale attiva il contesto necessario solo per
  l'editor, senza cambiare il significato dell'area globale;
- ultimo oggetto e stato visuale possono essere ricordati per contesto, ma non
  diventano la source of truth dell'identità;
- breadcrumb e comando Indietro ricostruiscono la posizione, non una serie di
  variabili implicite.

## 7. Shell UI

La shell è un sistema coerente di primitive e stati, non un identico layout
forzato per ogni attività.

### Cataloghi e dashboard

- rail primaria: Dashboard, Biblioteca, Trascrizioni, Traduzioni, Analisi;
- a barra aperta: elenco e creazione workspace in una sezione distinta;
- a barra chiusa: sole icone delle aree principali;
- intestazione contenuto: titolo della posizione, ricerca, filtri attivi e
  azioni proprie dell'area;
- centro: tabella, griglia, lista o dashboard secondo il dominio;
- stato globale di job e operazioni sempre raggiungibile.

### Workspace

- home mista con riepilogo, elementi recenti, stato, attività e azioni;
- sezioni per tipo che applicano un filtro workspace ai cataloghi globali;
- risorse condivise e configurazioni dichiarate nello scope del workspace;
- azione contestuale per esportare una selezione di oggetti o un pacchetto del
  workspace;
- nessuna copia locale delle schede globali.

### Studio di lavoro

Trascrizione e traduzione usano una modalità focalizzata:

- contesto/strumenti a sinistra;
- documento al centro;
- approfondimenti contestuali a destra;
- stato e job in basso;
- breadcrumb e ritorno alla vista di provenienza in alto.

La shell a tre colonne già usata dallo Studio di traduzione è la base da
evolvere, non da riscrivere. Lo Studio di trascrizione deve riusarne dimensioni,
comportamenti di collasso, primitive, status bar e convenzioni di accessibilità,
adattando i pannelli al proprio dominio.

### Regole comuni

- azione primaria unica e chiaramente riconoscibile per contesto;
- azioni globali separate da quelle dell'oggetto corrente;
- progressi lunghi rappresentati da job persistenti, non da spinner isolati;
- pannelli contestuali non cambiano la posizione primaria;
- preferenze di larghezza/collasso sono visuali e persistibili;
- selezione di area, oggetto e filtro non viene dedotta dalle preferenze UI;
- componenti e spaziature seguono `UI_DESIGN_SYSTEM.md`.

Non serve introdurre ora una nuova libreria UI generale: Radix, le primitive
esistenti e `react-resizable-panels` coprono già accessibilità, overlay e
layout. Nuove dipendenze vanno motivate da una capacità mancante, non dalla
sola necessità di ridisegnare la shell.

## 8. Contratti tra shell e domini

Ogni dominio espone alla shell:

- identità, titolo, icona e breadcrumb;
- azioni globali dell'area;
- azioni contestuali dell'oggetto;
- filtri supportati;
- stato di attenzione e avanzamento;
- job attivi o recenti;
- destinazioni valide per apertura, ritorno e creazione.

La shell non implementa:

- discovery e normalizzazione provider;
- download o gestione asset;
- OCR/HTR;
- pipeline di trascrizione o traduzione;
- costruzione dataset o calcolo metriche;
- regole di persistenza degli oggetti.

Le viste orchestrano i casi d'uso; servizi e core eseguono la logica. È lo
stesso confine architetturale di Scriptoria, adattato a React/Tauri/Rust.

## 9. Job, export, asset e analisi come servizi trasversali

### Job

Download di fonti, OCR/HTR, generazione PDF e documenti, export di immagini,
costruzione dataset, embeddings e altri calcoli lunghi condividono **un solo
sistema di job asincroni persistenti**. Non devono nascere code separate per
ogni feature.

Il sistema separa la richiesta di lavoro dalla sua esecuzione: la UI crea il
job, un orchestratore lo assegna a un worker appropriato e le viste osservano
lo stato senza dover restare aperte. Il modello comune registra:

- stato e progresso;
- oggetto, workspace e origine del comando;
- tipo di job, priorità e dipendenze da altri job;
- configurazione usata;
- tentativi, pausa, annullamento, ripresa e retry;
- errore leggibile e output prodotti;
- protezione degli stati terminali da aggiornamenti tardivi del worker.

Il runtime limita la concorrenza per categoria e risorsa: download, CPU,
provider remoto e generazione documenti non devono saturare insieme rete,
memoria o servizi a pagamento.

“Asincrono” significa che l'interfaccia resta utilizzabile e il lavoro
continua cambiando vista. Nella prima implementazione non richiede un demone
esterno attivo con Glossa chiusa: se l'app termina, i job restano persistiti e
al riavvio vengono ripresi o marcati recuperabili secondo il loro tipo.

I primi consumatori sono acquisizione fonti e asset (#218), poi OCR/HTR,
export e analisi. Le traduzioni interattive di un singolo frammento possono
restare nel flusso diretto; elaborazioni batch o lunghe potranno usare lo
stesso sistema senza introdurre una seconda coda.

### Export Studio e artifact

L'esportazione non è un'area primaria e non è un'impostazione del workspace.
È un'azione contestuale disponibile da:

- una fonte, per PDF, immagini, manifest o metadati;
- una trascrizione, per testo, PDF, DOCX, TEI/XML, immagini o selezioni;
- una traduzione, per output monolingue, bilingue e altri formati supportati;
- un workspace, per un pacchetto selezionato di più oggetti e artifact.

L'azione apre lo stesso **Export Studio**, adattato all'oggetto di origine. Qui
l'utente sceglie contenuto, versione, intervallo di pagine, formato, profilo,
metadati e destinazione. La produzione viene affidata al sistema di job e ogni
risultato diventa un artifact con origine e configurazione tracciate.

I profili predefiniti — tipografia, copertina, logo, formato, metadati e
destinazione — possono vivere nelle impostazioni del workspace o dell'app.
L'esecuzione dell'export resta invece un'azione visibile sull'oggetto o sul
workspace.

Gli artifact sono raggiungibili:

- dalla cronologia dell'oggetto che li ha prodotti;
- dalla panoramica del workspace;
- dalla vista globale di job e output collegata a Dashboard/status bar.

Questa vista globale è una superficie di servizio, non una quinta area
primaria. Potrà diventare un catalogo autonomo solo se il volume e i workflow
reali lo renderanno necessario.

### Asset

Il record canonico della fonte resta separato dai file locali. Per le pagine
IIIF il disco è la fonte di verità: cartelle e file laterali descrivono ciò che
è presente, senza una riga database per ogni pagina. Manifesti, documenti,
derivati e futuri artifact mantengono identità e metadati nel database quando
serve un riferimento stabile. Cache e deposito restano distinti: la cache è
riproducibile e si può eliminare, il deposito rappresenta materiale acquisito
esplicitamente.

### Analisi

Analisi è un'area globale con filtri workspace. La provenienza significativa
viene raccolta durante i workflow, non ricostruita a posteriori dai soli stati
finali.

Glossa registra dati scientificamente o operativamente utili: qualità, tempi,
costi, errori, correzioni, versioni di prompt/modelli, legami tra input e
output. Non introduce clickstream indiscriminato né telemetria esterna
implicita.

Glossa prepara dataset versionati ed esportabili; l'addestramento resta
esterno nella 2.0. Modelli o adapter prodotti fuori dall'app possono essere
registrati, valutati e riusati tramite provider locali come Ollama.

## 10. Scriptoria come riferimento principale

Ogni issue implementativa 2.0 deve indicare quali moduli Scriptoria sono stati
consultati e quali pattern sono stati adottati, adattati o rifiutati.

| Ambito | Riferimento Scriptoria | Decisione Glossa |
|---|---|---|
| Confine core/UI | `docs/ARCHITECTURE.md` | Adottare: vista orchestra, core implementa |
| Discovery | `resolvers/provider_registry.py`, `orchestrator.py` | Adottare registry capability-driven e risultati normalizzati |
| Catalogo | `library_catalog.py`, `docs/guides/discovery-and-library.md` | Adottare identità stabile anche senza asset |
| Storage | `services/storage/vault_manager.py`, `docs/explanation/storage-model.md` | Adattare record/asset/staging al vault Tauri |
| Job | `jobs.py`, `docs/explanation/job-lifecycle.md` | Adottare persistenza, terminalità, resume/retry e origine |
| Studio | `studio_ui/components/_studio/workspace.py`, `docs/guides/studio-workflow.md` | Adattare workspace pagina-aware alla shell Glossa |
| Statistiche | route e componenti `stats` | Adottare fast metrics; estendere con provenance e dataset |

Scriptoria resta il primo posto in cui cercare una soluzione funzionale e
tecnica per IIIF, fonti, asset, job, trascrizione ed export. Gli altri prodotti
raccolti in #383 servono come riferimenti secondari di funzionalità e UI/UX.

## 11. Migrazione senza big bang

### Passo A — contratto di navigazione

- introdurre la posizione tipizzata;
- separare posizione, filtro workspace e preferenze visuali;
- conservare le viste e lo Studio di traduzione correnti;
- correggere copy e comportamenti che presentano le aree come interne al
  workspace.

### Passo B — cataloghi globali sopra i dati esistenti

- Traduzioni continua a mostrare tutti i progetti;
- Workspace continua a mostrare il proprio sottoinsieme;
- aggiungere i punti d'ingresso vuoti di Biblioteca, Trascrizioni e Analisi;
- nessuna modifica distruttiva ai progetti 1.x.

### Passo C — modello fonti e collegamenti

- introdurre identità fonte, versioni, asset e relazione molti-a-molti con i
  workspace;
- migrare i riferimenti solo quando l'origine è nota;
- lasciare validi gli import autonomi.

### Passo D — trascrizioni e bridge

- introdurre documenti/pagine/revisioni di trascrizione;
- rendere esplicito il passaggio approvato verso la traduzione;
- mantenere separati gli stati dei due workflow.

### Passo E — servizi trasversali

- job persistenti e vault;
- provenance e metriche;
- Analisi, dataset e model registry;
- Export Studio contestuale e artifact history.

Ogni passo deve lasciare l'app utilizzabile e il database recuperabile. La
migrazione fisica dettagliata e la strategia di backup appartengono a #212,
#344 e #345.

## 12. Decisioni chiuse e questioni demandate

### Chiuse dalla #180

- aree globali più workspace operativi;
- oggetti canonici senza copie;
- fonti collegabili a più workspace;
- home workspace unica per trascrizioni e traduzioni;
- Analisi come area globale filtrabile;
- Scriptoria riferimento principale per codice e funzionalità;
- shell comune per convenzioni, con layout adattato al dominio;
- stato di navigazione tipizzato prima di valutare una libreria di routing;
- nessuna nuova libreria grafica necessaria per la foundation.

### Demandate alle issue specialistiche

- schema fisico, indici e migrazioni: #211 e #212;
- risorse condivise e regole precise di ereditarietà: #213;
- source/asset policy e vault: #217;
- protocollo ed esecutore dei job: #218;
- Export Studio, profili e artifact: #188 e #225;
- provenance e metriche: #378;
- visualizzazione Analisi: #379;
- formato dei dataset: #380;
- registro modelli e adapter: #381;
- metrica semantica sorgente-traduzione: #382.

## 13. Criteri di accettazione della #180

- [x] Information architecture e superfici principali definite.
- [x] Distinzione fra aree globali, workspace e studi operativi definita.
- [x] Identità, relazioni e cancellazione degli oggetti definite a livello
      concettuale.
- [x] Contratto di navigazione e stato globale definito.
- [x] Shell cataloghi/workspace/studi e relativi confini definiti.
- [x] Job, asset e Analisi collocati nell'architettura.
- [x] Export Studio e output collocati senza introdurre un'area primaria.
- [x] Pattern Scriptoria tracciati.
- [x] Migrazione incrementale dalla UI 1.x definita.
