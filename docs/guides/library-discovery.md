---
title: Biblioteca e fonti IIIF
---

# Biblioteca e fonti IIIF

La Biblioteca è il catalogo personale delle fonti che hai scelto di conservare. Contiene la scheda bibliografica di ogni opera, le copie digitali che le biblioteche mettono a disposizione, le immagini che hai scaricato sul computer e i collegamenti ai tuoi workspace.

Questa guida segue il percorso completo: cercare una fonte, aggiungerla al catalogo, leggerla nel visore, scaricarla, gestire lo spazio che occupa. Le impostazioni che governano misure e ritmo di rete sono descritte in [Archiviazione e lavori](/guides/storage-and-jobs).

## Opera, digitalizzazione e versione locale

Tre livelli diversi, che la Biblioteca tiene distinti perché rispondono a domande diverse.

- **Opera** — il libro come oggetto bibliografico: titolo, autore, data, lingua, segnatura. È la scheda del catalogo.
- **Digitalizzazione** — la copia digitale prodotta da una biblioteca. Due biblioteche che hanno fotografato lo stesso manoscritto danno due opere distinte nel catalogo, perché hanno segnature diverse; la stessa biblioteca può invece offrire la stessa copia in formati diversi, per esempio come sequenza di immagini e come PDF.
- **Versione locale** — le immagini che hai sul tuo computer, a una certa misura in pixel. Dello stesso libro puoi averne più di una: quella scaricata dalla biblioteca e quella ridotta da Glossa per occupare meno spazio.

## Cercare una fonte

La ricerca parte dalla Dashboard: scegli la biblioteca, scrivi cosa cerchi, avvia con l'icona di ricerca. La ricerca non scarica materiale.

Le biblioteche non hanno le stesse capacità, e Glossa dichiara cosa accetta ciascuna:

- **Internet Archive** — parole di ricerca, oppure l'indirizzo della pagina di dettaglio.
- **Biblioteca Vaticana** — la segnatura, scritta come ti viene (`Urb. lat. 1779`, `urb-lat-1779`, `Urblat1779` portano allo stesso manoscritto), l'indirizzo della pagina di lettura, oppure parole da cercare nel suo catalogo.
- **Gallica** — l'identificativo ARK, un indirizzo di Gallica in qualunque forma, oppure parole da cercare per titolo. Se scrivi una parola che somiglia a un identificativo, Gallica cerca prima: meglio qualche risultato che un'opera inesistente.
- **e-codices** — la segnatura composta (`bbb-0264`), l'indirizzo della pagina di lettura, oppure parole da cercare.
- **Library of Congress** — parole di ricerca, oppure l'indirizzo di un elemento del catalogo (`loc.gov/item/...`, `loc.gov/resource/...`). Il catalogo contiene molto più di quello che Glossa sa aprire: i risultati senza una riproduzione leggibile non compaiono.
- **Harvard Library** — parole di ricerca, oppure il gettone dell'oggetto (`drs:123456`, `ids:123456`), che compare anche dentro gli indirizzi del suo visore. Il numero del catalogo generale non vale: non porta a una riproduzione.
- **Cambridge University Digital Library** — parole di ricerca, l'indirizzo del visore, oppure la segnatura nella forma con i trattini (`MS-ADD-03996`).
- **Digital Bodleian** — parole di ricerca oppure l'indirizzo dell'oggetto. È l'unica che dichiara da sé l'indirizzo del manifesto di ogni risultato, invece di farlo ricavare dall'identificativo.
- **Heidelberg** — parole di ricerca, la segnatura (`cpg848`) o l'indirizzo del visore.
- **Biblioteca Estense** — parole di ricerca oppure l'identificativo dell'opera, anche preso da un indirizzo del visore Mirador.
- **Institut de France** — parole di ricerca, il numero della scheda (`17837`) o un suo indirizzo.
- **Indirizzo IIIF diretto** — l'indirizzo completo di un manifesto, di qualunque istituzione, anche non in elenco.

I risultati appaiono in un elenco, ognuno con miniatura e dati essenziali: autore, data, **quante pagine ha l'opera** e da quale biblioteca viene. Il numero di pagine si vede senza aprire la riga, perché è quello che fa decidere se vale la pena guardarla. Quando il catalogo non lo dichiara — succede con i manoscritti — la voce non compare, invece di scrivere uno zero che sarebbe falso. Selezionando un risultato, la riga si apre e mostra titolo completo, descrizione e tutti i metadati disponibili.

