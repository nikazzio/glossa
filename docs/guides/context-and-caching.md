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

1. Istruzioni statiche: ruolo e Contesto di traduzione, regole strutturali, glossario ed esempi.
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

Nella lettura automatica delle pagine di trascrizione l'unica istruzione è il
prompt del documento: Glossa non aggiunge regole proprie. Il prompt è la parte
tenuta in cache, uguale per tutte le pagine dello stesso documento; l'immagine
della pagina sta **sempre** nel messaggio utente, fuori dalla cache, e si paga
ogni volta al prezzo normale.

- **Anthropic:** cache attiva con durata di 1 ora. Fra una pagina e l'altra c'è
  il tempo del controllo a vista, e ogni lettura rinnova la durata.
- **OpenAI:** la stessa cache della traduzione, con una chiave per documento.
- **Gemini:** la cache implicita del servizio.

La cache scatta solo sopra una lunghezza minima del prompt, diversa per servizio
e modello: un prompt breve non viene messo in cache, senza errori. I token letti
dalla cache compaiono nel Log trascrizione, nella riga di esito di ogni lettura.

## Configurazione e verifica

La cache Anthropic è disattivata per impostazione predefinita; l’interruttore sta
sotto il modello di ogni fase Anthropic, nella linguetta Fasi. Attivala quando
prevedi di riutilizzare un prefisso e valuta l’opzione di durata estesa in
base agli intervalli tra richieste. La scrittura in cache può avere un costo,
quindi un prefisso mai riutilizzato non produce necessariamente un risparmio.

La scheda Statistiche mostra i dati di utilizzo restituiti dai provider.
Un prefisso identico non garantisce una lettura dalla cache: dimensione,
modello, scadenza e politiche del servizio possono influire. Usa l’anteprima
del frammento per controllare i messaggi e la console per ispezionare le
richieste eseguite.

Il costo stimato addebita i token letti dalla cache al loro prezzo ridotto, dove
il listino ufficiale è noto: OpenAI GPT-5.4 e GPT-5.6, modelli Anthropic e
DeepSeek del catalogo. Per Gemini la stima non applica sconti. Per Anthropic il
sovrapprezzo della scrittura in cache non entra nella stima, perché quei token
non vengono registrati: il costo reale di una chiamata che scrive la cache è un
po' più alto.

La cache dei prompt è distinta dalla [cache di rete della Biblioteca](./storage-and-jobs).
