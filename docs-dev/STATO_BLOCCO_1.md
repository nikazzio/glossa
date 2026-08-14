# Stato del blocco 1 — fondamenta invisibili

Diario di avanzamento delle sette PR decise in `BLOCCO_1_DECISIONI.md`, Parte G.
Si aggiorna **a ogni PR unita**. Serve a due cose: riprendere il filo fra una
sessione e l'altra, e travasare le novità in `STATO_SESSIONE_2.0.md` quando si
torna sulla postazione fissa.

Ultimo aggiornamento: **2026-08-13**, dopo la PR 3.

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
| 3 | Coda visibile: indicatore in barra e pannello Lavori | #218 (metà), #413 (parte) | **in revisione** (#417) |
| 3-bis | Impostazioni: deposito, limiti, ripresa automatica | #217, #218 (interfaccia) | da fare |
| 4 | Scaricamento vero | #218 primo consumatore | da fare |
| 5 | Risorse condivise e ambito | #213 | da fare, indipendente |
| 6 | Registrazione del lavoro svolto | #378 | da fare — **non lasciare ultima** |
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

**Coda visibile** (PR 3): indicatore al centro della barra di stato in ogni
sezione, scheda Lavori nel pannello in basso accanto ai messaggi, comandi per
pausa, ripresa, annullamento e nuovo tentativo, conferma alla chiusura con i
lavori attivi messi in pausa. Si prova con i tipi di lavoro finti delle build di
sviluppo.

**Non esiste ancora nessuna schermata di impostazioni** per deposito e lavori:
è la PR 3-bis.

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

- **Scelta cartella dal dialogo nativo del backend** (PR 3): oggi
  `check_vault_folder` riceve un percorso dal frontend e ci scrive un file di
  prova, in contrasto con il principio fissato in #405.
- **Notifiche di sistema** (D21): rinviate alla PR 4, quando esiste un lavoro
  vero da annunciare.
- **Documentazione pubblica** (`docs/`, `docs/en/`) e aiuto in-app: rinviati alla
  PR 4. Oggi i soli lavori esistenti sono quelli finti delle build di sviluppo:
  documentarli darebbe istruzioni per qualcosa che l'utente non può avviare.
- **Barra di stato unificata, salvataggio generalizzato, console di tutta
  l'app**: restano a #413, sono lavoro di guscio.
- **Livello bibliografico per gli stampati**: #404, fuori dal blocco.

## Da provare a mano, per chi rilegge

Fino alla PR 3 non c'è niente da cliccare: l'unica prova utile è **aprire l'app e
verificare che parta**, perché a ogni PR si applica una modifica al database.
Dalla PR 3 in poi si prova la coda vera e propria.