Di ogni risultato Glossa conserva **tutto quello che la biblioteca ha detto**, anche i dati che nessuna schermata mostra oggi: rifare la ricerca domani per recuperarli sarebbe lavoro sprecato, e la biblioteca potrebbe non ridarli uguali.

## Aggiungere una fonte al catalogo

Ogni risultato ha due comandi:

- **Aggiungi alla Biblioteca** — la salva nel catalogo personale, senza collegarla a nessun workspace.
- **Aggiungi a un workspace** — apre l'elenco dei tuoi workspace: scegline uno per collegare subito la fonte lì, oltre a salvarla in Biblioteca.

Una fonte è unica per manifesto: aggiungerla di nuovo non crea un duplicato, collega semplicemente il nuovo workspace scelto.

## Il catalogo

La Biblioteca è un catalogo, non la vista di un workspace: mostra le opere di tutti i workspace insieme. Le opere archiviate restano fuori finché non chiedi di vederle, con il comando apposito fra i filtri. Il comando sopra i risultati alterna vista a elenco e vista a griglia.

### Che cosa dice una riga

Tutta la parte informativa della riga — copertina, titolo, dati — apre l'opera con un clic, e si comporta allo stesso modo in elenco e in griglia.

Sotto il titolo c'è una **riga di dati** a separatori: biblioteca di provenienza, pagine dichiarate, misure presenti sul computer, spazio occupato. Per esempio:

```
Vatican Library · 328 p. · 2000+4000 px · 742 MB
```

Se non hai niente in locale l'ultima voce è `online`. Quando qualcosa c'è, in fondo alla stessa riga compare una **barra corta** con il conteggio accanto: verde e `100%` a libro completo, gialla e `120/328` quando ne mancano.

Sotto la riga di dati stanno le **etichette dei collegamenti**: i workspace a cui l'opera appartiene e le collezioni di cui fa parte. Cliccarne una la scollega; i due comandi accanto aprono l'elenco dei workspace e delle collezioni dove l'opera non è ancora. **Un'opera può stare in più workspace e in più collezioni insieme** e non viene mai duplicata: collegarla in due posti non fa due copie, né dei dati né dei file.

### I comandi della riga

I comandi che agiscono sui file e sulla scheda stanno tutti nel menu **«···»** — scarica, verifica, riduci le immagini, libera spazio, e più in basso, dopo un filo di separazione, archivia e togli. Restano sulla riga soltanto i collegamenti: le etichette dei workspace e delle collezioni, con i due comandi per aggiungerne. Quelli che in quel momento non servono restano al loro posto, spenti, così sai sempre cosa si può fare. Tenere il cestino fuori dal menu significherebbe averlo a un clic di distanza su ogni riga di un catalogo lungo.

### Filtri, ordinamento e viste salvate

I **filtri** vivono in una colonna a destra, che si ridimensiona e si richiude come gli altri pannelli laterali: la larghezza e lo stato aperto o chiuso si ricordano, e quando è chiusa un conteggio dice quanti filtri sono attivi. In cima c'è la ricerca — scrivi titolo o autore — e sotto tipo di opera, lingua, biblioteca di provenienza, disponibilità, workspace e collezione. Il filtro workspace mostra le opere collegate a quello che scegli, oppure — con l'ultima voce — solo quelle che non stanno in nessun workspace. I filtri lavorano su quello che hai già davanti, senza ricaricare niente. Lingua e biblioteca di provenienza offrono soltanto i valori davvero presenti nel tuo catalogo; tipo di opera e disponibilità elencano sempre tutte le voci previste, e workspace e collezione elencano quelli che hai creato anche se nessuna opera li usa. Il comando con la gomma azzera tutto.

**Ordinamento** — L'ultima tendina decide l'ordine: per titolo (come parte), per autore (le opere senza autore vanno in fondo) oppure per data di aggiunta, dalla più recente. L'ordine scelto entra anche nelle viste salvate.

**Viste salvate** — Il comando col segnalibro apre le viste salvate: dai un nome alla combinazione di filtri che stai usando e la ritrovi lì, con un clic. Ogni vista si può eliminare. Una vista salvata quando i filtri erano diversi continua a funzionare: quello che non si riconosce più torna semplicemente neutro.

**Collezioni** — Una collezione è un'etichetta che raccoglie opere, e serve a tenere insieme materiali della stessa ricerca senza spostarli. Si aggiunge dalla riga del catalogo o dalla scheda dell'opera, e un'opera può stare in più collezioni insieme: non si fonde e non si duplica niente, e togliere un'etichetta non tocca né l'opera né le altre collezioni.

## La scheda dell'opera

