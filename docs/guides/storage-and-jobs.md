---
title: Archiviazione e lavori
---

# Archiviazione e lavori

Glossa separa il database dei dati di lavoro, il deposito dei file scaricati
e la cache di rete. La coda persistente gestisce le operazioni lunghe senza
richiedere che la relativa schermata resti aperta.

## Posizione dei dati

| Componente | Contenuto | Gestione |
| --- | --- | --- |
| Database | Progetti, traduzioni, catalogo, risorse e impostazioni | Cartella dati locale |
| Deposito | Manifesti, immagini, miniature e versioni locali | Cartella selezionabile, anche su disco esterno |
| Cache di rete | Risposte di ricerca e immagini riutilizzabili | Spazio temporaneo con limite configurabile |

In **Impostazioni → Dati** puoi consultare e cambiare le posizioni.
Cambiare la cartella dati copia il database, verifica la copia e registra la
nuova posizione per il riavvio; l’originale non viene cancellato automaticamente.
Cambiare deposito seleziona una cartella vuota o ricollega un deposito Glossa
esistente, senza trasferire i file dalla cartella precedente.

Il database deve restare su un disco locale, fuori dalle cartelle sincronizzate.
Il deposito può essere sincronizzato solo mantenendo i file effettivamente
disponibili sul disco; i segnaposto dei servizi cloud non garantiscono la
disponibilità delle immagini.

## Ciclo di vita dei lavori

Il pannello nella barra di stato mostra lavori in attesa, in esecuzione e
conclusi. I dettagli comprendono avanzamento, fase corrente, tentativi,
orari ed eventuali errori. Scaricamenti, riduzione delle immagini, verifiche
del deposito e ricerche hanno lavori dedicati.

| Stato o comando | Comportamento |
| --- | --- |
| In attesa | Il lavoro attende risorse o il termine di una limitazione remota |
| Pausa | Richiede un arresto al punto di controllo successivo |
| Riprendi | Continua un lavoro sospeso |
| Annulla | Termina il lavoro; i file già salvati restano disponibili |
| Riprova | Avvia un nuovo tentativo dopo un errore |

La pausa richiesta dall’utente è distinta dall’attesa prima di un tentativo
automatico. Il tempo indicato per un nuovo tentativo non è una stima del tempo
necessario a completare il lavoro.

Chiudendo l’applicazione, i lavori attivi vengono sospesi dopo conferma. Al
riavvio restano in pausa. **Impostazioni → Lavori** può abilitare la ripresa
automatica dei download e configurare i limiti per categoria di risorsa.

## Dimensioni delle immagini

**Impostazioni → Biblioteca → Immagini** definisce dimensioni delle pagine,
miniature e parametri di riduzione. La scelta sulla singola opera prevale
sul valore generale. Il valore numerico indica il lato lungo desiderato,
non una garanzia sulle dimensioni dei file ricevuti.

| Modalità della biblioteca | Regola di richiesta |
| --- | --- |
| Automatico | Usa il dimezzamento dichiarato più vicino all’obiettivo, se disponibile; altrimenti calcola la larghezza dal lato lungo |
| Solo formati già pronti | Usa i dimezzamenti dichiarati; in loro assenza richiede la dimensione piena |
| Misura precisa | Calcola la larghezza proporzionale al lato lungo richiesto |
| Risoluzione massima dell’opera | Richiede la dimensione piena indipendentemente dalla modalità |

Le pagine già più piccole dell’obiettivo e quelle prive di dimensioni valide
vengono richieste intere. Un formato predefinito può risultare più grande o
più piccolo dell’obiettivo. Se il servizio rifiuta la dimensione richiesta,
il download può usare la dimensione piena e conservarla senza riduzione locale.
Le miniature vengono generate dalle pagine scaricate.

Chiedere una risoluzione diversa crea una versione separata. Il comando per
salvare la pagina dal visore usa invece l’immagine già caricata. La risoluzione
scelta non modifica retroattivamente i file presenti.

## Profili di rete

**Impostazioni → Biblioteca → Configurazioni** gestisce profili con concorrenza,
richieste al minuto, attesa dopo un rifiuto, tentativi e timeout. Le modifiche
richiedono salvataggio esplicito. La scheda **Biblioteche** assegna un profilo
e una modalità di richiesta delle immagini a ciascun servizio.

I profili predefiniti possono essere modificati ma non eliminati. Un profilo
personalizzato in uso deve essere disassociato prima dell’eliminazione.
Le richieste simultanee verso un host sono limitate a quattro, con capacità
riservata alla lettura interattiva. Il limite dei lavori non annulla questi
vincoli di rete. L’indicatore nella barra di stato mostra richieste attive,
attese e provenienza delle immagini.

## Copertura e integrità

Il conteggio delle pagine locali deriva dai file nel deposito. Il totale
atteso deriva dal manifesto e viene acquisito anche aprendo il visore.
Le pagine dichiarate non disponibili dal servizio sono conteggiate separatamente;
la completezza si riferisce alle pagine ottenibili.

La verifica rapida controlla la presenza dei file. La verifica completa ne
legge il contenuto, ne verifica il formato e confronta le impronte disponibili.
Entrambe producono un riepilogo di file integri, mancanti, corrotti e privi di
un’opera associata. Non cancellano né riscaricano file automaticamente.
La pulizia dei file senza opera è un comando separato che verifica nuovamente
il deposito prima di procedere.

## Riduzione e cache

La riduzione genera una nuova versione con dimensioni e qualità scelte,
conservando l’originale. Per recuperare spazio occorre eliminare una versione
dopo aver verificato il risultato. Se alcune pagine non sono elaborabili,
il lavoro segnala l’errore e conserva quelle prodotte correttamente.

