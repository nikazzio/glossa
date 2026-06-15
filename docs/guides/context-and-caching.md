---
title: Contesto e caching
---

# Contesto e caching

Glossa usa due meccanismi per mantenere le traduzioni coerenti tra chunk e contenere
i costi di inferenza: un blocco di riferimento documentale che dà a ogni chunk
accesso al testo sorgente dei vicini, e una struttura del prompt a strati che
permette ai provider di fare caching il più possibile tra le chiamate.

## Contesto documentale per chunk

Quando traduce un chunk, Glossa invia automaticamente il testo sorgente dei chunk
vicini come blocco di riferimento. Il modello lo usa per mantenere coerenti
terminologia, nomi, pronomi e stile attraverso i confini dei chunk — senza dover
vedere l'intero documento in una sola volta.

Per documenti brevi il blocco copre tutto il sorgente; per documenti più lunghi
copre una finestra scorrevole di chunk adiacenti. Il blocco viene fornito solo
come contesto: il modello riceve istruzioni esplicite di tradurre solo il chunk
corrente, non il contenuto del blocco di riferimento.

## Caching del prompt a strati

Ogni prompt è strutturato in tre strati in modo che il provider possa riusare il
più possibile il contesto già calcolato:

| Strato | Contenuto | Caching |
|---|---|---|
| 1 | Persona, regole strutturali, glossario | Cachato una volta per tutta la run |
| 2 | Blocco di riferimento documentale | Cachato per gruppo di chunk vicini |
| 3 | Istruzioni specifiche dello stage | Inviato di volta in volta — è la parte più piccola |

## Isolamento degli stage

Ogni stage riceve esattamente le informazioni di cui ha bisogno — niente di più.
Questo evita ritraduzione involontaria e mantiene ogni stage focalizzato sul suo
compito specifico.

| Stage | Riceve |
|---|---|
| Traduzione | Testo sorgente del chunk corrente + blocco di riferimento |
| Refine | Testo sorgente + blocco di riferimento + output della traduzione |
| Format | Solo il testo tradotto — non il sorgente, non il blocco di riferimento |
| Audit coerenza | Chunk tradotti vicini — non il sorgente |

Il stage Format riceve solo la traduzione per design: se ricevesse anche il sorgente,
il modello potrebbe ritradurre invece di limitarsi alla pulizia della formattazione.

## Cosa significa in pratica

Dopo che il primo chunk di un gruppo viene elaborato, i chunk successivi dello stesso
gruppo costano meno perché il provider riusa gli strati già cachati. Su documenti
lunghi con molti chunk il risparmio è significativo, specialmente in modalità
Editoriale dove tre stage vengono eseguiti per chunk.

## Cache retention per modello

La durata della cache varia a seconda del provider e del modello. OpenAI, ad esempio,
distingue due politiche:

- **Modelli completi**: extended retention fino a 24 ore — ogni chunk successivo
  beneficia del riscaldamento della run precedente anche tra sessioni diverse.
- **Modelli mini/nano**: in-memory retention — il prefisso scade dopo 5–10 minuti
  di inattività.

Questo spiega perché il stage Refine (tipicamente su un modello mini) può mostrare
0% di cache hit anche con prompt identico: se sono passati più di 10 minuti tra
un chunk e il successivo, la cache è già scaduta.

Controlla la documentazione del tuo provider per la politica di retention del modello
che stai usando.

## Vedi anche

- [Configurazione pipeline](../reference/pipeline-config) — come configurare stage e modelli
- [Audit e revisione](./audit-review) — come il giudice valuta l'output di ogni chunk