Cliccando la parte informativa di una riga si apre la **scheda dell'opera**, a tutta pagina. La schermata è divisa in due: al centro il visore delle pagine, a destra una colonna di informazioni a linguette che si può ridimensionare e richiudere.

In cima, su una riga sola: a sinistra il comando per tornare al catalogo, il titolo e la data; al centro **quale digitalizzazione stai leggendo**, con il collegamento al sito della biblioteca e, quando ce n'è più di una, la tendina per cambiarla; a destra i comandi dell'opera. La copia aperta è sempre dichiarata, anche quando è l'unica.

### Le quattro linguette

- **Opera** — i dati bibliografici: titolo, tipo di opera, autore, data, lingua, editore, altri responsabili, diritti, descrizione fisica, soggetti, volume, descrizione, luogo di origine, provenienza, note, serie o collana, genere e forma, identificativo standard, copertura, opere collegate. Un campo che la biblioteca non dichiara mostra «—» e non sparisce, così ogni scheda si legge allo stesso modo. I campi che compaiono raramente stanno sotto **Altri metadati**; i riferimenti interni — indirizzo del manifesto, protocollo, identificativi tecnici — stanno sotto **Dati tecnici**, chiuso all'apertura e con il comando per copiarli.
- **Digitalizzazioni** — le copie digitali registrate e le versioni locali. In cima il comando di scaricamento con la misura; sotto, una riga per ogni versione presente sul computer.
- **Organizzazione** — i workspace e le collezioni a cui l'opera è collegata.
- **Note** — un editor con formattazione per le tue annotazioni sull'opera. Si apre in anteprima e salva da sé; lo stato del salvataggio è scritto accanto al titolo.

Accanto alle icone delle linguette è scritto il nome di quella aperta, come negli altri pannelli dell'applicazione.

### Correggere i dati bibliografici

Titolo, autore, data e lingua si correggono a mano: il comando con la matita apre il campo, Invio salva, Esc annulla. Un campo corretto porta un segno accanto all'etichetta; passandoci sopra leggi cosa diceva la biblioteca, e il comando accanto al valore riporta all'originale.

**Il dato originale non viene mai sovrascritto**: la correzione vive a parte, quindi si può sempre tornare indietro. Riscrivere esattamente il valore della biblioteca non lascia nessun segno di correzione, perché non c'è niente da segnalare. Gli altri campi non hanno ancora un comando di modifica in questa scheda.

**Risincronizza con la biblioteca** — Il comando nell'intestazione della sezione dei dati richiede di nuovo la scheda alla biblioteca e riscrive i dati con quelli appena ricevuti. **Le correzioni fatte a mano vengono cancellate**: dopo la risincronizzazione la scheda dice quello che dice la biblioteca, e se ti serviva un titolo diverso va corretto di nuovo. Restano le note che hai scritto e restano le pagine scaricate: la risincronizzazione riguarda i dati bibliografici, non i file.

### Le versioni locali

Ogni versione presente sul computer ha la sua riga, che dichiara la misura in pixel, l'origine (scaricata dalla biblioteca o creata da Glossa), la copertura in pagine, lo spazio occupato e lo stato. I comandi stanno **su quella riga** — leggila nel visore, riducila, cancella soltanto lei — perché nell'intestazione della sezione non si capirebbe su quale versione agiscono.

L'elenco si rilegge sempre dal deposito, quindi una versione appena creata compare subito, senza riaprire l'opera.

## Il visore delle pagine

Sfogli il libro pagina per pagina, con le miniature nella colonna a sinistra. La barra del visore tiene la navigazione a sinistra — comando per aprire e chiudere le miniature, pagina precedente e successiva, campo per saltare a un numero, numero della pagina corrente — la provenienza dell'immagine al centro e i comandi a destra.

Glossa ricorda dove eri arrivato: riaprendo il libro torni a quella pagina.

### Da dove arriva l'immagine

Al centro della barra c'è scritto **da dove arriva la pagina che stai guardando**, e le parole sono due: **File locale** quando la pagina è sul tuo computer, **File online** quando non lo è. Il pallino accanto dice il resto: spento per un file tuo, **giallo** quando la pagina arriva dalla cache — l'hai già vista in questa sessione, ma chiudendo non resta — e **verde** quando è appena arrivata dalla biblioteca. Passandoci sopra leggi la provenienza per esteso e i pixel che stai davvero guardando.

Il visore **usa quello che hai sul computer**. Se hai scaricato il libro, le pagine e le miniature si leggono dal disco: compaiono subito, non costano nessuna richiesta alla biblioteca e funzionano anche senza collegamento. Se non hai niente, la pagina si chiede alla biblioteca **in una volta sola**, come immagine intera: è il modo più rapido di vederla.

