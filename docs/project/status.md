---
title: Stato del progetto
---

# Stato del progetto

Glossa è in beta privata. La numerazione delle versioni non indica che tutte
le funzioni previste siano complete. Questo sito documenta il codice integrato
su `main`; confronta la versione installata con le
[note di rilascio](https://github.com/nikazzio/glossa/releases).

## Funzioni disponibili

- Dashboard con riepiloghi e ricerca singola o su più fonti, con storico persistente.
- Catalogo delle opere, metadati modificabili, collezioni e collegamenti ai workspace.
- Lettura IIIF, download, versioni locali, riduzione e verifica delle immagini.
- Workspace e progetti di traduzione con importazione e segmentazione del testo.
- Pipeline Standard, Editoriale e DeepL Hybrid, con revisione e valutazione.
- Dizionari, memoria di frasi, esempi, annotazioni e storico delle traduzioni.
- Esportazione delle traduzioni e backup dei dati applicativi.

## Limiti attuali

| Ambito | Limite |
| --- | --- |
| Trascrizione | Studio di trascrizione, OCR/HTR e revisione per pagina non costituiscono ancora un percorso completo |
| Dalla fonte alla traduzione | Il trasferimento da una trascrizione approvata alla traduzione è incompleto |
| PDF nella Biblioteca | Metadati disponibili; download e lettura integrata non disponibili |
| Singole pagine | Salvataggio della pagina aperta disponibile; gestione avanzata e selezione multipla incomplete |
| Ricerca | Capacità diverse per fonte; filtri locali sui metadati e copertura dipendente dai servizi interrogati |
| Trasferimento di un workspace | Il backup sostituisce i dati dell’applicazione; non esporta e importa un singolo workspace |
| Export Studio e Analisi | Percorsi avanzati ancora in sviluppo |

L’estrazione di testo da PDF per traduzione è disponibile e distinta dalla
lettura dei PDF in Biblioteca. Non esegue riconoscimento del testo nelle scansioni.

## Conservazione dei dati

Il ripristino accetta solo lo schema corrente del backup e sostituisce i dati
locali. Credenziali, immagini ed esportazioni richiedono gestione separata.
Consulta [Backup e ripristino](../reference/backup-and-restore) prima di usarlo.

La [roadmap](https://github.com/nikazzio/glossa/blob/main/docs-dev/ROADMAP_2_0.md)
documenta priorità e dipendenze del lavoro restante. La presenza di una voce
di navigazione non implica che il relativo percorso sia già utilizzabile.
