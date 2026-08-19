# Piano — scaricamento, cache e spazio su disco

Riscrittura del sottosistema che porta le pagine dalla biblioteca al disco, della
cache che serve a mostrarle, e dell'ottimizzazione locale che decide quanto
spazio occupano.

Scritto il 2026-08-18, dopo un'indagine su codice, database, registri e deposito
reali. **Sostituisce D4, corregge D6 e D8, e prepara la modifica di D2, D5 e D7.**

Cinque decisioni prese con l'utente lo stesso giorno stanno nel capitolo 10 e sono già
riportate dentro il disegno — la quinta ne ha fatta decadere una. Una cosa resta
aperta e si risolve nella fase 2.

Il documento è stato riletto tre volte contro la discussione che lo ha prodotto, e due
volte da una revisione esterna. La prima ha trovato cinque buchi (chiusi), un'alternativa
che ha cambiato il disegno (§5.9) e un errore di fatto sulla politica di sicurezza, che
questo documento aveva respinto a torto: la seconda rilettura ha guardato i file di
configurazione e ha dato ragione alla revisione (§5.5). La stessa rilettura ha spostato
l'ottimizzazione locale in un ramo suo (§7) e aggiunto due precisazioni al §5.4.

---

## 1. Perché

Il blocco 1 ha costruito l'infrastruttura — deposito, coda dei lavori,
registrazione — e per scelta non ha ancora nessuno che legga i libri scaricati:
il visore viene dopo. La parte dello scaricamento però è cresciuta oltre il suo
problema, e non è più leggibile.

I numeri, misurati:

| | valore | regola del progetto |
|---|---|---|
| righe di codice del gestore | 1425 | 400-800 per file |
| funzione più lunga | 273 righe | — |
| argomenti della funzione peggiore | 16 | — |
| deroghe al limite di argomenti | 5 | 0 |

E la causa è concentrata in un punto. **Un quarto del codice, e cinque delle
ventitré strutture dichiarate nel modulo, esistono per rispondere a una domanda —
quale misura chiedere alla biblioteca — che si risponde con una divisione.** Da quella
zona vengono tre dei sei difetti trovati nell'indagine del 18 agosto.

Nella settimana passata sono stati corretti sei difetti in quella zona. Correggerne
altri lì dentro costa più che riscriverla: Glossa non ha utenti, le migrazioni
vengono collassate prima della 1.5, e nessuna schermata dipende ancora dalla
disposizione dei file. È la finestra giusta.

### Gli usi che questo deve sostenere

Dichiarati dall'utente il 2026-08-18, e il disegno va letto contro di loro. Non sono
funzioni da fare adesso: sono i modi in cui il lavoro verrà fatto, e servono a capire
se la disposizione regge.

1. **Sfogliare online è il caso normale.** Non «scarico il libro e poi lo leggo», ma
   «guardo le pagine dalla biblioteca, e scarico quando mi serve». Dipenderà dalla
   biblioteca, ma la previsione è questa.
2. **Una pagina alla massima risoluzione, quando serve.** Nelle trascrizioni capita
   una pagina ostica di cui serve tutto il dettaglio disponibile. Vale sia sfogliando
   online sia avendo il libro scaricato, e riguarda **quella** pagina, non il libro.
3. **Sapere sempre cosa si ha e a che misura.** Per ogni libro: quali versioni sono
   in locale, a che risoluzione, quali libri sono soltanto online. Non per curiosità:
   per poter decidere cosa comprimere, cosa ridimensionare e cosa buttare.

Il terzo è quello che pesa di più sul disegno, perché è un requisito
sull'**inventario**, non sullo scaricamento: lo scaricamento è il mezzo, e quale
strada prenda è quasi un dettaglio. È anche il caso che ha corretto due punti di
questo piano — §5.4 e §5.5.

---

## 2. Cosa va e cosa resta

Righe di **codice di produzione**, commenti e test esclusi.

### Da riscrivere

| | righe |
|---|---|
| il gestore dello scaricamento | 1425 |
| la scelta della misura | 138 |
| le righe per pagina nel database, sparse fra backend e interfaccia | ~200 |

**Circa 1750 righe.** Ci si aspetta di sostituirle con 500-700.

### Da tenere, senza toccarle

| | righe | perché |
|---|---|---|
| cortesia verso le biblioteche | 229 | Gallica bandisce, i valori sono tarati sul campo, i test coprono pause, raffica, concorrenza e raffreddamenti |
| lettura dei manifesti | 198 | Presentation 2 e 3 sono due formati veri, molte biblioteche non hanno migrato |
| singola richiesta e classificazione degli errori | 227 | un 403 significa «rallenta»: quella tabella è stata pagata sul campo |
| validazione dei file | 175 | i file troncati esistono, e la firma più il terminatore li coglie a memoria costante |
| la coda dei lavori | 1744 | non è dello scaricamento: la usano anche le verifiche e la useranno il riconoscimento testo e le esportazioni |
| disposizione dei percorsi nel deposito | 181 | componenti validate contro la risalita, percorsi sempre relativi |

**Circa 2750 righe restano.** Non è «buttare tutto»: è riscrivere la terza parte
che è diventata illeggibile, tenendo le due che funzionano.

---

## 3. I fatti pagati sul campo

**Questo è il capitolo che va scritto prima di cancellare una riga.** In quelle
1750 righe ci sono fatti costati una settimana di prove, e alcuni non sono scritti
da nessun'altra parte. Il codice si riscrive; questi no.

### Rete e biblioteche

1. **Un 403 significa «stai correndo troppo»**, non «vietato per sempre». Va
   ritentato dopo un'attesa lunga. Trattarlo come definitivo fa fallire
   scaricamenti legittimi.
2. **Le attese di partenza vanno in decine di secondi, non in secondi.** Base 20 s
   e tetto 300 s sono i valori che funzionano; 2-8-30 erano un ordine di grandezza
   troppo brevi.
3. **Un raffreddamento vale per l'host, non per il lavoro.** Dopo un 403 tutto ciò
   che parla con quel server deve rallentare, altrimenti un secondo scaricamento
   continua a bussare mentre il primo aspetta.
4. **I contatori stanno sull'host, il profilo lo dichiara il provider.** Ricerca e
   immagini possono venire da macchine diverse, e quella che si affanna è la
   seconda.
5. **La pausa fra richieste si sorteggia una volta**, quando la richiesta parte.
   Risorteggiarla a ogni controllo fa uscire al primo numero basso e la pausa
   media crolla sotto quella dichiarata.
6. **`info.json` può non rispondere per una pagina e rispondere alla successiva.**
   Sul campo lo stesso manoscritto è stato perso due volte, al 47% e al 48%, per
   una singola pagina il cui descrittore non arrivava; alla sessione dopo
   rispondeva. Il tempo di risposta misurato di `info.json`: **4,3 s**.
7. **Esistono pagine che il manifesto dichiara e il server non serve.** Un 404 non
   è ritentabile: se fa fallire il lavoro, quel libro non è scaricabile mai.
8. **I file arrivano troncati.** Un troncamento ha la dimensione dichiarata nei
   metadati HTTP: un controllo di dimensione non lo vede.
9. **Le misure non dichiarate vengono rifiutate o generate sul momento.**
   Archive.org dichiara `level2` e ha risposto `400` e `501` su `full/2000,`.
10. **Una misura non pronta costa dieci volte tanto.** Misurato: 26,6 s contro
    2,3 s sulla stessa pagina, e il risultato non viene tenuto in cache.
11. **La dimensione piena ha due nomi.** `max` dalla Image API 3.0, `full` prima.
    Chiedere `max` a un servizio della vecchia Presentation 2.1 fa rispondere
    `400`. Si riconosce dalla versione del manifesto.
12. **Alcuni servizi servono le immagini solo dopo aver visitato la pagina del
    lettore**, che apre una sessione. Il profilo della Biblioteca Vaticana lo
    dichiara — ed è **dichiarato e non usato da nessuno**: quel valore attraversa
    il codice e non fa niente. Va o attuato o cancellato, non lasciato a metà.

### Coda e lavori

13. **La pausa batte il nuovo tentativo.** Un errore incassato mentre l'utente
    premeva pausa faceva ripartire il lavoro da solo dopo qualche minuto.
