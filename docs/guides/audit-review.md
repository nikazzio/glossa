---
title: Valutazione e revisione
---

# Valutazione e revisione

La valutazione automatica, indicata come **Audit** nell’interfaccia, confronta
la traduzione del frammento con il sorgente. La verifica di coerenza è un
controllo separato sulle traduzioni del documento. Entrambe producono
segnalazioni da verificare durante la revisione.

## Risposta del valutatore

La risposta comprende una valutazione complessiva e un elenco di problemi
con categoria, gravità e descrizione. Le categorie riguardano glossario,
fedeltà, fluidità, grammatica e coerenza. Quando sono disponibili riferimenti
testuali, l’interfaccia tenta di individuare il passaggio interessato.

Il backend usa uno schema di risposta comune. OpenAI, Anthropic, Gemini e
Ollama ricevono i rispettivi parametri per l’output strutturato. DeepSeek e gli
endpoint personalizzati usano la modalità JSON e la validazione locale.
Una risposta non interpretabile viene segnalata come errore.

Per l’output vincolato allo schema, l’adattatore Ollama imposta la temperatura
a zero, sovrascrivendo il valore configurato. Ciò non garantisce giudizi
identici né valutazioni corrette; il rispetto dello schema riguarda il formato.

## Procedura di revisione

1. Apri la scheda **Audit** del frammento tradotto.
2. Confronta ciascuna segnalazione con originale e traduzione.
3. Correggi il testo manualmente o riesegui la fase pertinente.
4. Usa **Rivaluta** per aggiornare il giudizio senza ritradurre.
5. Registra le decisioni e i dubbi nelle **Note**.
6. Blocca la traduzione quando la revisione è conclusa.

Un problema dell’audit può essere convertito in annotazione. La ricerca del
passaggio usa il testo fornito dal modello e può non trovare la posizione
esatta. Il blocco della traduzione è una scelta del revisore, distinta
dall’esito automatico e dal tipo di annotazione.

## Coerenza del documento

Dopo aver completato i frammenti, avvia il controllo di coerenza. Esamina
le traduzioni con il contesto dei frammenti vicini, senza confrontarle con
il sorgente. Usa il prompt dedicato in **Controllo qualità** e presenta
i risultati nella scheda **Coerenza** del pannello Insight.

Questo controllo può evidenziare variazioni terminologiche o stilistiche tra
passaggi. Non sostituisce l’audit di fedeltà del singolo frammento.

## Interpretazione dei risultati

Una valutazione positiva non equivale a un’approvazione editoriale. In caso
di segnalazioni ripetute, controlla istruzioni, termini assegnati e riferimenti
di memoria prima di modificare i criteri del valutatore. Per localizzare
l’origine di un errore, confronta gli output delle diverse fasi.

Vedi [Annotazioni e note](./annotations) per conservare le decisioni e
[Configurazione della pipeline](../reference/pipeline-config) per i parametri
del controllo qualità.
