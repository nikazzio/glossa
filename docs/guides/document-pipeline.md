---
title: Pipeline documento
---

# Pipeline documento

Glossa ruota attorno a un workflow documento in quattro fasi:

1. **Configura** pipeline, glossario e coppia linguistica.
2. **Testa** prima un chunk per ispezionare l'output senza bloccare l'intero documento.
3. **Traduci** il documento completo quando il setup è stabile.
4. **Rivedi** i risultati dell'audit e itera se la qualità non basta.

Il principio di fondo è spiegato nella guida [LLM e pipeline](./llm-and-pipelines):
un modello linguistico è potente ma probabilistico, quindi Glossa divide il lavoro
in chunk, stadi e audit per rendere ogni passaggio controllabile.

## Workflow documento

Glossa usa il workflow documento anche per prove brevi. Il percorso resta lo stesso:
crea o apri un progetto, importa o incolla il testo sorgente, controlla il chunking
e usa **Test** su un chunk rappresentativo prima di avviare il batch.

| Area | Cosa controlli | Quando usarla |
|---|---|---|
| Import e anteprima | Testo sorgente, segmentazione, chunk iniziali | Prima di creare la lista chunk attiva |
| Configurazione pipeline | Lingue, provider, modelli, prompt, glossario | Prima del Test e prima dei batch lunghi |
| Vista documento | Chunk corrente, output, stati, run | Durante traduzione e revisione |
| Barra del frammento | Riferimenti, Anteprima, Audit, Memoria, Note | Durante controllo qualità e chiusura chunk |
| Pannello Insight | Indice, ricerca, statistiche, coerenza, glossario | Su tutto il documento, in ogni fase |

## Modalità DeepL Hybrid

La modalità **DeepL Hybrid** combina la velocità e la precisione dell'API DeepL con il raffinamento contestuale di un LLM:

| Stage | Provider | Ruolo |
|---|---|---|
| Stage 1 | DeepL API | Traduzione principale |
| Stage 2 | LLM opzionale | Raffinamento stile e registro |
| Judge | LLM | Audit qualità (invariato) |

**Requisiti:** API key DeepL configurata in Impostazioni → sezione provider.

**Quando usarla:** Testi che richiedono alta fedeltà terminologica e velocità, dove un LLM da solo richiederebbe troppo contesto o prompt elaborati.

**Registro:** Per le lingue che lo supportano (tedesco, italiano, ecc.), puoi configurare il registro formale/informale direttamente nello stage DeepL.

**Glossari DeepL:** Puoi creare un glossario DeepL dai termini del glossario Glossa assegnato alla pipeline, così DeepL rispetta automaticamente la tua terminologia.

## Flusso documento standard

1. Importa un documento o prepara un campione breve.
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
| DeepL Translation | Produce la prima traduzione tramite API DeepL quando la modalità DeepL Hybrid è attiva |
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

## Anteprima del messaggio prima di lanciare

Nel pannello del frammento, la scheda **Anteprima** (dopo Riferimenti) mostra il messaggio
letterale — istruzioni di sistema e testo utente — che verrebbe inviato al motore per la
fase scelta sul frammento aperto. Costruiscilo a comando con il tasto dedicato: nessuna
chiamata reale parte, nessun costo, nessun risultato viene scritto sul frammento. Utile per
controllare cosa riceverà davvero il modello prima di avviare una traduzione o una fase di
editing.

## Vedi anche

- [Annotazioni](./annotations) — per tracciare issue editoriali per chunk
- [LLM e pipeline](./llm-and-pipelines) — perché Glossa separa chunk, stadi e audit
- [Audit e revisione](./audit-review) — ciclo di review dettagliato con il giudice
- [Contesto e caching](./context-and-caching) — come Glossa usa il contesto tra chunk vicini
- [Configurazione pipeline](../reference/pipeline-config) — riferimento completo dei controlli
