# Piano — le decisioni rimaste scoperte

Scritto il 2026-08-15, dopo la rilettura esterna del blocco 1. **Rivisto lo
stesso giorno** confrontando ogni voce con tutte le 219 issue del repository, non
solo con i documenti: due delle otto avevano già una casa e sono uscite
dall'elenco.

Restano le decisioni approvate in `BLOCCO_1_DECISIONI.md` che **nessuna PR ha
implementato, nessuna PR ha dichiarato come rinviate e nessuna issue ha in
carico**. Le altre — cestino, spostamento del deposito, profili di rete (#421),
tetto configurabile (#422) — hanno già dove vivere.

Ogni voce dice cosa prescrive la decisione, cosa esiste oggi nel codice, cosa
manca e come si fa. I riferimenti al codice e alle issue sono stati verificati il
2026-08-15.

**Stato al 2026-08-15**: fatte la 1, la 2, la 3 e la 4. Restano la **5** e la
**7**, che l'utente ha scelto di vedere una per una.

**Ordine consigliato**: 1, 2, 3, 5, 4, 7. Le prime due sono piccole e sbloccano
comandi già scritti; la 5 riguarda il rapporto con le biblioteche; la 4 introduce
il secondo tipo di lavoro.

## Cosa è uscito da questo elenco, e dove è andato

| Voce | Dove sta | Perché |
|---|---|---|
| Modalità di lettura e indicatore di provenienza (D8, D8-bis) | **#217** e **#221** | #217 ha nello scope «policy `read source mode` e source switching»; #221 è il viewer, dove l'indicatore deve stare. Senza una schermata che mostri una carta non c'è posto per l'indicatore |
| Lavori vecchi che restano invisibili (D20, D28) | **#413** | il suo modello prevede «pannello completo con **storico** e controlli»: lo storico dei lavori è parte di quella issue |

Per queste due resta una cosa sola da fare adesso: **commentare le issue con le
decisioni**, così chi le prende in mano trova le regole invece di riscoprirle —
D8, D8-bis e D9 sulla #221; D28 e la finestra delle 24 ore sulla #413.

Due voci restano qui pur avendo un'epic che le nomina: l'epic **#183** ha nello
scope i derivati («thumbnails, hover preview») e le «politiche di cleanup e
retention», ma le sue uniche sub-issue sono #217 e #218, che non le eseguono.

---

## 1. Miniature all'aggiunta della fonte (D6) — FATTA il 2026-08-15

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

## 2. «Libera spazio» nell'interfaccia (D6) — FATTA il 2026-08-15

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

## 3. Verifica di una fonte, dall'interfaccia (D5) — FATTA il 2026-08-15

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

## 4. Verifica completa del deposito (D5-bis) e controllo all'avvio (D5) — FATTA il 2026-08-15

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

## 6. — spostata

Modalità di lettura e indicatore di provenienza sono di **#217** e **#221**: vedi
la tabella in testa. Qui resta solo da esporre il collegamento all'originale
nella scheda della fonte in Biblioteca, che è un posto che esiste già e dove il
dato è salvato e invisibile — un'ora di lavoro, non una voce di piano.

---

## 7. Primo avvio e controllo dello spazio (D1)

**La decisione**: al primo avvio, dentro l'applicazione, una schermata con due
scelte — «tieni tutto insieme» e «scegli dove tenere immagini e documenti». E,
scegliendo una cartella, cinque controlli in quest'ordine: si può scrivere; **c'è
spazio per quello che c'è già**; cosa contiene; sincronizzazione in streaming;
migrazione.

**Oggi**: le due scelte esistono in Impostazioni → Archiviazione, con
classificazione della cartella, prova di scrittura vera e avviso sulle cartelle
sincronizzate. Manca il passo al primo avvio — rinviato prima alla PR 3, poi alla
PR 4, e mai fatto — e **il controllo dello spazio**, che nessuna PR e nessuna
issue ha mai nominato.

**Cosa fare**

Sono due lavori indipendenti, e il secondo è molto più piccolo:

- **controllo dello spazio**: prima di adottare una cartella si confronta lo
  spazio libero del volume con quanto occupa il deposito attuale. Serve una
  dipendenza nuova o una chiamata di sistema per lo spazio libero; se il margine
  non basta si avvisa e si lascia decidere, senza vietare;
- **schermata al primo avvio**: **non va inventata**. Esiste già: `App.tsx`
  mostra `WorkspaceWizard` quando non c'è nessun workspace, ed è il primo avvio
  vero dell'applicazione. La scelta del deposito diventa un passo di quella
  procedura — due scelte, la predefinita già selezionata, e una riga che spiega
  che si può cambiare dopo in Impostazioni.

  Resta da decidere una cosa sola: se il passo del deposito viene **prima** della
  creazione del workspace (si sceglie dove tenere i file, poi si crea) o **dopo**
  (si crea il workspace, poi si sceglie). Propendo per dopo: creare il workspace
  è ciò che l'utente è venuto a fare, la cartella è una conseguenza.

**Test**: cartella su un volume pieno → avviso e non blocco; primo avvio simulato
con impostazione assente → schermata; secondo avvio → niente.

**Dimensione**: piccola il controllo, media la schermata.

---

## 8. — spostata

I lavori vecchi che restano invisibili nel database sono lo **storico** previsto
da **#413**. Quello che avevo proposto — un comando `list_job_history(limit)`,
una riga «83 lavori più vecchi — mostra» sotto i terminati di oggi, e nessuna
cancellazione automatica in coerenza con D28 — va scritto come commento sulla
#413, non fatto qui.

## Riepilogo

| # | Voce | Decisione | Dimensione | Dipendenze |
|---|---|---|---|---|
| 1 | Miniature all'aggiunta | D6 | media | tema nell'epic #183 |
| 2 | «Libera spazio» in interfaccia | D6 | piccola | tema nell'epic #183 |
| 3 | Verifica di una fonte | D5 | media | la 1, altrimenti dirà sempre che mancano le miniature |
| 4 | Verifica completa e controllo all'avvio | D5-bis, D5 | grande | la 3 per l'interfaccia del resoconto |
| 5 | Divieto dell'istituzione | D9 | piccola | — |
| 7 | Primo avvio e spazio disponibile | D1 | piccola + media | la schermata esiste già |

Il resto delle decisioni scoperte ha già un posto dove vivere: **#421** (profili
di rete modificabili), **#422** (tetto di risoluzione configurabile, e con esso
lo scaricamento della singola carta a richiesta di D4), PR 6 (cestino), PR 7
(spostamento del deposito).