14. **Il conto dei tentativi è dei fallimenti di fila.** Se si alza a ogni avvio,
    ogni ripresa ne consuma uno: un libro lungo messo in pausa cinque volte
    arriva a 5/5 con la colonna degli errori vuota.
15. **La durata di un lavoro non si ricava dagli orari della tabella.** Il primo
    avvio non si azzera più, quindi un lavoro ripreso la mattina dopo dichiara
    dodici ore di lavoro.
16. **Nessun lavoro riparte da solo alla riapertura**, tranne gli scaricamenti se
    l'impostazione è accesa.

### Deposito

17. **Un file parziale non deve poter entrare nel deposito.** Transito,
    validazione, spostamento atomico: è anche ciò che permette di fidarsi della
    sola presenza del file quando si riprende.
18. **Le righe del database e i file sul disco divergono, e nessuno se ne accorge.**
    Nel deposito di prova: 153 pagine sul disco senza riga, nove cartelle su dieci
    senza nessuna riga, 634 miniature orfane.
19. **Ritrovare una pagina sul disco senza la sua riga costa 2,65 s** — quanto
    scaricarla — fra due interrogazioni al database, l'impronta e la miniatura.

### Cortesia mai verificata sul campo

20. **La pausa fra richieste non è verificabile dai registri**: gli orari hanno
    risoluzione di un secondo e la pausa prudente è 600-1600 ms. Verificabile è il
    resto: in tre registri nessun raffreddamento è mai scattato e non è arrivato
    nessun 403 né 429. La spaziatura tipica fra due pagine è 2-8 s, dominata dal
    tempo di risposta del server. La pausa è coperta dai test, non dal campo.

---

## 4. Le misure che decidono il disegno

Tutte prese il 18 agosto 2026 con richieste vere.

### Cosa dichiara il descrittore

| Biblioteca | Misure dichiarate | Fattori di scala | Piramide? |
|---|---|---|---|
| archive.org | 2646 · 1323 · 662 · 331 · 165 · 83 | — | sì, dimezzamenti esatti |
| Bodleian | 500 · 250 · 125 (su 1000) | 1 · 2 · 4 · 8 | sì, dimezzamenti |
| Gallica | **niente** | **niente** | non lo dice |

### Quanto costa cosa

**archive.org**, pagina piena 2646×4112, tetto 2000.

| Cosa si chiede | Tempo | Byte | Cosa arriva | Campione |
|---|---|---|---|---|
| dimezzamento `1323,` | **2,6 s** | **0,53 MB** | 1323×2056 | media di 4 pagine |
| `max` | 5,3 s | 1,56 MB | 2646×4112 | media di 4 pagine |
| larghezza esatta `2000,` | 5,9 s | 1,20 MB | 2000×3108 | 1 pagina |
| dimezzamento più un pixel `1324,` | 2,5 s | 0,54 MB | 1324×2058 | 1 pagina |

Le due medie vengono da quattro pagine mai richieste, con l'ordine delle due misure
invertito fra una pagina e l'altra per escludere l'effetto della cache del server:
l'ordine non ha cambiato niente.

L'ultima riga risponde a una domanda che serviva: **sbagliare il dimezzamento di un
pixel non costa niente.** Quindi l'arrotondamento del calcolo non è un rischio su
questo server, e non serve inseguire la regola di arrotondamento di ognuno.

**Gallica**, pagina piena 5078×6711, tetto 2000. È la biblioteca che bandisce.
Una misura per riga, una pagina sola.

| Cosa si chiede | Tempo | Byte | Cosa arriva |
|---|---|---|---|
| larghezza esatta `1513,` | **1,5 s** | **0,57 MB** | 1513×2000 |
| riquadro `!2000,2000` | 1,7 s | 0,57 MB | 1513×2000 |
| dimezzamento `1270,` | 2,3 s | 0,41 MB | 1270×1678 — 16% di dettaglio in meno del richiesto |
| `max` | 7,5 s | **4,78 MB** | 5078×6711 |

**Conclusioni.** Agganciarsi alla piramide vale il doppio della velocità su
archive.org e non vale niente su Gallica, dove peggiora anche il risultato.
`max` sempre costa da due a cinque volte il tempo e da tre a otto volte i byte:
va bene come ripiego, non come regola.

### Il numero decisivo

Tutte le misure che Glossa ha negoziato leggendo il descrittore nei tre registri —
**85 richieste, 47 gruppi distinti** — confrontate con quello che si otterrebbe
calcolandole dai soli dati del manifesto:

```
predetti dai soli dati del manifesto: 47/47 gruppi (tolleranza ±1 px)
```

Compresi i casi non banali: una pagina dove il dimezzamento non basta e serve il
quarto, due pagine già più piccole del tetto dove la risposta giusta è la
dimensione piena, una richiesta vecchia con tetto 256 dove serviva il sedicesimo.

### Cosa fanno gli altri

| | Come sceglie la misura | Ripresa |
|---|---|---|
| **Scriptoria** | lista fissa provata in ordine (`3000`, `1740`, `max`). Non legge `info.json` per scegliere | scansione della cartella |
| **iiif-download** | dimensioni dal manifesto, lato lungo tagliato a un tetto fisso; su `400` ripiega su `max` | controlla il file sul disco |
| **IIIF-Downloader** | cascata di dodici forme di indirizzo, risoluzione piena per prima; **spegne** quelle che falliscono e si tiene quella che funziona | — |

Nessuno dei tre legge il descrittore per scegliere. Tutti e tre chiudono la catena
su `max`. Nessuno si aggancia alla piramide: o prendono la cima — veloce e pesante
— o chiedono una misura arbitraria — leggera e lenta. La casella «veloce e
leggera» è vuota, e si vede solo avendo misurato il punto 10.

---

## 5. Il disegno

### 5.0 Il tetto è dello scaricamento, non del guardare

Va detto una volta, perché il resto del piano lo dava per scontato e non è affatto
ovvio: **il tetto della misura governa quello che finisce nel deposito, e nient'altro.**

Chi guarda una pagina non passa da lì. Un visore IIIF vero non chiede «questa pagina
a 2000 pixel»: chiede **i riquadri** che servono al livello di zoom e alla porzione
che stai guardando. OpenSeadragon — su cui è costruito Mirador, che è quello che usa
Scriptoria — legge il descrittore dell'immagine e ne ricava la piramide dei riquadri;
la misura non è una scelta, è una conseguenza di quanto hai ingrandito. E infatti
nelle impostazioni del visore di Scriptoria **non esiste nessun tetto di misura**:
esistono i limiti di zoom, i filtri visivi, e una regola per decidere se aprire la
copia locale o quella remota.

Quindi:

| | Chi decide la misura | Cosa la limita |
|---|---|---|
| **scaricare** una pagina nel deposito | il tetto, per fonte o generale | il tetto |
| **guardare** una pagina, online | il livello di zoom | i limiti di zoom, e il tetto in **byte** della cache |
| **guardare** una pagina scaricata | la risoluzione che hai scaricato | quella, e basta |
| copertine e miniature | il lato lungo delle miniature | 300 px |

**Da qui la risposta alla domanda «posso mettere il tetto a `max`?»: sì, e per chi
scarica poche pagine di proposito è una scelta sensata.** Non rende costoso lo
sfogliare, perché lo sfogliare non passa dal tetto. Costa quando **scarichi un libro
intero**: da due a cinque volte il tempo e da tre a otto volte i byte, cioè un
deposito triplo — recuperabile con l'ottimizzazione locale (§5.7), ma da sapere prima.

**Cosa questo chiede al piano, in concreto.** Il visore non si progetta qui e non si
costruisce adesso, ma la cache non deve impedirlo. Tre requisiti, i primi due già
soddisfatti dal §5.5:

- la cache è **per richiesta**, non «una voce per pagina»: un riquadro è una richiesta
  come un'altra, e ci sta dentro senza cambiare niente;
- il tetto della cache è in **byte**, non in numero di pagine: è l'unica unità che
  regge sia le pagine intere sia i riquadri;
