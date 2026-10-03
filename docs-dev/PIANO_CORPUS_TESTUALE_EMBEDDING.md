# Corpus testuale, provenienza ed embedding

Piano concordato il 3 ottobre 2026. Non descrive funzioni già implementate.
Collega il lavoro sulla memoria di traduzione alle issue #227, #391, #382,
#380, #377, #209, #223 e #381. Sostituisce il piano limitato a una frase con
più vettori; le tecniche storiche sono un esempio di classificazione futura.

## Decisioni

- Unità testuali di lunghezza variabile: frasi, passaggi, pagine e sezioni.
  La pagina fisica non coincide necessariamente con un'unità di significato;
  un passaggio può attraversare pagine o frammenti.
- Identità e versioni del testo indipendenti da traduzioni, segmentazione,
  classificazioni e modelli. Originale diplomatico e forme normalizzate restano
  distinguibili; una correzione a monte non cambia silenziosamente un estratto.
- Una sola unità può avere traduzioni e più embedding. Aggiungere una misura
  non duplica il testo né elimina quelle degli altri modelli.
- Modello, dimensione e input identificato obbligatori per ogni embedding.
  Nessuna compatibilità con vettori senza modello; dati locali di test da
  aggiornare con operazione esplicita, senza inferire il modello dalla dimensione.
- Un modello attivo per workspace. La ricerca confronta solo misure compatibili
  per modello, dimensione e preparazione dell'input; niente ricerca fra modelli
  diversi. Cambiare modello non distrugge gli embedding precedenti.
- Memoria traduttiva, raccolte di studio ed evidenze documentali hanno ruoli
  distinti e condividono provenienza e infrastruttura. Il corpus può nascere
  prima della traduzione; una classificazione «tecnica» non è obbligatoria.
- Per la memoria estratta, il workspace corrente deriva dalla traduzione;
  spostarla non riscrive la provenienza storica. La ricerca globale esplicita
  non sposta né collega la frase al workspace che la trova. Non estendere
  automaticamente questa apertura a ogni corpus futuro.

## Struttura da definire prima del codice

1. **Unità e revisioni**: identità, testo, lingua, versione, relazione con
   eventuali unità più grandi e selezioni della fonte. Non imporre una lunghezza
   fissa derivata dal modello attuale.
2. **Provenienza**: libro/fonte e versione, una o più pagine e posizioni,
   revisione della trascrizione, traduzione/frammento quando presenti. Conservare
   il testo selezionato oltre agli ancoraggi. Origine sconosciuta dichiarata,
   mai ricostruita dal titolo della traduzione per supposizione.
3. **Traduzioni**: lingua, testo e revisione associati all'unità. La memoria
   traduttiva seleziona coppie riusabili senza possedere l'intero corpus.
4. **Embedding**: input/versione, ruolo (originale, normalizzato, traduzione),
   provider/modello identificato, dimensione, preparazione e data di calcolo.
   Unicità sul medesimo input e profilo di misura, non sul solo modello:
   originale e testo con contesto possono usare lo stesso modello.
5. **Annotazioni**: tag manuali riutilizzabili separati dai metadati della fonte;
   interpretazioni e proposte automatiche con autore/modello, revisione input,
   stato proposto/confermato/rifiutato ed eventuale evidenza.

