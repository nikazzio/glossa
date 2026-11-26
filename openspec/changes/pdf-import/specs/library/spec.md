# Spec Delta

## Purpose

La Biblioteca raccoglie le opere su cui lo studioso lavora, con i loro dati e le
loro copie (immagini, PDF). Questa specifica copre le opere che entrano da un
file sul computer invece che da una biblioteca online.

## ADDED Requirements

### Requirement: Importare un PDF come opera nuova

La Biblioteca SHALL offrire un comando per importare un file PDF dal computer.
L'importazione SHALL creare un'opera nuova con una copia PDF che contiene quel
file. Il titolo SHALL essere obbligatorio; autore, data, lingua e indirizzo
della pagina della biblioteca SHALL essere facoltativi. Glossa SHALL rifiutare
un file che non è un PDF valido, spiegando il motivo, senza creare l'opera.
Il numero di pagine SHALL essere letto dal file.

#### Scenario: Importazione riuscita

- **WHEN** lo studioso sceglie un PDF valido, scrive il titolo e conferma
- **THEN** in Biblioteca compare un'opera nuova con quel titolo, con la copia PDF
  sul computer e il numero di pagine letto dal file
- **AND** il PDF si apre nel visore della scheda dell'opera

#### Scenario: File non valido

- **WHEN** lo studioso sceglie un file che non è un PDF o è danneggiato
- **THEN** Glossa mostra un messaggio che dice che il file non è un PDF leggibile
- **AND** nessuna opera viene creata

#### Scenario: Titolo mancante

- **WHEN** lo studioso prova a confermare senza titolo e senza manifesto
- **THEN** la conferma non è possibile finché il titolo è vuoto

### Requirement: Estrazione subito dopo l'importazione

La finestra di importazione SHALL offrire la scelta «Estrai subito le pagine»,
attiva all'inizio. Se attiva, a importazione riuscita SHALL partire il lavoro di
estrazione delle pagine.

#### Scenario: Scelta attiva

- **WHEN** lo studioso importa un PDF lasciando attiva «Estrai subito le pagine»
- **THEN** nei Lavori compare subito l'estrazione delle pagine della nuova opera

#### Scenario: Scelta disattivata

- **WHEN** lo studioso disattiva la scelta e importa
- **THEN** l'opera viene creata senza avviare l'estrazione

### Requirement: Manifesto facoltativo all'importazione

Insieme al PDF lo studioso SHALL poter caricare un manifesto IIIF salvato dal
browser. I dati letti dal manifesto SHALL riempire i campi della finestra e
SHALL valere come dati della biblioteca. Un manifesto illeggibile SHALL essere
segnalato senza impedire l'importazione del PDF.

#### Scenario: Manifesto leggibile

- **WHEN** lo studioso carica un PDF e il manifesto della stessa opera
- **THEN** titolo, autore, data e gli altri dati dichiarati compaiono già
  compilati
- **AND** nella scheda dell'opera risultano come dati della biblioteca

#### Scenario: Manifesto illeggibile

- **WHEN** il file scelto come manifesto non si riesce a leggere
- **THEN** Glossa lo segnala e lascia importare il PDF con i campi a mano

### Requirement: Correzioni a mano sopra i dati della biblioteca

I campi scritti o modificati a mano nella finestra SHALL essere salvati come
correzioni, che prevalgono sui dati della biblioteca come nelle altre opere.
Un'opera importata senza manifesto SHALL offrire nella sua scheda il comando per
caricarlo in un secondo momento; il caricamento SHALL riempire i dati della
biblioteca senza toccare le correzioni.

#### Scenario: Correzione a mano sopra il manifesto

- **WHEN** lo studioso cambia a mano il titolo proposto dal manifesto e conferma
- **THEN** la scheda mostra il titolo scritto a mano come correzione
- **AND** il titolo del manifesto resta conservato come dato della biblioteca

#### Scenario: Manifesto caricato dopo

- **WHEN** lo studioso carica il manifesto su un'opera già importata con campi
  scritti a mano
- **THEN** i dati della biblioteca si riempiono dal manifesto
- **AND** le correzioni scritte a mano restano e continuano a prevalere

### Requirement: Etichette delle pagine dal manifesto

Le etichette delle pagine del manifesto (per esempio «f. 1r») SHALL essere
usate per le pagine estratte solo quando il numero di pagine del manifesto
coincide con quello del PDF. Altrimenti le pagine SHALL essere numerate in
ordine.

#### Scenario: Conteggi uguali