Se di una pagina hai sul computer una misura migliore di quella impostata, è quella che vedi: la misura scelta nelle impostazioni dice cosa chiedere alla biblioteca, non quanto peggiorare quello che possiedi già.

Se cancelli le pagine locali mentre stai leggendo, Glossa si accorge da sé che quella copia non c'è più: la pagina resta leggibile, e le successive vengono chieste alla biblioteca invece di essere cercate in una cartella che non esiste.

### Leggere solo i file locali

Fra i comandi a destra, accanto a quello che salva la pagina, c'è **leggere solo i file locali**: acceso, il visore non chiede più niente alla biblioteca e su una pagina che non hai compare un avviso al posto dell'immagine; spento, le pagine mancanti tornano ad arrivare dalla biblioteca. Vale per il libro aperto e si spegne chiudendolo.

### Salvare la pagina aperta

Il comando che salva la pagina conserva **solo quella aperta**, usando gli stessi byte che stai già guardando: non la chiede una seconda volta. Mentre salva, l'icona gira; quando la pagina è sul computer il comando lascia il posto a un segno verde, che è uno stato e non un pulsante spento. Il suggerimento scrive **quanti pixel** verranno salvati: sono quelli della pagina che hai davanti, che su un libro ancora tutto online possono non coincidere con la misura impostata.

La linguetta Digitalizzazioni si aggiorna subito: spazio, conteggio e versioni locali non aspettano la riapertura dell'opera.

**Sfogliando un libro scaricato a metà, i buchi si riempiono da soli.** Le pagine che mancavano restano sul computer senza che tu lanci niente: il conteggio nella scheda cresce mentre leggi, e riaprendo quelle pagine non costano nessuna richiesta.

### Zoom e dettaglio

Lo zoom arriva ben oltre la dimensione reale della pagina: ingrandendo molto l'immagine sgrana, ma una nota a margine si legge. Leggendo online, superata la dimensione reale Glossa passa da sola al dettaglio vero chiesto alla biblioteca. Su un libro letto dal disco l'ingrandimento resta quello della misura con cui l'hai scaricato: più grande si vede, non più nitido.

Quando l'indice del libro dichiara misure già pronte, Glossa usa la più piccola che resta nitida nel visore. Altrimenti usa subito un dimezzamento della pagina, senza aspettare una richiesta tecnica aggiuntiva prima di mostrarti l'immagine. Le miniature già apparse restano disponibili mentre scorri avanti e indietro; anche le pagine già viste vengono riprese dalla cache, non dalla biblioteca.

Alcune biblioteche costruiscono le immagini nel momento in cui gliele chiedi: là la prima apertura può richiedere un minuto, e Glossa ribussa una volta invece di arrendersi. Su quelle biblioteche capita che una singola pagina, a una certa misura, non arrivi mai: Glossa la richiede in un'altra misura, che di solito arriva, invece di dichiararla guasta. L'avviso sull'attesa lunga compare solo dove quella spiegazione è vera.

## Scaricare una fonte

Il comando **scarica** mette in coda il lavoro vero: puoi cambiare schermata, metterlo in pausa, riprenderlo. Mentre gira, al posto del comando compare la percentuale; nel pannello dei lavori in basso trovi la stessa cosa con il nome dell'opera e quanto ha scaricato.

Quando una fonte è tutta sul computer il comando **sparisce**, e al suo posto resta un segno di spunta: non c'è niente da chiedere alla biblioteca, e con i limiti di cortesia un manoscritto intero può costare un quarto d'ora di rete.

**A che risoluzione** — Glossa **calcola** la misura da chiedere: dalle dimensioni della pagina, che il manifesto della biblioteca dichiara, ricava la larghezza che porta il lato lungo alla misura scelta nelle impostazioni, e chiede quella. Non c'è nessuna trattativa e nessuna richiesta in più per pagina.

All'avvio di ogni libro fa una domanda sola alla biblioteca, che costa qualche secondo su un lavoro di ore, e serve a sapere se quella biblioteca tiene già pronte le misure ridotte: se le tiene, chiedergliene una vale il doppio della velocità. Se la domanda non riceve risposta si va avanti col calcolo, che funziona ovunque.

Se la biblioteca rifiuta la misura chiesta, Glossa prende la pagina alla sua dimensione piena e **la conserva così com'è**: non rimpicciolisce niente da sé, perché ridurre un'immagine le fa perdere qualcosa e non è una cosa che deve succedere alle tue spalle. Quel libro occuperà più spazio, e quando vuoi lo recuperi con il comando che riduce le immagini. Il rifiuto si paga **una volta per libro**, non a ogni pagina.

