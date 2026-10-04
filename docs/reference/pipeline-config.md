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

La barra affianca **opera / pipeline**, con i nomi lunghi troncati e il nome
completo nel suggerimento. Il nome della pipeline, con la piccola freccia accanto, apre il menu
per scegliere, creare, rinominare o eliminare; l’ingranaggio apre le opzioni.
Il tipo **Semplice, Editoriale o DeepL** è sempre visibile con un’icona. La
coppia compare nella barra soltanto per DeepL. Le operazioni sulla pipeline
restano bloccate durante l’elaborazione.

| Linguetta | Parametri |
| --- | --- |
| Generale | Modalità, lingue DeepL, Contesto di traduzione |
| Fasi | Servizio, modello, prompt e opzioni di ogni fase; memoria di contesto |
| Controllo qualità | Ciclo di raffinamento, modello del giudizio, prompt di giudizio e coerenza |
| Memoria | Memoria delle frasi ed esempi di traduzione (spenta in modalità DeepL) |
| Glossario | Dizionario assegnato e suoi termini |
| Anteprima prompt | Ogni richiesta pezzo per pezzo: fasi, audit, coerenza, richiesta DeepL |

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

## Contesto di traduzione e lingue DeepL

Il **Contesto di traduzione** prende il posto della coppia di lingue per gli
LLM: lingue e varietà storiche, destinatari, registro e obiettivo. È
obbligatorio e non è mai vuoto: una pipeline nuova parte da un testo
predefinito (dall’inglese all’italiano), che puoi riscrivere o sostituire con
un template salvato; la freccia circolare lo ripristina e la conferma di un
testo vuoto è spenta. Traduzione, revisione, audit e coerenza lo ricevono
insieme alle proprie istruzioni; la formattazione resta limitata alla
sintassi. Nessuna coppia linguistica viene aggiunta automaticamente ai prompt:
le lingue stanno nel Contesto.

Accanto al titolo di ogni prompt compare da dove viene il testo:
**Predefinito**, **Personalizzato** oppure **Template «nome»** quando coincide
con un template salvato della stessa categoria. Il riconoscimento confronta il
testo: un template modificato dopo l’applicazione non è più riconosciuto,
perché la pipeline conserva la copia applicata.

La matita apre una bozza; la spunta conferma, la X annulla. Anche la rifinitura
con un modello modifica solo la bozza. I prompt usano una carta tenue con
accento verde, comandi a icona e anteprima espandibile. Il Contesto viene
salvato con la pipeline e copiato nella duplicazione.

La coppia **DeepL · lingue** resta visibile in Generale, disabilitata nelle
modalità LLM e attiva in DeepL. Le fasi non usate restano visibili come
linguette disabilitate. Cambiando modalità conservi la configurazione di tutte
le fasi. In DeepL restano attive revisione LLM, audit e coerenza.
Le lingue generali usate dalle memorie sono ancora metadati distinti: la loro
configurazione sarà consolidata nel lavoro sulle risorse linguistiche.

In **Anteprima prompt** scegli una fase, Audit o Coerenza: vedi la richiesta
pezzo per pezzo, nell’ordine in cui parte, divisa in **messaggio di sistema**
(istruzioni, regole e risorse, uguale per tutti i frammenti) e **messaggio
utente** (il frammento e la consegna finale). I pezzi vengono dal backend, gli
stessi che compongono la richiesta vera: anteprima e invio coincidono. Ogni
pezzo dice se è **fisso nel programma**, **testo tuo**, **dati** o
**automatico**, e dove si modifica; il titolo spiega a cosa serve. I pezzi che
in questa pipeline non ci sono restano visibili, spenti, con il motivo (per
esempio «solo per documenti importati come Markdown»). I segnaposto tra doppie
graffe indicano dove entrano i dati del frammento: è una costruzione con la
configurazione attuale, non la richiesta storica di un’esecuzione. Il modo
**Frammento aperto** riempie gli stessi pezzi con i dati veri del frammento
aperto nello Studio, comprese le frasi della memoria spuntate. DeepL
mostra il corpo della richiesta.

I prompt possono essere salvati come modelli riutilizzabili, separati per
contesto: durante la modifica il segnalibro salva il prompt con un nome e il
libro apre l’elenco dei modelli salvati, con la ricerca. I modelli si
eliminano dalle risorse linguistiche. Un modello con un ambito non più
riconosciuto viene escluso dall’elenco e segnalato per nome, senza nascondere
gli altri. Il comando di rifinitura del prompt invia il testo a un modello
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

DeepL esegue la traduzione iniziale, poi revisione LLM e audit. La prima fase usa le impostazioni DeepL: lingua, registro dove supportato,
modalità di traduzione e glossario remoto. La chiave DeepL è distinta da quella
degli LLM usati per revisione e valutazione. Un errore di quota o del glossario
DeepL deve essere risolto su quel servizio prima di completare la sequenza.

La coppia DeepL si sceglie in Generale, dagli elenchi del servizio. La sorgente
può essere rilevata automaticamente; per usare o caricare un glossario serve
una sorgente esplicita. Cambiare coppia scollega il glossario remoto e cambiare
destinazione ripristina il registro predefinito. La destinazione va scelta esplicitamente: una richiesta senza destinazione viene bloccata prima di contattare DeepL. Il Contesto di traduzione non viene
inviato a DeepL: il suo campo Contesto è distinto.

Anteprima prompt nelle opzioni e anteprima del
frammento mostrano il corpo API, costruito dal backend come durante l’esecuzione;
nelle opzioni il testo del frammento è un segnaposto. I log conservano la
richiesta effettiva senza credenziali.

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
