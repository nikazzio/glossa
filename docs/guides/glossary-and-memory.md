---
title: Dizionari e glossario
---

# Dizionari e glossario

I dizionari contengono voci terminologiche riutilizzabili. Il glossario di una
pipeline è l’insieme di termini assegnato alla traduzione. Ogni voce associa
un termine sorgente alla resa richiesta e può includere note d’uso.

## Gestione dei dizionari

Apri **Risorse linguistiche** nel workspace. La finestra distingue dizionari,
modelli di prompt e frasi. Nella scheda dei dizionari puoi creare, rinominare,
duplicare ed eliminare risorse, modificare voci e importare dati da CSV o TSV.

L’importazione mostra un’anteprima e permette di scegliere tra integrazione
e sostituzione del contenuto. Verifica l’associazione dei campi sorgente,
destinazione e note prima di confermare. La sostituzione elimina le voci
precedenti del dizionario.

## Condivisione e correzioni locali

Un dizionario può essere collegato a più workspace. I collegamenti condividono
la stessa risorsa; una copia crea invece un dizionario indipendente. Le
correzioni o esclusioni applicate nel workspace modificano la vista locale
delle voci senza alterare l’originale condiviso.

Assegna il dizionario al progetto con il comando dedicato. La scheda
**Glossario** del pannello Insight mostra l’intero glossario assegnato;
la configurazione della pipeline ne espone il registro terminologico.

## Applicazione alla traduzione

Le fasi di traduzione e revisione ricevono istruzioni che richiedono l’uso
delle rese del glossario. Il valutatore può segnalare le difformità. Queste
istruzioni non garantiscono che il modello applichi correttamente ogni voce:
occorre controllare il risultato, anche dopo la fase di formattazione.

In DeepL Hybrid è possibile creare un glossario DeepL dai termini assegnati,
con i vincoli della coppia linguistica e del servizio. È una risorsa remota
distinta dal dizionario locale.

## Evidenziazioni

La legenda nella scheda Glossario descrive i colori attivi. I valori
predefiniti distinguono termine sorgente in blu sottolineato, resa trovata
in verde e resa attesa mancante in rosa. La ricerca testuale usa un colore
separato. I colori sono configurabili nelle impostazioni delle traduzioni.

L’evidenziazione segnala corrispondenze testuali: non interpreta il contesto
e non sostituisce la verifica linguistica. Una resa assente può richiedere
una correzione o una variante motivata nelle note del glossario.

## Glossario, memoria ed esempi

| Risorsa | Ruolo |
| --- | --- |
| Glossario | Terminologia richiesta per il progetto |
| Memoria di frasi | Coppie bilingui selezionate come riferimento per un frammento |
| Esempi di traduzione | Frammenti approvati che orientano lo stile della pipeline |

Per estrazione, selezione e salvataggio delle coppie bilingui, consulta
[Memoria di frasi ed esempi](./phrase-memory).
