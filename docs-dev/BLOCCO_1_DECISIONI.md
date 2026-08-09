# Blocco 1 — Decisioni da approvare prima di scrivere codice

Documento di lavoro per #217 (inventario asset e regole sulle sorgenti) e #218
(sistema unico di lavori in background), più l'aggancio dello scaricamento
reale che li unisce.

Ultimo aggiornamento: 2026-08-10. Approvate D1-D5, con D1-bis, D2-bis, D4-bis e D5-bis.

## Come si legge

Ogni decisione ha tre righe: **cosa propongo**, **cosa ho scartato e perché**,
**cosa comporta**. Le decisioni sono numerate `D1`, `D2`, … così puoi
rispondere con "D3 no, facciamo l'altra" senza riscrivere il contesto.

In fondo c'è un'appendice tecnica con schema, comandi e struttura delle
cartelle, e l'elenco delle domande che **non posso decidere io**.

Niente di questo documento è stato implementato. È materiale da approvare.

---

## Punto di partenza: cosa esiste già

Prima di proporre qualsiasi cosa ho letto lo schema del database introdotto da
#211 (`migrations/0001_baseline_2_0.sql`). **Il modello dati c'è già**, ed è più
completo di quanto le due issue lascino intendere:

- `sources` → l'opera (titolo, tipo, lingua);
- `source_versions` → una sua incarnazione concreta (manifesto IIIF, PDF,
  edizione), con l'URL di provenienza;
- `assets` → i singoli file: tipo (`image`, `pdf`, `manifest`, `thumbnail`,
  `derived`), **collocazione** (`remote`, `local`, `derived`), **disponibilità**
  (`catalogued`, `partial`, `complete`), percorso nel deposito, URL remoto,
  dimensione, impronta digitale, e il collegamento all'asset da cui deriva;
- `jobs` → i lavori, con già dentro gli otto stati previsti, priorità,
  proprietario, dipendenza da un altro lavoro, configurazione, progresso,
  numero di tentativi ed errore;
- `artifacts` → gli output prodotti dai lavori.

**Conseguenza importante**: #217 e #218 non sono lavoro di modellazione dati.
Sono lavoro di *runtime* e di *interfaccia*. Le tabelle esistono e sono vuote:
mancano il deposito su disco, l'esecutore dei lavori e ciò che l'utente vede.

Questo riduce parecchio il rischio. Ma sposta tutte le decisioni aperte su
altro: dove stanno i file, chi esegue cosa, cosa succede quando qualcosa va
storto.

---

# Parte A — Il deposito dei file

## D1 — Dove vivono i file scaricati

*Approvata con modifiche il 2026-08-09.*

**Il database resta dov'è**, nella cartella dati dell'utente. Non nella cartella
di installazione: su Windows è di sola lettura senza permessi da amministratore
e gli aggiornamenti possono ripulirla, su macOS il pacchetto è firmato e non
deve contenere dati mutevoli. Lo spostamento della cartella dati esiste già:
resta, ma smettiamo di consigliarlo.

**Il deposito è configurabile a parte.** Predefinito `vault/` dentro la cartella
dati, così chi non tocca niente ha tutto in un posto; ma chi vuole i gigabyte
su un'altra partizione, un disco esterno o una cartella sincronizzata può
sceglierne un'altra.

Regge perché `assets.vault_path` è **relativo** alla radice del deposito: il
deposito si sposta senza invalidare il database.

