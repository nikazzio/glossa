---
title: Configurazione della pipeline
---

# Configurazione della pipeline

La configurazione appartiene alla pipeline del progetto. Le credenziali e le
connessioni ai servizi appartengono invece alle impostazioni dell’applicazione.

## Sezioni

| Sezione | Parametri |
| --- | --- |
| Impostazioni | Modalità, lingue, persona, esempi e opzioni generali |
| Traduzione | Provider, modelli, prompt e opzioni delle fasi di generazione |
| Controllo qualità | Valutatore e controllo di coerenza |
| Registro termini | Glossario assegnato |
| Anteprima Prompt | Struttura delle richieste delle fasi attive |

Le modalità Standard, Editoriale e DeepL Hybrid sono descritte nel
[flusso di traduzione](../guides/document-pipeline).

## Lingue e persona

Imposta lingua sorgente e destinazione. La persona è un testo libero che
sostituisce l’introduzione predefinita del messaggio di sistema: può specificare
ruolo, ambito, lingue e registro. Se è attiva, deve descrivere correttamente
la coppia linguistica e le istruzioni che intendi applicare.

I prompt possono essere salvati come modelli riutilizzabili, separati per
contesto. Il comando di rifinitura del prompt invia il testo a un modello
configurato e ne propone una riscrittura nel campo. Richiede la connessione
e le eventuali credenziali del provider scelto.

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
dalla scheda Audit di un frammento bloccato. Sono modificabili nelle impostazioni.
La [memoria di frasi](../guides/phrase-memory) fornisce invece riferimenti
selezionati per il singolo frammento. La [cache dei prompt](../guides/context-and-caching)
ha regole specifiche per provider.

## Stima dei costi

Il preventivo della configurazione copre l’intero documento, compresa la
coerenza se configurata. Nella barra del documento, la stima segue l’azione
selezionata. I dettagli distinguono le fasi e i modelli.

La stima usa una conversione approssimativa da parole a token e i prezzi
registrati per i modelli. Il consumo riportato dopo l’esecuzione usa i token
restituiti dal servizio; il relativo costo resta un calcolo di Glossa, non
una fattura. DeepL riporta caratteri fatturati, che non sono token LLM e non
rientrano nello stesso preventivo in dollari.
