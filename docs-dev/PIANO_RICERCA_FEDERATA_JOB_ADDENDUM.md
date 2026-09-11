# Ricerca federata: job, monitoraggio e risultati in tempo reale

Aggiornamento richiesto dall'utente · 11 settembre 2026.

Questo documento integra `PIANO_RICERCA_FEDERATA_DASHBOARD.md` e prevale
sulle parti incompatibili. È un nuovo documento di progetto, non codice.
In particolare sostituisce la ricerca effimera unica: ogni invio crea una
ricerca identificabile e un job per ogni provider selezionato. Più ricerche
possono restare attive contemporaneamente. Inviare B non cancella A.

## 1. Tre livelli da distinguere

| Livello | Esempio | Responsabilità |
| --- | --- | --- |
| Ricerca | «Erbario · manoscritti · 1500–1600» | Snapshot immutabile dei criteri, provider, riepilogo e risultati |
| Esecuzione provider | «Gallica nella ricerca Erbario» | Job indipendente, avanzamento, errori, pagine e comandi |
| Risultato | Scheda di un manoscritto | Provenienza dalla ricerca e dal provider, azioni bibliografiche |

Una ricerca è un contenitore persistito e osservabile, non un job padre che
occupa un worker in attesa dei figli. Ogni provider ha il suo job nel sistema
esistente. Non usare `dependsOnJobId` per rappresentare appartenenza: indica
una dipendenza di esecuzione e renderebbe seriale ciò che deve essere concorrente.

Tutti i job vengono accodati subito; il motore li avvia entro i limiti globali
e di cortesia delle biblioteche. Asincrono non significa senza limiti.

## 2. Tre superfici coerenti

### Pagina ricerca: risultati al centro, monitor a destra

La colonna destra usa due schede: **Criteri** e **Esecuzione**. Prima dell'invio
si vede Criteri; dopo l'invio Esecuzione mostra i provider. La scheda attiva
ha etichetta visibile, secondo il design system. L'utente può tornare ai criteri
senza cambiare lo snapshot della ricerca in corso: modificare e inviare crea
una nuova ricerca, non riconfigura job già avviati.

```text
Cerca nelle biblioteche                   [Elenco ricerche] [Nuova]
Erbario · manoscritti · 1500–1600
In corso · 3/5 provider terminati · 48 risultati ricevuti
──────────────────────────────────────────────────────────────────
Risultati                                 │ Esecuzione
32 verificati · 16 non verificabili        │ Gallica       In corso
[Biblioteca: tutte v] [Ordine v]           │ 22 record · pagina 2
                                          │              [Pausa][Ferma]
[copertina] Titolo                         │ Vaticana      Completata
Autore · anno · biblioteca                 │ 18 record     [Ripeti]
Gallica · questa ricerca                   │ Archive       Fallita
[Dettaglio] [Aggiungi]                     │ 8 parziali    [Riprova]
                                          │ e-codices     In attesa
...                                       │ ...
──────────────────────────────────────────│ Statistiche
8 nuovi risultati disponibili [Mostra]     │ Ricevuti 48 · distinti 45
                                          │ Visibili 32 · esclusi 13
```

Parole tra parentesi quadre: descrizioni dei controlli, non pulsanti testuali
da introdurre. Riutilizzare `IconButton`, `TabStrip`/`InspectorShell`,
`StatRow`, `StatBlock`, `Select`, `Menu` e pannelli esistenti.
Su finestra stretta il monitor si apre nello stesso dialog dei criteri,
con le stesse schede; riepilogo compatto sempre visibile sopra i risultati.

### Elenco ricerche: tutte quelle lanciate

Destinazione interna alla ricerca, raggiungibile da un comando con conteggio
di ricerche attive. Elenco a righe: titolo/query, orario, stato, provider
terminati/selezionati, risultati distinti, errori e comando per aprire.
Filtri: Tutte, In corso, Con errori, Terminate; ordinamento per avvio recente.

L'espansione di una riga mostra i job provider con gli stessi controlli della
pagina risultati. Riusare una sola componente per queste righe. Da qualunque
ricerca si torna all'elenco senza interrompere nulla. La selezione della
ricerca visualizzata è distinta dalle ricerche attive nel motore.

### Pannello lavori e Dashboard

Nel pannello lavori esistente aggiungere il filtro per tipo Ricerca e
raggruppare i job per ricerca; una riga provider apre la ricerca e il relativo
filtro risultati. L'indicatore globale resta unico.

La Dashboard mostra «Ricerche: 2 in corso, 1 con errori» e poche ricerche
recenti, con accesso al monitor. Non incorpora l'intero elenco dei risultati.
Non duplicare logiche di stato o retry fra Dashboard, monitor e pannello lavori.

## 3. Risultati intelligibili mentre arrivano