**Modello di riferimento**: indice piccolo, fisso e locale; file grandi
configurabili. È lo stesso di Zotero (database nel profilo, *linked attachment
base directory* per i PDF), Lightroom (catalogo locale, fotografie ovunque),
Calibre e Obsidian (cartella scelta al primo avvio, dentro l'app).

### Il flusso

**Primo avvio, dentro l'applicazione** — non nell'installatore: i tre sistemi
operativi non condividono un modo di aggiungere schermate e mantenerne tre è
fragile. Una schermata, due scelte:

- *Tieni tutto insieme* (predefinita): deposito dentro la cartella dati;
- *Scegli dove tenere immagini e documenti*: apre la selezione cartella.

**Poi, in Impostazioni → Archiviazione**, due righe distinte: *cartella dati*
(dov'è il database, modificabile ma sconsigliata) e *cartella del deposito*
(quella che si sposta davvero).

**Scegliendo una cartella per il deposito**, controlli in quest'ordine:

1. si può scrivere;
2. c'è spazio per quello che c'è già;
3. cosa contiene: vuota → si crea il deposito; deposito Glossa esistente
   (riconosciuto dal marcatore, sotto) → si propone di **ricollegarlo** senza
   copiare, utile per spostare un disco fra due computer; cartella con altro
   contenuto → si rifiuta;
4. controllo sincronizzazione in streaming (D1-bis);
5. parte il lavoro di migrazione.

### Il marcatore

Un file `.glossa-vault` nella radice, con dentro la versione del formato. Serve
a riconoscere un deposito esistente da ricollegare, e a rifiutarsi di riversare
migliaia di file dentro una cartella scelta per errore.

### La migrazione è un lavoro, non un'operazione istantanea

Sposta gigabyte: avanzamento visibile, verifica, annullamento e ripresa. È il
**secondo consumatore** del sistema dei lavori dopo lo scaricamento, e conferma
che quel sistema va costruito prima.

### Deposito irraggiungibile

Disco staccato, condivisione di rete non montata, cartella cloud non ancora
sincronizzata. **Radice del deposito assente è un caso diverso da singolo file
mancante** (vedi D5): Glossa dichiara il deposito non raggiungibile, blocca
scaricamenti e verifiche, e non tocca nessuno stato. Senza questa distinzione
un disco staccato farebbe apparire tutte le fonti come non scaricate, e un clic
sbagliato riscaricherebbe l'intera biblioteca.

## D1-bis — Cartelle sincronizzate (Drive, OneDrive, iCloud)

**Il deposito su una cartella sincronizzata: sì**, a una condizione — il client
deve tenere una copia vera sul disco (Drive per desktop: modalità **mirror**).
In modalità **streaming**, che è la predefinita, i file sono segnaposto:
risultano presenti con la dimensione giusta ma occupano zero byte e si scaricano
all'apertura. Glossa direbbe "fonte completa sul computer" mentre non c'è
niente, e la modalità di lettura "solo locale" diventerebbe una bugia.

**Il database su una cartella sincronizzata: mai.** SQLite scrive usando file di
appoggio e blocchi; il client li sincronizza in ritardo e separatamente, e una
sincronizzazione a metà di una scrittura corrompe il database. È il modo
classico di distruggerlo.

Separare deposito e database, come sopra, **protegge il database**: chi vuole le
immagini sul cloud non è più costretto a portarci anche il database.

**Controllo**: una volta sola, quando si sceglie la cartella, non a ogni
lettura. Su Windows i segnaposto portano un contrassegno leggibile senza aprire
il file; trovandolo, avviso esplicito con l'indicazione di passare a mirror.
Sugli altri sistemi il contrassegno non è altrettanto affidabile, quindi
l'avviso è generico. Verificarlo a ogni lettura significherebbe una chiamata al
sistema per ogni pagina visualizzata.

**A tempo di lettura**, se il file non arriva, l'interfaccia dice *"file non
disponibile localmente"* invece di restare appesa. Copre anche il caso in cui la
sincronizzazione cambia sotto i piedi.

## D2 — Come sono disposti i file sul disco

*Approvata con modifiche il 2026-08-09.*

**Il disco riflette solo la provenienza.** Chi ha digitalizzato e chi possiede
l'esemplare sono fatti che non cambiano mai. Tutto il resto — opera, edizione,
esemplare, e i legami fra copie della stessa edizione in biblioteche diverse —
vive nel database e nei metadati, dove si corregge senza spostare un file.

```
<radice del deposito>/
  .glossa-vault
  providers/<chiave-provider>/<id-digitalizzazione>/
    manifest.json
    pages/0001.jpg
    pages/0002.jpg
    thumbnails/0001.jpg
    document.pdf
  derived/<id-asset>/…
  trash/<id-digitalizzazione>/
```

`<chiave-provider>` è la chiave già usata dal registry dei provider IIIF (#214),
non il nome esteso dell'istituzione: stabile, senza spazi né accenti.

`<id-digitalizzazione>` è l'identificativo interno della `source_version`, non
un titolo.

**Niente nomi parlanti.** Titoli lunghi, accentati, con barre e virgolette, in
alfabeti diversi; limiti di lunghezza del percorso diversi fra i tre sistemi
operativi; e rinominare un'opera in Biblioteca sposterebbe file sul disco.

**Le pagine sono numerate progressivamente a quattro cifre**, nell'ordine
dichiarato dal manifesto — non l'etichetta della biblioteca, che può essere
`12r`, `[iv]`, `Tavola III` o mancare del tutto. L'etichetta si conserva in
`assets.page_label` e si mostra all'utente; l'ordinamento usa `page_index`.

**Perché non per opera o per edizione**: l'attribuzione di una copia a
un'edizione è un giudizio filologico che si rivede. Se stesse nel percorso, una
riattribuzione comporterebbe lo spostamento di gigabyte. La provenienza no: è
un dato di fatto.

**Costo accettato**: la cartella non è navigabile a mano in modo utile, e con
D1 questo pesa di più, perché chi tiene il deposito su una cartella
sincronizzata la vede. Se serve "le immagini di questo manoscritto con nomi
leggibili", è una funzione di esportazione, non l'organizzazione interna.

**Bassa e alta risoluzione non sono versioni diverse**: sono derivati di una
stessa digitalizzazione, e lo schema li copre già (`assets.kind = 'derived'`,
`derived_from_asset_id`). Stanno sotto `derived/`, non sotto un'altra cartella
di provenienza.

## D2-bis — Aderenza a IIIF

IIIF è lo standard del dominio: **si rispetta, non si reinterpreta.**

**Il manifesto si conserva com'è.** `manifest.json` è il documento originale
scaricato, byte per byte, non una nostra normalizzazione. La normalizzazione
vive in memoria e nel database; l'originale resta la verità e permette di
ricostruire tutto se cambiamo idea sui campi che estraiamo.

**L'ordine delle pagine è quello del manifesto**, non uno nostro. `page_index`
è la posizione nella sequenza dichiarata (`items` in Presentation 3.0, `canvases`
in 2.x); `page_label` è l'etichetta dichiarata, mostrata all'utente così com'è.

**Le immagini si chiedono tramite Image API**, con i parametri dello standard
(`/full/<size>/0/default.jpg`), rispettando ciò che il servizio dichiara di
supportare in `info.json` — profilo, dimensioni disponibili, formati. Non si
costruiscono URL a indovinare.

**Si rispettano le dichiarazioni di licenza e attribuzione** del manifesto
(`rights`, `requiredStatement`, `provider`): vanno conservate insieme alla
fonte e mostrate. Materiale d'archivio senza attribuzione è un problema, non un
dettaglio.

**Le note di cortesia di D18 sono parte dell'aderenza**, non un'aggiunta:
identificazione dell'applicazione nelle richieste e limiti di concorrenza per
dominio.

**Riferimenti**: Presentation API 3.0 e Image API 3.0. La versione 2.1 va
ancora letta, perché molte biblioteche non hanno migrato.

**Nota sul modello bibliografico** (non è una decisione di questo blocco).
Lo schema di #211 rappresenta bene un manoscritto: opera → digitalizzazione →
file. Per gli stampati serve un livello in più — **edizione** (la tiratura),
**esemplare** (la copia fisica in una biblioteca), **digitalizzazione** — perché
la stessa edizione esiste in copie diverse in biblioteche diverse. Oggi
`source_versions` mescola il livello bibliografico (`edition`, `copy`) con il
supporto digitale (`iiif_manifest`, `pdf`).

Non serve al blocco 1: scaricamento, disponibilità e lavori operano tutti al
livello della digitalizzazione. Serve quando si vorranno confrontare due
esemplari della stessa edizione, o sapere quali biblioteche la possiedono, ed è
materia di **#404** insieme ai cataloghi di autorità (ISTC, EDIT16, CERL, VIAF).

La disposizione per provenienza scelta qui **non blocca** quel lavoro: se
l'edizione stesse nel percorso, lo bloccherebbe.

## D3 — Nessuna condivisione fisica dei file

*Approvata il 2026-08-10.*

Ogni digitalizzazione tiene i propri file. Nessun tentativo di riconoscere che
due fonti puntano allo stesso file remoto e tenerne una copia sola.

Con la disposizione per provenienza (D2) il caso è quasi inesistente: due
digitalizzazioni di biblioteche diverse sono file diversi per definizione, e la
stessa digitalizzazione aggiunta due volte è già impedita dal controllo
sull'indirizzo del manifesto in fase di aggiunta.

**Scartato**: un deposito indirizzato per contenuto, un file per impronta con
gli asset che ci puntano. È la soluzione giusta per una biblioteca grande, ma
richiede il conteggio dei riferimenti — cancellando una fonte devi sapere se
qualcun altro usa ancora quel file — e sbagliarlo significa cancellare immagini
altrui o non liberare mai spazio. Complessità reale per un problema che qui non
si presenta.

**A cosa serve davvero l'impronta digitale** (`assets.checksum`): verificare che
un file sia arrivato **intero**. Uno scaricamento interrotto lascia file
troncati che sembrano validi; senza impronta, una ripresa li salterebbe come
"già presenti". Serve anche al comando manuale di verifica di D5 e alla
migrazione del deposito di D1.

Non serve, e non si usa, per riconoscere duplicati.

## D4 — Quali immagini si scaricano

*Approvata con modifiche il 2026-08-10.*

### Sapere cosa è disponibile

Ogni immagine IIIF ha un descrittore (`info.json`) che dichiara:

- `sizes[]` — le dimensioni garantite;
- `maxWidth` / `maxHeight` / `maxArea` — i tetti oltre cui il servizio rifiuta;
- `extraFeatures` — se si può chiedere una larghezza arbitraria (`sizeByW`,
  `sizeByWh`, …);
- il **livello di conformità**: a livello 0 sono ammesse *solo* le dimensioni
  predefinite; dal livello 1 in su si può chiedere per larghezza.

Si legge una volta per digitalizzazione e si conserva insieme alla versione. Da
lì l'interfaccia sa dire, per ogni pagina, quali risoluzioni esistono davvero,
senza tentare richieste a indovinare. La dimensione massima si chiede con la
sintassi canonica `size=max`.

### Politica di scaricamento, per fonte

Scelta **alla fonte**, non globale, perché dipende dal materiale: una
cinquecentina a stampa larga si legge a molto meno di una minuscola fitta.

- **Standard** (predefinita): la massima disponibile entro il tetto —
  **2000 pixel sul lato lungo**, configurabile;
- **Massima**: `size=max`, nessun tetto.

Le miniature si scaricano sempre, in entrambi i casi.

**Scartato "scarica tutto al minimo"**: produrrebbe una fonte che risulta
completa ma è illeggibile, peggio di una non scaricata. Il minimo sono già le
miniature.

### Aggiornamento a richiesta, per singola pagina

Mentre si naviga, se per quella pagina esiste una risoluzione superiore a
quella presente, l'interfaccia lo dichiara e offre *"scarica questa pagina alla
massima risoluzione"*. Il nuovo file **si aggiunge**, non sostituisce: serve il
dettaglio su una carta, non su tutte.

### La risoluzione in esportazione appartiene all'esportazione

La scelta "a che risoluzione voglio il PDF che produco" si fa al momento
dell'esportazione, fra ciò che si ha; se manca, l'esportazione può richiedere lo
scaricamento di quello che serve.

**Perché conta**: tenerla qui trasformerebbe lo scaricamento in quattro comandi
diversi. Così le possibilità restano tutte, ma distribuite dove servono — una
impostazione alla fonte, un'azione sulla pagina, una scelta in esportazione.

### Conseguenza tecnica

Più file per la stessa pagina: il percorso diventa
`pages/<dimensione>/0001.jpg` e `assets` distingue le righe per dimensione
(`size_tag`). `page_index` resta il numero di pagina, non più unico da solo.

## D4-bis — Il PDF fornito dalla biblioteca

Un manifesto può dichiarare un PDF dell'intero oggetto (proprietà `rendering`,
Presentation API 3.0).

**Se c'è, si mostra e si può scaricare in aggiunta — mai al posto delle
immagini.** Le immagini restano la base: sono per pagina, di qualità dichiarata
e ordinabili. Il PDF è comodo per leggere fuori dall'app e, quando ha un livello
di testo, per cercarci dentro.

**Non si scompone il PDF per ricavarne le pagine quando le immagini esistono**:
quel PDF è quasi sempre costruito da immagini già compresse, quindi la qualità
sarebbe peggiore di una richiesta diretta al servizio immagini.

**Si scompone** solo quando la fonte è *soltanto* un PDF e non esiste IIIF: caso
già previsto dallo schema (`source_versions.version_kind = 'pdf'`).

**Produrre un PDF di un capitolo o di pagine scelte** si costruisce dalle
immagini già presenti, non scomponendo quello scaricato. È funzione di
esportazione (#188, #225), non di scaricamento.

## D5 — Verifica dei file e disallineamenti

*Approvata con modifiche il 2026-08-10.*

**Il database è la verità.** All'avvio non si scandisce il deposito. Un file sul
disco che il database non conosce viene ignorato; un file atteso che non c'è
viene segnalato come mancante, e quella pagina torna disponibile solo da remoto.

**Nessun riscaricamento automatico, mai.** La verifica constata e propone:
*"mancano 12 pagine — scaricale"*, che diventa un lavoro come gli altri. Stessa
regola di D13. Il motivo è concreto: un disco esterno staccato per sbaglio
farebbe ripartire il riscaricamento dell'intera biblioteca.

### Due livelli, perché costano diversamente

**Rapido — presenza.** Elenca i file e li confronta con il database.
Millisecondi anche per un manoscritto grande. Risponde: *"210 attese, 198
presenti, 12 mancanti"*.

**Completo — integrità.** Ricalcola l'impronta di ogni file. Scopre anche i file
troncati da uno scaricamento interrotto, che il controllo rapido conta come
presenti. Lento in proporzione ai gigabyte, e su un deposito sincronizzato in
streaming (D1-bis) **costringe il client a scaricare tutto**: va avvisato prima
di partire.

Il pulsante sulla fonte esegue il rapido. Il completo è una seconda voce,
esplicita.

### Cosa sa l'avvio senza guardare il disco

Solo due cose, entrambe senza costo: **la radice del deposito è raggiungibile**
(una chiamata sola) e **quali lavori sono rimasti interrotti** (una query).
Queste vanno in notifica.

Un singolo file mancante **non** è conoscibile senza elencare le cartelle: su
deposito locale è veloce, su condivisione di rete no.

Quindi: **controllo rapido all'avvio come opzione, spenta di default**, con
l'avvertenza che allunga l'apertura su depositi grandi o remoti. Chi la accende
trova le segnalazioni pronte; chi non la accende scopre il problema aprendo il
libro, e lì ha il pulsante.

### Radice del deposito assente

Caso diverso, già deciso in D1: non si applica niente di quanto sopra. Deposito
dichiarato non raggiungibile, scaricamenti e verifiche bloccati, **stati
intatti**.

### Dipendenza esterna

Le segnalazioni all'avvio presuppongono una **zona notifiche in Dashboard**, che
non esiste ancora e non fa parte di questo blocco. Finché non c'è, l'avviso di
deposito non raggiungibile va nella barra di stato.

## D5-bis — Verifica completa del deposito

*Approvata il 2026-08-10.*

Un lavoro globale avviabile a mano da **Impostazioni → Archiviazione**, accanto
alla riga del deposito. Non dalla Biblioteca: non riguarda una fonte, riguarda
il deposito.

**Valore aggiunto oltre la sicurezza dei dati**: è il primo lavoro lungo davvero
pesante per il **processore** e non per la rete. Serve a provare che i limiti di
concorrenza separati di D11 funzionano davvero, invece di scoprirlo con il
riconoscimento testo fra sei mesi.

### Resoconto in quattro categorie

- **integri** — verificati, impronta corrispondente;
- **mancanti** — attesi dal database, assenti dal disco;
- **corrotti** — presenti ma con impronta diversa: scaricamenti interrotti,
  deterioramento del supporto, sincronizzazioni andate male;
- **orfani** — file sul disco che il database non conosce.

Gli orfani sono la parte nuova: D5 dice di ignorarli nell'uso normale, ma qui è
il momento giusto per contarli, perché occupano spazio e nessuno li reclamerà
mai. Il resoconto propone *"elimina file orfani, liberi 3,2 GB"* come azione
esplicita.

**Non corregge niente da solo**, come D5.

### Rapporto con il backup

**Non legato.** Un backup che parte con ore di verifica è un backup che non si fa
mai.

Invece: se si avvia un backup che include le immagini e la verifica completa non
è mai stata eseguita, o è vecchia, compare una **nota non bloccante** con il
collegamento per lanciarla.

### Avvertenze

Su un deposito da decine di gigabyte sono ore: deve poter essere messo in pausa
e ripreso, e siccome è un lavoro lo è per costruzione.

Su deposito sincronizzato in streaming costringe il client a scaricare tutto
(D1-bis): va detto prima di partire.

## D6 — Cancellare una fonte

**Propongo**: cestinare una fonte non tocca il disco. I file spariscono solo
quando il cestino viene svuotato davvero. Prima della cancellazione definitiva
l'utente vede quanto spazio libera.

**Scartato**: cancellare subito. Il cestino esiste per poter tornare indietro,
e una fonte ripescata senza le sue immagini è una fonte da riscaricare.

**Comporta**: il cestino può occupare molto spazio in silenzio. Serve mostrare
lo spazio occupato dal cestino da qualche parte in Impostazioni.

---

# Parte B — Disponibilità e modalità di lettura

## D7 — Cosa vede l'utente sullo stato di una fonte

La colonna `availability` esiste già con tre valori. Propongo di mostrarli così:

| In tabella | L'utente legge | Significa |
|---|---|---|
| `catalogued` | **Solo online** | conosciamo la fonte, nessun file sul computer |
| `partial` | **Parziale — 34 di 210 pagine** | scaricamento interrotto o parziale |
| `complete` | **Completa sul computer** | tutte le pagine dichiarate dal manifesto sono presenti |

Lo stato **non** è una quarta colonna "in scaricamento": quello è un lavoro in
corso, e si legge dai lavori (Parte C). Una fonte in scaricamento resta
`partial` e mostra in più la barra di avanzamento del suo lavoro.

**Scartato**: aggiungere `downloading` e `error` agli stati dell'asset, come
suggerisce il testo della issue. Sono stati del *lavoro*, non del file: se
duplicati in due posti, prima o poi divergono — l'app si chiude durante uno
scaricamento e la fonte resta "in scaricamento" per sempre.

**Comporta**: l'interfaccia deve unire due fonti di informazione (disponibilità
+ lavoro attivo) per mostrare una riga. È il prezzo di non avere stati
duplicati.

## D8 — Leggere da remoto o dalla copia locale

**Propongo** tre modalità, dichiarate esplicitamente:

- **Automatica** (predefinita): se il file c'è sul computer lo usa, altrimenti
  va in rete;
- **Solo locale**: non tocca mai la rete; le pagine mancanti appaiono
  esplicitamente come non disponibili invece di caricare lentamente;
- **Solo remoto**: ignora le copie locali, utile per verificare che una copia
  scaricata corrisponda ancora all'originale.

**Scartato**: la sola modalità automatica. "Solo locale" serve davvero quando
si lavora senza rete o su connessione lenta, e senza una modalità esplicita
l'utente non capisce perché a volte è veloce e a volte no.

## D9 — Dove si salva questa preferenza

**Propongo**: preferenza **globale** dell'applicazione, in `app_settings`, con
possibilità di forzatura temporanea nella sessione di lettura corrente (non
persistita).

**Scartato**: per fonte, o per workspace. Per fonte significa una colonna in più
e un'impostazione che l'utente deve gestire decine di volte; per workspace
sembra elegante ma la modalità di lettura dipende da *dove sei adesso* — in
treno senza rete — non da *cosa stai studiando*.

**Comporta**: se un domani emerge il bisogno di fissarla per singola fonte, si
aggiunge una colonna che, se valorizzata, vince sulla globale. Retrocompatibile.

---

# Parte C — I lavori in background

Questa è la parte che, come hai detto tu, va fatta bene la prima volta.

## D10 — Chi esegue i lavori

**Propongo**: un solo orchestratore dentro l'applicazione, avviato all'apertura.
Tiene in memoria la coda, legge e scrive lo stato sul database, e affida
l'esecuzione a un gestore registrato per tipo di lavoro. L'interfaccia non
esegue mai nulla di lungo: chiede la creazione di un lavoro e osserva.

**Scartato**: un processo separato che continua a lavorare ad app chiusa. La
issue stessa lo esclude per ora, e aggiungerebbe installazione, aggiornamento e
diagnosi di un secondo eseguibile.

**Comporta**: chiudendo Glossa i lavori si fermano. La ripresa è D13.

## D11 — Quanti lavori insieme

**Propongo** limiti separati per categoria, perché saturano risorse diverse:

| Categoria | Limite | Perché |
|---|---|---|
| Rete verso biblioteche | **2 per dominio**, 4 totali | cortesia verso archivi pubblici, vedi D18 |
| Riconoscimento testo / calcolo locale | numero di processori meno 1 | satura la macchina, non la rete |
| Chiamate a servizi linguistici | 1 | costano soldi e hanno limiti propri |
| Generazione documenti | 1 | scrive su disco, l'ordine conta |

**Scartato**: un limite unico. Quattro scaricamenti e un riconoscimento testo
non competono per la stessa risorsa; un limite unico o strozza la rete o
soffoca il processore.

## D12 — Chiusura dell'applicazione

**Propongo**: alla chiusura, ogni lavoro in esecuzione passa a **in pausa** e
salva il punto raggiunto. Se la chiusura avviene mentre ci sono lavori attivi,
l'utente vede una richiesta di conferma con l'elenco.

**Scartato**: annullare tutto alla chiusura. Perdere venti minuti di
scaricamento perché hai chiuso la finestra è inaccettabile.

## D13 — Riapertura dopo un blocco o un arresto anomalo

Qui serve una distinzione, perché "riprendere" non vuol dire la stessa cosa per
tutti i lavori.

**Propongo** due categorie dichiarate da ogni tipo di lavoro:

- **Riprendibile**: il lavoro sa dire a che punto era e ripartire da lì. Lo
  scaricamento lo è: le pagine già complete e verificate si saltano. Alla
  riapertura questi lavori tornano **in pausa**, non ripartono da soli.
- **Da rifare**: il lavoro non ha punti intermedi affidabili. Alla riapertura
  torna **in coda** con il progresso azzerato, o viene segnalato come
  interrotto se ripeterlo costa denaro.

**Nessun lavoro riparte da solo alla riapertura.** L'utente vede "3 lavori
interrotti" e decide.

**Scartato**: ripresa automatica. Riaprire l'app e vedere partire cinque
scaricamenti che non ricordavi è ostile, e per i lavori che costano soldi è
peggio.

**Comporta**: un lavoro rimasto in uno stato di transizione — in pausa, in
annullamento — al riavvio viene portato allo stato stabile corrispondente. È il
"recovery" della issue, e va scritto una volta sola nell'orchestratore.

## D14 — Pausa

**Propongo**: la pausa è **cooperativa**. L'orchestratore segna il lavoro come
"in pausa richiesta"; il gestore la vede al confine dell'unità di lavoro
successiva — la pagina corrente, il file corrente — la porta a termine, salva
e si ferma. Non si interrompe niente a metà.

**Comporta**: mettere in pausa uno scaricamento richiede il tempo di finire la
pagina in corso, non è istantaneo. L'interfaccia deve mostrare "in pausa…" e poi
"in pausa", non fingere che sia immediato.

## D15 — Annullamento

**Propongo**: come la pausa, cooperativo, ma con pulizia. I file parziali della
unità interrotta vengono cancellati; quelli completi restano e contano per una
ripresa futura. Un lavoro annullato è terminale: si può solo ripetere da capo,
non riprendere.

## D16 — Tentativi automatici

**Propongo**: tre tentativi, con attesa crescente (2 secondi, 8, 30), **solo**
per gli errori che hanno senso ripetere — connessione caduta, timeout,
"riprova più tardi" del server. Non si ripetono: file non trovato, accesso
negato, spazio esaurito, formato non riconosciuto.

**Scartato**: ripetere tutto. È la stessa lezione della revisione di stamattina
sulla PR 403: ripetere un errore non ripetibile costa il doppio e non risolve.

**Comporta**: serve una classificazione degli errori nel gestore, non solo un
messaggio di testo. Un errore ha: se è ripetibile, cosa mostrare all'utente,
e cosa scrivere nel registro.

## D17 — Avanzamento

**Propongo**: il gestore aggiorna il progresso **al massimo una volta al
secondo**, e comunque a ogni cambio di stato. Il progresso è salvato sul
database e inviato all'interfaccia con un evento.

**Scartato**: aggiornare a ogni byte ricevuto. Scriverebbe sul database
centinaia di volte al secondo e riverserebbe eventi sull'interfaccia.

**Comporta**: una barra che avanza a scatti di un secondo. Accettabile.

## D18 — Cortesia verso le biblioteche

**Propongo**: al massimo due richieste contemporanee **per dominio**, una pausa
minima fra richieste allo stesso dominio, e rispetto dell'indicazione "riprova
fra N secondi" quando il server la manda. Identificazione dell'applicazione
nelle richieste, come chiede la buona pratica IIIF.

**Perché è una decisione e non un dettaglio**: gli archivi digitali sono
istituzioni pubbliche con infrastrutture modeste. Un client che scarica 400
pagine il più in fretta possibile viene bloccato, e giustamente. Questo limite
protegge te dal ritrovarti l'indirizzo bandito da una biblioteca.

---

# Parte D — Cosa vede l'utente

## D19 — Barra di stato in basso

**Propongo**: quando c'è almeno un lavoro attivo, la barra mostra una riga
sola: cosa sta facendo, quanti lavori mancano, avanzamento del lavoro corrente.
Cliccandola si apre il centro lavori. Quando non c'è niente, la barra continua
a mostrare quello che mostra oggi.

## D20 — Centro lavori

**Propongo**: un pannello con tre sezioni — in corso, in attesa, terminati
oggi. Per ogni lavoro: descrizione leggibile ("Scaricamento *Beatus di
Girona*, pagina 34 di 210"), avanzamento, e i comandi ammessi dal suo stato.
Comandi come icone neutre con suggerimento al passaggio del mouse, secondo il
vincolo di interfaccia del progetto.

**Domanda aperta**: dove vive questo pannello. Un'area globale accanto a
Biblioteca e Studio, o un pannello che scende dalla barra di stato? La seconda
mi sembra più coerente con "il centro lavori è di servizio, non è un luogo dove
si lavora", ma tocca la shell 2.0 e quindi la decisione è tua.

## D21 — Fine di un lavoro

**Propongo**: nessuna notifica per il singolo lavoro riuscito. Un avviso solo
quando una richiesta dell'utente si conclude interamente ("*Beatus di Girona*
scaricato, 210 pagine") e quando qualcosa fallisce.

**Scartato**: una notifica per pagina. Duecento notifiche per uno scaricamento.

---

# Parte E — Come lo spezzerei in PR

Ordine obbligato, ogni PR verificabile da sola.

**PR 1 — deposito e disponibilità reale.**
Struttura delle cartelle, calcolo e scrittura delle impronte, disponibilità
calcolata dai file presenti, tre modalità di lettura. Nessuno scaricamento
ancora: si popola a mano nei test. In Biblioteca compare lo stato reale di ogni
fonte. Copre #217.

**PR 2 — orchestratore dei lavori, a vuoto.**
Coda, stati, limiti di concorrenza, pausa, annullamento, tentativi, ripresa al
riavvio, comandi di creazione e osservazione. Con un solo tipo di lavoro finto,
che serve unicamente ai test. Nessuna interfaccia. Copre metà di #218.

**PR 3 — barra di stato e centro lavori.**
L'interfaccia sopra la PR 2, ancora con il tipo finto. Si vede una coda
funzionare, si mette in pausa, si annulla, si chiude e si riapre l'app. Copre
l'altra metà di #218.

**PR 4 — scaricamento vero.**
Il primo gestore reale: dal manifesto alle pagine sul disco, con ripresa,
salto dei file già validi, e i limiti di cortesia. È il punto 1.3 del tuo
piano.

**PR 5 — risorse condivise e ambito.**
#213. Indipendente dalle quattro sopra: si può fare in parallelo se serve.

Sul punto 1.5 del tuo piano — chiudere #210 — non ho abbastanza elementi per
proporre un ritaglio. Va guardata insieme, non stanotte.

---

# Domande che non posso decidere io

1. **Dove vive il centro lavori** (da D20): area globale o pannello della barra
   di stato? Tocca la shell.
2. **Migrazione del deposito** (da D1): cambiando cartella, i file esistenti
   vanno spostati, copiati lasciando gli originali, o solo ricollegati? Il
   ricollegamento c'è già per un deposito esistente; la domanda riguarda il caso
   in cui la nuova cartella è vuota.
3. **Backup e file scaricati**: il backup del workspace oggi esporta un file di
   testo. Con il deposito, un backup completo diventa di gigabyte. Il backup
   deve includere le immagini, escluderle sempre, o chiedere?
4. **Limite di spazio**: vuoi un tetto oltre il quale Glossa avvisa o si
   rifiuta di scaricare? Senza, un manoscritto grande riempie il disco senza
   preavviso.

---

# Appendice tecnica

## Modifiche allo schema

Il modello dati di #211 basta quasi del tutto. Servono solo:

```sql
-- Modalità di lettura globale: 'auto' | 'local' | 'remote'.
INSERT INTO app_settings (key, value) VALUES ('source_read_mode', 'auto');

-- Radice del deposito. Vuoto o assente = `<cartella dati>/vault/` (D1).
INSERT INTO app_settings (key, value) VALUES ('vault_root', '');

-- Numero di pagina progressivo, per ordinare gli asset di una versione senza
-- dipendere dall'etichetta della biblioteca (D2).
ALTER TABLE assets ADD COLUMN page_index INTEGER DEFAULT NULL;

-- Etichetta dichiarata dalla biblioteca, mostrata all'utente ma mai usata per
-- ordinare o per costruire percorsi.
ALTER TABLE assets ADD COLUMN page_label TEXT DEFAULT NULL;

-- Dimensione richiesta al servizio ('2000', 'max', …): la stessa pagina può
-- esistere in piu' risoluzioni, quindi page_index da solo non e' univoco (D4).
ALTER TABLE assets ADD COLUMN size_tag TEXT DEFAULT NULL;

-- Politica di scaricamento della singola fonte: 'standard' | 'max' (D4).
ALTER TABLE source_versions ADD COLUMN download_policy TEXT NOT NULL DEFAULT 'standard';

-- Capacita' dichiarate dal servizio immagini (info.json): dimensioni
-- disponibili, tetti, livello di conformita'. Conservate per non doverle
-- richiedere a ogni pagina (D4).
ALTER TABLE source_versions ADD COLUMN image_service_profile TEXT DEFAULT NULL;

-- Tetto predefinito, in pixel sul lato lungo, per la politica 'standard' (D4).
INSERT INTO app_settings (key, value) VALUES ('download_size_cap', '2000');

-- Controllo rapido di presenza all'avvio: spento di default (D5).
INSERT INTO app_settings (key, value) VALUES ('verify_vault_on_startup', '0');

-- Numero di pagine dichiarato dal manifesto: senza, 'complete' non è
-- calcolabile (D7).
ALTER TABLE source_versions ADD COLUMN expected_asset_count INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_version_page
  ON assets(source_version_id, page_index);
```

Nessuna modifica a `jobs`: la tabella copre già stati, priorità, proprietario,
dipendenza, configurazione, progresso, tentativi ed errore.

## Struttura del deposito

```
<cartella dati>/                  ← fissa, mai su cartella sincronizzata
  glossa.db

<radice del deposito>/            ← predefinita `<cartella dati>/vault/`,
  .glossa-vault                     riconfigurabile (D1)
  providers/<chiave-provider>/<source_version_id>/
    manifest.json               ← originale, byte per byte (D2-bis)
    pages/<dimensione>/0001.jpg …   ← 2000, max, … (D4)
    thumbnails/0001.jpg …
    document.pdf
  derived/<asset_id>/…
  trash/<source_version_id>/    ← cestinati, in attesa di svuotamento (D6)
```

`assets.vault_path` è **relativo** alla radice del deposito, mai assoluto: così
spostare la cartella dati non invalida il database.

## Contratto del gestore di lavoro

Ogni tipo di lavoro registra un gestore che dichiara:

- `job_type`: identificativo;
- `resource_class`: `network` | `cpu` | `llm` | `document`, che sceglie il
  limite di concorrenza (D11);
- `resumability`: `resumable` | `restartable` | `manual`, che decide il
  comportamento al riavvio (D13);
- `run(config, control) -> Result<Output, JobError>`, dove `control` espone il
  punto di ripresa, la richiesta di pausa o annullamento, e la segnalazione di
  avanzamento con la strozzatura di D17;
- `JobError` porta con sé `retryable: bool` (D16) e un messaggio già
  destinato all'utente.

## Comandi Tauri previsti

```
list_jobs(filter) -> Vec<JobSummary>
create_job(job_type, config, owner) -> JobId
pause_job(id) / resume_job(id) / cancel_job(id) / retry_job(id)
```

più un evento `job://updated` con lo stato aggiornato, strozzato come da D17.

## Cosa non è coperto

Riconoscimento testo, esportazioni e calcoli analitici useranno lo stesso
impianto ma non sono in questo blocco. Il contratto sopra è pensato per
reggerli senza modifiche: se durante la PR 2 emerge che non regge, è il momento
di fermarsi e ridiscuterlo, non di aggiungere un caso speciale.
