---
title: Contesto e cache dei prompt
---

# Contesto e cache dei prompt

Il contesto documentale fornisce riferimenti utili alla traduzione del frammento.
La cache del prompt può ridurre il costo di elaborazione delle parti ripetute
della richiesta. Sono meccanismi distinti: la presenza del contesto non
implica che il provider lo abbia conservato in cache.

## Contesto documentale

Ogni frammento può riferirsi a un gruppo di frammenti sorgente. Glossa costruisce
il blocco di contesto da questi riferimenti e indica esplicitamente quale
frammento tradurre. Il contesto può coprire l’intero documento quando è breve
oppure un gruppo di passaggi vicini quando è più lungo.

La revisione della bozza riceve anche il sorgente. La formattazione usa solo
il testo già tradotto, con un prompt dedicato. Il controllo di coerenza
costruisce il contesto dalle traduzioni, anziché dal testo originale.

## Ordine dei blocchi

Per traduzione e revisione, il messaggio di sistema mantiene questo ordine:

1. Istruzioni statiche: persona, regole strutturali, glossario ed esempi.
2. Contesto documentale condiviso.
3. Istruzioni specifiche della fase, con gli eventuali riferimenti di memoria selezionati.

Il messaggio utente contiene il testo da elaborare e, per la revisione, la
bozza precedente. L’ordine `static → blob → stage-instructions` mantiene
contiguo il prefisso riutilizzabile. Inserire contenuto variabile prima del
contesto condiviso ne ridurrebbe la riusabilità.

## Comportamento degli adattatori

| Provider | Comportamento implementato |
| --- | --- |
| OpenAI | Costruisce una chiave dal provider, modello e prefisso; inoltra una retention esplicita `in_memory` o `24h` quando configurata |
| Anthropic | Aggiunge `cache_control` ai blocchi idonei solo se la cache è abilitata; può richiedere TTL di un’ora |
| Gemini | Può creare e riutilizzare contenuti in cache per prefissi idonei |
| DeepSeek | Legge i conteggi di token di cache riportati dalla risposta |
| Ollama | Non fornisce le stesse metriche di cache fatturata dei provider remoti |

Questi comportamenti descrivono l’integrazione di Glossa. L’effettiva
disponibilità, durata e tariffazione della cache dipendono dal servizio e dal
modello; non sono deducibili dal solo nome della famiglia di modelli.

## Riconoscimento automatico della pagina (OCR)

Lo stesso principio vale per la lettura automatica delle pagine di
trascrizione: l'immagine della pagina e il suo identificativo stanno
**sempre** nel messaggio utente, mai in un blocco di sistema. Persona e
regole di trascrizione restano un blocco statico cacheable, identico per
ogni pagina letta — lo stesso beneficio di cache descritto sopra per la
traduzione si applica quindi a una sequenza di letture consecutive dello
stesso documento, senza che l'immagine ne comprometta il prefisso
riutilizzabile.

## Configurazione e verifica

La cache Anthropic è disattivata per impostazione predefinita. Attivala quando
prevedi di riutilizzare un prefisso e valuta l’opzione di durata estesa in
base agli intervalli tra richieste. La scrittura in cache può avere un costo,
quindi un prefisso mai riutilizzato non produce necessariamente un risparmio.

La scheda Statistiche mostra i dati di utilizzo restituiti dai provider.
Un prefisso identico non garantisce una lettura dalla cache: dimensione,
modello, scadenza e politiche del servizio possono influire. Usa l’anteprima
del frammento per controllare i messaggi e la console per ispezionare le
richieste eseguite.

La cache dei prompt è distinta dalla [cache di rete della Biblioteca](./storage-and-jobs).