- **il visore decide cosa chiedere, ma non è lui a chiedere.** Le richieste dei
  riquadri devono passare dalla cache e dalla cortesia come tutto il resto. Non è una
  preferenza architetturale: la politica di sicurezza dell'app impacchettata blocca
  comunque una richiesta di immagine fatta dalla finestra verso la rete, e un visore a
  riquadri che ingrandisce spara una decina di richieste in un attimo — se escono
  senza pause né limite a raffica, su Gallica ci si fa bandire mentre si legge. È il
  difetto che hanno oggi le due copertine, moltiplicato per il numero di riquadri.

E una cosa che il visore deciderà da sé, non noi: se aprire la copia locale — che è
un'immagine sola, con lo zoom limitato alla risoluzione che hai — o quella remota a
riquadri. Scriptoria ne ha fatto un'impostazione, che è la prova che la scelta esiste.

### 5.1 La misura si calcola, tre regole

Vale per chiunque **scarichi** un'immagine con un tetto: oggi lo scaricamento di un
libro, domani qualunque altra cosa metta file nel deposito. Il descrittore si legge
**una volta per libro** e mai più — non per gruppo, non per pagina (§5.9).

1. **Generale.** Dalle dimensioni della pagina scritte nel manifesto si calcola la
   larghezza che porta il lato lungo al tetto, e si chiede quella. La larghezza è
   livello 1 della specifica — obbligatoria per chiunque non sia livello 0. Nessuna
   richiesta per pagina, nessuna memoria fra le pagine.
2. **Una lettura all'avvio del libro, che decide come calcolare.** Si legge il
   descrittore di **una** pagina e si guarda una cosa sola: **le misure dichiarate
   sono i dimezzamenti delle dimensioni del canvas?** Se sì, quella biblioteca tiene
   pronta la piramide, e per tutto il libro si chiede il dimezzamento con il lato
   lungo più vicino al tetto invece della larghezza esatta: vale il doppio della
   velocità (§4). Se no — Gallica non dichiara niente — si chiede la larghezza esatta
   e si va avanti.

   **Più vicino vuol dire sopra o sotto che sia** (D4), e va scritto perché la prima
   attuazione ha inteso il tetto come un minimo. Su un manoscritto di archive.org
   dichiarato 5850×7667 i dimezzamenti sono 3833 e 1916: prendere sempre quello sopra
   dava 472 kB a pagina con il tetto a 2000, quattro volte i pixel chiesti. I casi
   misurati sul campo non distinguono le due letture — danno la stessa risposta — ma
   il deposito sì.

   Costa una richiesta per libro — 4,3 s misurati su un lavoro di ore — e non ci sono
   caselle da compilare a mano. **Se il descrittore non risponde non è un problema**:
   si calcola dalle dimensioni del canvas, che è la regola generale, e si va avanti
   senza riprovare (fatto 6: il silenzio è passeggero, ma non vale la pena inseguirlo
   per un guadagno di velocità).
3. **Ripiego.** Al primo rifiuto **della misura** si smette di calcolare e si passa a
   `max` **per il resto del libro**, rimpicciolendo in casa e conservando solo il
   risultato. Un rifiuto buttato invece di trecento. Se anche `max` viene rifiutato,
   la pagina si salta.

**Quale rifiuto, però, va detto con precisione**, perché è il punto in cui questa
regola può annullare un fatto pagato sul campo. Solo `400` e `501` sono rifiuti
*della misura*: sono quelli visti nel registro su `full/2000,`. Tutti gli altri
mantengono il significato che hanno sempre avuto:

| Risposta | Cosa significa | Cosa si fa |
|---|---|---|
| `400`, `501` | la misura chiesta non si può servire | **ripiego su `max` per il resto del libro** |
| `403`, `429` | «stai correndo troppo» (fatto 1) | raffreddamento dell'host, si ritenta |
| `404`, `410` | quella pagina non è servita (fatto 7) | si salta la pagina, si conta |
| `5xx` | il server tossisce | i tre tentativi ravvicinati, poi l'attesa del profilo |

Senza questa tabella un solo `403` — che su Gallica è la cosa più normale del mondo —
declasserebbe a piena risoluzione tutto il resto del libro, cioè **la regola nuova
cancellerebbe il fatto 1**.

Un `5xx` che insiste sulla stessa pagina anche dopo i tentativi è ambiguo: potrebbe
essere la misura. Si prova `max` **per quella pagina sola** prima di dichiararla
saltata, e non si declassa il libro.

Le due cose che il ripiego usa sono le più garantite della specifica: `max` è
obbligatoria a ogni livello di conformità, la larghezza dal livello 1.

Perché non `!tetto,tetto` e non `pct:n`: sono entrambe **livello 2**, quindi meno
garantite di `max`, e archive.org rifiuta le misure non dichiarate.

**Tre casi che la regola deve nominare, perché sono reali:**

- **una pagina di cui il manifesto non dichiara le dimensioni.** Capita, e il
  lettore dei manifesti lo prevede già. Non c'è niente da calcolare: si chiede la
  dimensione piena, che è garantita. Non si legge il descrittore per scoprirle;
- **la dimensione piena ha due nomi.** Si chiama `max` dalla Image API 3.0, e
  `full` prima: a un servizio dichiarato nella vecchia Presentation 2.1 va chiesto
  `full`, altrimenti risponde `400`. È un fatto già pagato, e va portato dentro la
  riscrittura;
- **il rimpicciolimento del ripiego è una ricompressione**, e come tale perde
  qualcosa (§5.7). Va segnato nel file di lato accanto alla pagina, altrimenti quella
  pagina è indistinguibile da una arrivata già a quella misura — e chi guarderà
  l'inventario non saprà perché è diversa dalle altre;
- **la politica «massima» resta, e salta tutto.** Quando il tetto è `max` non c'è
  niente da calcolare, niente da negoziare e niente da rimpicciolire: si chiede la
  dimensione piena e si conserva com'è arrivata. È il modo di non avere questo
  problema, e per lo **scaricamento** è una scelta sensata per chi scarica poche
  pagine di proposito. Va detto cosa costa: da due a cinque volte il tempo e da tre a
  otto volte i byte, quindi su un libro intero triplica il deposito — recuperabile
  con l'ottimizzazione locale (§5.7), ma da sapere prima. È una scelta diversa dal
  ripiego, che invece rimpicciolisce.

**La cartella prende il nome dal tetto, non dai pixel ottenuti.** Le pagine di uno
stesso libro hanno dimensioni diverse fra loro, quindi la larghezza chiesta varia
di pagina in pagina — 1323, 1278, 1264 sullo stesso libro. Se la cartella prendesse
il nome dalla misura ottenuta, la stessa fonte finirebbe sparsa in cartelle diverse
e una ripresa non ritroverebbe più quello che ha già scaricato.

**Quante pagine insieme lo dice la biblioteca, e per difetto è una.** Il profilo
dichiara già quante richieste insieme si possono fare verso un host, e
l'impostazione esiste per biblioteca in Impostazioni → Biblioteche. Il ciclo però
resta in fila finché quel valore non viene alzato a mano: il collo di bottiglia
misurato è il server, e parallelizzare su una biblioteca che bandisce si paga con
l'accesso. Il predefinito è **1 per tutte**, e si alza solo dove è stato misurato
(§7, quarto ramo).

### 5.2 Il ciclo, in sette passi

1. Leggi il manifesto — dal deposito se c'è già, altrimenti dalla rete,
   conservandolo com'è arrivato.
2. Per ogni pagina, nell'ordine dichiarato:
   1. il file è già sul disco? salta;
   2. calcola la larghezza da chiedere;
   3. aspetta il turno verso quell'host;
   4. chiedi l'immagine;
   5. valida i byte, scrivi in transito, sposta nel deposito;
   6. ricava la miniatura dai byte che sono già in memoria;
   7. di' dove sei arrivato.
3. Se alla fine **la cartella è vuota**, il lavoro non è riuscito.

Nessun ramo oltre a quelli del punto 5.1. Le pagine che la biblioteca non ha si
saltano e si contano; il conto si legge nel pannello accanto a «fatte su totali»,
che da solo direbbe «328 su 328» di un libro che sul disco ne ha 326. È il conto di
**questo avvio**, non un totale storico: quello lo dice la differenza fra le pagine
nella cartella e il conteggio atteso, che è l'unico posto dove serve.

