---
title: Import ed export
---

# Import ed export

Glossa è pensata per documenti reali, non solo per frammenti incollati.

## Import

I formati di input supportati includono:

- `.txt`
- `.md`
- `.docx` — conversione in Markdown via estrazione strutturata (funzionalità sperimentale). Limite: **100 MB**.
- `.pdf` — estrazione come testo piano. Limite: **50 MB**.

Durante l'import, Glossa ti permette di rivedere la segmentazione prima che il
documento diventi la lista chunk attiva.

## Cosa aspettarsi dall'import

- Il plain text è il percorso più semplice quando la struttura è minima.
- Markdown è la scelta migliore quando contano heading e formattazione.
- DOCX e PDF sono utili per materiale editoriale reale, ma controlla sempre l'anteprima prima di avviare la pipeline.

## Note a piè di pagina importate

Se un DOCX o un Markdown contiene note a piè di pagina, Glossa le conserva con il
progetto ma le tiene fuori dalla traduzione automatica. Il modello riceve il corpo
del testo, non il contenuto delle note. Dopo la traduzione, rivedi e riposiziona le
note manualmente: nelle traduzioni reali spesso cambiano formulazione e posizione.

Vedi anche [Annotazioni](../guides/annotations) per la distinzione tra note sorgente
importate e annotazioni create durante la revisione.

## Backup del workspace

Prima di chiederti di sostituire i dati locali, Glossa controlla che il backup sia
completo e compatibile. Un file incompleto, alterato o creato da una versione più
recente viene rifiutato senza modificare il workspace corrente.

## Posizione dei dati

Il database dell'app contiene progetti, glossari e impostazioni. In
**Impostazioni → Dati** puoi vedere la cartella utilizzata e sceglierne
un'altra. Glossa copia prima il database, verifica l'integrità della copia e
solo allora registra la nuova posizione. L'originale non viene cancellato
automaticamente e la nuova posizione entra in uso dopo il riavvio.

Questa operazione riguarda il database dell'app. I futuri materiali della
Biblioteca, come scansioni e immagini scaricate, non fanno ancora parte dello
spostamento.

## Export

I target di export tipici includono:

- plain text (`.txt`)
- Markdown (`.md`)
- HTML
- DOCX
- Markdown bilingue

## A cosa serve l'export

- Plain text per un output finale essenziale
- Markdown per workflow testuali modificabili
- HTML per review o pipeline di pubblicazione
- DOCX per handoff d'ufficio o editoriale
- Markdown bilingue per review affiancata di sorgente e traduzione, include rating qualità e issues del giudice per i chunk completati

## Separatori di chunk

I separatori (riga vuota, separatore orizzontale `---`, asterischi `***`) sono disponibili **solo per `.txt` e `.md`**. Non si applicano a HTML, DOCX o al formato bilingue.

## Regole pratiche

- Usa l'import Markdown quando la struttura conta e vuoi preservare gli heading.
- Controlla l'anteprima prima di confermare il chunking su file lunghi.
- Esporta solo a review conclusa; l'export è il passaggio di consegna, non quello di revisione.
