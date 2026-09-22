---
title: Trascrizione di un documento
---

# Trascrizione di un documento

Lo Studio di trascrizione è la modalità concentrata per scrivere e correggere
il testo di un documento: visore a sinistra, testo al centro, strumenti a
destra. È la stessa idea della Traduzione, applicata alla trascrizione.

## Creare un documento

Dall'area **Trascrizioni** scegli "Nuovo documento" e dai un titolo. Puoi
anche collegarlo subito a un'opera già in Biblioteca cercandola per titolo
nello stesso dialogo — facoltativo: senza, il documento resta senza visore,
un solo blocco di testo. Dalla scheda di un'opera in **Biblioteca** puoi
invece creare direttamente una trascrizione di quella digitalizzazione, con
il titolo già compilato. Se l'opera ha sia le immagini sia il PDF sul
computer, scegli da quale iniziare; con una sola copia disponibile non c'è
scelta da fare.

Dalla **Panoramica** di un workspace, la sezione Trascrizioni mostra soltanto
i documenti assegnati a quel workspace. Aprine uno dall'elenco oppure usa il
comando **+** per crearne uno già assegnato lì.

## Il visore a sinistra, un testo per pagina

Un documento creato dalla scheda di un'opera in Biblioteca mostra a sinistra
la pagina della digitalizzazione collegata, con zoom e trascinamento —
cambiando pagina nel visore, il testo a destra cambia con lei: ogni pagina
ha il proprio blocco di testo e il proprio storico. Un documento creato da
zero in Trascrizioni non ha una digitalizzazione da mostrare: al posto del
visore compare un avviso, non un errore, e resta un solo blocco di testo.

In alto, un documento legato a un'opera mostra titolo e autore dell'opera —
la stessa riga della scheda in Biblioteca, con l'uscita verso il sito della
biblioteca. Il comando con i tre puntini offre solo "Rimuovi trascrizione":
scaricare, verificare o archiviare l'opera restano comandi della scheda in
Biblioteca, non dello Studio.

## Scrivere e salvare

Il testo si salva da solo poco dopo che smetti di scrivere: l'indicatore in
alto a destra dell'editor dice se il salvataggio è in corso, riuscito o
fallito, con un comando per riprovare in caso di errore. Cambiando pagina
prima che il salvataggio sia partito, il testo scritto fin lì si salva
comunque, subito.

Quando il testo è pronto, segnalo come **verificato** con il lucchetto
accanto al titolo "Pagina N": il testo diventa bloccato, per non
sovrascrivere per sbaglio una trascrizione già controllata. Puoi tornare in
bozza in qualsiasi momento con lo stesso comando.

Mentre il visore sta ancora aprendo la pagina scelta, un velo copre il testo
e lo storico con una rotellina al centro: scrivere o ripristinare restano
disattivati finché la pagina non è davvero mostrata. Se l'apertura fallisce,
al posto della rotellina compare un avviso, con lo stesso blocco.

## Cambiare fonte, immagini o PDF

Se l'opera ha entrambe le copie, nella barra del visore compaiono due
comandi per passare dall'una all'altra. Se le due dichiarano lo stesso
numero di pagine, il cambio è fluido: stessa numerazione, il testo segue.
Se il numero non combacia, passando sulla copia secondaria il visore si
stacca dal testo — si sfoglia liberamente cercando quel che serve, mentre il
testo si sfoglia con le proprie frecce, accanto al titolo "Pagina N".
Tornando sulla copia principale l'aggancio si ripristina da solo.

Un terzo comando stacca il collegamento **a prescindere** dal numero di
pagine, anche restando sulla copia principale: comodo per guardare una
pagina diversa senza spostare il punto in cui si sta scrivendo.

## Riconoscimento automatico della pagina (OCR)

Nella scheda **OCR**, a destra, puoi far leggere il testo della
pagina aperta a un modello di intelligenza artificiale collegato — lo stesso
meccanismo già usato per la Traduzione, con provider e chiavi già
configurati. Il comando compare disattivato finché mancano le condizioni: la
pagina deve appartenere a una digitalizzazione collegata al documento, e
serve un provider e un modello che sappiano leggere le immagini, scelti per
il documento oppure ereditati dalle impostazioni del workspace. Il motivo di
un comando disattivato sta sempre nel suo suggerimento.

