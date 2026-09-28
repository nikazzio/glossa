---
title: Biblioteca e lettore IIIF
---

# Biblioteca e lettore IIIF

La Biblioteca contiene le fonti aggiunte al catalogo personale, i relativi
metadati e i collegamenti ai workspace. La [ricerca](./source-search) si trova
nella Dashboard. IIIF è il protocollo usato per descrivere e visualizzare molte
delle riproduzioni digitali supportate: il manifesto contiene metadati, sequenza
delle pagine e riferimenti alle immagini.

## Struttura del catalogo

| Elemento | Funzione |
| --- | --- |
| Opera | Scheda bibliografica con titolo, autore, data, lingua e identificativi |
| Digitalizzazione | Rappresentazione digitale collegata alla scheda, per esempio un manifesto IIIF o un PDF |
| Versione locale | Immagini di una digitalizzazione conservate nel deposito a una determinata risoluzione |

Il catalogo non unifica automaticamente opere sulla base del titolo. L’identità
del manifesto evita di aggiungere due volte la stessa fonte. Più versioni locali
possono appartenere alla stessa digitalizzazione, anche se prodotte tramite
riduzione delle immagini anziché scaricamento.

## Organizzazione

Ogni opera si presenta allo stesso modo nei risultati di ricerca, nel catalogo,
nella sua scheda e nello Studio di trascrizione: prima autore, anno, luogo e
tipografo, poi il titolo in corsivo, che si ferma a due righe (una nelle
intestazioni) e si legge intero al passaggio del puntatore. In fondo, in
piccolo, biblioteca, pagine e stato. I libri antichi si riconoscono da chi li
ha scritti e stampati, non da titoli che occupano mezza pagina.

La colonna di destra raccoglie gli **scaffali**, modi fissi di guardare il
catalogo: Tutte, Recenti (aggiunte o aperte negli ultimi 30 giorni), Da
scaricare (non ancora tutte sul computer), In trascrizione (con una
trascrizione non ancora verificata per intero), Non collegate a un workspace,
Archiviate. Le archiviate compaiono solo nel loro scaffale. Sotto stanno le
**raccolte** e le **viste salvate**. Ogni voce dice quante opere contiene. Il
«+» accanto al titoletto di ciascuna sezione apre il campo per il nome, nel punto
dove la voce comparirà: Invio salva, Esc o un clic altrove annullano. Una
raccolta si elimina senza toccare le opere.

Sopra l'elenco, in una riga sua, la ricerca guarda tutti i dati dell'opera — titolo, autore,
tipografo, luogo, note, identificativo — e sotto i **filtri rapidi** restringono lo
scaffale o la raccolta scelti per tipo, secolo (ricavato dal primo anno della
data), lingua, biblioteca, stato dello scaricamento e workspace. Accanto a ogni
valore c'è il numero di opere che avrebbe con gli altri filtri già applicati.
L'elenco si ordina per titolo, autore, anno, aggiunte o aperte di recente.
Una vista salvata ricorda i filtri scelti: il suo «+» si attiva solo quando
almeno un filtro è acceso, e al passaggio del puntatore dice perché. La vista
resta un filtro, e si aggiorna da sola quando entrano opere nuove.

L'elenco si vede a righe, a copertine o in **tabella**. Le copertine hanno
tutte la stessa misura: quando lo spazio manca si accorcia il titolo, e dei
collegamenti se ne vedono due; gli altri si contano («+3») e si leggono al
passaggio del puntatore. La tabella ha una
colonna per autore, titolo, anno, luogo e tipografo, biblioteca, pagine e stato
(lavoro e scaricamento); autore, titolo e anno si ordinano cliccando
l'intestazione. Con **Raggruppa** l'elenco si divide per secolo, autore,
biblioteca o raccolta, con il numero di opere accanto a ogni gruppo; le opere
senza il dato vanno in un gruppo in fondo, e un'opera in più raccolte compare
sotto ognuna. Vista e raggruppamento restano come li lasci.

Le viste a elenco e a griglia mostrano provenienza, pagine dichiarate,
risoluzioni locali, spazio occupato e collegamenti. Un conteggio non disponibile
non equivale a zero. Le raccolte raggruppano opere senza spostarle o
duplicarle.

