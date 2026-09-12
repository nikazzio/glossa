---
title: Stato della beta
---

# Stato della beta

Glossa è in beta. Il numero di versione, compreso 2.x, non certifica che tutte
le funzioni previste siano pronte: la numerazione è cresciuta durante le prove
del sistema di rilascio automatico.

Queste guide seguono lo sviluppo su main. Una versione scaricata può essere
precedente: confronta la versione nell'app con le
[note di rilascio](https://github.com/nikazzio/glossa/releases).

## Cosa puoi fare oggi

- Creare workspace e progetti, importare testi e tradurli per passaggi.
- Provare un frammento prima dell'intero documento, correggere e revisionare.
- Usare glossari, memoria di frasi, note e storico delle traduzioni.
- Cercare nelle biblioteche supportate e organizzare le fonti nel catalogo.
- Sfogliare immagini IIIF, conservarle e leggere quelle presenti senza rete.
- Seguire, interrompere e riprendere scaricamenti; verificare e ridurre immagini.
- Esportare traduzioni e salvare un backup dell'intera applicazione.

## Cosa resta da completare

| Ambito | Limite attuale |
| --- | --- |
| Trascrizioni | Studio completo, correzione per pagina e OCR/HTR ancora in sviluppo |
| Fonte → traduzione | Passaggio dalla trascrizione approvata non ancora completo |
| PDF in Biblioteca | Le copie possono comparire, ma download e lettura non sono disponibili |
| Singole pagine | Conservazione della pagina aperta disponibile; gestione avanzata e selezione multipla da completare |
| Ricerca | Capacità diverse per biblioteca; nessuna ricerca aggregata completa. I risultati senza riproduzione vengono segnati «non consultabile» invece di essere nascosti |
| Trasferimento workspace | Il backup riguarda tutta l'app; import/export di un solo workspace da costruire |
| Export Studio e Analisi | Percorsi avanzati ancora in sviluppo |

Importare il testo di un PDF in un progetto di traduzione è già possibile:
è distinto dal leggere un PDF nella Biblioteca. Un PDF di sole scansioni
richiede riconoscimento del testo, che non è ancora un percorso completo.

## Dati e backup

I backup attuali non accettano i formati precedenti. Il ripristino sostituisce
i dati dell'intera applicazione; non unisce due workspace. Le immagini del
deposito e le credenziali dei provider non sono incluse. Conserva separatamente
i materiali che vuoi tenere, anche se non saranno più scaricabili dalla fonte.

Il formato con password protegge il backup; quello apribile solo da Glossa è
offuscato, non cifrato. Leggi [Archiviazione e lavori](../guides/storage-and-jobs)
prima di ripristinare o cambiare deposito.

## Verso il completamento

Il percorso obiettivo è fonte → lettura → trascrizione → traduzione revisionata
→ esportazione. Le capacità arrivano progressivamente; una sezione visibile
non significa che tutte le azioni siano già disponibili.

La [roadmap di sviluppo](https://github.com/nikazzio/glossa/blob/main/docs-dev/ROADMAP_2_0.md)
indica ordine, dipendenze e criteri. Per segnalare un problema, includi versione,
sistema operativo, operazione tentata ed esito.
