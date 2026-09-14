---
title: Risoluzione dei problemi
---

# Risoluzione dei problemi

Per diagnosticare un problema, identifica l’operazione, il messaggio ricevuto
e il servizio coinvolto. Mantieni invariati gli altri parametri mentre
verifichi una causa.

## Connessione o credenziali

Se una fase non parte, controlla in **Impostazioni → Provider** la chiave,
il modello e, per Custom, il profilo selezionato. Un errore di autenticazione,
un modello non disponibile e una quota esaurita richiedono interventi diversi.
Per un endpoint remoto personalizzato è obbligatorio HTTPS; HTTP è ammesso
solo sugli indirizzi locali supportati.

Per Ollama, verifica URL del server, stato della connessione e presenza del
modello. `ollama list` elenca i modelli installati; `ollama serve` avvia il
server quando non è già gestito dall’installazione. Per timeout durante
l’inferenza, controlla dimensioni del contesto e risorse disponibili.

In DeepL Hybrid, distingui gli errori della prima fase DeepL da quelli degli
LLM successivi. Una quota caratteri esaurita o un glossario remoto incompatibile
non si risolvono modificando il prompt del valutatore.

## Ricerca vuota o incompleta

Controlla che la fonte supporti la ricerca per parole e che l’identificativo
segua l’esempio mostrato. Nella ricerca federata, verifica quante fonti hanno
terminato e quali sono in errore. I filtri operano sui metadati ricevuti:
dati assenti possono lasciare un risultato non verificabile.

Una scheda senza riproduzione viene indicata come non consultabile. Un errore
di rete non dimostra invece che l’opera sia assente. Se stai visualizzando
risultati dalla cache, usa il comando di aggiornamento per una nuova richiesta.

## Pagine mancanti e lavori in attesa

Controlla se il visore è limitato ai file locali e se la versione selezionata
contiene la pagina. Verifica anche che il disco del deposito sia collegato.
Per file mancanti o danneggiati, esegui la verifica del deposito e valuta
l’eventuale recupero proposto.

Un lavoro in attesa può rispettare un limite di rete; il dettaglio mostra
se è previsto un nuovo tentativo. Un lavoro in pausa richiede invece una
ripresa esplicita. Per eliminare file coinvolti in un lavoro sospeso, annulla
prima il lavoro: la pausa conserva la possibilità di riprendere la scrittura.

## Importazione o risultato errato

Un errore UTF-8 richiede di convertire il file di testo in quella codifica.
Per DOCX e PDF controlla il testo estratto prima di tradurre. Un PDF di sole
scansioni richiede un’operazione OCR esterna al percorso di importazione attuale.

Se la resa non è adeguata, prova un frammento rappresentativo e confronta
gli output delle fasi. Controlla glossario, riferimenti selezionati e istruzioni.
Una valutazione incoerente va verificata sul testo: non applicare correzioni
solo perché proposte dal modello.

## Salvataggio e backup

Se la barra di stato segnala un salvataggio fallito, verifica accessibilità
e spazio disponibile della cartella dati. Non considerare salvate le modifiche
finché non compare lo stato di completamento.

Un backup incompatibile o non valido viene rifiutato prima del ripristino.
Un archivio cifrato richiede password o codice di recupero. Le immagini
mancanti dopo un ripristino non indicano da sole un errore: i file del deposito
sono [esclusi dal backup](./backup-and-restore).

## Avvio da sorgente

Questa sezione riguarda lo sviluppo, non i pacchetti installati. Il server
Vite usa la porta `48123`; un conflitto di porta impedisce l’avvio.
Per scegliere un’altra porta:

```bash
# Linux e macOS
GLOSSA_DEV_PORT=9999 npm run tauri:dev
```

```powershell
# Windows PowerShell
$env:GLOSSA_DEV_PORT=9999
npm run tauri:dev
```

Verifica anche le dipendenze indicate nella [guida di installazione](../intro/getting-started).
I pacchetti desktop distribuiti non usano il server di sviluppo.

## Informazioni per una segnalazione

Includi versione di Glossa, sistema operativo, azione eseguita, risultato
atteso e messaggio effettivo. La console delle operazioni mostra le fasi e
le richieste; la guida in-app espone la cartella dei log. I dettagli dei prompt
possono contenere il testo del documento: controllali prima di condividerli.
Per una diagnosi tecnica aggiuntiva è possibile avviare l’app con `RUST_LOG=debug`.
