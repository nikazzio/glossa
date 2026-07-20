---
title: Phrase memory
---

# Phrase memory

La phrase memory aiuta Glossa a riutilizzare frammenti sorgente-target già approvati
quando ricompare una formulazione simile.

> Questa pagina è una panoramica rapida. Per il workflow completo, leggi [Glossario e phrase memory](./glossary-and-memory).

## Cosa memorizza

- Frasi sorgente brevi
- Frasi target approvate
- Valori di confidenza della coppia estratta

## Come funziona

Il pannello del frammento ha due schede distinte, per due momenti diversi del lavoro:

**Scheda Memoria — creare nuove frasi**: una frase entra nella raccolta solo da un frammento che hai **bloccato** (la traduzione è definitiva). Le frasi già salvate in precedenza per quel frammento si caricano da sole all'apertura della scheda, già spuntate ed etichettate "già salvata". Blocca il frammento, premi "Estrai frasi" (bottone separato) per farne proporre di nuove da Glossa: si aggiungono a quelle già mostrate, senza doppioni identici. Rivedi ogni riga — spunta/togli la spunta, correggi il testo se serve — e puoi anche aggiungerne manualmente. Il bottone "Salva" è sempre visibile in alto: quando lo premi, salva tutto ciò che in quel momento è spuntato — se hai tolto la spunta a una frase già salvata, viene rimossa davvero dalla raccolta (non serve un pulsante separato per eliminarla). Se cambi frammento a metà revisione, il lavoro non confermato resta lì ad aspettarti quando torni su quel frammento.

**Scheda Riferimenti — riusare frasi già salvate**: qui vedi le corrispondenze trovate per il frammento aperto, con una soglia di somiglianza regolabile. Solo le corrispondenze che spunti vengono davvero inviate come riferimento la prossima volta che traduci o rilanci quel frammento — quelle trovate ma non spuntate restano visibili ma ignorate. Il glossario del progetto non è ripetuto qui: è sempre visibile per intero nella scheda dedicata del pannello a destra.

## Quando evitarla

Disattiva o ignora i match quando il testo cambia registro, voce narrante o dominio.
La somiglianza lessicale non basta: una frase recuperata deve avere senso nel chunk
corrente e nel documento che stai traducendo.

## Buone pratiche

- Mantieni stabile il testo sorgente per ottenere un riuso affidabile delle frasi.
- Tratta la phrase memory come un supporto, non come sostituto del giudizio editoriale.
- Controlla i match selezionati prima di usarli in produzione.

## Esempi di traduzione (diverso dalla phrase memory)

Oltre alle singole frasi, puoi fissare 2-3 traduzioni intere di un frammento come esempio
di stile per l'intera pipeline: servono a orientare registro e tono su ogni frammento
successivo, non a suggerire coppie puntuali come la phrase memory.

Per aggiungerne uno: blocca un frammento con la traduzione che ritieni un buon esempio —
di solito dopo aver controllato la scheda Audit e verificato che vada tutto bene — poi
nella stessa scheda Audit premi il bottone "Usa come esempio di stile", che mostra anche
quanti esempi hai già salvato. L'esempio compare da subito nelle Impostazioni della
pipeline, dove puoi rivederlo, accorciarlo o rimuoverlo. Un piccolo tetto (5 esempi) evita
di appesantire inutilmente ogni traduzione successiva.
