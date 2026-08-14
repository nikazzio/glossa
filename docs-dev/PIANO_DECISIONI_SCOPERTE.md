# Piano — le sette decisioni rimaste scoperte

Scritto il 2026-08-15, dopo la rilettura esterna del blocco 1.

Queste voci — sette dalla rilettura, più una emersa provando — sono decisioni approvate in `BLOCCO_1_DECISIONI.md` che
**nessuna PR ha implementato e nessuna PR ha dichiarato come rinviate**. Non
sono predisposizioni per il futuro: sono buchi. Le altre — cestino, spostamento
del deposito, profili di rete, tetto configurabile — hanno una issue o una PR
che se ne fa carico e restano fuori da qui.

Ogni voce dice cosa prescrive la decisione, cosa esiste oggi nel codice, cosa
manca e come si fa. I riferimenti al codice sono stati verificati il 2026-08-15.

**Ordine consigliato**: 1, 2, 3, 5, 8, 4, 7, 6. Le prime tre sono piccole e
sbloccano cose già scritte; la 5 è quella che riguarda il rapporto con le
biblioteche; la 4 introduce il secondo tipo di lavoro; la 6 dipende da una
schermata che non esiste.

---

## 1. Miniature all'aggiunta della fonte (D6)

**La decisione**: «Aggiungendo una fonte si scaricano **tutte le miniature**.
Duecento miniature sono circa 3 MB: trascurabili, e rendono il libro sfogliabile
anche senza rete e senza pagine scaricate. Le miniature non vengono rimosse da
"libera spazio".»

**Oggi**: `vault/layout.rs` sa dove vanno (`thumbnails/0001.jpg`) e
`expected_version_paths` le pretende — lo dice anche il corpo della #414: «le
miniature si scaricano all'aggiunta, quindi la loro assenza è un disallineamento
come gli altri». **Nessuno le scarica.** Conseguenza: la verifica del deposito,
appena avrà un'interfaccia, dichiarerà ogni fonte disallineata.

**Cosa fare**

- nuovo tipo di lavoro `source_thumbnails`, registrato accanto a
  `source_download` in `jobs/commands.rs`. Classe di risorsa: rete. Ripresa:
  riprendibile, stesso checkpoint per conteggio dello scaricamento;
- il gestore riusa quello che c'è: `manifest.rs` per l'elenco delle carte,
  `size.rs` per la misura — per le miniature il tetto è basso e fisso (256 px
  sul lato lungo), quindi `first_attempt` va chiamato con quel tetto;
- promozione in `thumbnails/` invece che in `pages/<misura>/`, con la stessa
  area di transito e la stessa validazione (D16-bis);
- riga `assets` con `kind = 'thumbnail'`, così il conteggio della disponibilità
  in Biblioteca — che filtra `kind = 'image'` — non cambia;
- messa in coda **dentro `addSourceToLibrary`**, subito dopo l'inserimento
  della fonte: è l'unico punto dove «si aggiunge una fonte» ha un significato.
  Priorità bassa (5), così un manoscritto in scaricamento non viene rallentato;
- fase dichiarata: `thumbnails`, con la sua voce in `jobs.phase.*`.

**Test**: che il lavoro nasca alla prima aggiunta e non alla seconda della stessa
fonte; che le miniature non finiscano nel conteggio delle carte; che «libera
spazio» non le tolga (già vero: cancella solo `pages/`).

**Documenti**: scheda del modulo in `ARCHITECTURE.md`, guida pubblica
(«aggiungendo una fonte Glossa scarica le miniature, circa 3 MB»), aiuto in-app.

**Dimensione**: media. È il primo lavoro nuovo dopo lo scaricamento, quindi
verifica anche che registrare un secondo tipo sia davvero indolore.

---

## 2. «Libera spazio» nell'interfaccia (D6)

**La decisione**: «**Libera spazio** — sulla fonte. Cancella le pagine scaricate
subito e per davvero, senza passare dal cestino. Restano scheda, miniature,
trascrizione, traduzione e note. Conferma esplicita con la dimensione: *"3,2 GB.
Le pagine si riscaricano dalla biblioteca quando ti servono."* È l'azione
frequente.»

**Oggi**: il comando `free_version_pages` esiste, cancella `pages/` e restituisce
file e byte liberati; `vaultService.freeVersionPages` lo espone. **Nessuna
schermata lo chiama.**

**Cosa fare**

