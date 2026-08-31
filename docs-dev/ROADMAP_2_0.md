# Roadmap Glossa 2.0

Ultimo aggiornamento: 2026-08-30.

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

### Integrazione

La PR #429 è pronta: baseline, CI e ripristino del backup su database ricreato
sono stati verificati. Resta il merge di `blocco-1` in `main` come Glossa 1.5.

## Dopo la 1.5

### Biblioteca e acquisizione

- **sistemare visivamente l'elenco del catalogo** (vista lista/griglia): dopo
  il ridisegno della scheda opera, resta la revisione UI/UX del punto 9bis
  segnata da Niki, non ancora iniziata;
- **estendere la correzione a mano a tutti i campi della scheda opera**:
  deciso con Niki (1 settembre) — non serve solo per correggere quello che la
  biblioteca dichiara, ma soprattutto per **aggiungere** un dato quando la
  biblioteca non lo dà affatto (l'obiettivo è la stessa scheda, con lo stesso
  elenco di campi, per ogni opera — quello che manca dalla fonte lo completa
  Niki a mano). Oggi solo 5 campi sono correggibili (titolo, tipo, autore,
  data, lingua), tramite `source_field_overrides` con un vincolo che accetta
  solo quei 5 nomi. Da estendere ai 7 rimasti (editore, altri responsabili,
  diritti, descrizione fisica, soggetti, volume, descrizione) — nessuna
  migrazione incrementale serve (schema ancora in consolidamento pre-1.0,
  vedi CLAUDE.md), ma tre di questi campi (altri responsabili, diritti,
  soggetti) sono più valori insieme lato biblioteca: da decidere come si
  modificano a mano (oggi in visualizzazione sono uniti con «·» — probabile
  che la correzione a mano usi lo stesso separatore in un campo di testo
  unico, da confermare con Niki prima di scrivere codice);
- **migliorare la tab "Copie digitali"**: funziona ma va rifinita — capire se
  prevedere davvero più tipi di copia scaricabili per la stessa opera (oggi
  l'elenco versioni lo permette a livello di dati, ma l'interfaccia non
  distingue bene "scarica come IIIF" da "scarica come PDF" quando entrambi
  sono disponibili) e comunque rendere più chiara la relazione fra risoluzioni
  scaricate, tetto per-copia e tetto generale;
- **coerenza Biblioteca ↔ Trascrizioni**: la scheda opera ha ora un pattern
  stabile (colonna visore + colonna informazioni a tab, con `InspectorShell`
  condiviso con la traduzione) — quando lo Studio di trascrizione prende
  forma, i comandi generali (tornare indietro, aprire/chiudere la colonna
  informazioni) devono seguire lo stesso pattern, non uno nuovo per area;
- portare a termine il blocco Biblioteca: e-rara, e-manuscripta e Wellcome
  (nessun precedente in Scriptoria, da studiare una per una);
- dare una ricerca vera alle nove biblioteche che oggi accettano solo
  l'indirizzo completo del manifesto pur dichiarando di saper cercare;
- collegare l'opera alle sue traduzioni e trascrizioni sulla scheda, quando il
  passaggio opera → traduzione esisterà davvero;
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
- completare la console generale dei log (#413) — la ricerca in Biblioteca ha
  già log tecnici completi (Rust e frontend) pronti per confluirci, oggi
  visibili solo nel log di sistema;
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