Riutilizzare la scheda attuale: copertina, titolo, autore, data, metadati,
dettaglio, aggiunta al catalogo/workspace. Aggiungere:

- biblioteca di origine sempre leggibile;
- stato «Già in Biblioteca», indipendente dalla ricerca che l'ha trovata;
- indicazione di criteri non verificabili quando pertinente;
- provenienza completa nel dettaglio: ricerca, provider, esecuzione, orario
  di ricezione, eventuale cache. Non mostrare UUID o dettagli tecnici nella riga;
- se il risultato è presentato fuori dalla sua ricerca, titolo della ricerca
  e comando per aprirla. Dentro la pagina il titolo nell'intestazione evita
  di ripetere la stessa informazione su cinquanta righe.

### Regola di stabilità visiva

1. La prima pagina ricevuta compare subito, senza aspettare gli altri provider.
2. Gli arrivi successivi aggiornano subito contatori e monitor.
3. In ordine d'arrivo, appendere in fondo senza cambiare le righe precedenti,
   la posizione di scorrimento o l'espansione selezionata.
4. Se l'utente sta leggendo una parte lontana dalla fine, mostrare «N nuovi
   risultati» con comando per raggiungere il primo nuovo elemento. Non scorrere da soli.
5. Con ordinamento titolo/data, congelare l'ordine visibile: i nuovi record
   entrano in un gruppo «Nuovi risultati». Il comando Aggiorna ordinamento
   li integra conservando come ancora l'id della riga in lettura.
6. Nessun ordinamento globale per rilevanza ricavato da punteggi non confrontabili.
7. Selezione e focus basati su identità stabile, non sull'indice nell'elenco.

Filtro rapido per biblioteca sopra i risultati: filtra quanto già ricevuto,
non ferma i job. Distinguere questo comando dalla scelta dei provider nel form.
Gli errori sono righe nel monitor; non sostituiscono l'intera lista e non
generano una raffica di toast. Aggiornamenti accessibili raggruppati per pagina.

## 4. Stati: esecuzione e copertura sono due cose diverse

Riusare gli stati già presenti: queued, running, pausing, paused, cancelling,
cancelled, completed, error. Attesa di cortesia/retry è una ragione dello stato
esistente, con orario del prossimo tentativo quando noto; non un errore definitivo.

| Stato mostrato della ricerca | Regola aggregata |
| --- | --- |
| In corso | Almeno un job sta eseguendo o completando pausa/annullamento |
| In attesa | Nessuno esegue, ma esistono job accodati o in attesa di retry |
| In pausa | Nessuno esegue/attende automaticamente e almeno uno è in pausa |
| Completata | Tutte le esecuzioni correnti dei provider sono completed |
| Con errori | Tutte ferme e almeno una error; indicare i risultati parziali disponibili |
| Interrotta | Nessun job attivo, almeno uno cancelled e nessuno error |

Durante l'attività un contatore «1 errore» resta visibile accanto a In corso:
la precedenza dello stato non nasconde i guasti. Zero risultati è un successo
vuoto se il provider ha risposto correttamente, non un fallimento.

Una ricerca completata significa che è finito il lavoro richiesto, non che è
stato esaminato l'intero catalogo. Mostrare anche una copertura distinta:
esaurita, altre pagine disponibili, limite raggiunto, interrotta o sconosciuta.
Se un provider restituisce 20 risultati con hasMore, può aver completato il
budget richiesto e avere ancora pagine da cercare.

## 5. Statistiche della ricerca

Riepilogo compatto sempre visibile; dettaglio nel monitor.

| Misura | Definizione |
| --- | --- |
| Provider | Selezionati, accodati, attivi, riusciti, falliti, interrotti |
| Ricevuti | Record delle pagine uniche acquisite nelle esecuzioni correnti |
| Distinti | Ricevuti dopo deduplicazione per identità certa |
| Corrispondenze | Distinti verificati rispetto ai criteri |
| Non verificabili | Distinti con metadati insufficienti, mostrabili separatamente |
| Esclusi | Distinti che non soddisfano almeno un criterio |
| Tempo trascorso | Avvio ricerca → adesso/fine, non somma delle durate concorrenti |
| Primo risultato | Avvio → primo record ricevuto |
| Per provider | Pagine lette, record, tempo, retry, stato cache e copertura |

Invariante: distinti = corrispondenze + non verificabili + esclusi, con
classificazione esclusiva. Filtri puramente visivi hanno un conteggio a parte.
Retry automatici che rigiocano una pagina non gonfiano i record ricevuti.
Statistiche delle esecuzioni precedenti sono consultabili nello storico,
non sommate ai risultati correnti della ricerca.

Non mostrare percentuali o tempo residuo dell'intero catalogo senza un totale
affidabile. «3 provider terminati su 5» è progresso di esecuzione, non «60%
delle opere trovate». Totali dichiarati dalle biblioteche rimangono separati
e marcati stimati/esatti/sconosciuti.