La condizione del punto 3 va detta sulla **cartella** e non su questo avvio: una
ripresa in cui le ultime venti pagine mancano non ha scaricato niente, ma il libro
c'è. Guardare la cartella è anche l'unico modo di avere la stessa risposta a ogni
tentativo.

**La fase «negoziazione» sparisce dal pannello**, perché non c'è più niente da
negoziare: restano avvio, manifesto e scaricamento.

### 5.3 Il punto di ripresa sparisce

Conseguenza di prendere sul serio «il disco è la verità»: **non serve più un punto
salvato.** Quante pagine ci sono lo dice la cartella, e una pagina saltata
semplicemente non ha un file.

Una ripresa quindi **riprova** le pagine saltate. È giusto: sul campo quei silenzi
sono passeggeri — la stessa pagina che non rispondeva ha risposto alla sessione dopo
(fatto 6).

**Ma esistono anche i definitivi** (fatto 7), e senza tenerne traccia un libro con
venti pagine mai servite butterebbe venti richieste a ogni ripresa e leggerebbe
«incompleto» per sempre. Quindi la pagina saltata **lascia una riga nel file di
lato**: «non servita dalla biblioteca, ultimo tentativo il tale giorno». Non è un
punto di ripresa che torna dalla finestra: è lo stesso file che descrive le pagine,
che ora descrive anche quelle che non ci sono e perché.

Serve a due cose:

- **l'inventario può dire la verità**: «completo per quanto la biblioteca serve — 308
  su 328, venti mai servite», invece di un «incompleto» che sembra un lavoro a metà;
- **la ripresa può riprovarle a scadenza** e non a ogni avvio. Una volta ogni tanto è
  giusto — le biblioteche riparano — venti richieste buttate ogni volta che si riapre
  l'applicazione no.

Sparisce con lui il campo delle misure negoziate, il conto delle saltate da
mantenere coerente fra le riprese, e la semina della mappa all'avvio.

### 5.4 Il disco è la verità

Le righe per pagina nel database servono oggi a cinque cose: il conteggio nella
scheda, il totale in byte durante lo scaricamento, il manifesto del backup, le
opere incomplete dopo un ripristino, e la contabilità della cancellazione. **Le
prime quattro le risponde un elenco di cartella; la quinta esiste solo perché
esistono le righe.**

Resta una cosa che una cartella non sa dire: l'impronta registrata all'arrivo, che
serve alla verifica completa di D5. E con lei le poche altre cose che di una pagina
si vuole sapere — a che misura è arrivata, quanto pesava, quando.

**Quel poco va in un file di lato**, uno **per cartella di misura** — dentro
`pages/2000/`, insieme alle pagine che descrive. È il sostituto delle 328 righe, ma
in un posto solo e **appoggiato ai file stessi**: cancelli la cartella e se ne va
con loro, copi la cartella e viene dietro. Se la stessa opera esiste a due misure, ha
due file, ognuno che parla solo delle sue.

**Può divergere, e va detto come.** Una pagina promossa nel deposito e
un'interruzione prima di scrivere la sua riga lasciano un file senza riga: è lo stesso
caso che oggi costa 2,65 s a pagina per essere riparato. Qui non si ripara, si
interpreta — ed è per questo che il disegno regge:

> **Un file senza la sua riga è una pagina presente, di cui non si conosce
> l'impronta.** Si conta nell'inventario, la verifica rapida la vede, la verifica
> completa la **salta** e non la dichiara corrotta.

Il conteggio non ne soffre perché il conteggio lo dà la cartella; l'unica cosa che si
perde è la possibilità di verificare *quella* pagina, e riscaricarla è la cura.

**Come si scrive: una riga in coda, dopo lo spostamento atomico.** Mai riscrivere
tutto il file per ogni pagina, altrimenti un'interruzione a metà scrittura perde
trecento impronte invece di una. In coda, il caso peggiore è una riga troncata: si
scarta quella e le altre restano.

**E i depositi che esistono già** — pagine scaricate prima, senza nessun file di lato
— rientrano nella stessa regola: sono pagine presenti di cui non si conosce
l'impronta. Non serve nessuna migrazione: la prima verifica completa le salta, e chi
vuole l'impronta le riscarica.

Quindi:

- **quante pagine ci sono** lo dice la cartella;
- **cosa si sa di ognuna** — impronta, misura d'arrivo, byte — lo dice il file di
  lato, scritto insieme alle pagine;
- **una riga per digitalizzazione** resta nel database — manifesto, conteggio
  atteso, licenza, attribuzione — perché quelle cose non si riscaricano;
- **«libera spazio»** cancella la cartella delle pagine e il file delle impronte;
- **togliere un'opera** cancella la cartella dell'opera, cercandola sotto tutte le
  biblioteche perché la chiave si deduce da dati che possono essere già stati
  cancellati.

Spariscono: l'accordo fra righe e file e tutte le sue asimmetrie, il recupero
della pagina senza riga a 2,65 s l'una, gli elenchi di cosa è stato cancellato e
cosa no, il concetto di file orfano per le pagine.

**Cosa ne è delle righe che c'erano.** Le pagine e le miniature non hanno più una
riga a testa: erano 577 righe per un libro solo. Della tabella degli asset resta
quello che riguarda l'opera e non i suoi file. Se quella tabella sopravviva o se
quei pochi dati diventino colonne della digitalizzazione è una scelta da fare
quando si scrive lo schema nuovo, non adesso.

**Le quattro cose che leggevano quelle righe, e come le leggono dopo:**

| Chi | Prima | Dopo |
|---|---|---|
| il conteggio nella scheda di Biblioteca | conta le righe | conta i file, **una cartella di misura per volta** |
| il totale in byte durante lo scaricamento | somma i byte delle righe | somma quello che ha scritto in questo avvio, più la dimensione della cartella all'inizio |
| il backup | elenca le righe delle pagine | elenca le cartelle: quali digitalizzazioni hanno pagine, a che misure e quante |
| le opere incomplete dopo un ripristino | righe presenti contro conteggio atteso | file presenti contro conteggio atteso, per misura |

Il conteggio atteso viene dal manifesto e resta dov'è: è l'unica cosa che dice
quante pagine *dovrebbero* esserci, e una cartella non lo sa.

**Le cartelle di misura sono l'inventario, e si leggono da sole.** Questa è la cosa
che il deposito sa dire meglio del database, e serve a rispondere alle domande che
l'interfaccia deve poter fare:

| Domanda | Risposta |
|---|---|
| a che misure ho questo libro? | i nomi delle cartelle dentro `pages/` |
| quante pagine a ciascuna? | quanti file in ognuna |
| è completo, a quella misura? | quei file contro il conteggio atteso |
| questo libro è solo online? | non c'è nessuna cartella `pages/` |
| quanto occupa, per misura? | la dimensione di ogni cartella |

Nessuna di queste risposte richiede una interrogazione al database né un accordo da
mantenere. E la disposizione regge il caso misto senza inventare niente: una
digitalizzazione con 328 pagine in `pages/2000/` e tre in `pages/max/` è «completo a
2000, più tre pagine a risoluzione piena», che è la verità.

**Attenzione a come si legge «parziale».** Una cartella `max` con tre file su 328
non è un libro incompleto: è un libro completo a 2000 con tre pagine prese a
risoluzione piena di proposito (§5.6). L'interfaccia deve distinguere la misura
principale — quella con cui il libro è stato scaricato — dalle pagine prese a parte,
altrimenti mostra un avviso di incompletezza dove non c'è niente che manca.

**Le miniature e il manifesto stanno fuori, e va bene così.** Le miniature vivono in una
cartella loro, che non è divisa per misura, e il manifesto sta alla radice della
digitalizzazione: nessuno dei due entra nel file di lato. Non è un buco, è la conseguenza
di cosa sono — una miniatura si rifà dalla pagina in un istante, e il manifesto viene già
controllato quando arriva. Quindi non si verificano più: se una miniatura manca o è
rovinata, si rigenera.

