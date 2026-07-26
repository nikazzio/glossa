---
title: Glossario e phrase memory
---

# Glossario e phrase memory

Glossa ha due strumenti terminologici separati. Risolvono problemi diversi e funzionano meglio insieme.

La distinzione è importante: il glossario è un vincolo, la phrase memory è un
supporto contestuale. Il primo dice al modello cosa deve rispettare; la seconda
mostra esempi approvati che possono aiutare quando il contesto è simile.

## Glossario

Il glossario è esplicito e orientato al progetto. Definisci termini sorgente,
termini target obbligatori e note opzionali, poi Glossa inietta quei vincoli nella run.

Usa il glossario quando:

- un termine deve sempre corrispondere alla stessa traduzione
- un progetto ha house style o vocabolario editoriale specifico
- vuoi che il judge segnali terminologia mancante o errata

### Legenda delle evidenziazioni

La scheda **Glossario** del pannello Insight mostra sempre la legenda usata nel
documento:

- blu sottolineato: termine del glossario presente nel testo sorgente;
- verde: traduzione attesa presente correttamente;
- rosa: traduzione attesa mancante.

I match della ricerca usano invece il giallo. Puoi cambiare i colori da
**Impostazioni → Evidenziazioni**; passando sul termine vedi traduzione attesa
e note.

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

Non usare la phrase memory come fonte di verità assoluta. Un match recuperato può
essere perfetto in un capitolo e sbagliato in un altro: va scelto, non solo accettato.

## Workflow consigliato

1. Parti con un piccolo glossario per nomi, termini e traduzioni non negoziabili.
2. Esegui pochi chunk per volta: accendi il toggle "Blocchi multipli" e imposta con +/- un numero basso di frammenti da elaborare.
3. Conserva solo gli output davvero buoni: blocca quei frammenti (la traduzione è definitiva).
4. Nella scheda Memoria del frammento bloccato, estrai le frasi, rivedile (accetta/scarta/correggi, anche a mano) e conferma solo quando sei sicuro — nessun salvataggio è mai automatico.
5. Nella scheda Riferimenti dei frammenti successivi, controlla i match suggeriti e spunta solo quelli pertinenti prima di lanciare la run.

## Buone pratiche

- Mantieni il glossario corto e rigido; non trasformarlo in una style guide completa.
- Usa la phrase memory per pattern ricorrenti, non per automazione cieca.
- Se una frase recuperata è sbagliata nel contesto, rifiutala invece di abbassare la soglia globale.
- Ricontrolla la terminologia durante l'audit, soprattutto dopo refine o format.
- Se una frase è critica e sempre obbligatoria, promuovila nel glossario invece di lasciarla solo in memory.
