---
title: Pipeline documento
---

# Pipeline documento

Glossa ruota attorno a un workflow documento in quattro fasi:

1. **Configura** pipeline, glossario e coppia linguistica.
2. **Testa** prima un chunk per ispezionare l'output senza bloccare l'intero documento.
3. **Traduci** il documento completo quando il setup è stabile.
4. **Rivedi** i risultati dell'audit e itera se la qualità non basta.

## Due modalità di lavoro

| Modalità | Ideale per | Cosa cambia |
|---|---|---|
| Sandbox | Passaggi brevi, tuning prompt, esperimenti isolati | Nessun import documento, nessuna lista chunk |
| Document | Testi reali, traduzione lunga, workflow di review | Chunking, indice, audit, note, export |

Usa Sandbox quando vuoi iterare velocemente su un campione. Usa Document mode
quando il testo richiede struttura, continuità e storico di review.

## Flusso documento standard

1. Importa un documento.
2. Scegli il chunking e conferma l'anteprima di import.
3. Imposta lingua sorgente e lingua target.
4. Scegli provider e modello per ogni stage attivo.
5. Aggiungi glossario o phrase memory se il progetto richiede controllo terminologico.
6. Esegui un chunk di test.
7. Rivedi traduzione candidata, audit e metadati del chunk.
8. Passa alla modalità produzione e processa i chunk rimanenti.
9. Blocca o correggi i chunk durante la review editoriale.

| Stato run | Scopo |
|---|---|
| Test | Anteprima di un chunk con configurazione ancora modificabile |
| Production | Elabora tutti i chunk rimanenti |

## Comportamento degli stage

| Stage | Scopo |
|---|---|
| Translation | Produce la prima bozza a partire dal chunk sorgente |
| Refine | Riscrive la bozza con stile, accuratezza o terminologia migliori |
| Format | Ripulisce il formato senza ritradurre il testo sorgente |
| Judge | Valuta il risultato e restituisce issue strutturate |
| Coherence | Controlla la coerenza tra chunk tradotti quando attivo |

La modalità Editoriale espone più chiaramente questi stage. La Standard mantiene
il workflow più leggero.

## Cosa controlli in ogni fase

| Fase | Domanda principale |
|---|---|
| Configure | Lingue, stage, prompt e glossario sono corretti? |
| Test | Un chunk rappresentativo è abbastanza buono da scalare? |
| Translate | Il batch procede bene e produce chunk stabili? |
| Review | Quali chunk richiedono ancora intervento editoriale? |

## Cosa resta tra una run e l'altra

- I chunk completati non vengono ricalcolati finché non li rilanci esplicitamente
- I batch cancellati riprendono dal lavoro già completato quando possibile
- Le run di test non bloccano la configurazione
- Dati di review e annotazioni restano attaccati al chunk che descrivono

## Errori comuni

- Cambiare provider e prompt insieme, senza sapere poi cosa ha inciso
- Passare a Production prima che un chunk difficile abbia superato bene il Test
- Usare il format stage per correggere errori di traduzione invece che solo il formato
- Trattare un chunk completato come definitivo senza leggere l'audit

## Regole pratiche

- Resta in **Test** finché prompt, glossario e modello non smettono di cambiare.
- Usa **Production** solo quando vuoi che il resto del documento segua lo stesso setup.
- Se il format stage inizia a cambiare il significato, semplificalo o rimuovilo.
- Se un chunk è difficile, [annotalo](./annotations) invece di affidarti solo alla memoria.

## Vedi anche

- [Annotazioni](./annotations) — per tracciare issue editoriali per chunk
- [Audit e revisione](./audit-review) — ciclo di review dettagliato con il giudice
- [Contesto e caching](./context-and-caching) — come Glossa usa il contesto tra chunk vicini
- [Configurazione pipeline](../reference/pipeline-config) — riferimento completo dei controlli