**Nessuna trascrizione è legata a un file di pagina.** Vale la pena scriverlo perché è il
momento in cui si decide: il collegamento fra una trascrizione e la pagina che descrive va
fatto sulla digitalizzazione e sul numero della pagina, che sono cose stabili, e non su
un'identità del file, che con questo disegno non esiste più. Oggi non c'è niente da
convertire — nessuna trascrizione è agganciata a un file — quindi è gratis farlo bene
adesso e caro farlo dopo.

**La verifica del deposito** diventa più semplice, non più difficile: la rapida
confronta la cartella con il conteggio atteso; la completa rilegge i file e
confronta con il file delle impronte. Il concetto di file orfano resta per quello
che non è una pagina — una cartella di una digitalizzazione che il database non
conosce più.

**Adesso costa poco e dopo costa caro**: nessuna schermata legge ancora quei
percorsi, quindi non c'è compatibilità da mantenere. Appena esiste il visore, non
è più vero.

### 5.5 Una cache sola, per tutto quello che viene dalla rete

Oggi l'app ha tre immagini in tutto: il logo, la copertina nei risultati di
ricerca, la copertina nella scheda di Biblioteca. Le due copertine puntano a un
indirizzo della biblioteca, e la politica di sicurezza dell'app impacchettata dice
`img-src 'self' data: blob:` — **niente immagini dalla rete**. Nell'app installata
sono due riquadri vuoti; in sviluppo si vedono perché lì la politica non si
applica.

E le copertine **scavalcano la cortesia**: quaranta risultati di ricerca sono
quaranta richieste sparate dalla finestra alla biblioteca senza pause, senza
limite a raffica, senza raffreddamenti. Su Gallica è il modo più diretto di farsi
bandire mentre si guarda una lista.

Le ricerche, allo stesso modo, non hanno nessuna cache: ogni ricerca ripassa dalla
biblioteca.

**Una cache sola risolve tutti e tre.** Non due meccanismi, uno:

> **Chiave: la richiesta. Valore: i byte, con quando sono arrivati e quanto pesano.**

Ci stanno dentro le copertine, le miniature remote, le risposte delle ricerche e —
quando ci sarà il visore — le pagine dei libri non scaricati. Sono tutte risposte
a una richiesta HTTP.

Per le immagini la richiesta **è** un indirizzo, e la chiave è quello. Per le
ricerche no: la richiesta è biblioteca più termini più filtri, e non tutti i
fornitori la esprimono come un indirizzo. La chiave è quindi la richiesta **come
viene fatta**, ridotta a una forma stabile — stessa biblioteca, stessi termini,
stessi filtri, stessa chiave. Il punto è che il magazzino è uno: due politiche di
scadenza sopra un solo posto dove stanno i byte.

**Come si chiede un'immagine, da qualunque schermata.** La richiesta è «la pagina 34
di questa digitalizzazione, **a questa misura**»: la misura fa parte della domanda,
non è un dettaglio. Senza di lei, chi ha il libro a 2000 e ne vuole vedere una più
grande si ritrova restituito il file a 2000, cioè l'opposto di quello che ha chiesto.

1. **nel deposito, a quella misura** → si restituisce il file;
2. **nel deposito, a una misura più grande** → si restituisce quello, rimpicciolito
   sul momento. Meglio del deposito che chiedere alla biblioteca una cosa che
   abbiamo già in casa più bella, e non costa una richiesta a nessuno;
3. **nella cache, a quella misura** → si restituisce;
4. **altrimenti** si chiede alla biblioteca **passando dalla cortesia**, si mette in
   cache, si restituisce.

Il visore futuro chiede così: l'immagine di una pagina a una misura. Non un file,
non un indirizzo, e senza sapere se il libro è scaricato. È il motivo per cui questa
cache è riutilizzabile senza modifiche.

**La misura la indica chi chiede**, e non c'è un tetto che la governi (§5.0): una
copertina la chiede a 300 px, un visore a riquadri la chiede al livello di zoom in
cui si trova, un «guardala più grande» la chiede grande. La cache non ha un'opinione
su quale sia la misura giusta: conserva quello che è stato chiesto, e si tiene entro
il suo tetto in byte.

Quello che il visore chiede per guardare **non finisce nel deposito**: passa dalla
cache e prima o poi viene scartato. Se una pagina la si vuole tenere, è l'azione del
§5.6, che è un gesto diverso e deliberato.

**Ma mostrare e possedere sono due cose diverse, e vanno tenute separate.** Guardare
un libro online riempie la cache; una pagina in cache **non è tua** e può sparire al
prossimo giro di scarto. Quindi:

- **per disegnare un'immagine** la provenienza non conta: la catena qui sopra la
  trova dove è;
- **per dire cosa possiedi** conta solo il deposito. La scheda di Biblioteca, i
  conteggi, la disponibilità e il backup guardano **soltanto** il deposito. Una
  pagina in cache non è mai contata, non è mai «scaricata», non entra in un backup.

Se si vuole che un libro resti, si scarica: **il deposito è il modo di fissare una
cosa**, e per questo non serve nessun meccanismo per proteggere dallo scarto quello
che sta in cache.

**Com'è fatta dentro.** Era l'unico pezzo del piano senza una disposizione, e per
coerenza segue la stessa regola di tutto il resto: **il disco è la verità, niente
indice da tenere allineato.**

- **un file per richiesta**, il cui nome è l'impronta della richiesta. Cercare è
  guardare se quel file c'è;
- **quando è stata usata l'ultima volta lo dice la data del file**, aggiornata alla
  lettura. È una chiamata al sistema, non una scrittura su un indice, quindi non c'è
  una scrittura per ogni lettura;
- **quanto occupa** si somma camminando la cartella. Si fa quando serve — allo
  scarto, e quando le impostazioni lo mostrano — non a ogni voltata di pagina;
- **lo scarto** ordina per data e butta i più vecchi finché non si scende sotto il
  tetto;
- accanto ai byte serve poco altro: il tipo di contenuto e, per le ricerche, quando
  scadono. Sta in un file gemello, o nel nome: è un dettaglio della fase 3.

Non c'è nessun indice da riparare dopo una chiusura brusca, e cancellare la cartella
a mano è un'operazione legittima.

**L'immagine rimpicciolita sul momento** — il passo 2 della catena, quando nel
deposito c'è una misura più grande di quella chiesta — **va nella cache come tutte le
altre.** Rifarla a ogni voltata di pagina significherebbe decodificare un JPEG grande
ogni volta: è lavoro del processore, non di rete, ma si sente eccome sfogliando. È
materiale derivato e disponibile, cioè esattamente ciò che una cache deve contenere.

**Dove sta.** Cartella a sé nella cartella dati dell'applicazione, **mai nel
deposito** (D8). Il deposito contiene ciò che è stato scaricato di proposito e va
conservato; la cache si può cancellare in qualsiasi momento senza conseguenze, e
va esclusa dai backup.

**Quanto grande.** Un tetto configurabile in Impostazioni → Archiviazione,
predefinito **512 MB** (D8). Al superamento si buttano le voci non usate da più
tempo, fino a scendere sotto il tetto. La schermata mostra quanto occupa adesso e
un comando la svuota.

**Il predefinito va guardato con l'uso reale in mente.** Se il modo normale di
lavorare è sfogliare online, la cache non è una comodità: è il magazzino principale.
Quanto si riempie non si può prevedere con un conto secco, perché dipende da quanto si
ingrandisce: un manoscritto scorso a pagina intera pesa poco, le stesse pagine
guardate a fondo pesano molto. L'ordine di grandezza però è quello di **un libro per
volta**, non di dieci: 512 MB si esauriscono in una sessione di lavoro seria.

Non è un difetto — il tetto fa il suo mestiere e butta il più vecchio — ma la
schermata deve dire quanto occupa adesso, perché alzarlo serve a non richiedere due
volte le stesse pagine sfogliando avanti e indietro. E resta vero che il modo di
**fissare** un libro non è la cache: è scaricarlo.

**Quanto a lungo.** Due politiche, una per natura del contenuto:

| Contenuto | Scadenza | Perché |
|---|---|---|
| immagini (copertine, miniature, pagine) | nessuna, solo il tetto | i pixel di un manoscritto del Cinquecento non cambiano |
| risposte delle ricerche | configurabile, predefinito **24 ore** | i cataloghi crescono, e una ricerca di ieri va rifatta |

