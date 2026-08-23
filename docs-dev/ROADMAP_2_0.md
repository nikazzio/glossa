# Roadmap Glossa 2.0

Ultimo aggiornamento: 2026-08-23.

## Stato generale

La foundation 2.0 e il blocco 1 hanno introdotto cataloghi globali, workspace
operativi, deposito, scaricamento IIIF, coda persistente, cache, registrazione e
backup di base. Il prossimo rilascio intermedio è la 1.5.

## Prima della 1.5

### PR #444

Rifiniture funzionali, lint e suite automatica completati. Restano prove manuali
e CI.

### Riservatezza di backup ed esportazioni

Completati i backup privati: formato solo Glossa, dichiarato come
offuscamento, e formato cifrato con password e codice di recupero. Non c'è
retrocompatibilità con i formati precedenti. Le esportazioni di workspace e
pipeline non esistono ancora e definiranno il loro formato quando verranno
introdotte.

Il formato cifrato deve conservare in chiaro versione e parametri di derivazione,
distinguere password errata da archivio danneggiato e non includere le chiavi dei
provider.

### Consolidamento dello schema

- sostituire le migrazioni del blocco con una baseline leggibile;
- introdurre nella baseline pagine logiche e rappresentazioni file, rimuovendo
  il collegamento diretto fra frammento trascritto e file;
- ricreare i database di sviluppo;
- eseguire test di primo avvio, backup e ripristino.

### Integrazione

Aggiornare la PR #429, eseguire CI sul branch integrato e unire `blocco-1` in
`main` come Glossa 1.5.

## Dopo la 1.5

### Biblioteca e acquisizione

- applicare il divieto di scaricamento dichiarato dalle istituzioni;
- inserire la scelta del deposito nel primo avvio;
- controllare lo spazio libero prima di adottare una cartella;
- riconoscere realmente i segnaposto delle cartelle sincronizzate;
- misurare le undici biblioteche e verificare la sessione del lettore per la
  Biblioteca Vaticana;
- abilitare più pagine in parallelo solo per le biblioteche misurate;
- aggiungere il visore e il recupero della singola pagina a piena risoluzione;
- permettere valori di ottimizzazione specifici per opera.

### Workspace e portabilità

- esportare e importare un singolo workspace (#434);
- completare il flusso di spostamento del deposito;
- ricucire il legame pagina-segmento dopo un nuovo scaricamento;
- spostare l'import CSV dei glossari interamente nel backend.

### Shell e osservabilità

- unificare la barra di stato;
- completare la console generale dei log (#413);
- aggiungere notifiche di sistema per i lavori lunghi;
- risolvere scrollbar e artefatti grafici Linux senza workaround globali.

### Studio immagini e trascrizione

- visore pagine e selezione intervalli;
- snippet e corpus di immagini;
- OCR/HTR come lavori persistenti;
- bridge da trascrizione approvata a traduzione;
- livello bibliografico per gli stampati (#404).

### Export e Analisi

- Export Studio contestuale e artifact tracciati;
- metriche derivate e area Analisi;
- dataset versionati;
- registro di modelli e adapter;
- valutazione semantica sorgente-traduzione.

## Regole di avanzamento

- una funzione utente aggiorna guida interna e documentazione pubblica IT/EN;
- una modifica a flussi, comandi, store o schema aggiorna `ARCHITECTURE.md`;
- una modifica alla composizione dei prompt aggiorna la sezione Pipeline di
  `ARCHITECTURE.md`;
- lo stato di sessione viene aggiornato alla fine di ogni task;
- i piani implementativi completati vengono rimossi dopo aver trasferito
  invarianti, decisioni e lavoro residuo nei documenti permanenti.