- comando icona nella riga della Biblioteca, accanto a scarica e rimuovi, visibile
  solo quando ci sono carte sul computer (`localPages > 0`);
- la conferma deve dire **quanto** si libera: serve la dimensione prima di
  cancellare. Due strade: sommare `byte_size` delle righe `assets` della
  digitalizzazione (nessuna richiesta al disco, dato già nostro) oppure aggiungere
  al comando una modalità «quanto occupa». La prima basta;
- dopo la cancellazione: rileggere il catalogo — la riga torna a «solo online» —
  e cancellare le righe `assets` delle carte, altrimenti il conteggio continua a
  dire che ci sono;
- i file `assets` da togliere sono quelli con `kind = 'image'` della
  digitalizzazione: le miniature restano.

**Attenzione**: oggi `free_version_pages` cancella i file e **non** tocca il
database. Se lo si chiama così com'è, la Biblioteca continuerà a dichiarare le
carte presenti. La cancellazione delle righe va fatta nella stessa operazione.

**Test**: che le righe spariscano insieme ai file; che le miniature e il manifesto
restino; che la conferma riporti la dimensione vera.

**Dimensione**: piccola, se non fosse per la parte del database, che va fatta con
attenzione.

---

## 3. Verifica di una fonte, dall'interfaccia (D5)

**La decisione**: due livelli. «**Rapido — presenza.** Elenca i file e li
confronta con il database. Millisecondi anche per un manoscritto grande.
Risponde: *"210 attese, 198 presenti, 12 mancanti"*. **Completo — integrità.**
Ricalcola l'impronta di ogni file. […] Il pulsante sulla fonte esegue il rapido.
Il completo è una seconda voce, esplicita.» E: «Nessun riscaricamento automatico,
mai. La verifica constata e propone: *"mancano 12 pagine — scaricale"*.»

**Oggi**: `verify_files_present`, `verify_files_integrity` ed
`expected_version_paths` esistono, sono provati e non li chiama nessuno.

**Cosa fare**

- comando icona sulla riga della Biblioteca: costruisce l'elenco dei percorsi
  attesi con `expectedVersionPaths` e chiama `verifyFilesPresent`;
- il risultato va mostrato come conteggio — attese, presenti, mancanti — e come
  **proposta**: un comando «scarica le mancanti» che mette in coda lo scaricamento
  normale. Che poi salta da sé le carte già presenti, quindi non serve un lavoro
  diverso;
- la verifica completa come seconda voce, con l'avvertenza di D5 quando il
  deposito sta in una cartella sincronizzata;
- radice non raggiungibile: il comando risponde `vault_unreachable` e
  l'interfaccia deve dire «deposito non raggiungibile», non «file mancanti» — la
  distinzione è di D1 ed è già rispettata dal backend.

**Dipendenza**: le miniature (voce 1). Finché nessuno le scarica, la verifica dirà
sempre che mancano. Se si fa questa prima della 1, va escluso `thumbnails` dai
percorsi attesi, con un commento che dice perché.

**Test**: conteggio giusto con file mancanti; riga malformata che non ferma le
altre (già coperto nel backend); radice assente distinta da file assenti.

**Dimensione**: media, quasi tutta interfaccia.

---

## 4. Verifica completa del deposito (D5-bis) e controllo all'avvio (D5)

**Le decisioni**: D5-bis vuole «un lavoro globale avviabile a mano da
Impostazioni → Archiviazione», con resoconto in quattro categorie — integri,
mancanti, corrotti, **orfani** — e la proposta «elimina file orfani, liberi
3,2 GB». D5 vuole il controllo rapido all'avvio come «opzione, spenta di
default». Il corpo della #414 aveva rinviato il primo alla PR 2 e il secondo alla
PR 3: entrambe sono state fatte senza.

**Oggi**: `verify_vault_on_startup` esiste nel database con valore `0` e non ha
lettori. Nessun lavoro di verifica esiste.

**Cosa fare**

- tipo di lavoro `vault_verification`, classe di risorsa **processore** — è il
  primo lavoro pesante per la CPU e non per la rete, ed è esattamente il motivo
  per cui D5-bis lo vuole: prova che i limiti separati di D11 funzionano;
- scorre le digitalizzazioni, per ognuna costruisce i percorsi attesi e chiama la
  scansione già scritta in `vault/integrity.rs`;