Gli embedding devono riusare i contratti di revisioni, artifact, provenienza e
job già previsti: evitare un sottosistema isolato o duplicare il registro #378.
Consultare i moduli Scriptoria pertinenti prima della scelta dello schema,
registrando quali pattern sono adottati, adattati o scartati (#186/#446).

## Ordine di implementazione

### 1. Contratti e schema

- Mappare tutti i percorsi attuali di scrittura, lettura, ricalcolo, eliminazione
  e backup, inclusa la cache delle misure del testo sorgente.
- Definire la base comune minima e separare i vettori dal testo; aggiungere
  vincoli, relazioni e indici. Schema beta nella baseline, senza migrazioni
  speculative per dati distribuiti inesistenti.
- Aggiornare controlli di schema, formati di backup/ripristino e relativi
  contratti; non attribuire retroattivamente modelli ai dati di test.

### 2. Provenienza e revisioni

- Completare la registrazione dell'origine della traduzione: oggi il collegamento
  è predisposto e letto per lo stato delle opere, ma i percorsi di creazione
  devono compilarlo per rendere disponibile il libro alle frasi estratte.
- Collegare i passaggi a fonti e revisioni; mantenere snapshot e posizioni.
- Conservare origine e tracciamento quando si sposta o elimina una traduzione;
  concordare la policy di sopravvivenza dei passaggi senza introdurre cancellazioni
  implicite del corpus.

### 3. Operazioni della memoria

- Nuova coppia: salvare testo, provenienza e misura del modello selezionato.
- Aggiunta/ricalcolo: creare o aggiornare solo la misura richiesta. Ripetere
  l'operazione non duplica il testo; testi uguali con origini diverse non sono
  fusi automaticamente.
- Correzione della sola traduzione: nessun ricalcolo delle misure dell'originale.
- Correzione dell'originale: ricalcolare le misure interessate; confermare testi
  e vettori coerenti insieme, mantenendo il precedente stato se fallisce.
  Dichiarare il costo delle misure multiple prima dell'operazione.
- Proteggere da risposte tardive, doppio invio e modifiche concorrenti mediante
  revisione dell'input e scritture atomiche. Un errore non elimina misure valide.
- Eliminare una coppia di memoria e le sue misure senza lasciare record orfani;
  non propagare la cancellazione a evidenze condivise senza policy esplicita.

### 4. Ricerca

- Misurare la query con il modello attivo e confrontare solo input compatibili.
- Applicare lingue, ambito workspace, soglia e limite prima dei risultati.
- Una unità appare una volta; mostrare provenienza e misura utilizzata.
- Unità prive della misura richiesta restano consultabili nel catalogo ma
  non entrano nella ricerca per somiglianza.
- Le coppie già salvate nel frammento restano nella sua Memoria; non aggiungerle
  alla graduatoria semantica come corrispondenze a distanza zero.
- Cambiare ambito, lingue o profilo invalida i risultati precedenti.

### 5. Interfaccia e tag

- Componenti del design system per provenienza, misure disponibili, aggiunta e
  ricalcolo espliciti, avanzamento, errori e protezione delle bozze.
- Tag manuali riutilizzabili sulle unità, senza categorie obbligatorie legate
  alla scherma; distinguere dati della fonte da interpretazioni.
- Predisporre selezioni lunghe e relazioni fra unità senza consegnare in questo
  task l'intera interfaccia di analisi.

## Estensioni successive

- Etichette multilingui, sinonimi e categorie più ampie/specifiche; vocabolari
  controllati opzionali. Classificazione automatica soggetta a conferma.
- Porzioni di ricerca associate a unità complete; possibili rappresentazioni
  contestualizzate esplicitamente identificabili, senza modificare la citazione.
- Ricerca combinata lessicale, filtri e semantica; valutazione specifica su
  lingue, grafie e domini medievali, senza presumere qualità dai benchmark generali.
- Confronti originali/traduzioni, testi normalizzati e testimoni, con input e
  metriche versionati. Dataset riproducibili e collegamento a evidenze visive.
- Modelli locali e multimodali tramite gli stessi contratti, senza promettere
  che finestre di contesto maggiori rendano superflui selezione e verifica.

## Verifica e solidificazione

- Una coppia con small e large resta una coppia; ricalcolare small conserva large.
- Modello/dimensione/profilo errati non entrano nel confronto; modello assente
  rifiutato nei percorsi di scrittura e nei dati importati come embedding validi.
- Ricerca locale/globale esplicita e filtri linguistici; nessun collegamento
  workspace creato dalla consultazione; nessun doppione nei risultati.
- Provenienza su più pagine, aggiornamento della fonte, spostamento/eliminazione
  della traduzione e testi identici di origine diversa.
- Modifica traduzione senza chiamate di misura; modifica originale con errore,
  risposta tardiva e doppio invio senza incoerenza o perdita dei dati precedenti.
- Tag/proposte legati alla versione analizzata; normalizzazione distinta
  dall'originale; ancoraggi non riattribuiti silenziosamente dopo una correzione.
- Backup/ripristino di testi, relazioni, tag, revisioni e tutte le misure.
- Test mirati a fine implementazione, tipi/lint/formattazione e prova dal vivo:
  estrazione → salvataggio → secondo embedding → ricerca → modifica → riapertura.
- Guide IT/EN aggiornate quando cambia il comportamento effettivo. Questo piano
  non deve comparire nell'help come funzione già disponibile.

## Riferimenti verificati

- [W3C Web Annotation](https://www.w3.org/TR/annotation-model/): selezioni per
  posizione e citazione, provenienza delle annotazioni.
- [TEI, segmentazione e allineamento](https://tei-c.org/release/doc/tei-p5-doc/it/html/SA.html):
  annotazioni esterne e relazioni fra porzioni di testo.
- [W3C SKOS](https://www.w3.org/TR/skos-primer/): concetti, etichette multilingui,
  sinonimi e relazioni gerarchiche.
- [Anthropic, Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval):
  contesto delle porzioni e combinazione di ricerca lessicale/semantica.
- [Google, Long context](https://ai.google.dev/gemini-api/docs/long-context):
  capacità attuali e limiti; nessuna previsione certa sull'evoluzione degli LLM.


## Implementazione attuale

Base unità/revisioni/misure/tag separata; flussi Memoria su questa base; più modelli
conservati, ricerca compatibile, correzioni atomiche e provenienza visibile; scelta
esplicita del libro alla creazione; backup dei dati testuali. Nessuna conversione
automatica dei dati beta. Non comprende selettore di pagine/sezioni, analisi del
corpus, tag automatici, ricerca ibrida o modelli locali: restano nelle issue collegate.
