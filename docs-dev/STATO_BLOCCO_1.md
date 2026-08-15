# Stato del blocco 1 — fondamenta invisibili

Diario di avanzamento delle sette PR decise in `BLOCCO_1_DECISIONI.md`, Parte G.
Si aggiorna **a ogni PR unita**. Serve a due cose: riprendere il filo fra una
sessione e l'altra, e travasare le novità in `STATO_SESSIONE_2.0.md` quando si
torna sulla postazione fissa.

Ultimo aggiornamento: **2026-08-16**: #414-#420 unite in `blocco-1`, miniature
ricavate in locale, impostazioni di scaricamento e biblioteche, fondazione della
registrazione del lavoro svolto.

## Come è organizzato il lavoro

Le sette PR si uniscono nel branch di integrazione **`blocco-1`**, non in `main`.
Su `main` arriva un solo merge alla fine, che diventa la **1.5**.

Il motivo è il consolidamento dello schema: ogni PR aggiunge un file di
migrazione in coda; prima del merge finale le migrazioni del blocco si collassano
in un'unica baseline pulita e si butta il database di sviluppo. Vedi la nota
nell'appendice tecnica delle decisioni.

Eccezione: la **PR 5** (#213, risorse condivise) è dichiarata indipendente e va
dritta su `main`.

## Avanzamento

| PR | Cosa | Issue | Stato |
|---|---|---|---|
| 1 | Deposito dei file e disponibilità reale | #217 | **unita** in `blocco-1` (#414) |
| 2 | Orchestratore dei lavori, a vuoto | #218 (metà) | **unita** in `blocco-1` (#415) |
| 3 | Coda visibile: indicatore in barra e pannello Lavori | #218 (metà), #413 (parte) | **unita** in `blocco-1` (#417) |
| 3-bis | Impostazioni: deposito, limiti, ripresa automatica | #217, #218 (interfaccia) | **unita** in `blocco-1` (#418) |
| 4 | Scaricamento vero | #218 primo consumatore | **unita** in `blocco-1` (#419) |
| 4-bis | Catalogo Biblioteca, pulsante scarica, metadati | #217 (interfaccia) | **unita** in `blocco-1` (#420) |
| 5 | Risorse condivise e ambito | #213 | da fare, indipendente |
| 6 | Registrazione del lavoro svolto | #378 | **fondazione fatta**, restano gli eventi della pipeline |
| 7 | Backup, esportazioni e riservatezza | #345, #407 | da fare |

**Perché la 6 non va lasciata ultima**: ogni giorno senza registrazione è
materiale perso per sempre, in particolare la coppia proposta/approvata delle
traduzioni, che oggi viene sovrascritta a ogni correzione.

## Cosa esiste davvero, dopo le prime due PR

**Deposito** (`src-tauri/src/vault/`): struttura delle cartelle per provenienza,
impronte e validazione dei file in una lettura sola, verifica rapida e verifica
completa, "libera spazio", disponibilità calcolata dai file presenti, radice
configurabile con marcatore. Nessuno scaricamento: si popola a mano nei test.

**Lavori** (`src-tauri/src/jobs/`): coda unica con limiti per classe di risorsa,
pausa e annullamento cooperativi, tentativi con attese classificate per tipo di
errore, avanzamento al massimo una volta al secondo, recupero dei lavori
interrotti alla riapertura, eventi verso l'interfaccia. Gli unici tipi di lavoro
sono due finti, compilati solo nelle build di sviluppo.

**Coda visibile** (PR 3): indicatore nella zona destra della barra di stato, in
ogni sezione, scheda Lavori nel pannello in basso accanto ai messaggi, comandi per
pausa, ripresa, annullamento e nuovo tentativo, conferma alla chiusura con i
lavori attivi messi in pausa. Si prova con i tipi di lavoro finti delle build di
sviluppo.

**Impostazioni** (PR 3-bis): cartella del deposito scelta dal dialogo nativo
aperto dal backend, con rifiuto delle cartelle occupate e avviso per le cartelle
sincronizzate; scheda Lavori con i cinque limiti e la ripresa automatica.

## Decisioni prese implementando, già riportate nelle decisioni

- **Appendice** — lo schema prende la forma finale subito, ma ci si arriva con un
  file di migrazione per volta; il consolidamento in baseline si fa una volta
  sola prima del primo uso reale. Riscrivere una migrazione già applicata fa
  fallire l'avvio.
- **D3** — impronta FNV-1a a 64 bit, non crittografica: serve a rilevare
  corruzione accidentale, non manomissioni.
- **D16-bis** — validazione per firma e terminatore, senza decomprimere i pixel.
- **D13** — la ripresa automatica degli scaricamenti esiste come impostazione,
  spenta di default; e "da rifare" significa fermo in attesa dell'utente, non
  rimesso in coda, che con l'orchestratore in moto vorrebbe dire ripartire da
  solo.

## Aperti, da non perdere

- ~~Scelta cartella dal dialogo nativo del backend~~ — **chiusa nella PR 3-bis**:
  `choose_vault_folder` apre la finestra da Rust e il percorso non attraversa
  più la webview. `check_vault_folder` resta come comando di sola lettura.
- **Schermata al primo avvio** (D1): non fatta. Le due scelte — tieni tutto
  insieme / scegli dove — vivono per ora solo in Impostazioni. Va aggiunta
  quando esiste il primo avvio vero, cioè con lo scaricamento (PR 4).
- **Rilevamento vero dei segnaposto** delle cartelle sincronizzate (D1-bis): oggi
  è un riconoscimento per nome di cartella. Il contrassegno affidabile esiste
  solo su Windows e richiede una chiamata di sistema dedicata.
- **Notifiche di sistema** (D21): rinviate alla PR 4, quando esiste un lavoro
  vero da annunciare.
- ~~Documentazione pubblica e aiuto in-app~~ — **fatti**: guida
  `guides/storage-and-jobs` in italiano e inglese, con voce in barra laterale, e
  sezione «Archiviazione e lavori» nell'aiuto dentro l'app. È lì che vive la
  spiegazione lunga: i pannelli delle impostazioni restano asciutti.
- **Barra di stato unificata, salvataggio generalizzato, console di tutta
  l'app**: restano a #413, sono lavoro di guscio.
- **Livello bibliografico per gli stampati**: #404, fuori dal blocco.
- **Artefatti grafici su WSL2**: rettangoli chiari al movimento del mouse,
  risolti avviando con `WEBKIT_DISABLE_COMPOSITING_MODE=1`. Non messo di
  default: potrebbe essere specifico del portatile. Da riprovare sulla
  postazione fissa prima di decidere. Dettagli in `ARCHITECTURE.md`, refactor
  pendenti.
- **Codice di retrocompatibilità pre-2.0** (`db.rs`,
  `backfill_legacy_columns` e le tre colonne di `LEGACY_COLUMN_BACKFILLS`):
  serve solo a database rimasti a una forma antecedente alla baseline 2.0.
  Glossa non ha utenti, quindi quei database esistono soltanto sulle macchine di
  sviluppo. Va tolto **insieme al consolidamento delle migrazioni**, nello stesso
  momento in cui si butta il database di sviluppo: toglierlo prima non
  guadagnerebbe niente e rischierebbe di bloccare l'avvio qui.
- **Scrollbar su Linux**: il rimedio attuale funziona ma il risultato non
  piace. Da rivedere con una soluzione vera, fuori dal blocco 1.

## Rilettura esterna del 2026-08-14, e cosa ne è uscito

Le quattro PR aperte sono state riviste dall'esterno, leggendo il codice invece
del corpo delle PR. Le correzioni sono tutte sul ramo della **#420**, che
contiene le altre tre.

**Difetti veri, corretti**

- Il pulsante *scarica* passava `external_ref` come chiave della biblioteca. È
  «chiave **e** identificativo» (`archive_org:idxyz`), e come nome di cartella
  viene rifiutato: ogni fonte aggiunta dalla ricerca falliva subito. Ora la
  chiave arriva dai metadati della fonte, dove era già salvata.
- Il punto salvato contava il **numero dell'ultima carta** ma veniva usato come
  **quante ne sono fatte**: con un canvas non scaricabile nel manifesto, la
  ripresa saltava carte che non sarebbero tornate mai più.
- Rilanciare un lavoro finito conservava il punto salvato: dopo aver liberato
  spazio, il rilancio finiva in un istante dichiarando completa una fonte senza
  più un file. Ora un lavoro terminale riparte da capo, e le carte ancora sul
  disco si saltano una per una.
- Cinque comandi del deposito ricevevano ancora la radice **dal frontend**, e uno
  di quelli cancella ricorsivamente. Adesso la legge il backend: dopo #405, la
  #414 e la #418, davvero nessun comando accetta un percorso dall'interfaccia.
- La cartella di transito si costruiva con un identificativo non validato, e la
  si scartava solo a lavoro riuscito.
- «In attesa per i limiti della biblioteca» non lo scriveva nessuno: la coda
  restava «in corso» con l'icona che girava per tutto un raffreddamento (D17).
- Tentativi e attesa esponenziale venivano da costanti del motore, non dal
  profilo; la pausa fra richieste veniva risorteggiata a ogni controllo, e usciva
  in media più corta di quella dichiarata.
- Una carta sul disco senza la sua riga (chiusura brusca fra promozione e
  scrittura) veniva saltata per sempre.
- In Biblioteca: le carte si contavano per riga e non per numero di carta, il
  catalogo non si rileggeva a scaricamento finito, un lavoro fallito lasciava la
  percentuale ferma togliendo il modo di riprovare, e una fonte completa
  continuava a offrire *scarica*. Ora una fonte tutta sul computer mostra il
  segno che è a posto, e basta.
- In coda i lavori si chiamavano «Scaricamento fonte»: il nome dell'opera si
  scrive alla messa in coda, e diventa `titolo · 34/210 · 46 MB` mentre gira.

**Pulizie**: campi di `useStatusBarData` che nessuno leggeva (ricalcolavano le
parole di ogni frammento a ogni render), doppio elenco delle fonti in
`sourceLibraryStore`, doppione di scansione in `integrity.rs`, ramo morto sul
429, `expect()` sui percorsi di produzione.

**Non corretto, e perché**: la barra di stato non compare finché non c'è un
workspace attivo. Succede solo al primissimo avvio, dove non esiste ancora nulla
in coda, quindi l'indicatore non ha niente da nascondere.

## Prova sul campo del 2026-08-15, e cosa ne è uscito

Provando lo scaricamento su archive.org sono emerse due cose.

**La misura chiesta al servizio.** Chiedevamo `/full/2000,/`, cioè «larghezza
esattamente 2000». Misurato con richieste vere: archive.org risponde `500` su
pagine che poco prima aveva servito, e `400` quando 2000 supera la larghezza
dell'originale — mentre serve senza problemi `/full/1299,/`, che è una delle
misure che dichiara nel proprio descrittore. La specifica Image API garantisce
le misure elencate in `sizes` a qualunque livello di conformità; la larghezza
arbitraria solo dal livello 1 in su, e il livello dichiarato non è affidabile.
Ora il tetto si prova così com'è, e solo se il servizio rifiuta si legge il suo
descrittore e si sceglie la misura più vicina al tetto, ricordandola per tutte
le carte con le stesse dimensioni. Regola aggiornata in D4.

**I log dei lavori.** La coda scriveva sei righe in tutto, in forma libera.
Adesso ogni evento ha una riga sola con la stessa forma — `job <evento> id=…` —
e i livelli separano ciò che serve nell'applicazione compilata (ciclo di vita e
problemi) da ciò che serve mentre si sviluppa (dettaglio a carta, attese di
cortesia). Vocabolario e livelli sono documentati in testa a `jobs/engine.rs` e
nella scheda di `ARCHITECTURE.md`.