**Come la finestra riceve i byte.** Un comando li restituisce e la finestra ne fa
un indirizzo temporaneo. Le copertine oggi non si vedono perché usano indirizzi remoti
`https://`, che la politica non ammette: è esattamente il caso che questo meccanismo
risolve, perché quei byte non arrivano più dalla rete ma da casa.

**Ma la politica di sicurezza va toccata di una riga, e va detto.** Una prima stesura di
questo paragrafo diceva il contrario, e sbagliava: le politiche dichiarate sono **due**,
una per lo sviluppo e una per l'installato, e sono diverse proprio nel punto che conta.
Quella dello sviluppo ammette gli indirizzi temporanei; **quella dell'installato no** —
e l'installato è la versione in cui le copertine sono riquadri vuoti. Senza quella riga
il meccanismo funzionerebbe in sviluppo e fallirebbe esattamente dove serve. È una riga
che non apre niente verso l'esterno: dice alla finestra che può disegnare byte che il
motore le ha già passato, dopo averli presi lui con le sue pause e i suoi controlli.

Quando arriverà il visore, per le pagine intere conviene il protocollo
nativo dei file locali — non copia i byte due volte — e allora la politica va
allargata alla cartella del deposito e a quella della cache. **Questa è la ragione
per cui la cache va decisa adesso e non dopo**: decide la disposizione delle
cartelle e la politica di sicurezza, e sono le due cose che si pagano care a
retrofit.

### 5.6 La pagina singola alla massima risoluzione

Il caso viene dalle trascrizioni: una pagina particolarmente ostica, di cui serve
tutto il dettaglio che la biblioteca ha. Capita che il libro sia scaricato e capita
che lo si stia guardando online; in entrambi i casi la risposta è la stessa.

D4 lo aveva già deciso — «se per quella pagina esiste una risoluzione superiore a
quella presente, l'interfaccia lo dichiara e offre di scaricarla alla massima
risoluzione. Il nuovo file **si aggiunge**, non sostituisce» — e la disposizione per
misura esiste esattamente per questo.

**Quando si fa: con il visore, non prima.** *(Deciso il 2026-08-19.)* Il pezzo che
manca non è il comando — chiedi la dimensione piena, passi dalla cortesia, scrivi in
`pages/max/` con la sua riga — ma il **posto da cui chiederlo**: si chiede guardando
una pagina, e il visore non c'è. Scritto adesso sarebbe un comando che nessuno può
invocare, quindi va nel ramo del visore. Il ripristino, che è l'unico punto che oggi
ne sentirebbe la mancanza (§5.4), si limita a dire che quelle pagine non sono
tornate, senza indicare un comando che non esiste.

**Come funziona, quando ci sarà:**

- la pagina si chiede alla dimensione piena e finisce in `pages/max/0034.jpg`, con la
  sua riga nel file di lato di quella cartella;
- passa dalla **cortesia** come ogni altra richiesta: è una richiesta sola, ma verso
  una biblioteca che conta;
- **non è un lavoro della coda**: è una richiesta, e aspettare qualche secondo
  guardando la pagina è accettabile. La coda serve a quello che dura minuti;
- vale allo stesso modo sui libri online: non c'è niente da scaricare *prima*, e
  quella pagina diventa la prima cosa che quel libro ha nel deposito.

**Cosa ne consegue per l'inventario.** Un libro può avere `pages/2000/` piena e
`pages/max/` con tre file. Non è un libro incompleto: è la situazione normale di chi
lavora sulle trascrizioni. L'interfaccia lo deve saper dire in questi termini, e i
dati per dirlo sono già lì.

**E per l'ottimizzazione locale**: quelle tre pagine sono state prese a piena
risoluzione **di proposito**, quindi l'ottimizzazione non le deve toccare a meno che
non sia proprio a loro che si punta. Da qui la regola del paragrafo seguente.

### 5.7 Ottimizzare le immagini in locale, per risparmiare spazio

Come in Scriptoria, dove è un'azione esplicita per documento con un valore di lato
lungo e uno di qualità JPEG.

**Cos'è.** Un **lavoro della coda** — deciso, non un'azione immediata: su 900 pagine
dura minuti e va potuto seguire, mettere in pausa e annullare come ogni altro lavoro
lungo. Rilegge le pagine di una digitalizzazione già scaricata, le rimpicciolisce al
lato lungo scelto se lo superano, le ricomprime, e sostituisce l'originale.
Riferisce quanto spazio ha liberato, pagina per pagina.

**Perché serve.** Un libro scaricato a `max` per ripiego occupa il triplo del
necessario. Un libro scaricato mesi fa con un tetto più alto di quello che serve
adesso occupa spazio per un dettaglio che non si guarda. E ripulire è meglio che
riscaricare, perché la biblioteca non ne paga il prezzo.

**Come.** La macchina esiste già: si decodifica, si ridimensiona con Lanczos, si
ricomprime in JPEG. È quello che si fa per ogni miniatura. Cambia solo il lato
lungo di arrivo e il fatto che il risultato sostituisce l'originale.

**Regole, tutte necessarie:**

- **si scrive in transito e si sostituisce con uno spostamento atomico**, come per
  ogni file che entra nel deposito: un'ottimizzazione interrotta non deve lasciare
  una pagina a metà dove prima ce n'era una intera;
- **è irreversibile e va detto**: la conferma dichiara quante pagine, da quale
  misura a quale, e quanto si prevede di liberare;
- **l'impronta va riscritta** nel file di lato, altrimenti la verifica completa
  dichiara corrotto tutto il libro;
- **la misura d'origine resta scritta** nello stesso file di lato, così di quella
  pagina si sa che è arrivata più grande e che è stata ridotta qui;
- **le miniature si rifanno**, perché derivano dalle pagine;
- **non tocca chi è già più piccolo** del lato lungo scelto: non si ricomprime per
  niente, perché ogni ricompressione perde qualcosa.

**Su cosa lavora: una cartella di misura per volta.** Non «il libro», ma
`pages/2000/` **oppure** `pages/max/`. Due ragioni: le pagine prese a risoluzione
piena di proposito (§5.6) non devono essere schiacciate da un'ottimizzazione che
puntava ad altro, e ottimizzare `max` a 2000 significherebbe farne un duplicato di
una cartella che già esiste — se è quello che si vuole, si cancella `max`.

**Configurabile**, in Impostazioni → Scaricamento: lato lungo di arrivo
(predefinito 2000, lo stesso tetto delle pagine) e qualità JPEG (predefinito 82,
come Scriptoria). Estremi accettati 512-12000 e 40-100.

Quei valori sono i **predefiniti**, e si possono cambiare al momento di lanciare
l'ottimizzazione su quel libro: la scelta dipende dal materiale — una stampa larga
sopporta molto meno di una minuscola fitta — ed è la stessa ragione per cui il tetto
delle pagine è per fonte e non solo generale (D4).

**Non è automatica.** Nessuna ricompressione alle spalle dell'utente: è
un'operazione che perde informazione, e la si chiede.

**E non tocca la cache**, che è materiale di passaggio: quello che si guarda online
non si ottimizza, si butta quando serve spazio.

### 5.8 Cosa diventa configurabile

Tutto in due schede che esistono già.

| Impostazione | Dove | Predefinito | Note |
|---|---|---|---|
| tetto della misura delle pagine | Scaricamento | 2000 px sul lato lungo | scavalcabile per fonte (D4); vale solo per lo scaricamento (§5.0), e `max` è una scelta valida |
| lato lungo delle miniature | Scaricamento | 300 px | |
| lato lungo dell'ottimizzazione locale | Scaricamento | 2000 px | scavalcabile al lancio |
| qualità JPEG dell'ottimizzazione locale | Scaricamento | 82 | scavalcabile al lancio |
| tetto della cache | Archiviazione | 512 MB | va alzato se si sfoglia molto online |
| scadenza delle ricerche in cache | Archiviazione | 24 ore | le immagini non scadono, solo il tetto |

Niente per biblioteca: la casella «Misure pronte della biblioteca» **non esiste più**,
perché quello che dichiarava lo scopre da sé la lettura all'avvio del libro (§5.9).