- **gli orfani** sono la parte nuova: si cammina il deposito e si tolgono i
  percorsi conosciuti dal database. Serve una funzione nuova in `vault/`, che
  elenca i file presenti sotto `providers/`;
- il resoconto va salvato: la tabella `artifacts` esiste ed è pensata per gli
  output dei lavori. In alternativa, il messaggio del lavoro con i quattro
  numeri, e il dettaglio a schermo solo mentre la finestra è aperta;
- pausa e ripresa gratis, perché è un lavoro;
- il controllo all'avvio legge l'impostazione e mette in coda la sola verifica
  rapida, senza impronte;
- interruttore in Impostazioni → Archiviazione, con l'avvertenza sui depositi
  sincronizzati.

**Test**: che gli orfani vengano contati e non cancellati da soli; che il lavoro
si metta in pausa a metà; che l'impostazione spenta non metta in coda niente.

**Dimensione**: grande — è la voce più corposa delle sette.

---

## 5. Divieto dell'istituzione (D9)

**La decisione**: la colonna `download_allowed` esiste per rispettare le
condizioni d'uso di una biblioteca che non consente lo scaricamento; il corpo
della #414 diceva «il divieto vive nello scaricamento, PR 4».

**Oggi**: `source_versions.download_allowed` esiste (`INTEGER NOT NULL DEFAULT 1`,
migrazione `0003`). **Nessuno la legge.** Si scarica anche da una fonte marcata
come non scaricabile.

**Cosa fare**

- `enqueue_source_download` la legge insieme a `version_id` — è già lì che apre
  la connessione — e rifiuta con un errore parlante prima di creare il lavoro;
- il gestore la ricontrolla all'avvio: fra la messa in coda e l'esecuzione può
  passare tempo, e un lavoro ripreso dopo giorni non deve scavalcare un divieto
  nel frattempo registrato;
- in Biblioteca il comando di scaricamento è disattivato con la spiegazione al
  passaggio del mouse;
- chi scrive quel valore è un'altra questione: oggi nessuno. Va messo almeno un
  modo di impostarlo a mano sulla fonte, altrimenti resta una difesa teorica.

**Test**: fonte con divieto → nessun lavoro creato; divieto messo dopo la messa in
coda → il lavoro si ferma con un errore non ritentabile.

**Dimensione**: piccola, e vale più di quanto costa.

---

## 6. Modalità di lettura e indicatore di provenienza (D8, D8-bis)

**Le decisioni**: D8 stabilisce tre modalità — automatica, solo locale, solo
remota — e D8-bis vuole che si sappia sempre cosa si sta guardando: «l'indicatore
dice se la carta arriva dal computer o dalla biblioteca», e i collegamenti
all'originale si conservano sempre.

**Oggi**: l'impostazione `source_read_mode` esiste con valore `auto` e non ha
lettori; `homepage_url` viene scritto dal manifesto e non è mostrato da nessuna
parte. Soprattutto: **non esiste nessuna schermata che mostri una carta**.
Verificato: niente nel frontend legge `vault_path` o costruisce un indirizzo di
file locale.

**Cosa fare**

Questa non si può implementare adesso, e non per mancanza di tempo: l'indicatore
deve stare accanto all'immagine, e l'immagine non c'è. Il visualizzatore è la
issue **#221** (image workbench con viewer e source switching), sotto l'epic
#208.

Quello che si può fare ora, e che ha senso fare:

- **portare la decisione dove verrà implementata**: commentare la #221 con D8,
  D8-bis e D9, così chi la prende in mano non riscopre le regole da zero;
