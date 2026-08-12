# Blocco 1 — Decisioni da approvare prima di scrivere codice

Documento di lavoro per #217 (inventario asset e regole sulle sorgenti) e #218
(sistema unico di lavori in background), più l'aggancio dello scaricamento
reale che li unisce.

Ultimo aggiornamento: 2026-08-12. **Tutte le decisioni D1-D33 approvate**, con D1-bis, D2-bis, D4-bis, D5-bis, D8-bis e D16-bis. Nessuna domanda aperta. L'unica correzione successiva all'approvazione riguarda l'appendice tecnica: come si arriva alla forma finale dello schema, emersa implementando la PR 1 (#414).

## Come si legge

Le decisioni sono numerate `D1`, `D2`, … e riportano cosa si è scelto, cosa si è
scartato e perché, e cosa comporta. Le voci `-bis` sono emerse discutendo e non
erano nella prima stesura.

**Tutte approvate** fra il 9 e l'11 agosto 2026, nessuna domanda aperta. In
fondo l'appendice tecnica con schema, comandi e struttura delle cartelle.

**Niente di questo documento è ancora implementato.** La suddivisione in PR è
nella Parte G.

### Fonti

Le decisioni su rete e scaricamento vengono da **Scriptoria**
(`~/workspace/scriptoria`), in particolare `network_policy.py`,
`_rate_limiter.py`, `http_client.py`, `logic/downloader_runtime.py` e
`docs/HTTP_CLIENT.md`: sono valori ottenuti da prove reali sul campo, non
stimati. Quelle su IIIF vengono dalle specifiche Presentation API 3.0 e Image
API 3.0, verificate l'8 e il 10 agosto 2026.

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

Regge a una condizione, che diventa una regola: `assets.vault_path` si scrive
**relativo** alla radice del deposito, mai assoluto. Così il deposito si sposta
senza invalidare il database. Oggi la colonna esiste ma nessuno ci scrive
ancora, quindi la regola si può fissare adesso senza convertire niente.

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

**La finestra di scelta cartella la apre il backend** *(vincolo aggiunto il
2026-08-13, materia della PR 3)*, come già fa l'import documenti dopo #405: il
percorso scelto non attraversa la webview e nessun comando accetta un percorso
grezzo dal frontend. Nella PR 1 i comandi del deposito ricevono ancora la
cartella come parametro, perché la schermata non esiste; con la schermata, la
scelta passa dal dialogo nativo e quella superficie si chiude.

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

*Approvata il 2026-08-09.*

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
    pages/2000/0001.jpg      ← una cartella per risoluzione (D4)
    pages/2000/0002.jpg
    pages/max/0034.jpg       ← la carta scaricata al massimo su richiesta
    thumbnails/0001.jpg
    document.pdf
  derived/<id-asset>/…
  trash/<id-digitalizzazione>/
