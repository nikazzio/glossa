# Roadmap Glossa 2.0

Ultimo aggiornamento: 2026-07-04

## Principio guida

Glossa 2.0 evolve da workspace di traduzione documentale a research workbench locale per acquisizione, studio, trascrizione, traduzione, revisione ed export.

Scriptoria è la reference funzionale per il dominio IIIF/manoscritti, ma non va innestata come applicazione separata. Le funzionalità vanno riscritte nativamente in Glossa, mantenendo una sola shell di prodotto e un solo modello operativo.

Pattern da portare da Scriptoria:

- separazione chiara tra logica core e interfaccia;
- UI che orchestra, core che implementa;
- provider registry per discovery e capability;
- path runtime gestiti da configurazione, non hardcoded;
- policy esplicite per sorgenti locali/remoti;
- job persistenti per download, OCR/export e lavori lunghi;
- storage locale tracciabile per record, asset, derivati e artifact;
- nessuna mini-app parallela dentro Glossa.

## Milestone GitHub

- `v2.0 research workbench`: solo core release 2.0.
- `v2.x backlog`: idee utili post-2.0, non bloccanti.

## Ordine implementativo

### Fase 0 - Architecture gate

- #180 - architettura di prodotto e shell UI unificata.

Obiettivo: definire confini di prodotto, information architecture, domini principali, regole di integrazione con la pipeline esistente e criteri "no mini-app".

### Fase 1 - Foundation, data model, shell

- #181 - epic modello dati 2.0.
- #211 - modello dati 2.0 operativo.
- #212 - piano di migrazione 1.x -> 2.0.
- #207 - epic research workspace multi-testo.
- #213 - risorse condivise e regole di scope.
- #210 - shell 2.0 Library / Studio / Translation.
- #186 - interoperabilità e migrazione graduale da Scriptoria.

Obiettivo: prima dati e shell, poi feature. Nessuna discovery, viewer o OCR avanzato prima che workspace, item, asset, documenti e progetti siano modellati.

### Fase 2 - Library e IIIF

- #184 - epic discovery biblioteche e import IIIF.
- #214 - registry provider IIIF e capability model.
- #215 - discovery resolve/search normalizzata.
- #216 - add-to-library e persistenza metadati.
- #187 - catalogazione, metadati e gestione library/workspace.

Obiettivo: portare in Glossa il modello di discovery di Scriptoria senza copiare la UI. Direct resolve, search e provider capabilities devono produrre risultati normalizzati.

### Fase 3 - Asset e job

- #183 - epic acquisizione asset locali.
- #217 - inventory asset e source policy runtime.
- #218 - job queue persistente e orchestrazione download.

Obiettivo: scans, manifest, thumbnail, derivati e artifact devono vivere in un modello tracciabile. Download/resume/retry/cancel devono essere stati persistenti, non chiamate fire-and-forget.

### Fase 4 - Studio immagini, snippet, corpus

- #208 - epic image workbench.
- #221 - viewer, filtri visuali e source switching.
- #222 - cropper dal viewer e salvataggio snippet.
- #209 - epic snippet corpus.
- #223 - snippet corpus con metadata, listing e riuso comparativo.
- #227 - corpus `historical_techniques` e suggerimenti contestuali.

Obiettivo: lo Studio deve diventare superficie di lavoro, non preview decorativa. Viewer, crop, snippet e corpus devono collegarsi a item, pagine e workspace.

### Fase 5 - Trascrizione, OCR/HTR, bridge traduzione

- #182 - epic transcription studio.
- #219 - transcription document nativo.
- #185 - epic OCR/HTR orchestration.
- #220 - provider OCR/HTR e job orchestration.
- #189 - epic pipeline linguistica 2.0.
- #224 - bridge da trascrizione approvata a progetto di traduzione.

Obiettivo: la trascrizione approvata diventa ingresso strutturato della pipeline Glossa. OCR/HTR e correzione umana devono essere job e stati, non una singola chiamata opaca.

### Fase 6 - Export studio

- #188 - epic export studio.
- #225 - export studio con profili PDF/immagini e output selettivi.

Obiettivo: export come sottosistema con profili, sorgenti, job, artifact history e validazione pagine. Non solo "salva risultato".

## Fuori dal core 2.0

Spostate in `v2.x backlog`:

- #12 - documenti di riferimento nel contesto LLM.
- #17 - prompt versioning con storico e rollback.
- #24 - batch file processing.
- #52 - Google Docs import/export.
- #141 - history e rollback per glossario, note e azioni manuali.
- #167 - traduzione parallela di chunk multipli selezionati.
- #287 - DeepL Pro API style rules e translation memory.

Queste restano valide, ma vanno implementate dopo che il workbench locale ha fondamenta stabili.
