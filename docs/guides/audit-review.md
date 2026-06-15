---
title: Audit e revisione
---

# Audit e revisione

Glossa non si ferma alla generazione di una bozza. Esegue anche uno stage judge
per ispezionare i problemi di qualità chunk per chunk.

## Cosa restituisce il giudice

- Valutazione complessiva di qualità
- Issue strutturate
- Correzioni suggerite
- Problemi di terminologia, accuratezza, grammatica, fluidità e coerenza

## Cosa fare dopo un passaggio di audit

| Esito | Mossa successiva |
|---|---|
| Problemi minori di formulazione | Correggi a mano e poi rilancia l'audit |
| Drift terminologico sistematico | Correggi glossario o selezione phrase memory |
| Interpretazione sbagliata | Rivedi il prompt di traduzione o la scelta del provider |
| Rumore di formattazione | Restringi il format stage invece di compensare nell'audit |

## Ciclo di review

1. Esegui un chunk di test o un batch completo.
2. Apri l'output audit per il chunk.
3. Leggi la lista issue confrontandola con sorgente e traduzione.
4. Correggi a mano, rilancia uno stage oppure solo l'audit.
5. Converti i problemi persistenti in annotazioni se richiedono tracking editoriale.

## Quando fidarsi del judge

Il giudice va usato come seconda passata, non come autorità finale.

- Fidati per intercettare drift terminologici ripetuti o omissioni evidenti.
- Verifica a mano registro, interpretazione e casi filologici sottili.
- Se continua a produrre rumore, stringi il prompt o semplifica gli stage precedenti.

## Strategia di review per documenti lunghi

- Usa presto il **Test** mode per calibrare la pipeline su chunk rappresentativi.
- Usa annotazioni per marcare passaggi irrisolti senza perdere il contesto.
- Usa i coherence check quando il documento dipende dalla coerenza cross-chunk.
- Esporta solo quando l'elenco chunk non contiene più issue aperte.
- Blocca i chunk stabili solo dopo lettura manuale e audit.