```

`<chiave-provider>` è la chiave già usata dal registry dei provider IIIF (#214, PR #393),
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

**Bassa e alta risoluzione non sono digitalizzazioni diverse**: sono la stessa
carta chiesta al servizio con parametri diversi, e stanno sotto
`pages/<dimensione>/` della stessa digitalizzazione (D4). Mai sotto un'altra
cartella di provenienza.

`derived/` è un'altra cosa: contiene ciò che **produciamo noi** — ritagli,
immagini ottimizzate, derivati di lavorazione — che lo schema copre con
`assets.kind = 'derived'` e `derived_from_asset_id`.

## D2-bis — Aderenza a IIIF

*Approvata il 2026-08-10.*

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

**Quale impronta** *(deciso il 2026-08-12, implementando la PR 1)*: FNV-1a a 64
bit, non crittografica, calcolata a blocchi durante la lettura. La proprietà che
serve è accorgersi di una corruzione **accidentale** — troncamento, bit rot,
sincronizzazione a metà — e per quella basta. La resistenza a collisioni
costruite apposta non aggiungerebbe niente: chi può scrivere nel deposito può
scrivere anche nel database dove le impronte stanno, e nessuna biblioteca IIIF
dichiara un digest con cui confrontarsi. Se un giorno servisse davvero, si
sostituisce la funzione: il resto non cambia.

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

*Approvata il 2026-08-10.*

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

E il backup non contiene comunque le immagini (D31), quindi la verifica del
deposito non lo riguarda direttamente. Resta utile prima di **spostare il
deposito** (D30) o prima di affidarlo a una cartella sincronizzata: lì sì che
conviene sapere che i file sono integri prima di muoverli.

### Avvertenze

Su un deposito da decine di gigabyte sono ore: deve poter essere messo in pausa
e ripreso, e siccome è un lavoro lo è per costruzione.

Su deposito sincronizzato in streaming costringe il client a scaricare tutto
(D1-bis): va detto prima di partire.

## D6 — Liberare spazio e cancellare

*Approvata con modifiche il 2026-08-10.*

### Il principio

**Le immagini sono una copia locale, non un dato.** Si riscaricano dalla
biblioteca. Tutto il resto — scheda, note, collegamenti, trascrizione,
traduzione, annotazioni — non si riscarica da nessuna parte.

Questa distinzione governa tutta la decisione.

### Due azioni, non una

**Libera spazio** — sulla fonte. Cancella le pagine scaricate **subito e per
davvero**, senza passare dal cestino. Restano scheda, miniature, trascrizione,
traduzione e note. Conferma esplicita con la dimensione: *"3,2 GB. Le pagine si
riscaricano dalla biblioteca quando ti servono."*

È l'azione frequente: si cerca un'opera, si tiene la scheda, si scarica la
carta che serve, e quando non serve più si libera.

**Sposta nel cestino** — sulla fonte intera: scheda, note, collegamenti e
immagini. È l'azione rara, ed è l'unica che il cestino debba davvero proteggere,
perché quelle cose non si riscaricano.

**Perché "libera spazio" non passa dal cestino**: spostare 3 GB nel cestino non
libera niente. Servirebbe una seconda azione per ottenere ciò che si è chiesto.

### Il cestino

Mostra cosa contiene e quanto occupa. Si svuota a mano, non automaticamente:
su materiale che costa ore di scaricamento, nessuna cancellazione alle spalle.

Lo spazio occupato dal cestino va mostrato in Impostazioni → Archiviazione,
altrimenti cresce dimenticato.

### Fonti usate da trascrizioni o traduzioni

Liberare lo spazio di una fonte **non tocca** trascrizioni e traduzioni, che
sono documenti a sé. Restano leggibili e modificabili anche senza le immagini.

Riscaricare in seguito solo le pagine che servono non è una funzione nuova: è
l'azione per pagina già definita in D4, usata quando non c'è nulla in locale.

### Miniature all'aggiunta

Aggiungendo una fonte si scaricano **tutte le miniature**. Duecento miniature
sono circa 3 MB: trascurabili, e rendono il libro sfogliabile anche senza rete e
senza pagine scaricate. Le miniature non vengono rimosse da "libera spazio".

# Parte B — Disponibilità e modalità di lettura

## D7 — Cosa vede l'utente sullo stato di una fonte

*Approvata con modifiche il 2026-08-10.*

| In tabella | L'utente legge | Significa |
|---|---|---|
| `catalogued` | **Solo online** | scheda e miniature, nessuna pagina in locale |
| `partial` | **12 di 210 pagine** | alcune pagine in locale |
| `complete` | **Completa sul computer** | tutte le pagine dichiarate sono presenti |

### La disponibilità non si colora

`partial` **non è un avviso**. Chi scarica tre carte su duecento apposta — che è
l'uso normale, vedi D6 — non deve trovarsi duecento bandierine gialle addosso.
Il numero è un fatto e si mostra come un dato, in grigio.

**Il colore lo mettono i problemi veri**, che sono fatti verificabili e non
giudizi:

- l'ultimo scaricamento è **fallito**, con il motivo;
- la verifica ha trovato file **mancanti o corrotti** (D5, D5-bis);
- il deposito non è raggiungibile — riguarda tutto, non la singola fonte.

Nessuna bandierina da mettere a mano. Se nell'uso emergesse il bisogno di un
"per me è finito" esplicito, è un valore booleano da aggiungere dopo; si parte
senza, perché tolto il giallo ingiustificato probabilmente non serve.

### Niente stati di scaricamento sull'asset

Non si aggiungono `downloading` o `error` alla disponibilità, come suggerirebbe
il testo di #217. Sono stati del **lavoro**, non del file: duplicati in due posti
prima o poi divergono, e una fonte resterebbe "in scaricamento" per sempre dopo
una chiusura dell'app.

L'interfaccia unisce due informazioni — disponibilità e lavoro attivo — per
mostrare una riga. È il prezzo di non avere stati duplicati.

## D8 — Leggere da remoto o dalla copia locale

*Approvata con modifiche il 2026-08-10.*

- **Automatica** (predefinita): se la pagina c'è in locale la usa, altrimenti la
  chiede al servizio della biblioteca;
- **Solo locale**: non tocca mai la rete; le pagine assenti appaiono come non
  disponibili invece di caricare lentamente;
- **Solo remoto**: ignora le copie locali. Serve a verificare che una copia
  scaricata corrisponda ancora all'originale.

### La modalità automatica è già "online di default"

Finché non si scarica nulla, tutto arriva da remoto. La differenza fra
automatica e "solo remoto" si vede unicamente sulle pagine che si è **deciso**
di scaricare — e lì usare la copia locale è esattamente ciò che si è chiesto
scaricandola.

Mettere "solo remoto" come predefinita renderebbe inutile ogni scaricamento
finché non si cambia anche l'impostazione: una trappola.

### La lettura remota non è un ripiego

Per sfogliare e ingrandire è **tecnicamente la scelta migliore**. Lo standard
IIIF serve le immagini a riquadri: si carica solo la porzione visibile, alla
risoluzione che serve. Scaricare un'immagine intera per guardarne un angolo è
più lento e più pesante.

Il locale serve per tre cose precise: lavorare senza rete, trascrivere a lungo
sulla stessa carta, e conservare il materiale anche se la biblioteca cambia
indirizzi o lo ritira.

### Condizioni d'uso delle biblioteche

Alcune istituzioni consentono la **consultazione** ma non lo **scaricamento
sistematico**. La modalità online permette di lavorare nel rispetto delle loro
condizioni, e per quelle fonti è l'unica ammessa.

Vale insieme all'obbligo di D2-bis di conservare e mostrare licenza,
attribuzione e istituzione dichiarate nel manifesto.

### Copia temporanea

Le immagini viste da remoto finiscono in una cache dell'applicazione, **non nel
deposito**: tetto di dimensione, scarto dei più vecchi. Non contano come
scaricate e non toccano gli stati di D7.

## D8-bis — Sapere sempre cosa si sta guardando

*Approvata il 2026-08-10.*

Con la modalità automatica, dentro lo stesso libro alcune carte arrivano dal
disco e altre dalla rete. **Va sempre dichiarato quale delle due**, per pagina,
non per fonte.

### L'indicatore

Accanto alla pagina visualizzata, un segno discreto con due valori:

- **copia locale** — il file è nel deposito;
- **copia online** — arriva dal servizio della biblioteca.

Un'immagine servita dalla cache temporanea (D8) si dichiara **online**: la cache
è un dettaglio di implementazione, non una terza condizione di cui l'utente
debba tenere conto.

Icona neutra con spiegazione al passaggio del mouse, secondo il vincolo di
interfaccia del progetto: niente pastiglie colorate, niente verde se non per
stati attivi.

**Perché conta**: su materiale d'archivio la differenza fra "l'ho scaricata a
marzo" e "la sto vedendo adesso dal server" è rilevante. Una copia locale può
essere vecchia rispetto a una ridigitalizzazione, e chi lavora su una lezione
dubbia deve sapere quale delle due sta leggendo.

### I collegamenti all'originale si conservano sempre

Anche quando la copia locale vince, gli indirizzi restano nei metadati e sono
raggiungibili in un clic:

- **`homepage`** dichiarata dal manifesto (Presentation API 3.0): è la pagina
  della biblioteca su quell'oggetto, fatta per le persone. Può esistere sia sul
  manifesto sia sulla singola carta, e in quel caso si usa quella della carta.
- **Indirizzo del manifesto**, come ripiego quando `homepage` manca.
- **Indirizzo dell'immagine** della singola pagina, già in `assets.remote_url`.
- **`provider`**: nome, logo e contatti dell'istituzione, già richiesti da
  D2-bis insieme a licenza e attribuzione.

L'azione *"apri l'originale in biblioteca"* è disponibile su ogni pagina, in
qualunque modalità di lettura, anche se la fonte è completa in locale. Serve
esattamente a togliersi un dubbio senza dover ricostruire a mano dove si era
preso il materiale.

## D9 — Dove si salva la modalità di lettura

*Approvata con modifiche il 2026-08-10.*

**Globale**, in `app_settings`, con forzatura temporanea nella sessione di
lettura corrente che non viene memorizzata.

**Scartato per fonte o per workspace**: la modalità dipende da *dove sei* — in
treno senza rete — non da *cosa stai studiando*. Per fonte sarebbe
un'impostazione da gestire decine di volte.

**Un'eccezione, che non è una preferenza**: le biblioteche che consentono la
consultazione ma non lo scaricamento sistematico (D8). Per quelle fonti il
contrassegno `download_allowed = 0` vince sulla globale e disabilita i comandi
di scaricamento. Non è una scelta dell'utente, è un vincolo dell'istituzione.

**Non serve una modalità "solo locale" per fonte**: con l'automatica, un libro
scaricato per intero legge già dal locale. L'unica differenza si vedrebbe su un
libro incompleto, dove "solo locale" mostrerebbe le pagine mancanti come non
disponibili invece di caricarle. Caso marginale, si aggiunge se emerge.

# Parte C — I lavori in background

È la parte che va fatta bene la prima volta: riconoscimento testo,
esportazioni, dataset e calcoli semantici useranno tutti questo impianto.

## D10 — Chi esegue i lavori

*Approvata il 2026-08-10.*

Un solo orchestratore dentro l'applicazione, avviato all'apertura.
Tiene in memoria la coda, legge e scrive lo stato sul database, e affida
l'esecuzione a un gestore registrato per tipo di lavoro. L'interfaccia non
esegue mai nulla di lungo: chiede la creazione di un lavoro e osserva.

**Scartato**: un processo separato che continua a lavorare ad app chiusa. La
issue stessa lo esclude per ora, e aggiungerebbe installazione, aggiornamento e
diagnosi di un secondo eseguibile.

**Comporta**: chiudendo Glossa i lavori si fermano. La ripresa è D13.

## D11 — Quanti lavori insieme

*Approvata con modifiche il 2026-08-10.*

Limiti separati per **classe di risorsa**, perché saturano cose diverse. Quattro
classi, non tre: il disco è a sé.

| Classe | Predefinito | Perché |
|---|---|---|
| Rete verso le biblioteche | dal profilo del provider (D18) | il collo di bottiglia è il loro server, non il nostro computer |
| Processore | processori disponibili meno uno | verifica del deposito, riconoscimento testo, indicizzazione |
| Disco | **1** | due lavori che scrivono gigabyte insieme sono più lenti di due in fila |
| Servizi linguistici | 1 | costano denaro e hanno limiti propri |
| Generazione documenti | 1 | scrive su disco, l'ordine conta |

### Configurabili, con una distinzione

**Processore, disco, servizi linguistici, documenti**: configurabili liberamente
in Impostazioni. Il limite giusto lo sa chi ha la macchina davanti.

**Rete: non è una questione di potenza.** Il limite verso una biblioteca dipende
dal loro server, non dal tuo computer. Configurabile, ma con l'avvertenza
accanto e un tetto non superabile — non per limitare l'utente, per non farlo
bandire. Vedi D18.

### I lavori brevi non si mostrano singolarmente

Lo scaricamento di una singola pagina dura pochi secondi. Se ogni pagina
comparisse nella scheda Lavori, il pannello diventerebbe illeggibile. I lavori
brevi girano come tutti gli altri ma si mostrano **solo se falliscono**.

## D12 — Chiusura dell'applicazione

*Approvata il 2026-08-10.*

Alla chiusura ogni lavoro in esecuzione passa a **in pausa** e
salva il punto raggiunto. Se la chiusura avviene mentre ci sono lavori attivi,
l'utente vede una richiesta di conferma con l'elenco.

**Scartato**: annullare tutto alla chiusura. Perdere venti minuti di
scaricamento perché hai chiuso la finestra è inaccettabile.

## D13 — Riapertura dopo un blocco o un arresto anomalo

*Approvata il 2026-08-10.*

Qui serve una distinzione, perché "riprendere" non vuol dire la stessa cosa per
tutti i lavori.

Due categorie, dichiarate da ogni tipo di lavoro:

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

*Approvata il 2026-08-10.*

La pausa è **cooperativa**. L'orchestratore segna il lavoro come
"in pausa richiesta"; il gestore la vede al confine dell'unità di lavoro
successiva — la pagina corrente, il file corrente — la porta a termine, salva
e si ferma. Non si interrompe niente a metà.

**Comporta**: mettere in pausa uno scaricamento richiede il tempo di finire la
pagina in corso, non è istantaneo. L'interfaccia deve mostrare "in pausa…" e poi
"in pausa", non fingere che sia immediato.

## D15 — Annullamento

*Approvata con modifiche il 2026-08-10.*

Cooperativo come la pausa: si segna la richiesta, il gestore la vede al confine
dell'unità di lavoro successiva e si ferma.

**Grazie all'area di transito (D16-bis) non c'è niente di parziale da pulire**:
i file a metà non sono mai entrati nel deposito. Si scarta la cartella di
transito e basta.

Un lavoro annullato è **terminale**: si può ripetere da capo, non riprendere.

### Cosa succede alle pagine già scaricate

Restano. Sono complete, verificate, e sono costate tempo — con i profili di D18
anche molto tempo.

Ma il momento dell'annullamento è quello giusto per offrire l'alternativa,
perché è lì che l'utente sta decidendo di rinunciare. La conferma propone due
strade:

- **Annulla** (predefinito): tiene le pagine già scaricate, che contano per una
  ripresa futura;
- **Annulla ed elimina le 34 pagine scaricate**: libera lo spazio subito.

La seconda non è una funzione nuova: è *"libera spazio"* di D6, offerta nel
posto dove serve. Il conteggio è esplicito, così si sa cosa si sta buttando.

## D16 — Errori e tentativi

*Approvata con modifiche il 2026-08-10, dopo lettura di Scriptoria.*

### Due livelli distinti

**Trasporto**, sulla singola richiesta: connessione caduta, timeout, errore 5xx.
Pochi tentativi ravvicinati, gestiti dal client HTTP, invisibili al lavoro.

**Lavoro**: quando anche il trasporto ha rinunciato. Numero di tentativi e
attese vengono dal profilo del provider (D18), non da costanti nel codice.

### Classificazione degli errori

| Situazione | Ritentabile | Attesa |
|---|---|---|
| Connessione caduta, timeout, 5xx | sì | esponenziale, base e tetto dal profilo |
| **403** | **sì** | raffreddamento lungo dal profilo (Gallica: 600 s) |
| **429** | sì | `Retry-After` se presente, altrimenti dal profilo |
| 404, file non trovato | no | — |
| Spazio esaurito, permesso negato | no | — |
| Formato non riconoscibile | no | — |

**Correzione a quanto avevo scritto prima**: avevo classificato il 403 come non
ritentabile. **Sbagliato per questi servizi**: su Gallica un 403 significa "stai
correndo troppo", non "vietato per sempre". Va ritentato dopo una lunga attesa.
Trattarlo come definitivo farebbe fallire scaricamenti perfettamente legittimi.

Le attese di partenza che avevo proposto — 2, 8, 30 secondi — erano **un ordine
di grandezza troppo brevi**: i profili tarati usano base 20 secondi e tetto 300.

### Un errore non è una stringa

Ogni errore porta con sé: se è ritentabile, quanto attendere, cosa mostrare
all'utente, cosa scrivere nel registro. Senza questo, la tabella qui sopra non è
applicabile.

## D16-bis — Area di transito e validazione

*Approvata il 2026-08-10.*

**Niente entra nel deposito prima di essere validato.** Ogni file scaricato
arriva in una cartella di transito, viene verificato, e **solo allora** viene
promosso nella sua posizione definitiva.

**La validazione è per decodifica, non per dimensione**: si apre l'immagine e si
verifica che sia leggibile. Un file troncato ha la dimensione giusta nei
metadati HTTP ma non si apre — un controllo di dimensione non lo vedrebbe.

**Quanto a fondo** *(deciso il 2026-08-12, implementando la PR 1)*: firma
iniziale e terminatore, senza decomprimere i pixel. Coglie i due casi reali — il
download troncato e la pagina di errore HTML servita con stato 200 — a memoria
costante e senza una libreria di immagini. Non coglie la corruzione interna con
gli estremi intatti, che è rara e ha comunque lo stesso rimedio: riscaricare la
carta. Le immagini sono copie sostituibili, non originali: un controllo più
severo si aggiunge quando servirà, non prima.

Conseguenze:

- un file parziale **non esiste mai** nel deposito: non serve pulirlo
  all'annullamento (D15) e una ripresa non rischia di saltarlo credendolo
  completo;
- il conteggio della disponibilità (D7) non sovrastima mai;
- l'annullamento è banale: si scarta la cartella di transito.

È anche un requisito già scritto in #218 — *"output promossi solo dopo
validazione"* — e vale per tutti i tipi di lavoro, non solo per lo
scaricamento: un PDF generato a metà non deve comparire fra gli artifact.

## D17 — Avanzamento

*Approvata con modifiche il 2026-08-10.*

### Il dato

Il gestore aggiorna il progresso **al massimo una volta al secondo**, e comunque
a ogni cambio di stato. Il valore va sul database e all'interfaccia con un
evento. Aggiornare a ogni byte scriverebbe sul database centinaia di volte al
secondo.

### Il disegno

**La barra si muove con continuità**, interpolando fra un valore e il successivo.
Il dato arriva a scatti di un secondo, il disegno no: nessun costo aggiuntivo, e
si evita l'effetto a singhiozzo.

### Il limite: mai animare un avanzamento che non esiste

Con i profili di D18 un lavoro può restare **fermo per minuti** — fino a dieci
dopo un 403 — rispettando i limiti della biblioteca. In quella condizione la
barra **si ferma**. Non striscia, non finge.

Interpolare comunque mostrerebbe un progresso inventato, ed è il caso peggiore:
si continua ad aspettare fidandosi di un numero falso. Meglio una barra immobile
con scritto *"in attesa, riprende fra 8 minuti"*.

Vale la distinzione di D18: *"in attesa per rispettare i limiti della
biblioteca"* e *"in errore"* sono la stessa immobilità con due significati
opposti, e vanno dette diversamente.

### Tempo stimato

**Obbligatorio**, non facoltativo: un lavoro che dura un quarto d'ora senza una
stima sembra bloccato. Si calcola dalle pagine completate e dalla pausa media
dichiarata dal profilo, non dalla velocità osservata degli ultimi secondi, che
con pause di 2,5–6 secondi oscilla troppo per essere utile.

### Movimento ridotto

L'animazione rispetta la preferenza di sistema per il movimento ridotto: in quel
caso la barra salta al valore invece di interpolare.

## D18 — Profilo di rete, dichiarato dal provider

*Approvata con modifiche il 2026-08-10, dopo lettura di Scriptoria.*

### Dove vive

**Nel registro dei provider** (`iiif/mod.rs`, #214), accanto a resolver, handler
di ricerca e filtri. Non in una tabella separata con le stesse chiavi.

Il motivo: due elenchi indicizzati per la stessa chiave prima o poi divergono.
Aggiungere una biblioteca deve significare compilare **un** record. Scriptoria
li tiene ancora separati (`network_policy.py` e `providers.py`), ed è la sola
cosa che non copio.

### Il profilo dichiara

- **pausa fra richieste**, minima e massima, di durata casuale nell'intervallo;
- **limite a raffica**: quante richieste in quanti secondi, a finestra
  scorrevole, indipendente dalla concorrenza;
- **concorrenza per host** e **worker per lavoro** (sono due cose diverse);
- **tentativi** del lavoro, **base** e **tetto** dell'attesa esponenziale;
- **raffreddamento** dopo un 403 e dopo un 429;
- se rispettare `Retry-After` (sempre, negli attuali);
- **timeout** di connessione e di lettura;
- **header di provenienza** da inviare;
- **preriscaldamento del visualizzatore**: alcuni servizi richiedono di
  visitare la pagina del lettore per ottenere una sessione prima di servire le
  immagini.

### I profili tarati, importati da Scriptoria

Valori ottenuti da prove reali sul campo, non stimati.

| Biblioteca | Pausa | Raffica | Cooldown 403 | Cooldown 429 | Worker | Per host |
|---|---|---|---|---|---|---|
| **Gallica** | 2,5–6 s | 20 / 60 s | 600 s | 300 s | 1 | 2 |
| **Internet Culturale** | 1–3 s | 40 / 60 s | 300 s | 300 s | 2 | 2 |
| **Vaticana** | 0,6–1,6 s | 100 / 60 s | 120 s | 120 s | 2 | 4 |
| Bodleian | 0,6–1,6 s | 100 / 60 s | 120 s | 120 s | 2 | 4 |
| Institut de France | 0,6–1,6 s | 100 / 60 s | 120 s | 120 s | 2 | 4 |
| Estense | 0,6–1,6 s | 100 / 60 s | 120 s | 120 s | 2 | 4 |
| **predefinito prudente** | 0,6–1,6 s | 100 / 60 s | 120 s | 120 s | 2 | 4 |

Tentativi: 3 per Gallica, 4 per Internet Culturale, 5 per le altre. Attesa: base
20 s per Gallica, 15 s altrove; tetto 300 s per tutte. Timeout: 10–15 s per
connettersi, 30 s per leggere.

La Vaticana richiede il **preriscaldamento del visualizzatore**. Tutte inviano
l'header di provenienza.

### Precedenza, tre livelli

1. **modifica dell'utente**, salvata nel database per chiave provider o per host;
2. **profilo del registro**, compilato nell'applicazione;
3. **profilo prudente predefinito**.

Il secondo garantisce che i valori tarati arrivino corretti a chi installa; il
primo che si possano cambiare senza ricompilare.

### Profilo dal provider, contatori per host

Il profilo lo dichiara il provider; i contatori — raffica, concorrenza,
raffreddamento — si tengono **per host**. Un provider può usare host diversi per
ricerca e immagini, e il server che si affanna è quello delle immagini.

Le fonti aggiunte per indirizzo diretto non hanno una voce nel registro: per
quelle vale il profilo prudente, con contatori per host. **Nessuna fonte resta
senza politica.**

### La conseguenza che cambia il resto del blocco

Con i valori di Gallica, un manoscritto di 210 carte richiede **almeno un quarto
d'ora**: il solo limite a raffica impone dieci minuti e mezzo, e un worker con
pausa media di 4 secondi porta a circa quindici.

Quindi:

- **pausa e ripresa non sono un ornamento**: nessuno resta a guardare quindici
  minuti, l'app verrà chiusa a metà;
- **il tempo stimato è obbligatorio** in barra di stato e scheda Lavori,
  altrimenti sembra bloccato;
- il messaggio deve distinguere *"in attesa per rispettare i limiti della
  biblioteca"* da *"in errore"*: sono la stessa immobilità con due significati
  opposti.

### Identificazione

Le richieste identificano l'applicazione, come chiede la buona pratica IIIF.
Insieme alle dichiarazioni di licenza e attribuzione che D2-bis impone di
conservare, è la parte non tecnica dell'aderenza allo standard.

# Parte D — Cosa vede l'utente

L'architettura di queste tre decisioni vive in **#413**, che riguarda la shell e
non questo blocco. Qui restano le scelte che toccano i lavori.

## D19 — Barra di stato

*Approvata con modifiche il 2026-08-10.*

**Uguale in ogni sezione**, tre zone fisse: a sinistra il contesto (l'unica parte
che cambia), al centro l'indicatore lavori, a destra lo stato di salvataggio e
la maniglia del pannello.

L'indicatore è **sempre presente**, non solo dove il lavoro è stato avviato: uno
scaricamento parte dalla Biblioteca e prosegue mentre si lavora altrove.

Compatto e denso:

```
⣾ 3 lavori · Beatus, 34/210 · ~12 min
```

Quanti in coda, quello corrente, tempo stimato (obbligatorio, D17).

Fermo per rispettare i limiti di una biblioteca — frequente, con i profili di
D18:

```
⏸ in attesa · riprende fra 8 min
```

Senza animazione. La distinzione fra **in attesa** e **in errore** è visiva e
testuale: sono la stessa immobilità con significati opposti.

## D20 — Dove si vedono i lavori

*Approvata con modifiche il 2026-08-10.*

**Nel pannello in basso, come scheda accanto ai log.** Non un'area globale, non
un pulsante in alto a destra.

Il modello è il pannello di VS Code, dove terminale, problemi e output sono
schede della stessa area: log e lavori sono le due facce della domanda "cosa sta
facendo il programma".

Tre sezioni: **in corso**, **in attesa**, **terminati oggi**. Per ciascuno
descrizione leggibile — *"Scaricamento Beatus di Girona, pagina 34 di 210"* —
avanzamento, tempo stimato e i comandi ammessi dal suo stato, come icone neutre
con spiegazione al passaggio del mouse.

**I lavori brevi non compaiono singolarmente** (D11): lo scaricamento di una
pagina dura pochi secondi, e duecento righe da due secondi rendono il pannello
illeggibile. Compaiono solo se falliscono.

**Scartato — un pulsante in alto a destra**: quella zona è per la configurazione,
lingua e impostazioni. Ospitare uno stato operativo che cambia di continuo
mescola due registri. I browser lo fanno perché non hanno un pannello in basso.

**Scartato — un mini-pannello separato dal pannello completo**: due posti per
leggere le stesse cose sono una tassa di apprendimento. Al passaggio del mouse
un riepilogo breve, al clic il pannello sulla scheda Lavori. Una destinazione
sola.

## D21 — Quando avvisare

*Approvata con modifiche il 2026-08-10.*

**Nessun avviso per il singolo lavoro riuscito.** Duecento notifiche per uno
scaricamento sono rumore.

**Un avviso quando una richiesta dell'utente si conclude interamente**:
*"Beatus di Girona scaricato, 210 pagine"*.

**Un avviso quando qualcosa fallisce**, con il motivo e l'azione possibile.

### Notifica di sistema a finestra non attiva

Con i profili di D18 uno scaricamento dura un quarto d'ora: abbastanza perché
l'utente sia andato a fare altro. Quando la finestra non è in primo piano, il
completamento e il fallimento passano anche dalle notifiche del sistema
operativo.

Solo quei due casi, e solo a finestra non attiva: se Glossa è davanti,
l'indicatore in barra basta e una notifica di sistema sarebbe invadente.

# Parte E — Registrazione del lavoro svolto

Fondazione di #378, prima sub-issue dell'epic Analisi #377.

**Perché sta nel blocco 1 e non alla fine**: la registrazione non è recuperabile
a posteriori. Ogni giorno in cui Glossa lavora senza registrare produce dati che
non esisteranno mai. L'area Analisi (#379) arriva dopo, quando ci sarà qualcosa
da mostrare.

## Il dato che oggi si perde

La #380 mette fra i dataset previsti la coppia **"output rifiutato / output
preferito"**: non "come si traduce", ma *come traduce questo studioso invece del
modello*. È il materiale di maggior valore per l'addestramento, ed è irripetibile
perché è un giudizio umano.

Oggi la tabella `translations` **non ha storico**: `translation_display_text` è
una colonna sovrascritta in place da un `INSERT ... ON CONFLICT DO UPDATE`. Non
esiste da nessuna parte un registro che dica *"il modello aveva proposto X,
l'umano ha approvato Y, il giorno Z"*.

`transcription_revisions` esiste per le trascrizioni. Per le traduzioni no:
asimmetria da colmare.

I risultati per stadio sopravvivono in `stage_results`, quindi in alcuni casi
l'ultima proposta del modello resta per caso. Ma non è registrato **che** un
umano abbia cambiato qualcosa, **quando**, né **cosa** — che è precisamente ciò
che la #378 chiede: *"accettazione, rifiuto o modifica umana, con diff tra
proposta e risultato approvato"*.

## D22 — Storico delle traduzioni

*Approvata con modifiche l'11 agosto 2026.*

Nuova tabella `translation_revisions`, simmetrica a `transcription_revisions`.

**Non una revisione per salvataggio**: si scriverebbero centinaia di righe per
battitura, senza valore analitico. **Solo i due momenti che contano:**

- **`model`** — quando la pipeline produce la traduzione di un chunk;
- **`human`** — quando l'utente scrive la propria versione.

La revisione umana conserva il riferimento a quella da cui deriva. Da lì la
coppia proposta/approvata è ricostruibile per intero, e il diff si calcola
quando serve invece di conservarlo — così non può disallinearsi dai testi.

### Le revisioni non hanno uno stato di approvazione

Prima avevo messo una casella `approved` sulla revisione. **Sbagliato**: se
l'approvazione si sposta, bisogna modificare righe di uno storico che deve
essere immutabile.

Il modo di lavorare reale è questo: si approva un chunk, si va avanti, e più
tardi — con la terminologia che si assesta e la comprensione del testo che
matura — si torna indietro a cambiarlo. Oggi in Glossa quel gesto esiste già ed
è `translations.translation_locked`, che si toglie e si rimette
(`chunksStore.ts`), e che già protegge il chunk dalla riesecuzione in blocco
(`engine.ts`, modalità *rerun-unlocked*). È quindi il segnale giusto da cui
generare l'evento di approvazione.

Quindi, coerentemente col principio della #377 — *stato corrente nelle tabelle
di dominio, provenienza nel registro append-only*:

- le **revisioni sono testi immutabili**, senza stato;
- **approvare e ritirare l'approvazione sono eventi** che puntano a una
  revisione;
- `translations` porta un **puntatore alla revisione approvata adesso**, per la
  lettura veloce.

Lo scenario diventa: si approva la revisione 2 (evento), ci si accorge
dell'errore e si ritira (evento), si corregge creando la 3 (revisione nuova,
derivata dalla 2), si approva la 3 (evento). **Nessuna riga modificata, storia
completa.**

La versione ritirata resta, e **vale**: *"approvata e poi superata"* dice che
quella traduzione sembrava giusta e non lo era. Per l'addestramento è
informazione, non rumore.

L'approvazione si registra **anche quando l'utente non modifica nulla**:
l'accettazione è un giudizio, e per il preference training vale quanto una
correzione. Registrare solo le correzioni produrrebbe un dataset sbilanciato
verso gli errori.

### Lo stesso vale per le trascrizioni

`transcription_revisions` ha oggi una colonna `status` con `draft`, `approved`,
`rejected`: stesso difetto, perché l'approvazione che si sposta obbliga a mutare
lo storico. Va allineata al modello a eventi.

### Stato del documento

Serve un `in lavorazione / completato` a livello di documento, per due motivi
distinti da quelli sopra:

- **filtro di qualità per i dataset**: un documento su cui si sta ancora
  lavorando ha chunk bloccati provvisoriamente, mentre la terminologia si
  assesta. Poterli escludere è utile;
- **avanzamento**: Dashboard e area Analisi devono sapere quali lavori sono
  finiti.

**Non è un interruttore che abilita la registrazione.** Si registra sempre.

### Il principio che governa tutto questo

**Non si decide al momento della registrazione cosa conterà come "preferito".**
Si registrano i fatti; il significato lo attribuisce il costruttore di dataset
(#380) al momento dello scatto.

Perché la risposta cambierà: oggi si vorranno solo i documenti finiti, fra un
anno forse anche il resto, per studiare come evolvono le correzioni. Inciderla
adesso nella registrazione significa portarsela dietro per sempre.

Uno scatto prende la **revisione approvata in quel momento**: il chunk sistemato
alle 16 esporta la versione delle 16, mai quella delle 10. Il problema della
versione superata non si presenta.

## D23 — Un registro dei fatti, non tre

*Approvata l'11 agosto 2026.*

Oggi esistono `operation_logs`, che alimenta la console, e `provenance_events`,
vuota e molto più povera di quanto la #378 richieda.

**La telemetria costi non esiste ancora.** #342 la chiede in una tabella
dedicata, e dice esplicitamente che oggi il costo è solo un preventivo calcolato
al volo, senza storico. È un requisito aperto, non un terzo registro da
riconciliare — e la decisione qui è di **non** creare quella tabella dedicata:
il costo è un attributo del fatto, e sta in `provenance_events` accanto a
modello, token e durata. Così #342 si soddisfa senza aggiungere un posto in più.

**La regola di smistamento:**

| Se… | Va in |
|---|---|
| lo raggrupperesti in un grafico | `provenance_events` |
| serve solo a un umano che legge la console | `operation_logs` |
| è un valore calcolato dopo, ricalcolabile | `derived_metrics` |

`operation_logs` resta il **log tecnico**: effimero, cancellabile, nessun valore
analitico.

`provenance_events` diventa il **registro dei fatti**: append-only, mai
cancellato, immutabile. Il costo entra qui, come attributo dell'evento che lo ha
generato.

`derived_metrics` è nuova e separata **per una ragione precisa**: la #378 chiede
*"invalidazione e ricalcolo sicuro delle metriche quando cambia una revisione"*.
Un fatto non si invalida mai — è successo. Una metrica sì, quando cambia
l'input o l'algoritmo. Sono due nature diverse e non stanno nella stessa tabella.

## D24 — Cosa è colonna e cosa è JSON

*Approvata l'11 agosto 2026.*

**Colonna** tutto ciò per cui si vorrà raggruppare, filtrare o ordinare:
momento, tipo di evento, entità, workspace, attore, lavoro, esito, durata,
provider, modello, versione del prompt, token in ingresso e in uscita, token da
cache, costo stimato, coppia linguistica, tipo di errore.

**JSON** il resto: parametri completi della chiamata, dettagli specifici del
tipo di evento.

**Il motivo**: le interrogazioni dell'area Analisi raggruppano per modello, per
coppia linguistica, per periodo. Dentro un campo JSON quelle interrogazioni
funzionano ma non si indicizzano bene, e un pannello che legge decine di
migliaia di righe diventa lento nel momento peggiore — quando finalmente ci sono
abbastanza dati per essere interessante.

## D25 — Impronta del contenuto su ogni evento

*Approvata l'11 agosto 2026.*

Ogni evento che consuma o produce testo conserva l'**impronta** di ciò che ha
visto, non solo il riferimento all'oggetto.

Senza, due requisiti della #380 sono inapplicabili: *"lo stesso snapshot produce
sempre lo stesso manifest e gli stessi record"* e *"un dataset non cambia
silenziosamente quando cambia l'oggetto originale"*. Il riferimento punta allo
stato **corrente**; l'impronta dice cosa c'era **allora**.

## D26 — Cosa non si registra

*Approvata l'11 agosto 2026.*

Il principio è nella #377: dati con significato scientifico, operativo o
addestrativo, **non clickstream indiscriminato**.

Quindi **no**: navigazione, clic, scorrimento, battiture, tempo passato su una
schermata, ricerche digitate.

**Sì**: chiamate ai modelli con il loro esito, decisioni umane su una proposta,
ciclo di vita dei lavori, import e scaricamenti, esportazioni, metriche
calcolate.

**Niente lascia la macchina.** Nessuna telemetria esterna, nemmeno anonima,
nemmeno facoltativa in questa fase.

## D27 — Idempotenza

*Approvata l'11 agosto 2026.*

La #378 chiede eventi idempotenti. Serve perché un lavoro ritentato (D16)
rieseguirebbe lo stesso passo: senza protezione, un manoscritto scaricato dopo
tre tentativi risulterebbe scaricato tre volte, e ogni conteggio sarebbe
sbagliato.

**Identificativo derivato in modo deterministico** da lavoro, entità e tipo di
evento, con vincolo di unicità. Riscrivere lo stesso evento non duplica:
sostituisce.

**Il numero del tentativo non entra nella chiave.** Se ci entrasse, ogni
tentativo produrrebbe una chiave diversa e quindi un evento diverso — cioè
esattamente la duplicazione che questa decisione vuole impedire. Quante volte si
è ritentato è già in `jobs.attempt_count`: è un dato del lavoro, non un fatto
separato da registrare.

## D28 — Conservazione

*Approvata l'11 agosto 2026.*

**`provenance_events` non si cancella mai automaticamente.** È il registro
storico del lavoro.

Il volume non è un problema: un libro di 300 pagine sono circa 600 chunk per
quattro stadi, più giudizi e correzioni — sull'ordine delle 5.000 righe per
libro. Per SQLite è niente, e possiamo permetterci di registrare tutto ciò che
ha significato invece di scegliere in anticipo cosa sacrificare.

`operation_logs` si può scartare per età o dimensione: è il log tecnico.

Cancellazione **su richiesta esplicita** dell'utente, per oggetto o per
workspace, come chiede la #378 con le sue "politiche di esclusione e
cancellazione".

## D29 — Quando si accende

*Approvata l'11 agosto 2026.*

**La registrazione parte con le fondamenta**, l'area Analisi no. Sono due lavori
diversi e il secondo senza il primo non ha nulla da mostrare.

In pratica: scrivere gli eventi diventa **parte del contratto del gestore di
lavoro** (D-appendice) — ogni lavoro registra avvio, esito, durata e costo senza
che chi lo scrive debba ricordarsene. E si aggiunge ai percorsi della pipeline
già esistenti, dove oggi si scrive solo su `operation_logs`.

# Parte F — Spostamento, backup ed esportazioni

Decise l'11 agosto 2026. Erano le tre domande rimaste aperte, più la cifratura
emersa discutendole. Nessuna aggiunge un'impostazione da configurare.

## D30 — Spostare il deposito

*Approvata l'11 agosto 2026.*

**Prima si copia tutto, poi si cancella.** Non file per file con cancellazione
immediata: a metà strada l'origine sarebbe incompleta, e tornare indietro
richiederebbe un'operazione inversa da scrivere e da testare.

1. **Controllo preventivo**: si misura il deposito, si legge lo spazio libero
   nella destinazione, si pretende la dimensione più un margine. Se non basta,
   ci si rifiuta di partire, con i numeri in chiaro.
2. **Copia integrale**, verificando ogni file. L'origine non si tocca.
3. Solo a copia completa e verificata: si sposta il puntatore.
4. **Poi**, come passo separato, si cancella l'origine.

**Fino al passo 3 l'installazione funziona come prima**, perché l'origine è
intatta. Annullare significa cancellare la copia parziale nella destinazione:
non si perde niente e non c'è niente da ripristinare.

Se lo spazio finisce lo stesso — disco di rete, un altro processo che scrive —
il lavoro **si mette in pausa**: si libera spazio e si riprende saltando i file
già verificati, oppure si annulla. In entrambi i casi il deposito buono è ancora
al suo posto.

**Il prezzo**: serve spazio pari all'intero deposito nella destinazione. Ma la
destinazione si sceglie *perché* ha spazio — è il motivo per cui si sta
spostando. In cambio, "posso tornare indietro?" ha una risposta banale: sì,
sempre, perché non è stato cancellato niente.

## D31 — Cosa contiene un backup

*Approvata l'11 agosto 2026.*

**Solo il database, mai le immagini.** Discende da D6: le immagini si
riscaricano, tutto il resto no.

Un backup da 40 GB non si fa. Uno da pochi megabyte si fa ogni settimana, e
contiene le uniche cose irrecuperabili: schede, note, trascrizioni, traduzioni,
glossari, memoria di frasi e — da ora — lo storico del lavoro (Parte E).

**Ciò che rende indolore l'esclusione**: il backup annota *quali* fonti erano
scaricate e a che risoluzione. Al ripristino Glossa propone *"riscarico le 12
fonti che avevi?"*. Si recupera tutto; ci vuole tempo, ma non si è mai dovuto
portare in giro i gigabyte.

Chi vuole comunque le immagini al sicuro ha già la strada: deposito su cartella
sincronizzata (D1).

**Compresso**, in un archivio standard: il contenuto è testo, e le traduzioni si
comprimono di circa dieci volte. Dentro, un manifesto con versione dello schema
e impronta, per riconoscere un file troncato prima di tentare il ripristino.

**La compressione non è la scusa per infilarci le immagini più avanti.** La
regola resta questa.

## D32 — Spazio su disco

*Approvata l'11 agosto 2026.*

**Nessun tetto da impostare**: è un numero che nessuno sa scegliere.

**Prima di partire**: si stima la dimensione dalle prime pagine e si confronta
con lo spazio libero. Se non ci sta, ci si rifiuta con i numeri in chiaro —
*"servono circa 4,2 GB, liberi 1,1"*.

**Durante**: se lo spazio libero scende sotto una soglia di sicurezza, il lavoro
**si mette in pausa** invece di riempire il disco. Riprende quando si è fatto
spazio.

Il secondo conta più del primo: riempire il disco di sistema non danneggia solo
Glossa.

## D33 — Riservatezza di backup ed esportazioni

*Approvata l'11 agosto 2026.*

Tre livelli, ognuno risponde a una domanda diversa. Stessa macchina per i backup
e per le esportazioni di workspace o pipeline.

| Livello | A cosa serve | Cosa non fa |
|---|---|---|
| **Aperto** | usare i dati con altri strumenti, controllarli | niente riservatezza |
| **Solo Glossa** | evitare aperture per sbaglio o per curiosità | non ferma chi ha competenze tecniche |
| **Con password** | riservatezza vera | non impedisce al destinatario di ridistribuire il contenuto decifrato |

### Il livello di mezzo, e perché non si chiama "protetto"

Se il programma apre il file senza chiedere nulla, **la chiave è dentro il
programma**, che è pubblico. È offuscamento, non cifratura.

Ha però un valore reale che lo zip non ha: un archivio si rinomina e si apre con
due clic, un formato offuscato no. Contro un destinatario non tecnico è una
barriera vera. È la busta con scritto "non aprire".

Beneficio collaterale che non riguarda il segreto: **un formato non modificabile
a mano non viene modificato a mano**, e non torna indietro corrotto da una
reimportazione.

Nel momento della scelta va scritto senza giri di parole: *"chi ha competenze
tecniche può comunque leggerlo"*. Mai chiamarlo protetto o sicuro, e mai
proporlo come opzione per materiale sensibile.

**Cautela**: un formato che apre solo Glossa rende i dati ostaggio del
programma. Quindi formato documentato, e conversione verso "aperto" sempre
possibile senza password.

### Il livello con password

**Argon2id** per derivare la chiave — resistente agli attacchi con schede
grafiche. È l'unica libreria nuova: **AES-256-GCM è già nel progetto**, usato da
`keystore.rs` per le chiavi dei provider.

- cifratura **a blocchi**, non in un colpo solo: un backup da mezzo giga non si
  carica in memoria;
- **intestazione in chiaro** con versione del formato e parametri della
  derivazione, per poterlo decifrare fra anni anche dopo averli cambiati;
- **password sbagliata distinguibile da file danneggiato**, con una verifica
  nell'intestazione: un generico "non funziona" lascia l'utente a chiedersi se
  ha perso i dati o solo sbagliato a digitare;
- password conservabile nel portachiavi di sistema per i ripristini sulla stessa
  macchina, ma **mostrata e confermata alla creazione**: se il computer muore, il
  portachiavi muore con lui.

**Nessun recupero password.** Qualunque via di recupero è una seconda chiave e
vanifica la cifratura.

**Spento di default**, con la conseguenza scritta a chiare lettere al momento
della scelta: password dimenticata, backup perduto. Il backup è ciò a cui si
ricorre quando tutto il resto è già andato storto, e cifrarlo aggiunge un modo
di fallire proprio in quello scenario.

### Cosa non c'è nel backup

Le chiavi dei provider **non sono nel backup**: stanno nel portachiavi di
sistema o in un file cifrato a parte (`keystore.rs`). Il rischio che la
cifratura copre è la riservatezza del lavoro non pubblicato, non le credenziali.

# Parte G — Come lo spezzerei in PR

Ordine obbligato, ogni PR verificabile da sola.

## Come si verifica ogni PR

**Regola per tutte e sette.** Una PR non è pronta quando il codice funziona: è
pronta quando è stato verificato che fa quello che questo documento aveva
deciso.

Il documento è stato riletto tre volte e ogni volta sono emerse cose diverse,
perché i difetti hanno nature diverse e si trovano con metodi diversi. Lo stesso
vale per il codice. In ordine di importanza:

1. **Fatti** — ogni affermazione sul codice esistente va riscontrata nel codice,
   non ricordata. È il livello dove si sbaglia di più, ed è invisibile a chi non
   legge codice. Al terzo giro su questo documento è emerso così che una
   premessa di D23 era falsa: davo per esistente una telemetria dei costi che
   non esiste.
2. **Logica** — ogni regola va verificata contro sé stessa. D27 conteneva una
   chiave di deduplicazione che includeva il numero del tentativo, e avrebbe
   quindi prodotto esattamente la duplicazione che voleva impedire.
3. **Forma** — rimandi, terminologia, coerenza fra parti scritte in giorni
   diversi.

### Cosa va nel corpo della PR

Una **mappatura esplicita, decisione per decisione**: il numero (`D4`,
`D16-bis`, …), cosa è stato implementato, e se ci si è discostati, perché. Le
decisioni della stessa area non implementate in quella PR vanno elencate come
tali.

Non è burocrazia: è l'unico modo che ha chi non legge codice di controllare che
il costruito corrisponda al deciso, invece di doversi fidare.

---

**PR 1 — deposito e disponibilità reale.**
Struttura delle cartelle, calcolo e scrittura delle impronte, disponibilità
calcolata dai file presenti, tre modalità di lettura. Nessuno scaricamento
ancora: si popola a mano nei test. In Biblioteca compare lo stato reale di ogni
fonte. Copre #217.

**PR 2 — orchestratore dei lavori, a vuoto.**
Coda, stati, limiti di concorrenza, pausa, annullamento, tentativi, ripresa al
riavvio, comandi di creazione e osservazione. Con un solo tipo di lavoro finto,
che serve unicamente ai test. Nessuna interfaccia. Copre metà di #218.

**PR 3 — barra di stato e pannello lavori.**
L'interfaccia sopra la PR 2, ancora con il tipo finto. Si vede una coda
funzionare, si mette in pausa, si annulla, si chiude e si riapre l'app. Copre
l'altra metà di #218 e la parte di **#413** che serve ai lavori: indicatore in
barra e scheda Lavori nel pannello. Barra di stato unificata, stato di
salvataggio generalizzato e console di log estesa restano a #413, che è lavoro
di shell.

**PR 4 — scaricamento vero.**
Il primo gestore reale: dal manifesto alle pagine sul disco, con ripresa,
salto dei file già validi, e i limiti di cortesia del profilo di rete (D18).

**PR 5 — risorse condivise e ambito.**
#213. Indipendente dalle quattro sopra: si può fare in parallelo se serve.

**PR 6 — registrazione del lavoro svolto.**
Parte E, cioè #378. Storico delle traduzioni, `provenance_events` allargata,
`derived_metrics`, scrittura automatica dagli handler di lavoro e dai percorsi
della pipeline. Nessuna interfaccia: l'area Analisi è #379 e viene dopo.

**Va fatta presto, non ultima.** Ogni giorno senza registrazione è materiale
perduto per sempre — in particolare la coppia proposta/approvata delle
traduzioni, che oggi viene sovrascritta a ogni correzione. Se la PR 2
(orchestratore) è pronta, questa può procedere in parallelo alla 4.

**PR 7 — backup, esportazioni e riservatezza.**
Parte F: backup compresso con l'elenco delle fonti da riscaricare, tre livelli
di riservatezza, cifratura con password. Dipende dalla PR 2 per lo spostamento
del deposito come lavoro, e va coordinata con #407, che porta backup e
ripristino sullo stesso schema dell'import.

**Fuori da questa suddivisione**: chiudere o restringere #210 (shell 2.0). Un
ritaglio è già stato estratto in #413; cosa resti da fare o da archiviare va
deciso guardando la issue nel suo insieme.

---

# Domande aperte

Nessuna. Le tre rimaste — spostamento del deposito, contenuto del backup, limite
di spazio — sono state decise l'11 agosto 2026 e sono nella Parte F, insieme
alla riservatezza emersa discutendole.

Quello che resta fuori è dichiarato dove serve: il livello bibliografico per gli
stampati (D2-bis, materia di #404), l'architettura della shell (Parte D,
materia di #413), i lettori per i formati non supportati (#192) e il ripristino
da backup portato allo stesso schema dell'import (#407).

---

# Appendice tecnica

## Nota sullo schema: forma finale subito, consolidamento una volta sola

*Corretta il 2026-08-12, implementando la PR 1.*

Glossa è alla 1.4 ma **non la usa nessuno**: nessun dato utente da migrare,
nessuna retrocompatibilità da preservare. Le tabelle prendono quindi la loro
**forma finale subito**, senza rattoppi né colonne tenute in vita per
compatibilità. Su questo la prima stesura non cambia.

Cambia **come** ci si arriva. La prima stesura diceva di riscrivere le tabelle
pulite dentro `0001_baseline_2_0.sql` a ogni passo. Non si può fare per PR:
sqlx registra in `_sqlx_migrations` le migrazioni già applicate **con
l'impronta del loro contenuto**, e una migrazione già applicata che cambia sotto
i piedi fa fallire l'avvio su ogni database esistente — compresi quelli di
sviluppo, sette volte nelle sette PR. È anche la convenzione dichiarata in testa
a `db.rs`: ogni cambiamento è un file nuovo.

Quindi: **ogni PR aggiunge un file di migrazione numerato**; il consolidamento
in un'unica baseline pulita si fa **una volta sola**, prima del primo uso reale,
buttando i database di sviluppo. Si ottiene lo schema leggibile che si voleva,
senza rompere l'avvio nel frattempo.

**Costo accettato**: fino ad allora, per sapere che forma ha una tabella si
legge la baseline più i file successivi.

Sotto ci sono solo le tabelle nuove, per esteso, e le colonne da aggiungere a
quelle esistenti, in forma di elenco: è la **forma finale** da raggiungere, non
il contenuto letterale di `0001`.

## Modifiche allo schema

### Deposito, disponibilità e scaricamento (Parti A e B)

Colonne da aggiungere alle tabelle esistenti.

**`assets`**

| Colonna | Tipo | Perché |
|---|---|---|
| `page_index` | INTEGER | numero progressivo dal manifesto, per ordinare (D2) |
| `page_label` | TEXT | etichetta della biblioteca, solo da mostrare (D2) |
| `size_tag` | TEXT | la stessa carta esiste in più risoluzioni (D4) |
| `homepage_url` | TEXT | pagina della biblioteca sulla carta, se dichiarata (D8-bis) |

**`source_versions`**

| Colonna | Tipo | Perché |
|---|---|---|
| `download_policy` | TEXT, default `standard` | `standard` o `max` (D4) |
| `image_service_profile` | TEXT | capacità dichiarate da `info.json` (D4) |
| `homepage_url` | TEXT | collegamento umano all'originale (D8-bis) |
| `download_allowed` | INTEGER, default 1 | vincolo dell'istituzione (D9) |
| `expected_asset_count` | INTEGER | senza, `complete` non è calcolabile (D7) |

```sql
CREATE INDEX idx_assets_version_page
  ON assets(source_version_id, page_index, size_tag);
