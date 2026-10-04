---
title: Memoria di frasi ed esempi
---

# Memoria di frasi ed esempi

Durante la modifica di testi o metadati, la ricerca resta disabilitata
con il motivo. I titoli lunghi della provenienza vanno a capo.

La memoria di frasi conserva coppie di testo sorgente e traduzione approvata
per riutilizzarle nelle traduzioni. La ricerca di corrispondenze,
la loro selezione per il prompt e il salvataggio di nuove frasi sono operazioni
separate.

## Recupero dei riferimenti

Quando la funzione è attiva, Glossa cerca corrispondenze per i frammenti del
documento. La ricerca usa le risorse accessibili al workspace e non modifica
né traduzioni né frasi salvate.

La sottolinguetta **Riferimenti** della scheda **Memoria** mostra i risultati e permette di regolare la soglia
di somiglianza. Solo le coppie selezionate vengono incluse nella successiva
richiesta per quel frammento. Se esistono risultati ma nessuno è selezionato,
l’avvio segnala che la traduzione procederà senza quei riferimenti.

Le coppie sono aggiunte alle istruzioni della fase, dopo il prefisso statico
e il contesto documentale. Non modificano i blocchi condivisi predisposti
per la cache. La somiglianza indica una possibile pertinenza, non l’equivalenza
semantica o l’adeguatezza della resa al contesto corrente.

## Creazione e revisione delle frasi

1. Rivedi la traduzione e segnala come verificata.
2. Apri **Memoria** → **Memoria**: le coppie già salvate vengono caricate in sola lettura.
3. Usa **Estrai frasi** per ottenere nuove proposte, oppure aggiungi coppie manualmente.
4. Correggi i testi e seleziona le coppie da conservare.
5. Usa il dischetto **Aggiungi alla memoria le coppie spuntate**.

L’estrazione non salva automaticamente. Il dischetto aggiunge soltanto le coppie
nuove selezionate e conserva quelle già salvate. Per rimuovere una coppia
salvata usa il suo cestino e conferma. Le modifiche
non confermate restano nella bozza del frammento quando si passa a un altro
frammento durante la revisione; non equivalgono a un salvataggio permanente.

## Ambito e compatibilità

Le frasi estratte seguono il workspace corrente della traduzione di origine.
La provenienza conserva separatamente il workspace al momento dell’estrazione.
Consultare una frase da un altro workspace non crea collegamenti né copie.

In **Impostazioni workspace → Memoria**, **Cerca anche nella memoria degli altri
workspace** è inizialmente spento. Attivalo e salva per includere anche le frasi
di altri workspace e senza workspace. La ricerca confronta sempre la stessa
coppia di lingue e embedding dello stesso modello, dimensione e profilo di input.
Testi privi della misura richiesta restano nel catalogo, senza entrare nei risultati.
Non si confrontano embedding di modelli diversi. Le coppie già salvate nel
frammento non diventano automaticamente corrispondenze a distanza zero.

## Testi, provenienza e più embedding

Ogni coppia è collegata a un’unità testuale con versioni dell’originale e della
traduzione. Aggiungere un modello conserva gli embedding degli altri modelli e
non duplica la coppia. Testi uguali provenienti da frammenti diversi restano distinti.

Creando una traduzione puoi indicare **Libro e versione di origine** scegliendo
una versione della Biblioteca. È una scelta esplicita: senza, il libro resta
**Non specificato**. Non viene dedotto dal nome del file. Le frasi estratte
registrano questo libro, la versione, la traduzione, il frammento e il workspace
di origine; non ricevono numeri di pagina se questi non sono noti.

## Gestire la raccolta

Apri **Risorse linguistiche → Memorie**. Le risorse generali partono da tutte
le frasi; quelle del workspace dalla sua raccolta. Puoi filtrare per workspace,
**Tutti**, **Senza workspace** ed etichetta, oppure cercare nei testi e nei tag.

Ogni frase mostra provenienza, lingue, data e modelli disponibili, con la loro
dimensione. Scegli un modello e usa il più per aggiungere il suo embedding o la
freccia circolare per ricalcolarlo. Il calcolo richiede la chiave OpenAI e comporta
costi: la conferma li segnala. Gli embedding degli altri modelli restano disponibili.
Nelle impostazioni del workspace puoi calcolare il modello selezionato su tutta
la sua memoria senza cancellare gli altri modelli. La scelta del modello attivo
si applica salvando le impostazioni, indipendentemente dal calcolo.

La matita apre la correzione dei due testi. Cambiare solo la traduzione non
ricalcola gli embedding dell’originale. Cambiare l’originale richiede il ricalcolo
di tutti gli embedding disponibili, con conferma dei costi: testi e vettori si
salvano insieme, oppure nessuna modifica viene applicata se un calcolo fallisce.
Le versioni precedenti rimangono archiviate, mentre la ricerca usa quella corrente.
Queste correzioni non modificano il documento di origine.

Le **Etichette del testo** sono manuali e riutilizzabili; separale con un punto
e virgola. Non sono classificazioni automatiche. Il cestino elimina la coppia,
le sue revisioni ed embedding dopo conferma. Il comando del dizionario copia la
coppia nel dizionario scelto: salva prima eventuali sue modifiche pendenti.
**Esporta CSV** include testi, tag, provenienza e modelli delle sole frasi visibili.
Il backup dell’app conserva anche le revisioni e i vettori; il CSV non lo sostituisce.

La struttura permette unità di diversa lunghezza e testi senza traduzione.
La selezione di pagine o sezioni, la classificazione automatica e lo studio
semantico del corpus sono sviluppi successivi, non funzioni disponibili in questa schermata.

Eliminare una traduzione conserva i testi già archiviati, con libro e provenienza.
Diventano memorie senza workspace e indicano che la traduzione non è più disponibile.
Dopo una correzione dell’originale, la provenienza continua a descrivere
l’estrazione iniziale; una riga segnala la correzione, senza riattribuire la citazione.

## Esempi di stile

Gli esempi di traduzione sono coppie di frammenti completi usate per orientare
registro e stile della pipeline. Non vengono recuperati in base alla
somiglianza del frammento corrente.

Da un frammento verificato, il comando **Usa come esempio di stile** nella scheda
Audit aggiunge la coppia alla linguetta Memoria della configurazione della
pipeline. Lì puoi modificarla
o rimuoverla. Il limite è cinque esempi; poiché entrano nel contesto statico,
la loro lunghezza contribuisce alla dimensione delle richieste.

Usa il [glossario](./glossary-and-memory) per le rese obbligatorie e i
riferimenti di memoria per formulazioni pertinenti al singolo passaggio.

## Nello Studio di traduzione

Nella linguetta Memoria, **Riferimenti** mostra le frasi simili già in memoria:
per ognuna, sotto la coppia, da dove viene (workspace, traduzione, frammento,
oppure «importata»). La spunta in cerchio decide quali usare nella traduzione.
**Memoria** si apre solo a traduzione verificata: le coppie già salvate si
tolgono una a una con il cestino; quelle nuove si spuntano e si aggiungono con
il dischetto, che non cancella mai le altre. La ricerca usa solo frasi della
stessa coppia di lingue.
