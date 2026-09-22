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

Nella scheda **Assistenza**, a destra, puoi far leggere il testo della
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

Il prompt che guida la lettura si personalizza su tre livelli — workspace,
documento, singola pagina — ognuno pensato per prevalere sul livello sopra
solo quando viene scritto apposta; altrimenti resta quello ereditato.

La lettura parte in coda, come uno scaricamento: la trovi nel pannello
lavori mentre procede, con la possibilità di metterla in pausa o annullarla
allo stesso modo. Apri il pannello in basso e scegli **Log trascrizione** —
compare solo qui, dentro un documento di trascrizione, speculare al Log
traduzione che vedi dentro un progetto — per l'elenco di ogni lettura fatta
con il relativo costo e i token usati.

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