La cache di rete riutilizza risposte e immagini; il limite predefinito è
512 MB e la validità predefinita delle ricerche è 24 ore. Le immagini sono
soggette al limite di spazio, senza la stessa scadenza temporale. In
**Impostazioni → Dati** puoi modificare questi valori e svuotare la
cache. La cache non aumenta il conteggio delle pagine scaricate e non entra
nel [backup](../reference/backup-and-restore).


## Una copia sola per opera

Di un'opera si tiene **una copia a immagini**, alla misura scelta al momento
dello scaricamento, con **un file per pagina**. Chiedere il libro a un'altra
misura lo dichiara prima e sostituisce quella che hai: le misure vecchie
vengono cancellate solo a scaricamento riuscito, così un guasto di rete non ti
lascia senza niente.

Il deposito resta capace di tenere più misure insieme, ma nessun comando ne
crea più di una.

## Agire sulla pagina che stai leggendo

I comandi sulla singola pagina stanno nella scheda a destra, sotto **Copie
digitali**, nella sezione in cima che riguarda la pagina aperta nel visore. Sono
comandi a icona: il nome compare passandoci sopra. Restano visibili anche quando
il visore mostra un'altra copia, spenti.

Con la pagina aperta puoi:

- **scaricarla**, anche se il libro non è sul disco: la pagina va nella cartella
  della risoluzione scelta per quell'opera;
- **scaricarla a risoluzione massima**: viene richiesta di nuovo e **sostituisce**
  quella presente, restando l'unico file di quella pagina;
- **riscaricarla alla risoluzione del libro**, che recupera lo spazio quando non
  serve più il dettaglio;
- **eliminarla dal disco**: la pagina viene esclusa e non torna né con un nuovo
  scaricamento del libro né da sola. Richiederla la riammette.

Quando il libro è già alla risoluzione massima i due comandi sulla risoluzione
sono spenti: chiederebbero la stessa immagine.

Sotto compaiono la misura vera di quella pagina — i pixel che ha davvero, che
dopo una ripresa non sono più quelli del libro — e quanto pesa. Nella barra del
visore restano soltanto i comandi di lettura: lettura solo dal computer,
ingrandimento, miniature e il collegamento alla pagina sul sito della
biblioteca.

I comandi che riguardano le pagine sul disco — verifica, ricompressione,
eliminazione — stanno sulla riga della risoluzione, non nell'intestazione della
sezione: è lì che si legge su cosa agiscono.

Nella scheda dell'opera la copia dichiara quante pagine hai tolto di proposito:
senza quella riga una copia incompleta sembrerebbe guasta.

## Alleggerire le pagine

Il comando di ricompressione riscrive **tutte** le pagine della copia a una
qualità più bassa, **senza cambiarne le dimensioni**: serve quando la misura va
bene e il problema è lo spazio. Non crea una seconda copia del libro e non è
reversibile — per riavere la qualità di prima si riscarica dalla biblioteca.

Se dopo la ricompressione una pagina ti serve migliore, la riprendi alla massima
risoluzione: sostituisce quella ricompressa.


## Messaggi e log di sistema

Il pannello in basso raccoglie tre schede: i messaggi della traduzione in corso,
il **log di sistema** e i lavori. Il log di sistema è disponibile in ogni area e
mostra quanto il programma ha scritto mentre lavorava — ricerche nelle
biblioteche, scaricamenti, deposito, salvataggi — leggendo direttamente il file
di log dell'applicazione, compresi i file ruotati delle sessioni precedenti.

I filtri restringono per area (Biblioteca, Traduzione, Lavori, Interfaccia) e
per livello (errore, attenzione, info, debug); la ricerca lavora sul testo della
riga. Le righe prodotte dalle librerie di terze parti — interrogazioni al
database, portachiavi, connessioni di rete — restano nascoste finché non le si
richiede esplicitamente: da sole costituiscono la maggior parte del file.

«Svuota la vista» ripulisce la finestra e non tocca il file su disco: ricaricando,
le righe tornano. «Carica le precedenti» prosegue la lettura all'indietro.
Il percorso della cartella dei log resta indicato nella guida dentro
l'applicazione, alla voce di risoluzione dei problemi.

## Storico dei jobs e retention

Il pannello in basso è la vista operativa: mostra i jobs non ancora conclusi e
quelli terminati nelle ultime 24 ore, con pausa, ripresa e retry. Il comando con
il cestino nella sua intestazione **toglie dalla vista** le righe concluse, così
i jobs nuovi si leggono senza rumore: non cancella niente, e un job nascosto che
riparte ricompare da solo. La pulizia vale per la sessione in corso.

Lo **storico completo** sta nella colonna a destra della Panoramica: elenca tutto
ciò che è passato dalla coda, si legge a pagine e si può stringere, allargare o
chiudere come le altre colonne laterali. Ogni riga si apre come nel pannello in
basso, con fase, tentativi, orari, esito ed errore.

In cima alla colonna ci sono la ricerca a testo libero sul nome del job e due
file di comandi: la prima filtra per esito (in corso, riuscito, fallito,
interrotto), la seconda per tipo di lavoro. Più scelte possono essere attive
insieme; lo stato di ogni riga è un simbolo con la spiegazione al passaggio del
mouse, non una parola.

Nessun job viene eliminato automaticamente e non esiste un tetto al numero di
righe conservate. L'eliminazione è sempre esplicita: la singola riga, oppure —
con il cestino in cima alla colonna — **tutti i conclusi che i filtri stanno
mostrando**, quindi tutti se i filtri sono spenti e solo quelli selezionati
altrimenti. Restano i jobs a cui è ancora appesa un'altra superficie — oggi le
esecuzioni di una ricerca salvata, che verranno eliminate insieme alla ricerca
stessa.