### 5.9 Perché una lettura per libro, e non zero

*Deciso il 2026-08-18, dopo una rilettura del piano che ha contestato il punto.*

La prima stesura diceva «il descrittore non si legge mai, senza eccezioni». Quella
parola — *mai* — era nata dalla frustrazione di una negoziazione per gruppo, e non
resisteva alle misure di questo stesso documento: leggerlo **una volta per libro**
costa 4,3 secondi su un lavoro di ore, lo 0,1%.

Quella lettura sola darebbe **automaticamente** ciò che la casella «Misure pronte
della biblioteca» dichiara a mano:

- si confrontano le misure dichiarate con i dimezzamenti delle dimensioni del canvas.
  Coincidono? allora quella biblioteca tiene pronti i dimezzamenti, e lo si sa senza
  che nessuno l'abbia compilato;
- funziona anche per le biblioteche **mai misurate** e per le fonti aggiunte per
  indirizzo diretto, che nel registro non hanno voce.

Costo in codice: qualche decina di righe — chiedi, confronta, decidi — con ripiego sul
calcolo se non risponde. **Non riporta indietro niente di quello che va via**: la
negoziazione per gruppo, la memoria delle misure e la coerenza fra riprese spariscono
comunque. Quelle erano il quarto di codice, non la lettura.

Cosa si guadagna, oltre a questo: **sparisce un'impostazione**. Che è una
semplificazione più grande di quaranta righe di codice, perché un'impostazione ha una
casella, un valore da salvare, due traduzioni, una riga di documentazione e un modo
silenzioso di essere sbagliata — una casella spenta dove doveva essere accesa dimezza
la velocità e nessuno se ne accorge. E la fase 2 smette di essere un prerequisito:
resta utile, diventa conoscenza invece di condizione.

Cosa si perde: le zero richieste, che sono più pulite e che il 47 su 47 giustifica; e
una lettura può non rappresentare tutto il libro, se dentro la stessa opera
convivono digitalizzazioni di epoche diverse.

**Adottata.** Un'impostazione in meno vale più di quaranta righe in più, e il costo
misurato è lo 0,1%. La decisione presa poche ore prima sul nome della casella —
«Misure pronte della biblioteca» — **decade**, perché la casella non esiste più.

Resta valido il ragionamento che l'aveva prodotta, e vale la pena tenerlo scritto: se
un giorno servisse esporre quella scelta all'utente, quello è il nome giusto, perché
dice cosa fa senza gergo di formato immagine.

---

## 6. Le decisioni che questo cambia

| | Cosa cambia |
|---|---|
| **D4** | **Sostituita.** «Si legge il descrittore una volta per gruppo, e la misura si sceglie fra quelle dichiarate» diventa «si legge una volta per **libro**, e serve solo a decidere **come calcolare**: la misura la calcola il manifesto». Resta tutto il resto: il tetto è una politica e non un pixel, la cartella prende il nome dal tetto e non dai pixel ottenuti, la politica «massima» esiste, la misura più vicina al tetto vince sopra o sotto, e la pagina singola a piena risoluzione si aggiunge invece di sostituire. |
| **D6** | **Estesa.** Le miniature restano ricavate dalla pagina scaricata. Si aggiungono: la cache per i libri non scaricati, e l'ottimizzazione locale come terza azione accanto a «libera spazio» e «togli». |
| **D8** | **Da attuare.** La cache era decisa e non è mai stata fatta. Si attua allargandola alle ricerche e rendendo configurabili tetto e scadenza. |
| **D2 · D5 · D7** | **Da modificare**, insieme al collasso delle migrazioni: le pagine non hanno più una riga a testa, le impronte stanno in un file di lato, la disponibilità si legge dalla cartella. |
| **D13 · D16 · D18** | **Confermate**, con le precisazioni già scritte: una pagina che non c'è si salta, i tentativi contano i fallimenti di fila, le attese sono del profilo della biblioteca. D18 **non** guadagna una voce nuova: come si calcola la misura si scopre leggendo il descrittore all'avvio del libro, non si dichiara nel profilo. |

---

## 7. Le fasi

Quattro, e le prime due non toccano una riga di codice.

### Fase 1 — I fatti, per iscritto

Il capitolo 3 di questo documento. **Già fatto**: è la condizione per poter
cancellare il resto senza perdere quello che è costato una settimana.

### Fase 2 — Misurare le undici biblioteche

Per ognuna delle undici del registro, il descrittore di una pagina: dichiara
misure? sono dimezzamenti? che livello di conformità?

**Due o tre libri per biblioteca, non uno.** Il costo è identico — sono richieste
minuscole — e una digitalizzazione sola ripeterebbe in piccolo l'errore che questo
piano si rimprovera: le collezioni dentro la stessa biblioteca sono state
digitalizzate in epoche diverse, con strumenti diversi, e non c'è ragione di
aspettarsi che si comportino tutte allo stesso modo.

**Non è più un prerequisito.** Con la decisione del §5.9 — il descrittore si legge una
volta per libro — non c'è nessuna casella da compilare, quindi il codice può partire
prima. Questa fase resta comunque da fare, per tre ragioni che valgono da sole:

- **verificare che la regola dei dimezzamenti valga oltre archive.org e Bodleian**, e
  scoprire per tempo la biblioteca che si comporta in un terzo modo che non abbiamo
  previsto;
- **provare la sessione del lettore** su un manoscritto vaticano: è l'unica cosa
  ancora aperta di questo piano (fatto 12);
- **sapere con quali livelli di conformità abbiamo a che fare**, perché il ripiego su
  `max` è l'unica cosa garantita a livello 0 e vale la pena sapere se qualcuno ci
  costringe a usarlo sempre.

Prodotto: una tabella nel documento delle decisioni, con quello che si è trovato.
Non alimenta più nessuna impostazione: alimenta la fiducia nella regola.

### Fase 3 — La riscrittura

**Quattro rami, in quest'ordine.**

