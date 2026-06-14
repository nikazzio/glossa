---
title: Configurazione pipeline
---

# Configurazione pipeline

Glossa separa la configurazione della pipeline dal contenuto del documento, così puoi
tarare la run prima di avviare un batch.

## Controlli principali

- Source language
- Target language
- Provider and model per stage
- Translation instructions
- Persona
- Glossary / term registry
- Phrase-memory settings
- Audit / judge settings

## Superfici tipiche di configurazione

| Superficie | Cosa imposti di solito |
|---|---|
| Settings tab | Lingue, modalità run, default generali, persona |
| Translation tab | Prompt stage, modelli, opzioni specifiche provider |
| Audit tab | Modello judge, prompt judge, prompt coherence |
| Area glossario | Glossario assegnato e voci terminologiche |

## Cosa cambia di solito per prima cosa

Se una run non è abbastanza buona, cambia questi elementi in ordine:

1. Translation prompt
2. Provider or model
3. Glossary entries
4. Phrase-memory retrieval
5. Judge prompt

Lascia stare tutto il resto finché non capisci quale parte sta causando il problema.

## Modalità pipeline

| Modalità | Descrizione |
|---|---|
| Standard | Singola passata di traduzione più audit |
| Editorial | Stage di translation, refine e format prima dell'audit |

## Consigli a livello di stage

- Mantieni il translation stage focalizzato su accuratezza e stile di base.
- Usa refine per riscrivere, non per la prima traduzione.
- Tieni il format stretto, così non altera il significato in modo silenzioso.
- Usa il judge per segnalare problemi, non per sostituire la review umana.

## Regole di esecuzione

- Il Test mode processa un chunk e lascia la configurazione modificabile.
- Il Production mode processa l'intero documento.
- Una run cancellata riprende dai chunk già completati quando possibile.

## Consigli di stabilità

- Cambia una variabile importante alla volta.
- Salva la pipeline prima delle run batch più grandi.
- Se un progetto è stabile, clona o rinomina una pipeline prima di sperimentare.

## When to change config

Change the configuration before a full run if you need a different provider,
prompt, or glossary behavior. If you only need to inspect a result, prefer Test
mode over changing the whole pipeline.
