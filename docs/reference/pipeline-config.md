---
title: Configurazione pipeline
---

# Configurazione pipeline

Glossa separa la configurazione della pipeline dal contenuto del documento, così puoi
tarare la run prima di avviare un batch.

## Controlli principali

- Lingua sorgente
- Lingua target
- Provider e modello per ogni stage
- Istruzioni di traduzione
- Persona
- Glossario / registro terminologico
- Impostazioni phrase memory
- Impostazioni audit e giudice

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
| Editoriale | Stage di translation, refine e format prima dell'audit |

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

## Quando cambiare la configurazione

Cambia la configurazione prima di una run completa se hai bisogno di un provider,
un prompt o un comportamento del glossario diverso. Se devi solo ispezionare un
risultato, preferisci la modalità Test invece di cambiare l'intera pipeline.

## Preventivo costi

Passando il mouse sull'icona informazioni vicino al costo stimato (nel pannello impostazioni pipeline, e vicino al pulsante di traduzione/esecuzione nella vista documento) vedi un dettaglio per fase con il costo approssimativo in dollari.

- Nel pannello impostazioni pipeline il preventivo copre **sempre l'intero documento**, incluso il controllo di coerenza se configurato.
- Vicino al pulsante di esecuzione nella vista documento, il preventivo segue quello che sta per succedere: in modalità "traduci chunk" copre solo il chunk selezionato, in modalità "esegui tutto" copre l'intero documento.
- È una stima approssimativa basata sul conteggio parole e sul prezzo per token del modello scelto: il costo reale può variare leggermente.

## Vedi anche

- [Provider supportati](./provider-support) — confronto tra provider e guida alla scelta del modello
- [Pipeline documento](../guides/document-pipeline) — come le impostazioni si applicano al workflow end-to-end
- [Contesto e caching](../guides/context-and-caching) — come il prompt è strutturato per ottimizzare i costi