- **WHEN** manifesto e PDF hanno entrambi 300 pagine
- **THEN** le pagine estratte mostrano le etichette del manifesto

#### Scenario: Conteggi diversi

- **WHEN** il manifesto dichiara 300 pagine e il PDF ne ha 302
- **THEN** le pagine estratte sono numerate in ordine senza le etichette del
  manifesto

### Requirement: Importare un PDF in un'opera esistente

Lo studioso SHALL poter importare un PDF, dalla scheda di un'opera già presente
in Biblioteca che non ha una copia PDF sul computer, scegliendo solo il file. Il file SHALL diventare la copia PDF di
quell'opera, senza cambiarne i dati. Se l'opera ha già un PDF sul computer,
il comando SHALL non essere disponibile.

#### Scenario: Opera senza PDF

- **WHEN** lo studioso importa un PDF in un'opera che ha solo le immagini della
  biblioteca
- **THEN** l'opera mostra anche la copia PDF, consultabile nel visore

#### Scenario: Opera con PDF già presente

- **WHEN** l'opera ha già una copia PDF sul computer
- **THEN** il comando di importazione per quell'opera non è disponibile

### Requirement: Estrarre le pagine del PDF come immagini

Per ogni copia PDF sul computer la scheda dell'opera SHALL offrire il comando
«Estrai le pagine». Il comando SHALL avviare un lavoro in coda che disegna ogni
pagina come immagine alla risoluzione dell'originale. Il lavoro SHALL comparire
nei Lavori con avanzamento, pausa e annullamento, e SHALL proseguire mentre lo
studioso usa altre parti dell'app.

#### Scenario: Estrazione completa

- **WHEN** lo studioso avvia «Estrai le pagine» su un PDF di 308 pagine
- **THEN** nei Lavori compare il lavoro con l'avanzamento
- **AND** al termine l'opera ha una copia a immagini di 308 pagine, con
  miniature

### Requirement: Ripresa e pagine guaste dell'estrazione

Rilanciato dopo un'interruzione, il lavoro di estrazione SHALL ripartire dalla
prima pagina non ancora estratta. Una pagina che non si riesce a disegnare
SHALL essere segnalata con il suo numero, senza fermare le altre.

#### Scenario: Ripresa dopo la chiusura

- **WHEN** l'app si chiude dopo 120 pagine estratte e lo studioso rilancia il
  lavoro
- **THEN** l'estrazione riparte dalla pagina 121

#### Scenario: Pagina non disegnabile

- **WHEN** una pagina del PDF non si riesce a disegnare
- **THEN** il lavoro termina con l'elenco delle pagine non estratte
- **AND** le altre pagine sono disponibili

### Requirement: Copia a immagini dell'opera importata

A estrazione completata la copia a immagini SHALL comportarsi come quella di
un'opera scaricata da una biblioteca: visore a immagini, miniature,
ottimizzazione e lettura automatica. Durante l'estrazione il visore SHALL
continuare a mostrare il PDF.

#### Scenario: Durante l'estrazione

- **WHEN** l'estrazione è in corso e lo studioso apre l'opera
- **THEN** il visore mostra il PDF

### Requirement: Allineamento fra PDF e immagini

La numerazione delle pagine estratte SHALL coincidere con quella del PDF, così
una trascrizione iniziata sul PDF resta allineata quando si passa alle
immagini. Il PDF SHALL restare sul computer finché lo studioso non lo toglie con
il comando che libera lo spazio.

#### Scenario: Passaggio da PDF a immagini

- **WHEN** una trascrizione è stata iniziata sul PDF e l'estrazione è completa
- **THEN** lo studioso può passare alle immagini nel visore e la pagina mostrata
  resta la stessa del testo

#### Scenario: PDF conservato

- **WHEN** l'estrazione è completa
- **THEN** la copia PDF resta disponibile finché lo studioso non la toglie

### Requirement: Nessuna rete per le opere importate

Le copie create dall'importazione (PDF importato e pagine estratte) SHALL non
generare richieste di rete per pagine, miniature o dati, anche quando è stato
caricato un manifesto. Una pagina non presente sul computer SHALL essere
dichiarata mancante, senza tentativi verso servizi esterni. Con il manifesto i
file SHALL stare nella cartella del deposito della biblioteca che lo dichiara;
senza manifesto, in una cartella propria delle opere importate, distinta da
quelle delle biblioteche.

#### Scenario: Pagina mancante

- **WHEN** il visore apre una pagina che non è stata estratta
- **THEN** il visore dice che la pagina non è sul computer
- **AND** non parte nessuna richiesta di rete