```

Impostazioni in `app_settings`: `vault_root` (vuoto = dentro la cartella dati,
D1), `source_read_mode` (`auto` predefinito, D8-D9), `download_size_cap`
(`2000`, D4), `verify_vault_on_startup` (`0`, D5), `remote_image_cache_mb`
(`512`, D8).

### Registrazione del lavoro svolto (Parte E)

```sql
-- Storico delle traduzioni (D22). Testi immutabili, nessuno stato di
-- approvazione: l'approvazione e' un evento, vedi sotto.
CREATE TABLE translation_revisions (
  id TEXT PRIMARY KEY,
  translation_id TEXT NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL CHECK (created_by IN ('model', 'human', 'import')),
  -- Per una revisione umana: la versione da cui deriva, che puo' essere una
  -- proposta del modello o una precedente revisione umana ritirata.
  derived_from_revision_id TEXT REFERENCES translation_revisions(id) ON DELETE SET NULL,
  content_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (translation_id, revision_number)
);

-- transcription_revisions perde la colonna `status`: stesso difetto della
-- casella `approved`, l'approvazione che si sposta obbligherebbe a mutare lo
-- storico. Diventa un evento come per le traduzioni (D22).

-- provenance_events: cio' per cui si raggruppa diventa colonna (D24).
-- Forma finale: le colonne gia' presenti piu':
--   status, started_at, finished_at, duration_ms
--   provider, model, prompt_template_id, prompt_version
--   input_tokens, output_tokens, cached_input_tokens, cost_estimated
--   source_language, target_language, error_kind
--   input_hash, output_hash   cosa l'evento ha visto allora, non adesso (D25)
--   dedupe_key                un ritentativo sostituisce, non duplica (D27)