**Primo — la cache.** *(fatto: PR #442, in `blocco-1`.)* Le copertine, le ricerche, la consegna dei byte alla finestra, la
riga da aggiungere alla politica di sicurezza dell'installato e due impostazioni. Non
tocca lo scaricamento, è il ramo più piccolo, e **da solo ripara le copertine invisibili
nell'app installata**, che è un difetto che esiste adesso. Fa anche da collaudo della
disposizione delle cartelle prima del ramo grande.

**Secondo — lo scaricamento e il disco.** *(fatto: ramo `feat/scaricamento-e-disco`.)* La misura, il ciclo, il disco come verità, il
file di lato. È il pezzo intrecciato: cambiare dove stanno le pagine cambia come si
riprende, che cambia il gestore. Diviso in più rami produrrebbe stati intermedi da
buttare.

Un ramo solo per questo pezzo, e non quattro, perché: non c'è nessun utente da non
rompere, le migrazioni si collassano comunque, nessuna schermata legge ancora quei
percorsi, e un diff da 1750 righe cancellate non si controlla leggendolo — si
controlla contro una specifica approvata prima, che è il modo in cui le PR di questo
progetto vengono già verificate.

I 47 gruppi misurati diventano un test a tabella con i dati veri: se la regola della
misura cambia, il test se ne accorge.

**Terzo — l'ottimizzazione locale.** *(fatto: ramo `feat/ottimizzazione-locale`.)* Stava insieme alla cache, e non può: l'ottimizzazione
**riscrive l'impronta nel file di lato** (§5.7), e il file di lato nasce nel ramo dello
scaricamento. Tenerli insieme vorrebbe dire o scrivere l'ottimizzazione contro le righe
del database che stanno per sparire, o fermare la cache ad aspettare il ramo grande. Viene
dopo, ed è il ramo più semplice dei tre perché la macchina che ridimensiona esiste già.

**Quarto — le pagine in parallelo.** *(Deciso il 2026-08-19 con l'utente.)* Un ramo
piccolo, e va da sé dopo il secondo: la struttura c'è già tutta. Il profilo della
biblioteca dichiara `host_concurrency`, l'impostazione è già in Impostazioni →
Biblioteche («Richieste insieme»), e la cortesia applica già un semaforo per host a
ogni richiesta. Manca solo che il ciclo immetta più di una pagina alla volta, entro
quel semaforo.

Due condizioni, e sono la ragione per cui il ramo è separato:

- **il predefinito è 1 per ogni biblioteca**, e si alza a mano dove serve. Il valore
  prudente di oggi è 4, scritto per limitare i lavori concorrenti fra loro: se il
  ciclo cominciasse a usarlo così com'è, ogni biblioteca mai misurata passerebbe da
  una richiesta in volo a quattro senza che nessuno abbia deciso niente;
- **la fase 2 viene prima**, perché è lei a dire quali biblioteche lo tollerano.

Cosa rende, misurato sui profili che abbiamo: su archive.org (100 richieste ogni 60 s,
pausa 600-1600 ms) quattro in volo portano un libro di 328 pagine da un quarto d'ora a
quattro o cinque minuti; su Gallica (20 ogni 60 s) non cambia quasi niente, perché il
limite a raffica lega prima della concorrenza. L'impostazione è potente dove è sicura
e inerte dove sarebbe pericolosa, e questo vale finché i profili dicono la verità.

Quello che il ramo tocca, oltre al fan-out: la regola della misura si declassa da uno
stato condiviso (con N richieste in volo un rifiuto si paga fino a N volte invece di
una), i contatori si aggregano in un punto solo, e le righe del file di lato si
scrivono in append concorrente — una sola scrittura per riga, che è già come si fa, e
diventa un invariante da dichiarare.

### Fase 4 — Rifiniture note

*Fatte tutte e tre nel ramo 2.*

- i commenti del codice dicevano «carte» dove l'unità si chiama **pagina**;
- una pagina ritrovata sul disco registrava un indirizzo che nessuno ha mai chiesto:
  sparito con il recupero;
- la stima del tempo era una media da inizio lavoro — le pagine ritrovate la rendevano
  ottimista, un raffreddamento pessimista per tutto il resto. Adesso guarda le ultime
  dieci pagine.

### Cosa si fa della PR #440

Le sei correzioni della settimana stanno su un ramo di cui metà del codice sta per
essere cancellato, e che introduce un difetto su Gallica — togliendo il ripiego sul
riquadro senza accorgersi che era la cosa che faceva funzionare le biblioteche che
non dichiarano misure.

- **Si porta avanti la correzione della coda** — i tentativi che si azzerano alla
  ripresa, la durata misurata sull'esecuzione — su una PR sua. Vive in un modulo
  che resta, è indipendente da tutto il resto, e sono due difetti veri.
  *Fatto il 2026-08-18: è la #441.*
- **Si chiude il resto.** Le correzioni allo scaricamento e alla cancellazione
  sono superate da questo piano; chiudere il ramo riporta anche Gallica a
  funzionare come prima. *Fatto: la #440 è chiusa senza fondere, e il ramo resta.*
- **Si tiene tutto quello che ha scoperto**: il capitolo 3 di questo documento e i
  casi di prova, che diventano i test della fase 3.

---

## 8. Cosa non tocchiamo, e perché

Metà di questo sottosistema è complicato perché il problema lo è. Delimitare
quello che resta è parte del piano quanto delimitare quello che va.

- **I profili di cortesia.** Gallica bandisce, e i valori vengono dalle prove sul
  campo. Pausa, raffica, concorrenza per host e raffreddamenti stanno in 229
  righe: è il prezzo giusto. **Con la cache la cortesia copre anche le copertine e
  le ricerche**, che oggi la scavalcano.
- **Transito, validazione, spostamento atomico.** I file troncati esistono. Un file
  a metà non deve poter entrare nel deposito, e la sola presenza del file è ciò di
  cui una ripresa si fida.
- **La coda dei lavori.** Un libro dura ore. E non è dello scaricamento: la usano
  le verifiche, e la useranno il riconoscimento testo e le esportazioni.
- **La lettura dei manifesti.** Presentation 2 e 3 sono due formati veri.
- **La disposizione dei percorsi nel deposito.** Componenti validate contro la
  risalita, percorsi sempre relativi alla radice: è ciò che permette di spostare il
  deposito.

---

## 9. Come sappiamo che è andata bene

Sei numeri, misurabili prima e dopo. Se a fine lavoro non sono questi, il lavoro
non è finito.

| Misura | Oggi | Obiettivo |
|---|---|---|
| righe di codice del gestore | 1425 | quattro file sotto 500 |
| funzione più lunga | 273 righe | sotto 80 |
| argomenti della funzione peggiore | 16 | 8 |
| deroghe al limite di argomenti | 5 | 0 |
| richieste di rete per pagina | 1,14 | 1,003 (una per pagina, più una per libro) |
| copertine visibili nell'app impacchettata | 0 | tutte |

E sette prove a mano, che i test non possono fare. Le ultime quattro vengono dagli
usi dichiarati nel capitolo 1:

1. un libro di archive.org, dall'inizio alla fine, con una pausa e una ripresa in
   mezzo;
2. un manoscritto di Gallica, che è la biblioteca che non dichiara misure e che
   bandisce;
3. una ricerca con quaranta risultati, guardando i registri: le copertine devono
   passare dalla cortesia, e la seconda ricerca uguale non deve toccare la rete;
4. **una pagina alla massima risoluzione**, una volta su un libro sfogliato online e
   una su un libro scaricato: finisce in `pages/max/`, la scheda dice «completo a
   2000, più una a piena risoluzione» e **non** la chiama incompleta;
5. **sfogliare online e poi guardare la scheda**: la cache si riempie, e il conteggio
   del libro resta a zero pagine possedute. Se la scheda conta la cache, è sbagliata;
6. **l'ottimizzazione locale su `pages/2000/`** di un libro che ha anche `pages/max/`:
   la cartella `max` non viene toccata;
7. **il tetto messo a `max`**, e poi si scarica una pagina sola e si sfoglia il resto
   online: la pagina scaricata è a piena risoluzione, e lo sfogliare non è diventato
   più pesante di prima. Se lo è diventato, il tetto sta influenzando qualcosa che
   non è lo scaricamento (§5.0).

---

## 10. Decisioni prese

Cinque, il 2026-08-18, con l'utente. La quinta ne ha fatta decadere una.

1. ~~**La casella per biblioteca si chiama «Misure pronte della biblioteca».**~~
   **Decaduta** poche ore dopo, con la decisione 5: la casella non esiste più, perché
   quello che dichiarava lo scopre la lettura del descrittore all'avvio del libro
   (§5.9). Il nome resta scritto perché era quello giusto, se un giorno servisse.
2. **L'originale del ripiego si butta.** Quando la misura calcolata viene rifiutata
   si chiede la dimensione piena, si rimpicciolisce al tetto e si conserva solo il
   risultato. I byte in più sono già stati spesi in rete, ma non occupano disco, e
   il deposito resta coerente con il tetto scelto. Chi vuole la copia integrale ha
   la politica «massima».
3. **L'ottimizzazione locale è un lavoro della coda.** Su 900 pagine dura minuti: va
   seguita dal pannello, messa in pausa e annullata come ogni altro lavoro lungo.
4. **Il file di lato è uno per cartella di misura.** Sta dentro `pages/2000/`
   insieme alle pagine che descrive, quindi «libera spazio» lo porta via con loro:
   niente pulizia da ricordare e niente modo di divergere. Se la stessa opera ha due
   misure, ha due file.

5. **Il descrittore si legge una volta per libro**, e serve a decidere *come*
   calcolare la misura: se quella biblioteca tiene pronti i dimezzamenti, e se le
   dimensioni dichiarate dal manifesto sono attendibili. Costa 4,3 s su un lavoro di
   ore. In cambio spariscono un'impostazione, il suo modo silenzioso di essere
   sbagliata, e la fase 2 come prerequisito. Sostituisce la decisione 1 (§5.9).

### Ancora da decidere, nella fase 2

**La sessione del lettore.** Il profilo della Biblioteca Vaticana dichiara che le
sue immagini si servono solo dopo aver visitato la pagina del lettore, e **nessuno
legge quel valore** (fatto 12). Se serve, i suoi manoscritti oggi non si scaricano;
se non serve, quel valore va tolto. Non è una preferenza: è una prova da fare su un
manoscritto vaticano, insieme alle misure delle undici biblioteche.