Chiedere una misura diversa da una già presente crea una **seconda versione locale** accanto alla prima, non sostituisce quella che hai. Se uno scaricamento per quel libro è già in corso, il comando lo dice invece di ignorare la richiesta.

Con i limiti di alcune biblioteche lo scaricamento è lento per scelta: vedi [Archiviazione e lavori](/guides/storage-and-jobs).

## Controllare e liberare spazio

**Verifica** confronta quello che Glossa ha registrato con quello che c'è davvero sul disco. Se manca qualcosa te lo dice e ti propone di riscaricarlo: le pagine già presenti non vengono richieste di nuovo.

Da ogni pagina che scarica Glossa ricava la sua **miniatura**, senza chiedere niente in più alla biblioteca: servono a sfogliare il libro senza rete. Finché non scarichi, le miniature si guardano online come le pagine.

**Riduci le immagini** parte da una versione locale e ne ricava una più piccola alla misura e qualità scelte, senza modificare l'originale. Le due restano affiancate, ognuna con i propri comandi.

**Libera spazio** cancella le pagine scaricate, subito e per davvero. Restano la scheda, il manifesto e le miniature, quindi il libro resta sfogliabile e le pagine si riscaricano quando servono. La conferma dice quanto stai liberando.

## Archiviare un'opera

Quando un'opera non ti serve più tutti i giorni ma non vuoi perderla, **archiviala**: sparisce dall'elenco senza uscire dalla Biblioteca. Per rivedere le archiviate accendi il comando con la cassetta fra i filtri; da lì lo stesso comando sulla riga la riporta in catalogo.

Archiviare riguarda **solo l'elenco**: le pagine già scaricate restano dov'erano. Siccome è il momento in cui te ne accorgi, subito dopo Glossa ti chiede se vuoi anche liberare lo spazio che quell'opera occupa. Puoi dire di no e farlo più tardi, o non farlo mai: niente viene cancellato senza che tu lo chieda.

## Togliere una fonte

Il comando di rimozione toglie l'opera **per intero**: la scheda, i collegamenti ai workspace, tutto quello che ha nel deposito — manifesto, miniature e pagine scaricate — **e anche le pagine tenute in cache**. È l'unico momento in cui Glossa butta via quello che ha messo da parte: così lo spazio si libera davvero, e riaggiungendo la stessa opera le pagine tornano a essere chieste alla biblioteca. La conferma dice quanto spazio stai eliminando.

Se vuoi tenere l'opera e recuperare solo lo spazio, il comando è un altro: **libera spazio**. Se invece vuoi solo toglierla di mezzo senza perderla, **archiviala**: la rimozione non ha ripensamenti, l'archivio sì.

## Le impostazioni della Biblioteca

Stanno in **Impostazioni → Biblioteca**, in tre linguette:

- **Biblioteche** — una riga per biblioteca, con il profilo di rete che segue e il modo in cui le si chiedono le immagini.
- **Immagini** — la misura delle pagine, quella delle miniature e i valori con cui si ricavano le versioni ridotte.
- **Configurazioni** — i profili di rete, cioè i ritmi condivisi da più biblioteche, con salvataggio esplicito.

La misura delle pagine è un tetto, non un obbligo: le pagine già più piccole si prendono come sono. La stessa scelta si può fare sulla singola opera, e lì vince, perché la misura dipende dal materiale e non da chi conserva il libro. I dettagli dei profili e delle manopole di rete sono in [Archiviazione e lavori](/guides/storage-and-jobs).

## Limiti attuali

- **PDF** — una digitalizzazione in PDF compare fra le copie, con il suo nome e il collegamento alla biblioteca, ma non si scarica e non si legge dentro Glossa. Il comando di scaricamento non viene offerto per quelle copie, invece di lasciarlo fallire. Importare il testo di un PDF in un progetto di traduzione è un'altra cosa, e funziona già.
- **Ricerca** — tutte le biblioteche in elenco hanno una ricerca propria, ma con capacità diverse: alcune trovano per parole, altre soprattutto per segnatura o identificativo, e quello che accettano è scritto nell'esempio del campo. Non esiste ancora una ricerca su più biblioteche insieme.
- **Singola pagina** — salvare la pagina aperta è possibile; scegliere la misura per quella pagina, sostituirla, eliminarla o selezionarne più di una dalle miniature sono lavori ancora da completare.
- **Divieti di scaricamento** dichiarati dalle istituzioni non sono ancora applicati automaticamente.

Lo stato aggiornato di quello che manca è nella pagina [Stato della beta](/project/status).
