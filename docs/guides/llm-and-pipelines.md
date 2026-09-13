---
title: Modello di elaborazione
---

# Modello di elaborazione

La pipeline organizza la generazione e la verifica di una traduzione in fasi
distinte. Questa pagina descrive le responsabilità delle fasi e i dati che
ricevono; la [guida al documento](./document-pipeline) descrive i comandi operativi.

## Unità di lavoro

Il frammento è l’unità di esecuzione, revisione e ripresa. La segmentazione
permette di elaborare solo una parte del documento, conservare risultati
intermedi e ripetere una fase senza ricalcolare l’intero testo.

Ogni richiesta al modello viene costruita a partire dalla configurazione
e dai dati disponibili. Il modello non dispone automaticamente della storia
del progetto: contesto, glossario, esempi e riferimenti devono essere inclusi
nella richiesta.

## Responsabilità delle fasi

| Fase | Dati principali | Risultato atteso |
| --- | --- | --- |
| Translation | Sorgente corrente, contesto documentale, istruzioni e glossario | Prima traduzione |
| Refine | Sorgente, contesto e bozza precedente | Traduzione rivista completa |
| Format | Testo già tradotto e istruzioni di formattazione | Correzioni di struttura e sintassi Markdown |
| Judge | Sorgente, traduzione e criteri di valutazione | Valutazione e problemi strutturati |
| Coherence | Traduzioni e contesto dei frammenti vicini | Segnalazioni di incoerenza tra frammenti |

La fase Format usa un prompt separato: non riceve persona, glossario o contesto
sorgente della traduzione. Le istruzioni ne limitano il compito alle correzioni
di formattazione, ma il risultato deve comunque essere controllato.

In DeepL Hybrid, la prima fase usa l’API DeepL e i relativi parametri di lingua,
registro e glossario. Le eventuali fasi successive usano i provider LLM
configurati separatamente.

## Configurazione e riproducibilità

Separare le fasi consente di confrontare le versioni prodotte e attribuire
gli errori a un passaggio. Non rende l’output deterministico: ripetere una
richiesta può produrre una risposta diversa, anche con temperatura bassa.
Un formato JSON valido garantisce una struttura interpretabile, non la
correttezza del giudizio.

Per valutare una modifica, mantieni invariati testo e criteri e cambia un
parametro alla volta. Usa i risultati intermedi e la console delle operazioni
per confrontare le richieste effettive. La decisione editoriale finale resta
al revisore.

## Contesto e risorse

Il glossario specifica la terminologia richiesta. La memoria di frasi fornisce
solo i riferimenti selezionati per il frammento. Gli esempi di traduzione
orientano invece lo stile a livello di pipeline.

La struttura delle richieste e il riuso del prefisso sono descritti in
[Contesto e cache dei prompt](./context-and-caching). I parametri disponibili
sono elencati nella [configurazione della pipeline](../reference/pipeline-config).