## 6. Controlli per un solo provider

| Comando | Semantica |
| --- | --- |
| Pausa | Sospende cooperativamente il job; conserva pagine e checkpoint |
| Riprendi | Continua l'esecuzione in pausa dal checkpoint valido |
| Annulla | Arresta questo job; conserva risultati parziali, non tocca gli altri |
| Riprova | Per un errore: nuova esecuzione collegata, riprende la pagina non completata se il cursore è riutilizzabile |
| Ripeti da capo | Per errore, successo o annullamento: nuova esecuzione dalla prima pagina, stessi criteri |
| Carica altri | Per successo con hasMore: nuova esecuzione di continuazione, dal cursore successivo |

Il retry automatico di trasporto resta interno allo stesso job, con contatore
e attesa gestiti dal motore. Il rilancio manuale crea un nuovo job/esecuzione
per conservare storia e identità, invece di riscrivere il vecchio esito.
L'API generica attuale può riaccodare lo stesso id: per la ricerca non usare
quel comportamento senza uno storico separato verificabile.

Vincolo: una sola esecuzione non terminale per coppia ricerca/provider.
Comandi idempotenti, protetti nel backend: doppio clic non crea due lavori.
Ripeti su job attivo richiede prima di fermarlo; non sovrapporre generazioni.

Ripeti da capo non cambia criteri: per cambiarli creare una nuova ricerca.
Può offrire «Aggiorna dal catalogo» per bypassare la cache, chiarendo la scelta.
Il vecchio insieme di risultati resta visibile come precedente durante il
rilancio; il nuovo flusso lo sostituisce a livello di intera esecuzione, senza
mescolare vecchie e nuove pagine. Se fallisce, conservare entrambi gli insiemi
distinti e scegliere esplicitamente quale visualizzare. Lo stato deve dire
che il nuovo tentativo è fallito anche se si stanno leggendo i risultati vecchi.

Riprendi e Carica altri possono invece ereditare pagine già acquisite nello
stesso insieme logico: riferimenti alle pagine, non copie dei record. Un cursore
scaduto richiede Ripeti da capo, senza unione silenziosa di cataloghi cambiati.

Comandi globali: Pausa attive, Riprendi in pausa, Annulla attive, Riprova fallite.
Mostrare quanti job saranno interessati. Riprova fallite non rilancia successi
o provider annullati volontariamente. Consentire retry automatico disattivabile
per esecuzione con limiti validati, mantenendo comunque la cortesia di rete.

## 7. Paginazione e durata del lavoro

Prima versione: un job provider acquisisce una pagina remota e termina. I job
partono insieme e pubblicano ciascuno la sua pagina appena pronta. Carica altri
crea una continuazione solo per i provider richiesti con hasMore.
Questo mantiene un limite esplicito senza trasformare una ricerca in crawler.

Estensione prevista: budget di più pagine per job, con checkpoint/pubblicazione
dopo ogni pagina. «Successo» riguarda il budget richiesto. Non cambiare questo
budget mentre il job gira. La UI deve mostrare quante pagine sono state richieste.
Un provider con dimensione pagina fissa conserva la pagina intera.

Molte ricerche simultanee condividono limiti per host/provider e classe Network.
Serve equità: evitare che una ricerca lunga occupi tutti i posti. Nessun pool
per ricerca che moltiplica il limite globale; riusare la cortesia del lettore
e degli scaricamenti e la precedenza della pagina aperta.

## 8. Persistenza ed eventi

Estensioni proposte del modello dati, da tradurre in migrazione secondo le
regole del repo al momento dell'implementazione:

- `search_runs`: id, titolo, snapshot criteri/provider, versione contratto,
  avvio, archiviazione. Stato aggregato derivato, non aggiornato a mano da ogni worker.
- `search_provider_executions`: id, ricerca, provider, jobId, generazione,
  predecessore, modalità first/retry/restart/continue, versione adapter,
  insieme risultati e checkpoint. Vincolo contro due esecuzioni attive.
- `search_result_pages`: insieme, provider, chiave pagina/cursore, ordine,
  stato cache, istante acquisizione, payload normalizzato e riferimenti.
- risultati indicizzati/deduplicati per insieme + provider + id remoto;
  non creare una fonte della Biblioteca finché l'utente non la aggiunge.

Creazione ricerca + esecuzioni + job accodati atomica: un errore di inserimento
non lascia metà provider avviati. Riutilizzare il coordinamento delle scritture;
può servire un'operazione batch di creazione nella coda esistente.

Commit di pagina + risultati + checkpoint nella stessa transazione; evento
dopo il commit. Gli eventi sono invalidazioni/delta piccoli, non l'unica copia
dei risultati. Snapshot paginabile dal database per apertura, riavvio e recupero.
Non inserire tutte le schede nel campo detail del job.

