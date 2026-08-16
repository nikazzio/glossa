# Stato del blocco 1 — fondamenta invisibili

Diario delle sette PR decise in `BLOCCO_1_DECISIONI.md`, Parte G. Si aggiorna a
ogni PR unita, e serve a riprendere il filo fra una sessione e l'altra.

Ultimo aggiornamento: **2026-08-17**.

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
| **5** | Risorse condivise e ambito | #213 | **da fare**, indipendente |
| **6** | Registrazione del lavoro svolto | #378 | **fondazione fatta**, mancano gli eventi delle chiamate ai modelli |
| **7** | Backup, esportazioni e riservatezza | #345, #407 | **da fare** |

**Perché la 6 non va lasciata ultima**: ogni giorno senza registrazione è
materiale perso per sempre, in particolare la coppia proposta/approvata delle
traduzioni.

## Cosa esiste, adesso

**Deposito** (`src-tauri/src/vault/`): cartelle per provenienza, impronte e
validazione in una lettura sola, verifica rapida (presenza) e completa (forma e
confronto dell'impronta registrata), «libera spazio», disponibilità calcolata
dai file presenti, radice configurabile con marcatore. All'avvio si butta
quello che una chiusura brusca ha lasciato nell'area di transito.

**Lavori** (`src-tauri/src/jobs/`): coda unica con limiti per classe di
risorsa, pausa e annullamento cooperativi che **battono il nuovo tentativo**,
attese classificate per tipo di errore, ripresa dopo una chiusura brusca,
avanzamento al massimo una volta al secondo, eventi verso l'interfaccia. Ogni
lavoro registra avvio ed esito nel registro dei fatti senza che chi scrive il
gestore debba ricordarsene.

**Scaricamento** (`src-tauri/src/download/`): dal manifesto alle pagine, con i
tempi della biblioteca, la misura scelta fra quelle dichiarate, le miniature
ricavate in locale, il tempo stimato dal ritmo vero del lavoro.

**Interfaccia**: catalogo Biblioteca con copertine e pagine sul computer,
pannello dei lavori con i dettagli divisi fra opera e ultima pagina,
impostazioni di scaricamento e profili di rete.

**Registrazione** (`src-tauri/src/provenance.rs`, `services/provenanceService.ts`):
storico delle traduzioni con revisioni immutabili, approvazione e ritiro come
fatti, registro append-only con le colonne che serviranno all'area Analisi.

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
- **Eventi delle chiamate ai modelli** (D29): provider, modello, token, costo e
  durata per stadio. Le colonne esistono e sono vuote.
- **`transcription_revisions`** ha ancora la colonna `status`, che D22 vuole
  allineata al modello a eventi.
- **Backup ed esportazione** non portano con sé revisioni e fatti: è la PR 7. Il
  puntatore all'approvazione non è nel backup **di proposito**: ripristinato
  punterebbe a revisioni che il backup non contiene.
- **File orfani**: la verifica li conta e nessuno li cancella. Manca il comando
  «elimina i file orfani» previsto da D5-bis.
- **Rilevamento vero dei segnaposto** delle cartelle sincronizzate (D1-bis):
  oggi è un riconoscimento per nome di cartella.
- **Barra di stato unificata e console generale dei log**: restano a #413, che
  ha l'elenco di cosa oggi scrive nel registro.
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
| **D4** | il tetto è una politica, non un pixel: si legge il descrittore e si prende la misura dichiarata più vicina, senza tentare niente alla cieca. Due livelli di scelta — opera e generale — non tre |
| **D5** | la verifica completa **confronta** l'impronta registrata, non la ricalcola e basta |
| **D6** | le miniature non si scaricano: si **ricavano** dalla pagina appena scaricata, a 300 px sul lato lungo |
| **D13** | «da rifare» significa fermo in attesa dell'utente, non rimesso in coda |
| **D14** | pausa e annullamento battono il nuovo tentativo: un errore incassato mentre l'utente premeva pausa faceva ripartire il lavoro da solo |
| **D17** | il tempo stimato viene dal ritmo vero del lavoro, non dalla pausa dichiarata dal profilo |
| **D18** | i valori di rete sono **profili** — un ritmo, non una biblioteca — e le biblioteche ne scelgono uno |
| **D22** | le revisioni non hanno stato: approvare e ritirare sono fatti che puntano a una revisione |

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
- **2026-08-17** — prove a mano su ogni PR: da lì la pausa che non riprova, il
  tempo stimato dal ritmo vero, la verifica che confronta l'impronta, la
  rimozione che porta via anche i file, i profili di rete al posto dei valori
  per biblioteca, e le quattro schede delle impostazioni riportate nell'idioma
  visivo dell'app.

## Da provare a mano, per chi rilegge

Scaricare un'opera e guardare il pannello: una riga sola, le due sezioni dei
dettagli, il tempo stimato che cala mentre va. Metterla in pausa mentre la
biblioteca dà errore: non deve ripartire da sola. Togliere l'opera: la sua
cartella nel deposito deve sparire.
