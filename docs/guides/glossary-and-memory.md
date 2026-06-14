---
title: Glossario e phrase memory
---

# Glossario e phrase memory

Glossa ha due strumenti terminologici separati. Risolvono problemi diversi e funzionano meglio insieme.

## Glossario

Il glossario è esplicito e orientato al progetto. Definisci termini sorgente,
termini target obbligatori e note opzionali, poi Glossa inietta quei vincoli nella run.

Usa il glossario quando:

- un termine deve sempre corrispondere alla stessa traduzione
- un progetto ha house style o vocabolario editoriale specifico
- vuoi che il judge segnali terminologia mancante o errata

## Phrase memory

La phrase memory è basata su retrieval. Glossa estrae coppie sorgente-target riusabili
da lavoro approvato, le salva e le ripropone per chunk simili in seguito.

Usa la phrase memory quando:

- formulazioni ricorrenti compaiono in tutto un corpus
- vuoi supporto oltre un piccolo glossario mantenuto a mano
- il progetto evolve nel tempo e deve beneficiare di formulazioni già approvate

## Differenze principali

| Strumento | Ideale per | Tipo di input |
|---|---|---|
| Glossario | Terminologia obbligatoria | Inserimento manuale |
| Phrase memory | Formulazioni locali riusabili | Coppie approvate estratte |

## Dove agiscono in pratica

- Il glossario vincola la run a monte.
- La phrase memory suggerisce formulazioni riusabili da lavoro approvato precedente.
- Il judge può comunque segnalare errori terminologici o di coerenza dopo entrambi.

## Workflow consigliato

1. Parti con un piccolo glossario per nomi, termini e traduzioni non negoziabili.
2. Esegui alcuni chunk in Test mode.
3. Conserva solo gli output davvero buoni.
4. Lascia che Glossa salvi o cerchi match di phrase memory a partire dal lavoro approvato.
5. Rivedi i match suggeriti prima di iniettarli in una run di produzione.

## Buone pratiche

- Mantieni il glossario corto e rigido; non trasformarlo in una style guide completa.
- Usa la phrase memory per pattern ricorrenti, non per automazione cieca.
- Se una frase recuperata è sbagliata nel contesto, rifiutala invece di abbassare la soglia globale.
- Ricontrolla la terminologia durante l'audit, soprattutto dopo refine o format.
- Se una frase è critica e sempre obbligatoria, promuovila nel glossario invece di lasciarla solo in memory.
