---
title: Ricerca delle fonti
---

# Ricerca delle fonti

La Dashboard offre una sola schermata di **Ricerca**: una casella per cercare
opere nelle biblioteche e per aprire direttamente un'opera di cui si conosce
l'identificativo o l'indirizzo. I risultati restano separati dal catalogo
personale finché non vengono aggiunti alla Biblioteca.

## Cercare

La ricerca si apre dalla barra a sinistra, sotto Dashboard.

A sinistra della casella si sceglie **dove cercare**: tutte le biblioteche, una
sola, oppure una scelta personalizzata. «Tutte» comprende le biblioteche che
cercano per parole, non le raccolte aggregate: Europeana e Internet Archive
moltiplicano i risultati di altre istituzioni e si aggiungono di proposito nei
**criteri avanzati**, prima scheda della colonna di destra, dove si spuntano le
fonti una per una. Europeana richiede una chiave in **Impostazioni → Biblioteca
→ Biblioteche**. La scelta delle fonti resta per le ricerche successive.

Le parole si scrivono nella casella e la ricerca parte dal comando accanto. Il
comando dei criteri avanzati apre titolo, autore, tipografo, istituzione,
lingua, materiale e anni. Si può cercare anche solo per campi, senza parole
libere. Un altro comando avvia una ricerca nuova, svuotando parole e criteri e
lasciando le fonti scelte.

Sopra i risultati si sceglie l'ordine: **per pertinenza** (l'ordine in cui le
biblioteche rispondono), **per anno**, **per autore** o **per titolo**; i
risultati senza il dato vanno in fondo. Quando qualche fonte ha altri
risultati, il comando in fondo all'elenco li chiede a tutte quelle che ne
hanno: resta al suo posto e gira finché le pagine nuove non sono arrivate, e i
risultati che si aggiungono entrano con una breve dissolvenza.

L'avvio registra i criteri della ricerca. Ogni pagina di risultati di ciascuna
fonte è un lavoro indipendente: una fonte lenta o in errore non impedisce alle
altre di pubblicare risultati. La scheda **Fonti**, a destra, ha una riga per
biblioteca con stato, numero di risultati arrivati, il comando «riprova» dopo
un errore e il filtro per guardare solo quella fonte. Pause, ripartenze e
tentativi stanno nel pannello dei lavori. Le ricerche già fatte si riaprono
dalla scheda **Ricerche**, che conserva criteri e risultati.

## Criteri bibliografici

Le biblioteche che sanno cercare campo per campo ricevono i criteri così come
sono scritti. Oggi è il caso di Gallica: titolo, autore e tipografo vanno sui
rispettivi campi del catalogo, «manoscritto» e «stampato» sul tipo di
documento, gli anni sulla data. Cercando «Le guidon des capitaines» come titolo
Gallica risponde con 5 opere; la stessa frase cercata ovunque, testo delle
pagine compreso, ne dava 17 427. Le parole libere del campo in cima restano una
ricerca generale.

Le altre fonti ricevono le parole libere, oppure titolo, autore e tipografo
quando si è cercato solo per campi. I criteri scartano poi i risultati i cui
dati dichiarano altro. Lingua e istituzione filtrano sempre i risultati
arrivati: Gallica vuole la lingua in codici che nessuno scrive a mano. Il
suggerimento accanto a ogni criterio dice quali delle fonti scelte lo cercano
davvero.

Quando manca il dato per decidere — un catalogo che non dichiara l’anno, una
data per secolo — il risultato resta in elenco segnato **dati incompleti**. Un
valore generico come `text` non viene convertito in «manoscritto» o «stampato».
Valuta il numero di fonti concluse e quelle in errore prima di interpretare
l’assenza di risultati.

## Perché un risultato è uscito

Le parole cercate sono **in grassetto e nel colore d'accento** dove compaiono:
nell'autore, nell'anno o nel titolo della riga, e aprendo la riga nei dati della
scheda — soggetti, descrizione, altri responsabili. Quando la biblioteca dice da
sé in quale sezione le ha trovate (e-codices, Bodleian, Cambridge, Estense,
Institut de France, Vaticana), la sezione compare fra i dati della scheda aperta
con il suo nome, per esempio «Bibliography», e il testo intorno alle parole.

Se le parole non compaiono in nessun dato della scheda, accanto alla riga
piccola c'è un'icona: al passaggio del mouse dice che su Gallica sono state
trovate solo nel testo trascritto delle pagine, che la ricerca per parole
libere di Gallica comprende, o in generale che la biblioteca le ha trovate
altrove.

Il confronto ignora maiuscole e accenti e accetta una parola come inizio di una
più lunga («achille» trova «Achilles»); le parole di due lettere non contano.

**Frase esatta**, nei criteri avanzati, cerca le parole in fila invece che una
per una, dove la biblioteca lo sa fare: oggi Internet Archive. Il suggerimento
accanto dice quali delle biblioteche scelte la rispettano; le altre cercano le
parole come sempre.

## Come cercano le biblioteche

Le biblioteche non cercano tutte allo stesso modo, e i risultati lo riflettono:

- **Gallica** con le parole libere guarda la scheda **e il testo delle pagine**:
  molti risultati di giornali o riviste escono per una parola in una pagina
  qualunque. Titolo, autore e tipografo nei criteri cercano solo nella scheda.
- **e-codices** unisce le parole con «o»: Glossa tiene solo i risultati che le
  contengono tutte. Una pagina che resta vuota con altre dopo si continua da
  sola, fino a cinque pagine vuote di fila; poi resta il comando «altri
  risultati».
- **Estense** cerca le parole come frase unica: con più parole Glossa chiede la
  più lunga e tiene i risultati che le contengono tutte, guardando i primi 200.
