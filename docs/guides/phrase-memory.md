---
title: Memoria di frasi ed esempi
---

# Memoria di frasi ed esempi

La memoria di frasi conserva coppie di testo sorgente e traduzione approvata
per riutilizzarle nei progetti del workspace. La ricerca di corrispondenze,
la loro selezione per il prompt e il salvataggio di nuove frasi sono operazioni
separate.

## Recupero dei riferimenti

Quando la funzione è attiva, Glossa cerca corrispondenze per i frammenti del
documento. La ricerca usa le risorse accessibili al workspace e non modifica
né traduzioni né frasi salvate.

La scheda **Riferimenti** mostra i risultati e permette di regolare la soglia
di somiglianza. Solo le coppie selezionate vengono incluse nella successiva
richiesta per quel frammento. Se esistono risultati ma nessuno è selezionato,
l’avvio segnala che la traduzione procederà senza quei riferimenti.

Le coppie sono aggiunte alle istruzioni della fase, dopo il prefisso statico
e il contesto documentale. Non modificano i blocchi condivisi predisposti
per la cache. La somiglianza indica una possibile pertinenza, non l’equivalenza
semantica o l’adeguatezza della resa al contesto corrente.

## Creazione e revisione delle frasi

1. Rivedi la traduzione e blocca il frammento.
2. Apri **Memoria**: le coppie già salvate vengono caricate e selezionate.
3. Usa **Estrai frasi** per ottenere nuove proposte, oppure aggiungi coppie manualmente.
4. Correggi i testi e seleziona le coppie da conservare.
5. Salva per applicare la selezione.

L’estrazione non salva automaticamente. Togliere la selezione a una coppia
già salvata e confermare ne provoca la rimozione dalla raccolta. Le modifiche
non confermate restano nella bozza del frammento quando si passa a un altro
frammento durante la revisione; non equivalgono a un salvataggio permanente.

## Ambito

Le frasi estratte mantengono il collegamento alla traduzione di origine.
Spostando quella traduzione in un altro workspace, le frasi la seguono.
Le risorse importate e collegate possono essere condivise secondo i collegamenti
del workspace. La scheda **Frasi** delle Risorse linguistiche permette di
consultare la raccolta.

## Esempi di stile

Gli esempi di traduzione sono coppie di frammenti completi usate per orientare
registro e stile della pipeline. Non vengono recuperati in base alla
somiglianza del frammento corrente.

Da un frammento bloccato, il comando **Usa come esempio di stile** nella scheda
Audit aggiunge la coppia alle impostazioni della pipeline. Qui puoi modificarla
o rimuoverla. Il limite è cinque esempi; poiché entrano nel contesto statico,
la loro lunghezza contribuisce alla dimensione delle richieste.

Usa il [glossario](./glossary-and-memory) per le rese obbligatorie e i
riferimenti di memoria per formulazioni pertinenti al singolo passaggio.
