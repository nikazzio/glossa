---
title: Configurazione della pipeline
---

# Configurazione della pipeline

La configurazione appartiene alla pipeline del progetto. Le credenziali e le
connessioni ai servizi appartengono invece alle impostazioni dell’applicazione.

## La finestra

La configurazione si apre con l’ingranaggio nella riga in cima allo Studio di
traduzione, o con Ctrl + virgola. Il titolo è il nome della pipeline: si
rinomina dalla riga in cima allo Studio, non da qui. Le spiegazioni delle voci
non sono scritte sotto i campi: compaiono passando sopra il titolo di una
sezione o il nome di una voce.

| Linguetta | Parametri |
| --- | --- |
| Generale | Modalità, lingue, persona |
| Fasi | Servizio, modello, prompt e opzioni di ogni fase; memoria di contesto |
| Controllo qualità | Ciclo di raffinamento, modello del giudizio, prompt di giudizio e coerenza |
| Memoria | Memoria delle frasi ed esempi di traduzione (spenta in modalità DeepL) |
| Glossario | Dizionario assegnato e suoi termini |
| Anteprima prompt | Struttura delle richieste delle fasi attive |

Mentre la pipeline lavora la finestra resta aperta e leggibile, ma un velo ne
blocca i comandi. In fondo, l’icona rossa **Azzera tutte le traduzioni** cancella
le traduzioni e i relativi audit dopo una conferma; è spenta, con il motivo,
durante l’esecuzione o quando non c’è niente da azzerare.

Quando esistono già traduzioni, modalità, prompt delle fasi e memoria di contesto
non si cambiano; il modello di una fase è chiuso da un lucchetto. Aprirlo
permette di cambiarlo, ma i frammenti già tradotti restano fatti con il modello
precedente.

Le modalità Standard, Editoriale e DeepL Hybrid sono descritte nel
[flusso di traduzione](../guides/document-pipeline).

## Lingue e persona

Imposta lingua sorgente e destinazione. La persona è un testo libero che
sostituisce l’introduzione predefinita del messaggio di sistema: può specificare
ruolo, ambito, lingue e registro. Se è personalizzata, deve descrivere
correttamente la coppia linguistica, che resta ferma finché la persona non
viene ripristinata.

I prompt possono essere salvati come modelli riutilizzabili, separati per
contesto: durante la modifica il segnalibro salva il prompt con un nome e il
libro apre l’elenco dei modelli salvati, con la ricerca. I modelli si
eliminano dalle risorse linguistiche. Il comando di rifinitura del prompt invia il testo a un modello
configurato e ne propone una riscrittura nel campo. Richiede la connessione
e le eventuali credenziali del provider scelto: senza chiave il comando è
spento e il suggerimento dice quale manca.

## Parametri dei modelli

Ogni fase LLM seleziona provider e modello indipendentemente. I controlli
disponibili dipendono dalle capacità dichiarate nell’applicazione.

- **Temperatura:** controlla la variabilità del campionamento, senza garantire
  accuratezza o ripetibilità. Gli intervalli gestiti sono 0–1 per Anthropic
  e 0–2 per Gemini, OpenAI e DeepSeek.
- **Ragionamento:** quando richiesto per OpenAI o DeepSeek, l’adattatore non
  invia il parametro temperatura.
- **Ollama:** espone opzioni di contesto, generazione e ragionamento in base
  al modello. Le opzioni avanzate devono essere un oggetto JSON valido,
  per esempio `{ "num_ctx": 8192 }`.
- **Valutazione Ollama:** nelle richieste vincolate allo schema la temperatura
  viene impostata a zero, anche in presenza di un altro valore configurato.

Un oggetto JSON non valido non sostituisce la configurazione precedente.
Il significato delle opzioni del servizio va verificato per il modello utilizzato.

## DeepL Hybrid

La prima fase usa le impostazioni DeepL: lingua, registro dove supportato,
modalità di traduzione e glossario remoto. La chiave DeepL è distinta da quella
degli LLM usati per revisione e valutazione. Un errore di quota o del glossario
DeepL deve essere risolto su quel servizio prima di completare la sequenza.

## Esempi e contesto

Puoi mantenere fino a cinque esempi di traduzione nella pipeline, aggiunti
dalla scheda Audit di un frammento verificato. Sono modificabili nella linguetta Memoria.
La [memoria di frasi](../guides/phrase-memory) fornisce invece riferimenti
selezionati per il singolo frammento. La [cache dei prompt](../guides/context-and-caching)
ha regole specifiche per provider.

## Stima dei costi

Nella colonna degli strumenti dello Studio la stima segue l’azione
selezionata. I dettagli distinguono le fasi e i modelli.

La stima usa una conversione approssimativa da parole a token e i prezzi
registrati per i modelli. Il consumo riportato dopo l’esecuzione usa i token
restituiti dal servizio; il relativo costo resta un calcolo di Glossa, non
una fattura. DeepL riporta caratteri fatturati, che non sono token LLM e non
rientrano nello stesso preventivo in dollari.