- **Monaco (MDZ)** restituisce solo le opere digitalizzate.
- **Library of Congress** risponde alle ricerche automatiche con una verifica
  che solo un browser supera; la **Biblioteca di Scozia** non ha una ricerca
  interrogabile, e Glossa cerca in un elenco di titoli delle sue raccolte.
  Tutte e due restano fuori da «tutte» e si scelgono a mano.

Una ricerca che torna vuota non si conserva nella cache: rifatta, interroga di
nuovo la biblioteca.

## Identità e provenienza

Ogni risultato mostra autore, anno, luogo e tipografo, poi il titolo; in
piccolo la biblioteca, le pagine e «PDF disponibile» quando c'è. Il
raggruppamento usa l’identità esatta del manifesto IIIF: la stessa opera
arrivata da più biblioteche è una riga sola con il numero delle copie, e
aprendo la riga si sceglie quale copia usare. Titoli simili non bastano per
unire risultati. Il servizio interrogato,
l’istituzione di conservazione e il servizio delle immagini possono essere
organizzazioni diverse.

**Estendi alle raccolte** crea una ricerca collegata con gli stessi criteri, limitata
alle raccolte selezionate che non erano già incluse.

## Apertura per identificativo o indirizzo

Nella stessa casella si può scrivere o incollare l'identificativo di un'opera,
una segnatura o un indirizzo. Mentre si scrive, Glossa controlla quali
biblioteche lo riconoscono — senza nessuna richiesta di rete — e per ciascuna
mostra sopra i risultati la riga **Apri su …**: il comando accanto apre
l'opera, pronta da aggiungere alla Biblioteca. Chi cerca per parole non vede
niente in più.

Una forma inequivocabile, come un indirizzo o un ARK, viene sempre proposta.
Un identificativo nudo viene proposto solo se è una parola sola con almeno una
cifra: su Gallica qualunque parola di sei lettere ha la forma di un
identificativo, e proporre di aprire «Rabelais» come un'opera sarebbe rumore.
Un indirizzo completo si apre anche con Invio; il manifesto IIIF di
un'istituzione non elencata si apre allo stesso modo, incollandone l'indirizzo.

| Fonte | Ricerca per parole | Esempio di riferimento diretto |
| --- | --- | --- |
| Europeana | Sì, con chiave API | Indirizzo della scheda |
| Internet Archive | Sì | Indirizzo `archive.org/details/…` |
| Wellcome Collection | Sì | Indirizzo di un manifesto IIIF |
| Biblioteca Vaticana | Sì | `Urb.lat.1779` |
| Gallica | Sì | Identificativo ARK o indirizzo Gallica |
| e-codices | Sì | `bbb-0264` |
| Bodleian Libraries | Sì | Indirizzo dell’oggetto |
| Biblioteca Estense | Sì | Identificativo o indirizzo del visore |
| Institut de France | Sì | `17837` |
| Cambridge University Digital Library | Sì | `MS-ADD-03996` |
| Bayerische Staatsbibliothek | Sì | `bsb00026283` |
| Library of Congress | Sì | Indirizzo `loc.gov/item/…` o `loc.gov/resource/…` |
| Harvard Library | Sospesa nell’integrazione | `drs:123456` o `ids:123456` |
| Heidelberg University Library | No | `cpg848` |
| e-rara | No | Numero della scheda |
| e-manuscripta | No | Numero della scheda |
| National Library of Scotland | Sì, sui titoli delle raccolte digitali | Numero dell’opera, per esempio `133475158` |
| University of Glasgow | No | Indirizzo del manifesto IIIF, offerto dalla scheda dell’opera |
| IIIF diretto | No | Indirizzo completo del manifesto |

La tabella descrive le capacità implementate in Glossa, non la disponibilità
in tempo reale dei servizi. Limitazioni di rete e controlli anti-automazione
possono impedire una richiesta anche per una fonte supportata.

## Cercare sul sito della biblioteca

Accanto a ogni biblioteca compare un comando che apre la sua pagina di ricerca
nel browser, con le parole già scritte dove la biblioteca le accetta
nell’indirizzo. Serve quando la ricerca interna non basta: quello che Glossa
interroga è ciò che la biblioteca espone a un programma, che quasi mai coincide
con tutto il suo catalogo. Si cerca sul loro sito, si copia l’indirizzo
dell’opera e lo si incolla qui per aprirla.

Il comando compare quando l’elenco dei risultati resta vuoto, quando si stanno
guardando i risultati di una sola biblioteca, e nella scheda di un’opera che
non porta con sé l’indirizzo della propria pagina.

## Disponibilità delle riproduzioni

Una scheda bibliografica non implica che esista una riproduzione consultabile.
Glossa verifica i risultati visibili e distingue gli elementi non ancora
controllati, quelli aperti correttamente e quelli dichiarati non disponibili.
Questi ultimi restano visibili con l’indicazione **non consultabile**.
Un timeout o un limite di richieste non viene interpretato come assenza dell’opera.

## Conservazione dei risultati

**Aggiungi alla Biblioteca** salva la fonte nel catalogo; **Aggiungi a un
workspace** la salva e crea anche il collegamento. Aggiungere di nuovo lo
stesso manifesto non duplica la fonte.

Le ricerche persistenti conservano criteri, esecuzioni e risultati fra le
sessioni e sono incluse nel backup. I lavori si fermano quando l’app è chiusa.
La cache delle risposte di rete è distinta dallo storico: il comando di
aggiornamento rilegge lo stato della ricerca, mentre «riprova» e una ricerca
nuova interrogano di nuovo le fonti.
