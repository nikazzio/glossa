---
title: Traduzione di un documento
---

# Traduzione di un documento

La traduzione opera su frammenti di testo, chiamati *chunk* in alcune parti
dell’interfaccia. Ogni frammento conserva sorgente, risultati delle fasi,
traduzione modificabile, valutazione e annotazioni. Anche un documento composto
da un solo frammento utilizza lo stesso flusso.

## Importazione e segmentazione

Importa un file o inserisci il testo sorgente, quindi controlla l’anteprima.
La segmentazione automatica usa una lunghezza obiettivo in parole. Per Markdown,
le opzioni dedicate ai titoli permettono di mantenere un titolo con il testo
successivo oppure di separare sezioni secondo il livello scelto.

Verifica i confini prima di confermare: essi determinano le unità di traduzione
e revisione. I dettagli su formati, limiti e note importate sono nel
[riferimento per importazione ed esportazione](../reference/import-export).

## Configurazione

Apri la configurazione della pipeline e imposta lingue, modalità, provider,
modelli e istruzioni. Le modalità definiscono questa sequenza:

| Modalità | Elaborazione |
| --- | --- |
| Standard | Traduzione e valutazione automatica |
| Editoriale | Traduzione, revisione della bozza (*Refine*), formattazione (*Format*) e valutazione |
| DeepL Hybrid | Traduzione DeepL, revisione LLM facoltativa e valutazione LLM |

Provider e modelli delle fasi LLM sono indipendenti. DeepL richiede una propria
chiave API e non svolge il ruolo di valutatore. La modalità della pipeline non
è modificabile quando l’elaborazione o i risultati presenti ne bloccano il cambio.

## Prova ed esecuzione

Usa **Test** per valutare un frammento mantenendo la configurazione modificabile.
Controlla la bozza e le segnalazioni prima di passare alla produzione.
I comandi di esecuzione consentono di lavorare sul frammento corrente o su più
frammenti; il numero impostato limita il gruppo da elaborare.

L’elaborazione procede per frammenti e ne aggiorna lo stato. L’annullamento
interrompe il lavoro corrente senza eliminare i risultati già completati.
La ripresa e la rielaborazione hanno scopi diversi: la prima completa il lavoro
restante, la seconda ricalcola i frammenti non bloccati selezionati dall’azione.

## Lettura e revisione

La vista documento affianca originale e traduzione. La barra del frammento
contiene **Riferimenti**, **Anteprima**, **Audit**, **Memoria** e **Note**.
Il pannello **Insight** raccoglie indice, ricerca, statistiche, coerenza e
glossario dell’intero documento.

I risultati intermedi delle fasi permettono di individuare dove è stata
introdotta una modifica. Dopo una correzione manuale, **Rivaluta** esegue il
solo controllo qualità. **Blocca traduzione** protegge un risultato approvato
dalla rielaborazione. Se cambia il testo sorgente, l’interfaccia segnala che
la traduzione richiede un aggiornamento.

## Anteprima delle richieste

La configurazione mostra la struttura dei prompt. La scheda **Anteprima** del
frammento costruisce invece la richiesta della fase scelta per il testo corrente.
Questa operazione non chiama il modello e non produce una traduzione.

## Esportazione

Controlla anche i frammenti incompleti prima di esportare: nei formati ordinari,
un frammento senza traduzione può essere esportato con il testo sorgente.
Il formato bilingue distingue esplicitamente originale e traduzione assente.
Vedi [formati e contenuto esportato](../reference/import-export).
