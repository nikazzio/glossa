# Proposal

## Why

Nel codice di Glossa restano funzioni, comandi del motore, testi e piccoli tipi
che nessuna parte dell'app usa più: avanzi di schermate rifatte (la vecchia
Dashboard, la vecchia schermata di ricerca, la sandbox), di flussi sostituiti
(rimozione di un'opera, testo di trascrizione per pagina) o di aiuti rimasti
senza chiamate dopo un refactor. Non si vedono, ma allungano il codice e fanno
credere che certe strade siano ancora vive. È il primo passo della revisione
generale del codice: si toglie il morto prima di riordinare le singole aree.

Non tutto ciò che è inutilizzato è un avanzo: alcune funzioni sono state
preparate per evoluzioni previste nelle issue aperte. Quelle restano e sono
elencate a parte, perché la scelta spetta al maintainer.

## What Changes

Tolte circa 20 voci che sono **avanzi** (la loro ultima chiamata è sparita
quando la schermata o il flusso sono stati rifatti, oppure non sono mai state
collegate e nessuna issue aperta le richiede):

- **Biblioteca e Ricerca**: cancellazione dei file di una singola
  digitalizzazione (la rimozione di un'opera usa già quella per l'opera
  intera), preparazione del deposito (la cartella si crea già da sola), tre
  conteggi della vecchia Dashboard, l'elenco di tutti i progetti;
- **Trascrizioni**: l'elenco dei segmenti, sostituito dal testo per pagina;
- **Traduzioni**: conteggi di dizionari e memoria frasi, calcolo dei blocchi
  consigliati (dalla sandbox tolta), anteprima della divisione manuale, un
  indicatore di lavoro in attesa, una voce della barra del documento;
- **Parti comuni**: data relativa («adesso», «3 giorni fa») con i suoi testi in
  italiano e inglese, un controllo sulla

  chiave API e una funzione dei provider lasciata «per il futuro» senza issue,
  il riepilogo dei lanci per categoria, il comando di prova del database
  vettoriale, tre tipi mai usati.

Con le voci se ne vanno i test che controllavano solo loro. La documentazione
per sviluppatori si corregge dove indica come strada della rimozione di
un'opera il comando tolto. Nessun cambiamento visibile.

**Restano: possibili evoluzioni** (inutilizzate oggi, ma legate a issue
aperte; da decidere con il maintainer):

| Cosa fa | Evoluzione collegata |
|---|---|
| Leggere un singolo lavoro in background | #469 traduzione nella coda dei lavori |
| Sapere quali elementi stanno in un workspace e in quali workspace sta un elemento | #434 esporta/importa un workspace |
| Stimare costo e token degli embedding | #391 reindicizzazione esplicita |
| Leggere una singola frase della memoria | #141 storico e ripristino, #227 corpus |
| Elenco dei campi anagrafici a più valori | modifica a schermo degli altri campi dell'opera (oggi solo titolo, autore, data, lingua) |
| Togliere i numeri in apice delle note | #500 esportazione minuta, #503 editor unico (legame debole) |
| Copia del file del database prima di un'operazione rischiosa | #434 e consolidamenti del database (legame debole) |

**Restano: funzioni a metà** (preparate ma mai completate; da completare o
togliere su decisione del maintainer):

- Correzione di una voce di dizionario solo per un workspace: il database la
  prevede e l'app ne legge il segno, ma nessun comando la scrive.
- Modalità di lettura delle fonti (automatica, solo locale, solo remota):
  l'impostazione si legge ma non si può scegliere né cambia niente.

**Altro fuori perimetro**:

- Il collegamento di un elemento a un workspace scritto a mano in cinque punti
  invece che con la funzione comune: si guarda nella revisione di Biblioteca e
  Ricerca.
- Gli strumenti dei test (dati di esempio, azzeramento delle cache).
- I circa 215 nomi resi visibili al resto del codice ma usati solo nel proprio
  file: pulizia meccanica rimandata.
- La ricerca generale di testi dell'interfaccia non più usati: con chiavi
  composte al volo il controllo automatico non è affidabile.

## Capabilities

### New Capabilities

Nessuna.

### Modified Capabilities

Nessuna: nessun comportamento cambia, quindi nessuna specifica cambia
(`skip_specs: true`).

## Impact

- Codice dell'interfaccia: servizi dati (deposito, progetti, dizionari, memoria
  frasi, trascrizioni), utilità, un componente della barra del documento, un
  hook, uno store, tipi, testi `common.relative.*` in italiano e inglese.
- Motore: tre comandi non più registrati (preparazione del deposito,
  cancellazione dei file di una digitalizzazione, prova del database
  vettoriale) e un metodo dei provider.
- Documentazione per sviluppatori: paragrafi sulla rimozione di un'opera.
- Nessuna dipendenza, migrazione o dato toccati.
