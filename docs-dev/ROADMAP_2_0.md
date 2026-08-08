# Roadmap Glossa 2.0

Ultimo aggiornamento: 2026-08-09

## Principio guida

Glossa 2.0 evolve da workspace di traduzione documentale a research workbench locale per acquisizione, studio, trascrizione, traduzione, revisione ed export.

Scriptoria è il riferimento principale per codice e funzionalità nei domini
IIIF, fonti, asset, job, trascrizione ed export. I pattern utili vengono
adattati nativamente all'architettura React/Tauri/Rust di Glossa e alla sua
shell di prodotto.

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

Obiettivo: definire confini di prodotto, information architecture, domini
principali e regole di integrazione con la pipeline esistente.

Decisione architetturale:
[`PRODUCT_ARCHITECTURE_2_0.md`](PRODUCT_ARCHITECTURE_2_0.md). Le aree
Biblioteca, Trascrizioni, Traduzioni e Analisi sono cataloghi globali; i
workspace sono raccolte operative trasversali degli stessi oggetti canonici.

### Fase 1 - Foundation, data model, shell

- #181 - epic modello dati 2.0.
- #211 - modello dati 2.0 operativo.
- #212 - piano di migrazione 1.x -> 2.0.
- #207 - epic research workspace multi-testo.
- #213 - risorse condivise e regole di scope.
- #210 - shell 2.0 Library / Studio / Translation.
- #390 - identità visiva workspace completata: segni storico-editoriali preset,
  distinti dalle icone delle aree globali.
- #186 - interoperabilità e migrazione graduale da Scriptoria.

Obiettivo: prima dati e shell, poi feature. Nessuna discovery, viewer o OCR avanzato prima che workspace, item, asset, documenti e progetti siano modellati.

### Fase 2 - Library e IIIF

- #184 - epic discovery biblioteche e import IIIF.
- #214 - registry provider IIIF e capability model.
- #215 - discovery resolve/search normalizzata.
- #216 - add-to-library e persistenza metadati.
- #397 - rollout verificato delle biblioteche/provider: Internet Archive e URL
  generico già usabili; poi Biblissima+ e Digital Scriptorium come aggregatori
  ad alta copertura, quindi Vaticana, Gallica, e-codices, Estense,
  e-manuscripta/e-rara e Wellcome. Gli altri provider del registry solo dopo
  verifica di endpoint, metadati e capability reali.
- #395 - ricerca globale multi-provider, solo quando esistono almeno più
  provider realmente usabili e fonti persistibili.
- #187 - catalogazione, metadati e gestione library/workspace.

Obiettivo: portare in Glossa il modello di discovery di Scriptoria senza copiare la UI. Direct resolve, search e provider capabilities devono produrre risultati normalizzati.

Il registry non abilita automaticamente un archivio: #397 conserva lista,
priorità e riferimenti Scriptoria; ogni provider richiede un handler reale e
verifica aggiornata prima di comparire nella ricerca.

### Fase 3 - Asset e job

- #183 - epic acquisizione asset locali.
- #217 - inventory asset e source policy runtime.
- #218 - sistema condiviso di job asincroni persistenti; download come primo
  consumatore.

Obiettivo: introdurre una sola infrastruttura asincrona per download, OCR/HTR,
export, analisi e altri lavori lunghi. Scans, manifest, thumbnail, derivati e
artifact devono vivere in un modello tracciabile; progresso, pausa, ripresa,
retry e cancellazione devono essere stati persistenti, non chiamate
fire-and-forget.

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

Obiettivo: Export Studio come azione contestuale di fonte, trascrizione,
traduzione o workspace, non come area primaria. Profili nelle impostazioni,
esecuzione tramite il sistema condiviso di job, artifact history sull'oggetto e
nel workspace, vista globale di servizio per job e output.

### Filone trasversale - Analisi, dataset e modelli

- #377 - epic area Analisi.
- #378 - provenance e metriche dei workflow.
- #379 - dashboard, esplorazione e confronti.
- #380 - dataset builder versionato.
- #381 - model registry e adapter locali.
- #382 - allineamento semantico sorgente-traduzione.

La raccolta di provenance e metriche (#378) comincia con la foundation, così i
workflow successivi producono dati analizzabili fin dall'inizio. Le superfici
Analisi e i dataset arrivano per incrementi quando esistono abbastanza dati
reali; l'addestramento resta esterno a Glossa nella 2.0.

### Filone trasversale - Acquisizione documenti e sicurezza dell'import

- #371 - import ancorato al file scelto nel dialog (chiuso da #405).
- #192 - nuovi formati di importazione: PPTX, XLSX, HTML, EPub, RTF, ODT, DOC.
- #407 - stessa impostazione per backup e ripristino.

Con #405 la finestra di scelta file viene aperta dal backend: nessun comando
accetta piu' un percorso dal frontend, il percorso scelto non attraversa il
confine IPC e l'import non ha piu' vincoli di cartella. Sostituisce
l'allowlist di #367 e la preferenza opzionale che ne derivava.

Il ripristino da backup usa ancora lo schema vecchio (#407): finche' non lo
segue, i permessi filesystem in `capabilities/default.json` non si possono
restringere.

Le estensioni non riconosciute vengono lette come testo semplice. Per i formati
con marcatura interna questo produce testo sporco invece di un errore: #192
raccoglie i lettori dedicati da scrivere.

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
