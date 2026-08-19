# Stato del blocco 1 — fondamenta invisibili

Diario delle sette PR decise in `BLOCCO_1_DECISIONI.md`, Parte G. Si aggiorna a
ogni PR unita, e serve a riprendere il filo fra una sessione e l'altra.

Ultimo aggiornamento: **2026-08-20**.

## Come è organizzato il lavoro

Le PR si uniscono nel branch di integrazione **`blocco-1`**, non in `main`. Su
`main` arriva un solo merge alla fine, che diventa la **1.5**: la PR di
integrazione è la **#429**, aperta in bozza finché il blocco non è completo.

Il motivo è il consolidamento dello schema: ogni PR aggiunge un file di
migrazione in coda; prima del merge finale le migrazioni del blocco si
collassano in un'unica baseline pulita e si buttano i database di sviluppo.
Riscrivere una migrazione già applicata fa fallire l'avvio — sqlx le traccia
con l'impronta del contenuto.

Eccezione: la **PR 5** (#213, risorse condivise) è dichiarata indipendente e va
dritta su `main`.

## Avanzamento

| PR | Cosa | Issue | Stato |
|---|---|---|---|
| 1 | Deposito dei file e disponibilità reale | #217 | unita (#414) |
| 2 | Orchestratore dei lavori, a vuoto | #218 | unita (#415, #416) |
| 3 | Coda visibile: indicatore e pannello Lavori | #218, #413 | unita (#417) |
| 3-bis | Impostazioni: deposito, limiti, ripresa automatica | #217, #218 | unita (#418) |
| 4 | Scaricamento vero | #218 | unita (#419) |
| 4-bis | Catalogo Biblioteca | #217 | unita (#420) |
| 4-ter | Miniature ricavate in locale | #218 | unita (#423) |
| 4-quater | Profili di rete, registrazione, rifiniture | #421, #422, #378 | unita (#428) |
| **5** | Risorse condivise e ambito | #213 | **fatta**: struttura dei contenitori, override, archiviazione |
| 4-quinquies | Scaricamento, cache e spazio su disco — riscrittura | #218 | **fatta**: cache (#442), disco come verità e misura calcolata (#443), ottimizzazione locale (#444) |
| 6 | Registrazione del lavoro svolto | #378 | **fatta**: fondazione, tutte le chiamate ai modelli, costo con i token da cache |
| 7 | Backup, esportazioni e riservatezza | #345, #407 | **backup fatto** e spostato nelle impostazioni generali; restano i tre livelli di riservatezza (D33) e l'esportazione di un workspace (#434) |

**Perché la 6 non va lasciata ultima**: ogni giorno senza registrazione è
materiale perso per sempre, in particolare la coppia proposta/approvata delle
traduzioni.

## Cosa esiste, adesso

**Deposito** (`src-tauri/src/vault/`): cartelle per provenienza, impronte e
validazione in una lettura sola, verifica rapida (presenza) e completa (forma e
confronto dell'impronta registrata), «libera spazio», disponibilità calcolata
dai file presenti, radice configurabile con marcatore. All'avvio si butta
quello che una chiusura brusca ha lasciato nell'area di transito. L'esito
dell'ultimo controllo resta nelle impostazioni finché non se ne fa un altro, con
accanto il comando che cancella i file che nessuna opera reclama (D5-bis): il
backend riguarda il deposito nel momento in cui si preme, invece di fidarsi di
un conto vecchio.

**Lavori** (`src-tauri/src/jobs/`): coda unica con limiti per classe di
risorsa, pausa e annullamento cooperativi che **battono il nuovo tentativo**,
attese classificate per tipo di errore, ripresa dopo una chiusura brusca,
avanzamento al massimo una volta al secondo, eventi verso l'interfaccia. Ogni
lavoro registra avvio ed esito nel registro dei fatti senza che chi scrive il
gestore debba ricordarsene.

**Scaricamento** (`src-tauri/src/download/`): dal manifesto alle pagine, con i
limiti della biblioteca rispettati per host. **Il disco è la verità** (piano
§5.4): nessuna riga per pagina nel database, il conteggio lo dà la cartella, e
checksum, dimensioni e byte di ogni pagina stanno in un file di lato dentro la
cartella di misura. La misura **si calcola** dalle dimensioni del manifesto — una
sola lettura del descrittore per libro, che dice solo se quella biblioteca tiene
pronti i dimezzamenti — e il tetto è una politica: vince il dimezzamento più
vicino, sopra o sotto. Riprendere significa rileggere la cartella; una pagina che
la biblioteca dichiara di non servire lascia la sua riga e si riprova a scadenza,
un guasto no. Se la biblioteca rifiuta la misura si prende la dimensione piena e
**si conserva com'è**: ridurre è una scelta che si fa a freddo.

**Cache di tutto ciò che viene dalla rete** (`src-tauri/src/httpcache/`, #442):
copertine, miniature remote e risposte delle ricerche passano dalla cortesia e da
un magazzino solo, un file per richiesta. Le copertine si vedono anche nell'app
impacchettata, che era il difetto che questa parte doveva chiudere.

**Ottimizzazione locale** (`src-tauri/src/optimize/`, #444): un lavoro della coda
che rilegge una cartella di misura, riduce le pagine oltre il lato lungo scelto e
le ricomprime, riscrivendo checksum e miniature. È **l'unica cosa che riduce**, e
la si chiede: la conferma dice quante pagine tocca e quanto si prevede di
liberare.

**Workspace come contenitore** (#213): due forme di appartenenza. **Casa** — una
traduzione e una trascrizione stanno in un solo workspace, e da lì prendono le
risorse. **Collegamento** — libri, dizionari e frasi importate stanno in più
workspace insieme, con una tabella sola (`workspace_items`) che vale per ogni
tipo, anche per quelli che non esistono ancora. Un dizionario condiviso si può
correggere **a casa propria** senza toccare l'originale. Un workspace si
**archivia** invece di eliminarlo; eliminandolo se ne vanno solo i lavori che ci
abitavano. La Biblioteca mostra **sempre tutti i libri**, con i workspace a cui
appartengono sulla scheda.

Le regole decise il 2026-08-17: traduzioni e trascrizioni in **un solo**
workspace; memoria di frasi che segue il progetto da cui nasce; spostamento come
fatto senza riscrivere il passato; una scelta sola all'eliminazione; risorse
scollegate che **restano**; workspace del documento facoltativo.

**Interfaccia**: catalogo Biblioteca con copertine e pagine sul computer,
pannello dei lavori con i dettagli divisi fra opera e ultima pagina,
impostazioni di scaricamento e profili di rete.

**Registrazione** (`src-tauri/src/provenance.rs`, `services/provenanceService.ts`):
storico delle traduzioni con revisioni immutabili, approvazione e ritiro come
fatti, registro append-only con le colonne che serviranno all'area Analisi.
Ogni chiamata a un modello lascia un fatto — stadi, giudice, coerenza,
riscrittura dopo il giudizio, estrattore della memoria — più la rigenerazione
degli embedding come fatto del workspace. Il costo tiene conto dei token letti
da cache, e i caratteri fatturati da DeepL stanno nel fatto. I fatti dei lavori
portano il workspace da cui il lavoro è nato.

## Cosa manca al blocco, prima della 1.5

Due cose sole sono **obbligatorie** per chiudere:

1. **I tre livelli di riservatezza** di backup ed esportazioni (D33): aperto,
   solo Glossa, con password. Il terzo richiede di scegliere **come derivare la
   chiave** dalla password — la libreria per cifrare c'è già, quella per
   derivare no — e va scelta, non improvvisata.
2. **Collassare le migrazioni** in una baseline sola e buttare i database di
   sviluppo. Insieme a quello: correggere la migrazione delle trascrizioni (vedi
   sotto), togliere il codice di retrocompatibilità pre-2.0 — che serve solo a
   database antecedenti alla baseline — e la colonna
   `transcription_segments.asset_id`, che doveva legare un segmento al file di
   una pagina: nessuno la scrive, e il §5.4 del piano ha deciso che quel legame
   si fa sulla digitalizzazione più il numero di pagina.

Poi `blocco-1` va su `main` come **1.5**.

### Del sottosistema scaricamento, resta fuori questo

Nessuna di queste blocca la 1.5. Il piano
`SCARICAMENTO_E_DEPOSITO.md` le tiene con il loro perché.

| | Cosa | Quando |
|---|---|---|
| **Fase 2** | misurare le undici biblioteche: dichiarano i dimezzamenti? con che livello di conformità? e la prova della sessione del lettore su un manoscritto vaticano (fatto 12, l'unica cosa ancora aperta del piano) | quando si vuole: non è un prerequisito di niente |
| **Pagine in parallelo** | il ciclo immette più di una pagina alla volta entro `host_concurrency`, che il profilo dichiara già e l'impostazione per biblioteca espone già. **Predefinito 1 per tutte**: il 4 di oggi limita i lavori concorrenti fra loro, e usarlo così porterebbe ogni biblioteca mai misurata a quattro richieste in volo senza che nessuno l'abbia deciso | dopo la fase 2, che dice quali biblioteche lo tollerano |
| **Una pagina alla massima risoluzione** (§5.6) | il comando c'è nella specifica e non nel codice: una pagina si chiede guardandola, e il visore non c'è. Scriverlo adesso sarebbe un comando che nessuno può invocare | col visore |
| **I due valori dell'ottimizzazione per opera** | lato lungo e qualità nella scheda di Biblioteca, accanto al tetto per fonte. Il motore li accetta già come parametri; alla stima va aggiunto il lato lungo | con la fase 2 |

## Scoperto strada facendo, ancora aperto

- **Il «workspace attivo»** decide ancora due cose: cosa mostra la pagina di un
  workspace, e dove nasce un dizionario nuovo. **Non** decide più cosa si vede
  in Biblioteca. La seconda si risolverebbe prendendo il workspace dal progetto
  aperto, che lo sa già.

## Aperti, da non perdere

- **Divieto dell'istituzione** (D9): la colonna `download_allowed` esiste e non
  la legge nessuno, quindi si scarica anche da una fonte marcata come non
  scaricabile. Va deciso **chi scrive quel contrassegno**, altrimenti resta una
  difesa teorica. Lo scaricamento deve rifiutarlo alla messa in coda e
  ricontrollarlo all'avvio del lavoro; in Biblioteca il comando va disattivato
  con la spiegazione al passaggio del mouse.
- **Primo avvio e spazio disponibile** (D1): la schermata esiste già — è la
  creazione del primo workspace — e la scelta del deposito ne diventa un passo,
  **dopo** la creazione, perché creare il workspace è ciò che l'utente è venuto
  a fare. Manca anche il controllo dello spazio libero prima di adottare una
  cartella: si avvisa e si lascia decidere, senza vietare.
- **Notifiche di sistema** (D21): mai fatte.
- **Il legame fra segmento di trascrizione e pagina** dopo un ripristino resta
  solo se quella pagina è sul computer: se manca, il segmento sopravvive senza
  il suo riferimento. Riscaricando l'opera gli identificativi tornano identici,
  quindi il legame si potrebbe ricucire — nessuno lo fa ancora.
- **Esportare e importare un singolo workspace** (#434): il backup è del
  programma intero e resta tale. Portare via un workspace solo richiede
  identificatori nuovi a ogni riga; le regole di ambito che gli mancavano
  adesso ci sono (#213), quindi è pronta per essere fatta.
- **L'import di glossari da CSV** è rimasto l'ultimo punto che legge un file
  dalla webview: finché c'è, il permesso di lettura non si può restringere
  (#407, terzo punto).
- **Rilevamento vero dei segnaposto** delle cartelle sincronizzate (D1-bis):
  oggi è un riconoscimento per nome di cartella.
- **Barra di stato unificata e console generale dei log**: restano a #413, che
  ha l'elenco di cosa oggi scrive nel registro.
- **La migrazione delle trascrizioni perde il puntatore che dichiara di
  conservare**: imposta l'approvazione leggendo il vecchio stato e poi rifà la
  tabella, e la cancellazione implicita azzera il puntatore appena scritto (le
  chiavi esterne sono attive su ogni connessione). Oggi non perde niente perché
  nessuna revisione di trascrizione esiste. **Si corregge al collasso delle
  migrazioni**, non prima: riscrivere un file già applicato impedisce l'avvio, e
  il file da correggere sparisce comunque nella baseline. Il commento dentro la
  migrazione descrive quindi un'intenzione, non il comportamento.
- **Codice di retrocompatibilità pre-2.0** (`db.rs`, `backfill_legacy_columns`):
  va tolto **insieme al consolidamento delle migrazioni**, non prima.
- **Artefatti grafici su WSL2**: risolti con `WEBKIT_DISABLE_COMPOSITING_MODE=1`,
  non messo di default perché potrebbe essere specifico del portatile.
- **Scrollbar su Linux**: il rimedio funziona, il risultato non piace.
- **Livello bibliografico per gli stampati**: #404, fuori dal blocco.

## Decisioni cambiate implementando

Tutte riportate in `BLOCCO_1_DECISIONI.md` accanto alla decisione originale.

| Decisione | Cosa è cambiato |
|---|---|
| **D4** | **sostituita** dal piano §5.1: la misura non si negozia, si **calcola** dalle dimensioni del manifesto. Il descrittore si legge una volta per libro e serve solo a sapere se quella biblioteca tiene pronti i dimezzamenti. Il tetto resta una politica, e vince il dimezzamento più vicino **sopra o sotto** — prenderlo sempre sopra dava pagine al doppio del tetto |
| **D2 · D5 · D7** | **il disco è la verità** (§5.4): le pagine non hanno più una riga a testa, checksum e dimensioni stanno in un file di lato dentro la cartella di misura, e la disponibilità si legge contando i file. Un file senza riga è una pagina presente di checksum ignoto: si conta, e la verifica completa la salta |
| **decisione 2 del piano** | **sostituita il 2026-08-19**: il ripiego non rimpicciolisce più. Se la biblioteca rifiuta la misura, la pagina arriva a dimensione piena e si conserva com'è — nessuna ricompressione alle spalle dell'utente, che è la regola che il §5.7 dichiarava già per l'ottimizzazione |
| **D5** | la verifica completa **confronta** l'impronta registrata, non la ricalcola e basta |
| **D6** | le miniature non si scaricano: si **ricavano** dalla pagina appena scaricata, a 300 px sul lato lungo |
| **D13** | «da rifare» significa fermo in attesa dell'utente, non rimesso in coda |
| **D14** | pausa e annullamento battono il nuovo tentativo: un errore incassato mentre l'utente premeva pausa faceva ripartire il lavoro da solo |
| **D17** | il tempo stimato viene dal ritmo vero del lavoro, non dalla pausa dichiarata dal profilo |
| **D18** | i valori di rete sono **profili** — un ritmo, non una biblioteca — e le biblioteche ne scelgono uno |
| **D22** | le revisioni non hanno stato: approvare e ritirare sono fatti che puntano a una revisione, e **il giudizio si lega alla revisione** invece di stare in colonne sovrascritte |
| **D29** | «ogni chiamata» comprende coerenza, riscrittura dopo il giudizio, estrattore della memoria ed embedding: la prima stesura ne lasciava fuori proprio quelle che fanno salire il conto. Il costo distingue i token da cache, e il verdetto del giudice si scrive anche rilanciando la sola revisione |
| **D5-bis** | l'esito del controllo non vive più nella riga del pannello, che dopo un giorno spariva: resta nelle impostazioni finché non se ne fa un altro, con accanto il comando che cancella i file senza opera |
| **D17** | fermo non è una cosa sola: in pausa, in attesa dei limiti di una biblioteca e in attesa di riprovare si dicono diversamente in barra, nella scheda della Biblioteca e nel pannello, e il tempo mostrato è quello del **tentativo**, non quello che manca a finire |
| **D31** | il backup è del **programma intero**, non di un workspace, e sta nelle impostazioni generali: si chiamava «backup del workspace» ma prendeva tutto. Portare via un solo workspace diventa #434. Le colonne che il ripristino riscrive si chiedono al database, perché l'elenco scritto a mano ne perdeva alcune in silenzio |

## Cronologia breve

- **2026-08-12/14** — PR 1-4. Rilettura esterna sul codice: corretti la chiave
  della biblioteca passata come nome di cartella, il punto salvato che contava
  il numero dell'ultima pagina invece di quante ne fossero fatte, cinque comandi
  del deposito che ricevevano la radice dal frontend, la pausa fra richieste
  risorteggiata a ogni controllo.
- **2026-08-15** — prova sul campo su archive.org: la misura va scelta fra
  quelle dichiarate, i log dei lavori prendono una forma sola, il pannello dice
  a che punto è il lavoro. Implementate quattro decisioni scoperte: miniature
  all'aggiunta (poi corretta), «libera spazio» in interfaccia, verifica di una
  fonte, verifica del deposito.
- **2026-08-16** — miniature ricavate in locale, impostazioni di scaricamento e
  biblioteche, fondazione della registrazione, pulizia dell'area di transito.
- **2026-08-18** — il workspace diventa un contenitore: una tabella sola per i
  collegamenti, casa unica per traduzioni e trascrizioni, correzioni locali dei
  dizionari, archiviazione. La Biblioteca torna a mostrare tutti i libri, con i
  workspace sulla scheda. Chiusa la prima stesura (#436), che aveva la struttura
  sbagliata.
- **2026-08-17** — prove a mano su ogni PR: da lì la pausa che non riprova, il
  tempo stimato dal ritmo vero, la verifica che confronta l'impronta, la
  rimozione che porta via anche i file, i profili di rete al posto dei valori
  per biblioteca, e le quattro schede delle impostazioni riportate nell'idioma
  visivo dell'app.
- **2026-08-18/20** — riscrittura del sottosistema scaricamento contro
  `SCARICAMENTO_E_DEPOSITO.md`, in tre rami: la cache (#442), il disco come
  verità con la misura calcolata (#443), l'ottimizzazione locale (#444). Il
  gestore da 1424 righe diventa dodici file, le righe per pagina nel database
  spariscono, e da tre revisioni esterne più le prove sul campo escono le
  correzioni che contano: la riga «non servita» solo per i rifiuti dichiarati
  della biblioteca e non per un guasto, il tetto che è una politica e non un
  minimo, il ripiego che conserva invece di ricomprimere.
- **2026-08-17, sera** — revisione della finestra Impostazioni contro il design
  system: le sette schede avevano tre generazioni di stile addosso. Nascono tre
  primitive (intestazione di sezione allineata a 11px, riga di impostazione,
  trattamento unico dei campi), il colore d'avviso smette di essere identico al
  grigio secondario, sparisce l'ultimo pulsante testuale, le linguette si
  cambiano con le frecce e un ritmo di rete a metà non si perde più cambiando
  scheda.

## Da provare a mano, per chi rilegge

Scaricare un'opera e guardare il pannello: una riga sola, le due sezioni dei
dettagli, il tempo stimato che cala mentre va. Metterla in pausa mentre la
biblioteca dà errore: non deve ripartire da sola. Togliere l'opera: la sua
cartella nel deposito deve sparire.

Del sottosistema riscritto, le prove che i test non possono fare:

1. **Staccare la rete a metà scaricamento**, lasciare che il lavoro esaurisca i
   tentativi, riattaccarla e riprovare: il libro riparte da dove era. Se dice «non
   ha servito nessuna pagina» e non riprende più, la riga «non servita» è stata
   scritta per un guasto.
2. **Un libro di archive.org dall'inizio alla fine**, con una pausa in mezzo: nel
   registro **una sola** lettura del descrittore, e la ripresa non richiede quello
   che è già sul disco.
3. **Un manoscritto di Gallica**, che non dichiara misure: larghezza esatta, lato
   lungo esattamente al tetto, nessun raffreddamento nel registro.
4. **La verifica di un'opera**, tre casi: completa, con file cancellati a mano,
   e senza conteggio atteso dichiarato dalla biblioteca.
5. **«Cancella i file senza opera»**: il numero annunciato è quello dei file, e
   con la Biblioteca vuota non propone di cancellare niente.
6. **Backup e ripristino** di un libro che ha anche pagine a risoluzione piena: il
   ripristino riscarica la misura principale e **dice** che le altre non tornano.
7. **L'ottimizzazione locale** su un libro scaricato a dimensione piena: la
   conferma dice quante pagine tocca e quanto libera, il pannello dice quanto ha
   liberato, la verifica completa dopo non trova niente di corrotto — è la prova
   che i checksum sono stati riscritti.