Il testo letto entra nello storico come una revisione normale, marcata
"Riconoscimento automatico": non sovrascrive mai quello che c'è, resta
modificabile come qualunque altra versione, e una correzione manuale
successiva crea semplicemente la revisione dopo.

Il prompt che guida la lettura appartiene **al documento**: lo modifichi da
una pagina qualsiasi e vale per tutte le pagine di quel documento, ma per
nessun altro. Un documento nuovo parte dal prompt scelto nelle impostazioni del
workspace, alla voce OCR, dove puoi anche caricarne uno dalla libreria dei
prompt. Per riusare un prompt in un altro documento salvalo nella libreria dal
comando di modifica, poi caricalo di là. Il comando di ripristino riporta il
documento al prompt del workspace.

Al modello partono l'immagine della pagina e il prompt, senza il numero di
pagina: la numerazione stampata dalla biblioteca raramente coincide con la
posizione nella scansione e confonderebbe solo la lettura.

Sotto il modello due cerchietti scelgono quale immagine inviare:

- **ottimizzata**: ridotta al lato lungo scelto nelle Impostazioni, scheda
  Trascrizioni (1500, 2000, 2500 o 3000 pixel), e ricompressa. Un'immagine più
  piccola non viene ingrandita;
- **copia sul computer**: la stessa immagine del visore, senza modifiche — la
  pagina del libro scaricato, oppure quella salvata in cache mentre sfogli
  online. Online può essere più piccola dell'ottimizzata, perché il visore
  chiede alla biblioteca una misura già pronta. Se la copia manca (cache
  svuotata per il limite di spazio, libro scaricato solo in parte) si invia
  l'ottimizzata.

La scelta di partenza sta nelle Impostazioni; nello Studio la cambi per la
sessione, senza che resti salvata nel documento. Con il pannello a destra
chiuso il comando di lettura resta sotto il comando di riapertura.

Mentre una pagina viene letta il suo foglio si vela e resta in sola lettura,
per non scrivere su un testo che sta per essere sostituito; nella riga in alto
della colonna del testo una pastiglia dice quale pagina è in lettura, e resta
visibile anche se nel frattempo sfogli avanti.

La lettura parte in coda, come uno scaricamento: la trovi nel pannello
lavori mentre procede, con la possibilità di metterla in pausa o annullarla
allo stesso modo. Un intoppo passeggero — il servizio che chiede di rallentare,
una connessione caduta per un istante — viene ritentato da solo; una chiave
sbagliata, un modello inesistente o una risposta vuota no, perché riprovare
darebbe la stessa risposta. Una risposta vuota di solito vuol dire che sulla
pagina il modello non ha trovato testo.

Apri il pannello in basso e scegli **Log trascrizione** — compare solo qui,
dentro un documento di trascrizione, speculare al Log traduzione che vedi
dentro un progetto. Ogni lettura lascia quattro righe: l'avvio con fornitore e
modello, l'immagine inviata con misura reale, peso e provenienza (libro scaricato, cache o biblioteca), il prompt inviato per intero
(apribile riga per riga), e l'esito con durata, token, costo stimato e numero
della revisione creata. In testa ci sono ricerca, filtri per tipo di riga e per
livello, e il raggruppamento per pagina.

## Storico, ripristino e metadati

Ogni salvataggio resta nello storico della pagina, nel pannello a destra:
mostra chi ha scritto quella versione — correzione manuale, riconoscimento
automatico o importazione — e quando. Il comando su ogni voce dello storico
riporta il testo di quella versione come nuovo salvataggio: le versioni
precedenti non si perdono mai, anche dopo un ripristino. Cambiando pagina lo
storico mostrato cambia con lei.

La scheda **Metadati**, accanto allo Storico, mostra i dati grezzi salvati
per la pagina corrente: posizione, etichetta, stato e numero di revisioni.
Serve a vedere cosa viene registrato oggi; la sua presentazione cambierà.

## Limiti attuali

Il riconoscimento automatico legge una pagina alla volta, scelta a mano
nello Studio: non c'è ancora un comando per leggere un intervallo di pagine
in un solo passaggio, né un comando per leggere l'intero documento. Funziona
solo su digitalizzazioni collegate tramite manifesto IIIF: un documento
unico (PDF) non è ancora supportato. Il modello non riceve per ora il testo
delle pagine vicine come riferimento di continuità — solo l'immagine della
pagina corrente e il prompt configurato. Il visore non ha ancora filtri
visivi (luminosità, contrasto, inversione).