Ogni evento contiene searchId, executionId, jobId, generazione e sequenza.
Il frontend filtra per ricerca selezionata; gli altri eventi aggiornano il
monitor globale. Una risposta vecchia non può aggiornare il nuovo tentativo.
Sottoscrivere prima dello snapshot, poi applicare solo eventi successivi alla
versione letta. Pagina ripetuta dopo crash: inserimento idempotente.

La navigazione non ferma i job. Alla chiusura applicare le regole esistenti di
pausa e recupero; al riavvio mostrare ricerche e risultati persistiti, senza
ripartire automaticamente di default. Non promettere esecuzione con app chiusa.
Per cursor/sessioni remote non durevoli segnalare la necessità di ricominciare.

Archiviare una ricerca la nasconde dall'elenco principale; non cancella fonti
acquisite. Eliminazione storia: consentita solo senza job attivi, con conferma
del perimetro e senza cancellare opere/immagini. «Pulisci lavori terminati»
non deve distruggere lo storico delle ricerche: conservarne gli esiti o impedire
la rimozione dei job referenziati. Definire la stessa politica per backup:
prima implementazione include ricerche persistite nel backup dati e invalida
la ripresa automatica dopo restore; i cursori non sono garanzia di riprendibilità.

## 9. Riutilizzo verificato e lavoro necessario

Il sistema corrente espone JobStatus, ResourceClass.Network, configurazione,
checkpoint, attemptCount, errorKind, attese di retry ed eventi `jobs:updated`.
Il motore registra handler per tipo. JobsPanel, JobsIndicator, jobsStore e
AppStatusBar costituiscono la superficie comune da estendere.

Non risultano sufficienti da soli per storico ricerca, risultati persistiti
e relazione ricerca/provider: questi sono contratti nuovi del dominio ricerca.
`listActiveJobs` e la finestra dei lavori recenti non sostituiscono l'elenco
storico. `dependsOnJobId` non è una parentela. Il controllo di cancel attuale
è cooperativo: verificare esplicitamente il passaggio ai client HTTP/attese.

## 10. Revisione dei task del piano principale

| Task | Nuovo criterio |
| --- | --- |
| F0 | Contratti ricerca/esecuzione/pagina, stati aggregati, idempotenza e capacità filtri |
| F1 | Pagina ricerca, elenco ricerche e selezione della ricerca visualizzata |
| F2 | Handler job per provider, creazione batch atomica e risultati persistiti progressivi |
| F3 | Form crea nuova ricerca; provider selezionati fissati nello snapshot |
| F4 | Filtri del piano principale invariati, statistiche di corrispondenza per ricerca |
| F5 | Arrivi stabili, monitor provider, continuazione e storico tentativi |
| D1/D2 | Dashboard con riepilogo ricerche e collegamenti al monitor comune |
| F6 | Ricerche lanciate persistite già nel nucleo; preset di criteri salvati restano opzionali |
| Q1 | Verifica concorrente, riavvio, ripartenza selettiva e integrità statistiche |

Comandi proposti: create_search, list_searches, get_search_snapshot,
list_search_results, retry_provider_search, restart_provider_search,
continue_provider_search. Pause/resume/cancel riusano il motore esistente.
I nomi sono proposte: adattarli ai contratti singoli in sviluppo.

### Scenari aggiuntivi obbligatori

1. A e B attive insieme; aprire B non perde o annulla risultati di A.
2. Cinque job accodati; tre rispondono, uno fallisce, uno aspetta cortesia.
3. Riprova di un solo provider: altri successi e job non cambiano.
4. Evento tardivo del tentativo vecchio non altera il nuovo o i suoi conteggi.
5. Zero risultati completato distinto da errore senza risultati.
6. Errore dopo una pagina: parziali leggibili, checkpoint ripetibile senza duplicati.
7. Ripeti da capo: vecchi e nuovi risultati distinti; errore nuovo non nascosto.
8. Doppio invio/retry/continua: un solo job per chiave idempotente.
9. Scroll, focus e riga espansa stabili mentre arrivano pagine da altri provider.
10. Ordinamento alfabetico attivo: nuovi record non spostano il testo in lettura.
11. Riavvio fra commit pagina ed evento: snapshot ricostruisce risultati corretti.
12. Rimozione storia/pulizia job/restore: nessuna fonte acquisita viene eliminata.
13. Statistiche distinguono record, duplicati, filtri, tentativi ed esiti correnti.
14. Carica altri dopo completed con hasMore: stato torna attivo per la continuazione,
    senza cancellare la storia della pagina precedente.

La nuova decisione sostituisce anche il test del piano precedente «query B
cancella A»: ora si verifica isolamento fra ricerche, non cancellazione implicita.
