# Stato del blocco 1 — fondamenta invisibili

Diario delle sette PR decise in `BLOCCO_1_DECISIONI.md`, Parte G. Si aggiorna a
ogni PR unita, e serve a riprendere il filo fra una sessione e l'altra.

Ultimo aggiornamento: **2026-08-18**.

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
tempi della biblioteca, la misura scelta fra quelle dichiarate, le miniature
ricavate in locale, il tempo stimato dal ritmo vero del lavoro.

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

1. **I tre livelli di riservatezza** di backup ed esportazioni (D33): aperto,
   solo Glossa, con password. Il terzo richiede di scegliere **come derivare la
   chiave** dalla password — la libreria per cifrare c'è già, quella per
   derivare no — e va scelta, non improvvisata.
2. **Collassare le migrazioni** in una baseline sola e buttare i database di
   sviluppo. Insieme a quello: correggere la migrazione delle trascrizioni (vedi
   sotto) e togliere il codice di retrocompatibilità pre-2.0, che serve solo a
   database antecedenti alla baseline.

Poi `blocco-1` va su `main` come **1.5**.

## Scoperto strada facendo, ancora aperto

- **La politica di sicurezza vieta le immagini prese dalla rete**: `img-src`
  consente solo `self`, `data:` e `blob:`. Nell'app impacchettata le copertine
  di archive.org **non comparirebbero**; in sviluppo si vedono perché lì la
  politica non viene applicata. Si risolve con la **cache delle immagini** —
  decisa in D8 (tetto in `remote_image_cache_mb`, 512 MB predefiniti, scarto dei
  più vecchi, mai nel deposito) e mai fatta — che serve comunque: oggi ogni
  disegno di una scheda ripassa dal servizio della biblioteca.
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

## Trovato indagando lo scaricamento (2026-08-18)

Sei difetti emersi da una lettura del codice confrontata con il database, i log
e il deposito reali. Chiusi in `fix/scaricamento-robustezza`.

1. **Un `info.json` che non risponde portava via il libro intero.** Lo stesso
   manoscritto perso due volte, al 47% e al 48%: quindici richieste e dieci
   minuti bruciati per volta, e alla sessione dopo la stessa carta rispondeva.
   Adesso si ripiega sul riquadro, come già si faceva per un descrittore
   illeggibile (D4).
2. **Ogni ripresa consumava un tentativo.** Un libro in pausa tre volte era già
   a 3/5 con la colonna degli errori vuota; alla quinta ripresa il primo errore
   di rete sarebbe stato definitivo. Il conto è dei tentativi falliti **di fila**
   (D16).
3. **Un 404 su una carta rendeva il libro non scaricabile mai**: ogni rilancio
   tornava a morire sulla stessa carta. Ora si salta e si va avanti (D13).
4. **La misura negoziata non sopravviveva a una pausa**: 70 letture del
   descrittore per 39 gruppi distinti sullo stesso libro, dove D4 prevede una
   lettura per gruppo. Ora sta nel punto salvato.
5. **«Libera spazio» e «togli l'opera» potevano cancellare le righe senza
   cancellare i file**, e dichiarare di essere riuscite. Nel deposito di prova:
   153 carte e nove cartelle su dieci senza più niente che le reclamasse. Ora i
   percorsi li dicono le righe e la cartella si cerca sotto tutte le biblioteche
   (D6).
6. **La durata registrata di un lavoro comprendeva le pause**, perché veniva
   dagli orari della tabella: 22 minuti dichiarati su un lavoro spalmato su due
   giorni. Ora si misura l'esecuzione.

**Non** era un difetto, e resta com'è: il registro dei fatti tiene una riga per
lavoro e non una per tentativo. È D27, e il numero del tentativo sta in
`jobs.attempt_count`.

Verificato sul campo e **non** toccato: la misura scelta (tetto 2000, lato lungo
reale 2056-2141, costante su tutto il libro), le miniature (288 su 288, 300 px,
nessun ritardo), i tempi di cortesia (nessun raffreddamento in tre log, gap fra
carte 2,0-8,0 s, nessuno sotto la pausa minima del profilo — su archive.org il
collo di bottiglia è il server, non noi), il punto salvato e la ripartenza dopo
una chiusura brusca.

Resta aperto, misurato ma non affrontato: **ritrovare una carta già sul disco
costa 2,65 s**, quanto scaricarla, quando le sue righe mancano — rileggere il
file, ricalcolarne l'impronta e ricavarne di nuovo la miniatura. Su un libro di
900 carte sono quaranta minuti per «saltare» roba già fatta.

## Decisioni cambiate implementando

Tutte riportate in `BLOCCO_1_DECISIONI.md` accanto alla decisione originale.

| Decisione | Cosa è cambiato |
|---|---|
| **D4** | il tetto è una politica, non un pixel: si legge il descrittore e si prende la misura dichiarata più vicina, senza tentare niente alla cieca. Due livelli di scelta — opera e generale — non tre |
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

Dopo `fix/scaricamento-robustezza`: mettere in pausa e riprendere un libro tre
o quattro volte di fila e guardare che il numero dei tentativi resti a 1 — prima
saliva a ogni ripresa. Riprendere un libro già a metà: nel registro non deve
comparire nessuna riga `job size negotiated` per un gruppo già visto. Liberare
lo spazio di un'opera e guardare che la cartella `pages` sparisca **e** che il
conteggio delle carte vada a zero: prima potevano non andare d'accordo.
