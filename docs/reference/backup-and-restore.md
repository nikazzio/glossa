---
title: Backup e ripristino
---

# Backup e ripristino

Il backup salva i dati dell’applicazione in un file `.glossa-backup`.
L’operazione è disponibile in **Impostazioni → Backup** e comprende tutti
i workspace. Il ripristino sostituisce i dati applicativi presenti con quelli
del backup; non esegue un’unione e non importa un singolo workspace.

## Contenuto

| Incluso | Escluso |
| --- | --- |
| Workspace, progetti, pipeline, traduzioni e revisioni | Immagini e altri file del deposito |
| Catalogo, metadati, collegamenti e annotazioni | File dei documenti esportati |
| Dizionari, memoria di frasi e modelli di prompt | Chiavi API e credenziali |
| Ricerche persistenti, risultati e relativi lavori | Cache di rete |
| Impostazioni salvate, profili personalizzati, storico delle operazioni ed elenco degli artefatti | Copia completa dell’ambiente o del sistema operativo |

L’elenco degli artefatti registra ciò che è stato prodotto, senza incorporarne
i file. Analogamente, il backup registra le risoluzioni scaricate per poter
proporre il recupero delle immagini, ma non ne conserva i byte.

## Formati di protezione

- **Solo Glossa:** archivio compresso e offuscato, adatto a evitare aperture
  accidentali; non offre riservatezza crittografica.
- **Con password:** archivio cifrato, apribile con la password oppure con il
  codice di recupero mostrato dopo il salvataggio.

Conserva il codice di recupero fuori dall’applicazione. Se perdi sia il codice
sia la password, non puoi recuperare il contenuto cifrato. Annullare la finestra
di salvataggio non crea un backup.

## Validazione e ripristino

Glossa verifica il contenitore e il contenuto prima di chiedere conferma per
la sostituzione. Il contenuto deve avere la versione di schema corrente
(`schema_version: 5`); formati diversi o contenuti non validi vengono rifiutati
prima della scrittura.

Le tabelle vengono ripristinate in una transazione rispettando i vincoli di
relazione. Il marcatore delle migrazioni del database corrente non viene
sostituito dal valore del backup. Le ricerche attive devono essere sospese
prima del ripristino; i lavori di ricerca ripristinati non ripartono automaticamente.

## File locali dopo il ripristino

I file già presenti nel deposito non vengono cancellati dal ripristino.
Una verifica successiva controlla quelli associati alle opere ripristinate.
Se mancano immagini, Glossa propone di recuperarle alle risoluzioni registrate.
I file senza un’opera associata possono essere esaminati e rimossi dalle
impostazioni del deposito.

La possibilità di riscaricare dipende dalla fonte remota. Per conservare
immagini o esportazioni anche se la fonte non sarà più disponibile, copia
separatamente il deposito e i documenti esportati. Reinserisci le credenziali
necessarie quando ripristini su un’altra installazione.

Vedi [Archiviazione e lavori](../guides/storage-and-jobs) per posizione delle
cartelle e verifiche di integrità.