Un’opera può essere collegata a più workspace e raccolte. Rimuovere un
collegamento non elimina la scheda né i file. In basso a sinistra della riga
stanno i comandi per collegarla a un workspace e metterla in una raccolta; in
alto a destra, sulla prima riga, gli altri comandi come icone con il nome al
passaggio del puntatore, in tre gruppi: creare una trascrizione | scaricare,
verificare, ridurre le immagini, liberare spazio | archiviare, eliminare. Tutti
compaiono al passaggio del puntatore o quando la riga ha il fuoco. Nella
griglia a copertine e nella tabella gli stessi comandi stanno in un menu.
La riga piccola dice anche a che punto è il lavoro: in trascrizione (una
trascrizione non ancora verificata per intero), trascritta, tradotta.

### Più opere insieme

Un clic apre l'opera. Con Ctrl (⌘ sul Mac) un clic la aggiunge alla scelta o
la toglie; con Maiuscolo si scelgono tutte le opere fra l'ultima scelta e
quella cliccata, nell'ordine dell'elenco; il segno di spunta a sinistra della
riga fa lo stesso di Ctrl. Finché la scelta non è vuota, sopra l'elenco una
barra offre i comandi che valgono per tutte: raccolta (anche nuova), workspace,
scaricamento, archiviazione o ritorno in catalogo. Archiviare più opere insieme
non propone di liberare spazio, come fa per l'opera singola. Esc o la croce
svuotano la scelta, che si svuota anche cambiando scaffale o raccolta.

Una riga si trascina su una raccolta nella colonna degli scaffali: entra la riga,
oppure tutta la scelta se la riga ne fa parte.

## Scheda dell’opera

La scheda affianca il visore a un pannello con quattro sezioni:

- **Opera:** metadati bibliografici, campi aggiuntivi e riferimenti tecnici.
- **Digitalizzazioni:** copie registrate, scaricamenti e versioni locali.
- **Organizzazione:** collegamenti a workspace e collezioni.
- **Note:** annotazioni sull’opera con salvataggio automatico.

Titolo, autore, data e lingua possono essere corretti manualmente. Le correzioni
sono memorizzate separatamente dal dato originale e possono essere rimosse.
**Risincronizza con la biblioteca** acquisisce nuovamente i metadati e cancella
le correzioni manuali **solo dei campi che la biblioteca dichiara** in quella
lettura: una correzione su un campo che la biblioteca non fornisce resta,
insieme alle note e ai file scaricati.

## Dati dell'opera

La scheda mostra **tutti** i campi previsti, anche quelli che la biblioteca non
ha compilato: un campo vuoto dice che quell'informazione non è arrivata, e da lì
la puoi scrivere tu. Ogni riga si corregge con la matita e conserva il valore
originale della biblioteca, che resta consultabile e ripristinabile.

I campi essenziali — titolo, tipo di opera, autore, data, editore, lingua —
stanno sempre in vista. Il resto è raccolto in gruppi richiudibili: contenuto,
esemplare, provenienza, diritti e note. I gruppi ricordano se sono aperti, e la
scelta vale per tutta la Biblioteca.

Il tipo di opera si sceglie fra i valori previsti, perché i filtri del catalogo
si appoggiano a quelli. I campi che contengono più valori — soggetti, altri
responsabili, diritti, provenienza — si scrivono su una riga sola separandoli
con «·», come vengono mostrati.

## Lettura delle pagine

Il visore offre miniature, navigazione per numero di pagina e zoom; ricorda
la posizione di lettura. Utilizza le immagini locali quando disponibili.
In lettura online carica prima un’immagine della pagina e può richiedere
tessere di maggior dettaglio quando lo zoom lo richiede. Ingrandire una copia
locale non ne aumenta la risoluzione.

Nella barra del visore un comando apre **la pagina che stai guardando** nel
visore della biblioteca, dove la forma dell’indirizzo è verificata — oggi
Gallica e Internet Archive. Il collegamento all’opera intera sta in alto nella
scheda, accanto agli altri comandi.

L’indicatore **File locale / File online** distingue il deposito dalla lettura
remota. Il suggerimento specifica provenienza, eventuale cache e dimensioni
dell’immagine. La cache del visore non equivale a uno scaricamento permanente.

Attivando la lettura dei soli file locali, le pagine assenti mostrano un avviso
e il visore non richiede immagini alla biblioteca. L’opzione vale per l’opera
aperta e si disattiva alla chiusura.

## Conservazione e versioni

Il comando per salvare la pagina aperta conserva i byte già visualizzati.
Non richiede una nuova immagine alla risoluzione configurata: le dimensioni
effettive sono indicate nel suggerimento. Durante la lettura di una versione
scaricata parzialmente, le pagine mancanti acquisite possono completarla.

