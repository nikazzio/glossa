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

1. Abilita la phrase memory nelle impostazioni del workspace o della pipeline.
2. Lascia che Glossa cerchi automaticamente le corrispondenze, oppure aggiorna manualmente.
3. Controlla i match restituiti per il chunk corrente.
4. Seleziona solo i match che vuoi iniettare nella run.

## Quando evitarla

Disattiva o ignora i match quando il testo cambia registro, voce narrante o dominio.
La somiglianza lessicale non basta: una frase recuperata deve avere senso nel chunk
corrente e nel documento che stai traducendo.

## Buone pratiche

- Mantieni stabile il testo sorgente per ottenere un riuso affidabile delle frasi.
- Tratta la phrase memory come un supporto, non come sostituto del giudizio editoriale.
- Controlla i match selezionati prima di usarli in produzione.
