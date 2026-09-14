---
title: Importazione ed esportazione
---

# Importazione ed esportazione

L’importazione crea il testo sorgente di un progetto. L’esportazione genera
un documento a partire dai frammenti della pipeline. Nessuna delle due
operazioni sostituisce il [backup dell’applicazione](./backup-and-restore).

## Formati di importazione

| Formato | Elaborazione | Limite del file |
| --- | --- | --- |
| TXT | Testo UTF-8 | 50 MiB |
| Markdown | Testo UTF-8 con struttura Markdown | 50 MiB |
| DOCX | Estrazione strutturata in Markdown, sperimentale | 100 MiB |
| PDF | Estrazione del testo disponibile nel file | 50 MiB |

I limiti sono calcolati in multipli di 1024 byte. Le estensioni non riconosciute
vengono lette come testo semplice scegliendo **All files** nella finestra di
apertura; questo non aggiunge supporto a formati binari o strutturati come ODT
o RTF. Un testo non UTF-8 viene rifiutato con un errore di codifica.

La finestra di sistema permette di scegliere file da qualsiasi cartella
accessibile, anche su dischi esterni. L’anteprima consente di controllare
estrazione e segmentazione prima di confermare. Un PDF composto soltanto da
immagini non fornisce testo tramite questa estrazione: l’importazione non
esegue OCR.

## Note sorgente

Le note a piè di pagina di DOCX e Markdown sono conservate separatamente.
La pipeline riceve il corpo del testo senza i loro marcatori e contenuti.
La traduzione e il posizionamento delle note richiedono intervento manuale.
Vedi [Annotazioni e note](../guides/annotations).

## Formati di esportazione

| Formato | Contenuto |
| --- | --- |
| TXT | Testo della traduzione; l’opzione Markdown può convertirne la struttura in testo semplice |
| Markdown | Testo e marcatura, con annotazioni quando fornite all’esportazione |
| HTML | Documento generato dal Markdown |
| DOCX | Documento generato dal Markdown tramite il backend |
| Markdown bilingue | Originale e traduzione per frammento, valutazione completata e segnalazioni dell’audit |

Nei formati ordinari, se un frammento non ha testo tradotto viene utilizzato
il sorgente. **L’esportazione non certifica che la traduzione sia completa.**
Il formato bilingue indica esplicitamente l’assenza di una traduzione e
non inserisce le annotazioni con lo stesso percorso degli export Markdown.

## Separatori e formattazione

I separatori tra frammenti sono disponibili solo per TXT e Markdown.
HTML, DOCX e bilingue applicano la propria composizione. Il risultato DOCX
deriva dal testo Markdown corrente e non ricostruisce necessariamente
l’impaginazione del documento importato.

Prima della consegna, verifica frammenti incompleti, annotazioni, note e
struttura del file prodotto. Annullare la finestra di salvataggio non genera
un’esportazione.