CREATE UNIQUE INDEX idx_provenance_dedupe
  ON provenance_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_provenance_model
  ON provenance_events(model, occurred_at);
CREATE INDEX idx_provenance_languages
  ON provenance_events(source_language, target_language, occurred_at);

-- Metriche calcolate: separate dai fatti perche' si invalidano e si
-- ricalcolano quando cambia un input o l'algoritmo (D23, #382).
CREATE TABLE derived_metrics (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metric_kind TEXT NOT NULL,
  value REAL,
  -- Senza versione dell'algoritmo, confrontare due calcoli fatti in momenti
  -- diversi non significa niente.
  algorithm_version TEXT NOT NULL,
  model TEXT,
  -- Impronte degli input al momento del calcolo: se cambiano, e' scaduta.
  input_hashes TEXT NOT NULL,
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entity_type, entity_id, metric_kind, algorithm_version)
);

CREATE INDEX idx_derived_metrics_entity
  ON derived_metrics(entity_type, entity_id, metric_kind);
```

Colonne da aggiungere a tabelle esistenti:

| Tabella | Colonna | Perché |
|---|---|---|
| `translations` | `approved_revision_id` | puntatore allo stato corrente, per la lettura veloce; derivabile dagli eventi e tenuto aggiornato insieme a loro (D22) |
| `projects` | `work_state` (`in_progress` / `completed`) | filtro di qualità per i dataset e avanzamento per la Dashboard; non abilita la registrazione, che avviene sempre (D22) |

Tipi di evento per l'approvazione: `translation_approved`,
`translation_approval_revoked`, e gli equivalenti per la trascrizione. Puntano
alla revisione, non al chunk.

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
- `resource_class`: `network` | `cpu` | `disk` | `llm` | `document`, che sceglie
  il limite di concorrenza (D11);
- `resumability`: `resumable` | `restartable` | `manual`, che decide il
  comportamento al riavvio (D13);
- `run(config, control) -> Result<Output, JobError>`, dove `control` espone il
  punto di ripresa, la richiesta di pausa o annullamento, e la segnalazione di
  avanzamento con la strozzatura di D17;
- `JobError` porta con sé `retryable: bool`, l'attesa suggerita, il messaggio
  destinato all'utente e cosa scrivere nel registro (D16);
- l'output passa da un'area di transito e viene promosso solo dopo validazione
  (D16-bis);
- l'orchestratore registra da sé avvio, esito, durata e costo in
  `provenance_events` (D29): chi scrive un gestore non deve ricordarsene.

## Profilo di rete nel registro dei provider

`IIIFProvider` (`iiif/mod.rs`) guadagna un campo con pausa minima e massima,
limite a raffica, concorrenza per host, worker per lavoro, tentativi, base e
tetto dell'attesa, raffreddamento su 403 e 429, timeout, header di provenienza e
preriscaldamento del visualizzatore (D18). Le modifiche dell'utente vivono in
`app_settings`, indicizzate per chiave provider o per host.

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