- esporre il collegamento all'originale nella scheda della fonte in Biblioteca,
  che è un posto che esiste già: è il minimo che D8-bis chiede («i collegamenti
  all'originale si conservano sempre») e oggi il dato è salvato e invisibile.

**Dimensione**: piccola adesso, il resto va con #221.

---

## 7. Primo avvio e controllo dello spazio (D1)

**La decisione**: al primo avvio, dentro l'applicazione, una schermata con due
scelte — «tieni tutto insieme» e «scegli dove tenere immagini e documenti». E,
scegliendo una cartella, cinque controlli in quest'ordine: si può scrivere; **c'è
spazio per quello che c'è già**; cosa contiene; sincronizzazione in streaming;
migrazione.

**Oggi**: le due scelte esistono in Impostazioni → Archiviazione, con
classificazione della cartella, prova di scrittura vera e avviso sulle cartelle
sincronizzate. Mancano la schermata al primo avvio — rinviata prima alla PR 3,
poi alla PR 4, e mai fatta — e **il controllo dello spazio**, che non è mai stato
nominato da nessuna PR.

**Cosa fare**

Sono due lavori indipendenti, e il secondo è molto più piccolo:

- **controllo dello spazio**: prima di adottare una cartella si confronta lo
  spazio libero del volume con quanto occupa il deposito attuale. Serve una
  dipendenza nuova o una chiamata di sistema per lo spazio libero; se il margine
  non basta si avvisa e si lascia decidere, senza vietare;
- **schermata al primo avvio**: si mostra quando non esiste ancora un deposito
  adottato e nessuna cartella è stata scelta. Due scelte, la predefinita già
  selezionata, e una riga che spiega che si può cambiare dopo. Va decisa una
  cosa sola: se mostrarla prima o dopo la creazione del primo workspace, che è
  l'altro passaggio obbligato del primo avvio.

**Test**: cartella su un volume pieno → avviso e non blocco; primo avvio simulato
con impostazione assente → schermata; secondo avvio → niente.

**Dimensione**: piccola il controllo, media la schermata.

---

## 8. I lavori vecchi che restano nel database (emersa il 2026-08-15)

**Il problema**: un lavoro finito resta nella tabella per sempre. Il pannello ne
mostra i terminati delle ultime 24 ore — è la finestra di D20, «terminati oggi» —
quindi dopo un giorno quelle righe diventano invisibili ma continuano a esistere.
Oggi nel database di prova ce ne sono undici, fra lavori finti e scaricamenti, e
nessuna schermata li nomina.

**Cosa dice il documento**: D28 riguarda il registro del lavoro svolto, non i
lavori, e distingue due regimi: il registro storico non si cancella mai da solo,
mentre il log tecnico «si può scartare per età o dimensione»; la cancellazione
vera avviene «su richiesta esplicita dell'utente». La coda è runtime, quindi sta
dalla parte del log tecnico — ma il principio della richiesta esplicita resta il
più prudente, perché un lavoro fallito è la traccia di qualcosa che non ha
funzionato e buttarlo di nascosto è il modo di non accorgersene.

**Proposta**

- comando nuovo `list_job_history(limit)`: i terminali dal più recente, con un
  tetto (200) per non caricare tutto;
- nel pannello, sotto «terminati oggi», una riga che compare **solo** se nel
  database c'è dell'altro: «83 lavori più vecchi — mostra». Aprendola si vede
  l'elenco, con la data e l'esito;
- da lì il comando che già esiste, `clear_finished_jobs`, senza identificativo:
  li toglie tutti. Sulla singola riga resta il cestino che c'è già;
- **nessuna cancellazione automatica**, coerente con D28. In alternativa, se
  preferisci, una conservazione a tempo — trenta giorni — con l'avvertenza che
  toglie anche i falliti. È una decisione tua: la prima non perde niente e
  richiede un clic ogni tanto, la seconda non richiede niente e perde le tracce
  vecchie.

**Test**: che la riga compaia solo quando c'è dello storico; che il tetto valga;
che svuotare non tocchi i lavori ancora in corso (già coperto nel backend).

**Dimensione**: piccola.

## Riepilogo

| # | Voce | Decisione | Dimensione | Dipendenze |
|---|---|---|---|---|
| 1 | Miniature all'aggiunta | D6 | media | — |
| 2 | «Libera spazio» in interfaccia | D6 | piccola | — |
| 3 | Verifica di una fonte | D5 | media | la 1, altrimenti dirà sempre che mancano le miniature |
| 4 | Verifica completa e controllo all'avvio | D5-bis, D5 | grande | la 3 per l'interfaccia del resoconto |
| 5 | Divieto dell'istituzione | D9 | piccola | — |
| 6 | Modalità di lettura e provenienza | D8, D8-bis | piccola ora | il resto va con #221 |
| 7 | Primo avvio e spazio disponibile | D1 | piccola + media | — |
| 8 | Lavori vecchi visibili invece che invisibili | D20, D28 | piccola | — |

Il resto delle decisioni scoperte ha già un posto dove vivere: **#421** (profili
di rete modificabili), **#422** (tetto di risoluzione configurabile, e con esso
lo scaricamento della singola carta a richiesta di D4), PR 6 (cestino), PR 7
(spostamento del deposito).