Lo scaricamento dell’intera digitalizzazione crea un lavoro in background.
Una risoluzione diversa produce una versione locale distinta. Ogni versione
ha comandi propri per aprirla, ridurla o eliminarla. Le regole di dimensionamento
sono descritte in [Archiviazione e lavori](./storage-and-jobs).

## Il PDF dell'opera

Alcune biblioteche, accanto alle immagini, offrono la stessa opera come PDF. Lo
dichiarano nel loro manifesto — sulla radice o sulla sequenza, secondo la
versione dello standard — ed è da lì che Glossa lo scopre: nessun indirizzo
costruito per analogia.

Nei **risultati della ricerca** la riga chiusa scrive «PDF disponibile» solo
quando il PDF c'è. La riga aperta dichiara sempre lo stato completo —
disponibile, non disponibile, oppure non verificato quando il manifesto non si
è potuto leggere — e aggiunge le pagine dichiarate
e la misura in pixel della prima pagina, unico indizio sulla qualità della
scansione disponibile prima di scaricare. Il manifesto si legge una volta sola
per opera, solo per le righe che stanno sotto gli occhi, due letture alla volta
al massimo, e mai per un risultato che il catalogo dichiara già senza
riproduzione.

Nella **scheda dell'opera** il PDF è una riga della sezione del libro, sotto le
copie a immagini. Dichiara disponibilità e stato locale; un comando verifica di
nuovo presso la biblioteca — serve quando il PDF è stato pubblicato dopo — e lo
stesso controllo lo fa il riallineamento. Quando il PDF è disponibile, dalla
stessa riga si scarica; quando è sul disco, la riga ne dichiara pagine e spazio
e offre i comandi per visualizzarlo, aprirlo con l'applicazione di sistema o
eliminarlo. Eliminarlo non tocca le immagini della stessa opera.

Dalla stessa riga si sceglie **cosa visualizzare**: il PDF o le immagini. Il
visore dichiara sempre quale delle due copie è a schermo, perché le pagine del
PDF e quelle della sequenza di immagini non corrispondono e non vengono fuse in
un unico sfoglio.

Limiti dichiarati: un PDF oltre i 256 MB non si apre nel visore integrato e va
letto con l'applicazione di sistema; di un PDF protetto da password o malformato
non si contano le pagine, e la scheda lo dichiara invece di inventare un numero.
La pagina viene disegnata a risoluzione fissa: ingrandita al massimo si vede
meno nitida delle tessere IIIF.

Ogni verifica ha una **scadenza**: se la biblioteca è occupata o non risponde,
lo stato resta «non verificato» e si può riprovare. Nessuna attesa resta appesa,
e una richiesta lenta non blocca le altre.

## Archiviazione ed eliminazione

| Azione | Effetto |
| --- | --- |
| Archivia | Nasconde l’opera dal catalogo attivo e conserva i file; l’eventuale liberazione dello spazio richiede una scelta separata |
| Libera spazio | Elimina le immagini scaricate, conservando scheda, manifesto e miniature |
| Elimina una versione locale | Rimuove solo i file della versione selezionata |
| Elimina l’opera | Rimuove scheda, collegamenti, i file di **tutte** le copie — immagini e documento — e la relativa cache |

L’eliminazione non prevede un cestino. Le operazioni distruttive sui file
richiedono che i lavori che possono modificarli siano conclusi o annullati;
la sola pausa non è sufficiente.

## Limiti

L’importazione del testo di un PDF in un progetto di traduzione resta una
funzione distinta: dal documento conservato nella Biblioteca non si avvia
ancora una trascrizione. La gestione avanzata delle singole pagine e la
selezione multipla sono ancora incomplete.
Le restrizioni di scaricamento dichiarate dalle istituzioni non sono applicate
automaticamente: consulta le condizioni della fonte.

Nella scheda, sotto **Copie digitali**, la sezione richiudibile «Dati tecnici»
raccoglie tutti gli indirizzi di quella copia — manifest IIIF, pagina
dell’opera, scheda di catalogo, pagina aperta nel visore della biblioteca,
immagine di quella pagina, sito della biblioteca — ognuno riconoscibile dal suo
segno, copiabile e apribile nel browser. Gli indirizzi lunghi si leggono per
esteso al passaggio del mouse.

Da lì si chiede anche il manifest della biblioteca: non viene riversato com’è —
per quello c’è il suo indirizzo — ma letto e mostrato come dichiarazione
sull’opera, con numero di pagine, descrizione, voci del catalogo e diritti.
