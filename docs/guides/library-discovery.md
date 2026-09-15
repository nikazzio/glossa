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

Le viste a elenco e a griglia mostrano provenienza, pagine dichiarate,
risoluzioni locali, spazio occupato e collegamenti. Un conteggio non disponibile
non equivale a zero. I filtri permettono di restringere il catalogo e di
includere le opere archiviate; una vista salvata conserva una combinazione di
filtri. Le collezioni raggruppano opere senza spostarle o duplicarle.

Un’opera può essere collegata a più workspace e collezioni. Rimuovere un
collegamento non elimina la scheda né i file. I comandi per scaricare,
verificare, ridurre le immagini, liberare spazio, archiviare ed eliminare sono
nel menu dell’opera.

## Scheda dell’opera

La scheda affianca il visore a un pannello con quattro sezioni:

- **Opera:** metadati bibliografici, campi aggiuntivi e riferimenti tecnici.
- **Digitalizzazioni:** copie registrate, scaricamenti e versioni locali.
- **Organizzazione:** collegamenti a workspace e collezioni.
- **Note:** annotazioni sull’opera con salvataggio automatico.

Titolo, autore, data e lingua possono essere corretti manualmente. Le correzioni
sono memorizzate separatamente dal dato originale e possono essere rimosse.
**Risincronizza con la biblioteca** acquisisce nuovamente i metadati e cancella
le correzioni manuali. Note e file scaricati restano invariati.

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

## Archiviazione ed eliminazione

| Azione | Effetto |
| --- | --- |
| Archivia | Nasconde l’opera dal catalogo attivo e conserva i file; l’eventuale liberazione dello spazio richiede una scelta separata |
| Libera spazio | Elimina le immagini scaricate, conservando scheda, manifesto e miniature |
| Elimina una versione locale | Rimuove solo i file della versione selezionata |
| Elimina l’opera | Rimuove scheda, collegamenti, deposito dell’opera e relativa cache |

L’eliminazione non prevede un cestino. Le operazioni distruttive sui file
richiedono che i lavori che possono modificarli siano conclusi o annullati;
la sola pausa non è sufficiente.

## Limiti

Le digitalizzazioni PDF possono essere registrate, ma il loro download e la
lettura nella Biblioteca non sono disponibili. L’importazione del testo di
un PDF in un progetto di traduzione è una funzione distinta. La gestione
avanzata delle singole pagine e la selezione multipla sono ancora incomplete.
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