Insieme sono stati sistemati altri tre rilievi della stessa prova:

- «riprende fra 11 minuti» mostrava la stima dello scaricamento al posto
  dell'attesa prima del tentativo. Ora il motore scrive nel campo della stima i
  secondi che mancano, e il pannello li conta dall'orario del prossimo
  tentativo, così il numero cala mentre la riga resta ferma sullo schermo;
- la barra di avanzamento spariva sotto l'1%: ha una larghezza minima;
- il messaggio d'errore era l'indirizzo IIIF completo, tre righe di parametri.
  Adesso dice cosa è successo — «misura non disponibile per questa carta (400)»,
  «la biblioteca ha chiesto di rallentare (403)» — e l'indirizzo va nel registro;
- la sezione «terminati oggi» si svuotava a ogni riavvio: l'elenco iniziale
  chiedeva solo i lavori non finiti, e nessun evento riportava indietro gli
  altri. Adesso comprende anche i terminati nelle ultime 24 ore, la stessa
  finestra che il pannello mostra.

**Lavori più parlanti** *(chiesto dall'utente il 2026-08-15)*: la riga del
pannello dice cosa sta facendo il lavoro adesso — avvio, lettura del manifesto,
scelta della risoluzione, scaricamento — e non un generico «in corso». La fase è
una chiave breve che scrive il gestore e traduce l'interfaccia, quindi ogni tipo
di lavoro avrà il suo vocabolario; quelle che l'interfaccia non conosce ancora si
leggono com'è scritta la chiave invece di sparire.

**Piano delle decisioni scoperte**: `PIANO_DECISIONI_SCOPERTE.md` raccoglie le
otto voci che nessuna PR ha implementato né dichiarato, con come si fanno e in
quale ordine.

**Quattro decisioni scoperte, implementate il 2026-08-15**: le miniature si
scaricano all'aggiunta della fonte (D6) come lavoro a priorità bassa che
condivide i contatori di cortesia con lo scaricamento; in Biblioteca ogni riga ha
ora quattro comandi sempre visibili — scarica, verifica, libera spazio, togli —
che si disattivano quando non si possono usare; la verifica di una fonte
confronta quello che il database dichiara con quello che c'è sul disco e propone
di riscaricare le mancanti (D5); la verifica del deposito è un lavoro avviabile
da Impostazioni, rapida o completa, con il conteggio degli orfani (D5-bis), e
l'impostazione «verifica all'avvio» finalmente ha un lettore.

Restano scoperte la 5 (divieto dell'istituzione, D9) e la 7 (primo avvio e
controllo dello spazio, D1): vedi `PIANO_DECISIONI_SCOPERTE.md`.

**Rilettura del 2026-08-15 sul codice appena scritto**, mia e di Copilot. Sei
correzioni: la cartella di transito era una sola per carte e miniature, quindi
chi finiva per primo poteva portare via il file che l'altro aveva appena scritto;
la chiave della biblioteca per scaricare e per liberare spazio veniva dai
metadati invece che da dove i file stanno davvero, e sulle fonti aggiunte prima
che la provenienza venisse salvata avrebbe riscaricato tutto in una cartella
nuova o cancellato le righe lasciando i file; i lavori **falliti** restavano
nell'elenco per sempre, e l'indicatore in barra continuava a segnalarli a
distanza di giorni; il catalogo faceva due letture della tabella degli asset per
ogni fonte; l'elenco locale dei lavori si svuotava anche quando la cancellazione
falliva; l'interruttore della verifica all'avvio restava acceso anche se
l'impostazione non veniva scritta.

**Righe dei lavori parlanti** *(chiesto dall'utente il 2026-08-15)*: il tipo di
lavoro si legge in un contrassegno — pagine, miniature, verifica — e i numeri
distinguono quanto è arrivato da quanto si prevede in tutto, perché il peso della
carta in corso da solo è fuorviante. La riga si apre con un'animazione e mostra i
dettagli veri: risoluzione negoziata, biblioteca, host, tentativi, orari. Il dato
sta in una colonna nuova, `jobs.detail`, in JSON: le chiavi le decide il tipo di
lavoro, così i gestori futuri ne aggiungono senza toccare l'interfaccia.

**Miniature spostate allo scaricamento** *(D6 corretta il 2026-08-15)*: partivano
all'aggiunta della fonte, e su un libro di 924 carte erano 18 MB e un quarto
d'ora di rete per qualcosa che serve solo offline. Ora vanno con il libro, come
lavoro separato a priorità più bassa. La misura si sceglie a tre livelli: la
miniatura dichiarata dal canvas se c'è, altrimenti la misura dichiarata dal
descrittore letto una volta per gruppo. Chiedere 256 px alla cieca faceva
generare l'immagine sul momento — misurato su archive.org: 23 secondi contro 1.

**Aperto da qui**: #421 (profili di rete gestibili dalle impostazioni) e #422
(tetto di risoluzione configurabile: globale, per biblioteca, per fonte).
**Entrambe fatte il 2026-08-16**: vedi più sotto.

## Miniature in locale, 2026-08-16

Le miniature **non si scaricano più**: si ricavano dalla carta appena scaricata,
sul computer. Ogni libro costava due richieste per carta — 1848 su un libro di
924 — a servizi che rispondono in modo irregolare: la stessa richiesta ad
archive.org, misurata, va da 1 a 19 secondi. Ricavarla in locale costa qualche
decina di millisecondi e nessuna richiesta.

Cosa è cambiato:

- una libreria nuova per le immagini, `image`, **puro Rust** e con i soli formati
  che servono (`jpeg`, `png`): nessuna dipendenza di sistema, quindi le build per
  i tre sistemi restano come sono. Vive in `src-tauri/src/images.rs`, funzioni
  pure, provabili senza rete;
- il lato lungo è una scelta vera: predefinito **300 px**, ammessi 100-800,
  letto da `app_settings.thumbnail_long_edge` alla messa in coda. La schermata
  che lo cambia arriva con la politica di scaricamento (#422);
- decodifica e ricodifica girano in `spawn_blocking`: sono lavoro del
  processore, e nel filo del runtime terrebbero ferma tutta la coda;
- il tipo di lavoro `source_thumbnails` **non esiste più** — variante del
  gestore, messa in coda, traduzioni e prove comprese. Il pannello torna a una
  riga per libro;
- l'area di transito torna **una per digitalizzazione**: la divisione per
  variante serviva a due lavori che giravano insieme, e i due lavori non ci sono
  più. Carta e miniatura ci passano con nomi diversi;
- se la miniatura non riesce, il libro non fallisce: si scrive nel registro e si
  va avanti. Una carta già sul disco a cui manca la miniatura la fa ricavare
  rileggendo il file, una volta sola.

D6 aggiornata: diceva «si scaricano», adesso dice come si ricavano. Cade con lei
il primo dei tre livelli di D4 — «l'indirizzo che il manifesto dichiara già
pronto» — che valeva per le sole miniature.

## Impostazioni di scaricamento e biblioteche, 2026-08-16

Due schermate nuove in Impostazioni, e le due issue aperte dal piano si
chiudono.

**Scaricamento** (#422): il tetto di risoluzione — 1000, 1500, 2000, 3000 o «la
più grande disponibile» — e il lato lungo delle miniature. Il tetto si può dire
a tre livelli e vince il più vicino all'opera: **fonte → biblioteca → globale**,
come prescrive D4. La scelta per la singola opera sta sulla sua scheda in
Biblioteca, che è dove la decisione la vuole; quella per biblioteca sta insieme
agli altri valori di quella biblioteca.

**Biblioteche** (#421): l'elenco del registro, ognuna apribile sui propri
tredici valori — pause, raffica, richieste insieme, tentativi, attese,
raffreddamenti, timeout, preriscaldamento del visualizzatore — con il comando
che la riporta ai valori compilati nell'applicazione, disattivato per chi non è
mai stato toccato. Si può aggiungere una voce per un **host fuori dal registro**,
che è il caso delle fonti aggiunte per indirizzo diretto (D18): parte dal
profilo prudente, letto dal backend perché tenerlo anche nell'interfaccia
vorrebbe dire due elenchi destinati a divergere.

Due cose che valgono più della schermata:

- **il tetto sulle richieste insieme adesso vale nel backend** (D11). Prima
  viveva solo nel menu, che è un aiuto e non una difesa: un profilo scritto a
  mano nel database scavalcava tutto. Adesso ogni profilo viene riportato dentro
  i limiti nel punto in cui si usa;
- **il profilo si rilegge all'avvio del lavoro**, non alla messa in coda: un
  lavoro ripreso dopo giorni deve rispettare i limiti di adesso.

Migrazione `0007`: colonna `source_versions.size_cap` e tabella
`library_settings` — una riga per biblioteca, e **solo** per chi è stato
cambiato. Chi non compare si comporta come dichiara il registro, e togliere la
riga è il modo di tornare ai valori di fabbrica.

## Registrazione del lavoro svolto, 2026-08-16 (PR 6, prima parte)

La fondazione di #378. **Va fatta presto e non ultima**: ogni giorno senza
registrazione produce dati che non esisteranno mai, e la coppia
proposta/approvata delle traduzioni oggi veniva sovrascritta a ogni correzione.

**Lo storico delle traduzioni** (D22), che finora esisteva solo per le
trascrizioni. Non una revisione per salvataggio — sarebbero centinaia di righe
per battitura — ma i due soli momenti che contano: quando la pipeline propone e
quando l'utente approva la propria versione. Le revisioni **non hanno uno stato
di approvazione**: approvare e ritirare sono fatti che puntano a una revisione,
e la traduzione porta un puntatore a quella in vigore adesso. Una revisione
ritirata resta e vale: «approvata e poi superata» dice qualcosa che «approvata»
da sola non dice. L'approvazione si registra **anche quando l'utente non cambia
niente**, perché accettare è un giudizio.

**Il registro dei fatti** (D23-D28): `provenance_events` prende le colonne che
l'area Analisi raggrupperà — esito, durata, provider, modello, versione del
prompt, token, token da cache, costo, coppia linguistica, tipo di errore,
impronte di ingresso e uscita — e resta in JSON solo il resto. Il costo sta qui
e non in una tabella dedicata: è un attributo del fatto. `derived_metrics` è
nuova e separata perché un fatto non si invalida mai e una metrica sì.

**L'identità di un fatto è derivata** (D27): riscriverlo sostituisce invece di
duplicare, e il numero del tentativo non entra nella chiave — se ci entrasse
produrrebbe esattamente la duplicazione che la regola vuole impedire. Backend e
interfaccia usano la **stessa formula e la stessa impronta**: scrivono nella
stessa tabella.

**Chi registra**: il ciclo di vita dei lavori lo scrive il motore da sé (D29),
non chi scrive un gestore — avvio ed esito, con la durata. Le decisioni umane
sulle traduzioni le scrive l'interfaccia, dove accadono.

Migrazione `0008`. Una registrazione che fallisce non ferma niente: si dice nel
log tecnico e si va avanti.

**Cosa resta della PR 6**, dichiarato e non fatto:

- gli eventi delle **chiamate ai modelli** — provider, modello, token, costo,
  durata per ogni stadio della pipeline. Le colonne ci sono e sono vuote finché
  i percorsi della pipeline non le scrivono;
- `transcription_revisions` ha ancora la colonna `status` con
  `draft/approved/rejected`, che D22 vuole allineata al modello a eventi;
- `derived_metrics` non ha ancora chi la riempie: arriva con l'area Analisi
  (#379);
- backup ed esportazione non portano ancora con sé revisioni e fatti: è lavoro
  della PR 7, che rifà il backup.

## Prossima sessione: da dove riprendere

Quattro PR impilate, tutte verdi. La **#420 contiene le altre tre**, e le
correzioni della rilettura stanno lì: si unisce quella in `blocco-1`, e #417,
#418 e #419 si chiudono come incluse.

Prima di unire serve una prova a mano sulla rete vera: è l'unica cosa che i test
non possono dire.

**Poi**: notifiche di sistema (D21), schermata di primo avvio, e la PR 6 (registrazione del lavoro svolto), che il
documento chiede di non lasciare ultima.

~~Da aprire come issue: la cartella dati usa ancora la finestra aperta dal
frontend~~ — **chiusa nella PR 3-bis**: anche la cartella dati passa dal dialogo
nativo aperto dal backend. ~~Dopo #405, il deposito e la cartella dati, in Glossa
nessun comando accetta più un percorso dal frontend.~~ — vero **solo dopo la
rilettura**: cinque comandi del deposito ricevevano ancora la radice come
parametro. Adesso la legge il backend.

## Da provare a mano, per chi rilegge

Fino alla PR 3 non c'è niente da cliccare: l'unica prova utile è **aprire l'app e
verificare che parta**, perché a ogni PR si applica una modifica al database.
Dalla PR 3 in poi si prova la coda vera e propria.
