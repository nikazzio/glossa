---
title: Servizi di traduzione
---

# Servizi di traduzione

Glossa integra servizi LLM remoti, Ollama ed endpoint compatibili con l’API
OpenAI. DeepL è disponibile come prima fase della modalità DeepL Hybrid.
La tabella descrive i ruoli implementati, senza classificare la qualità
dei modelli per marca.

| Provider | Configurazione | Ruolo |
| --- | --- | --- |
| Gemini | Chiave API e modello | Fasi LLM e valutazione |
| OpenAI | Chiave API e modello | Fasi LLM e valutazione |
| Anthropic | Chiave API e modello | Fasi LLM e valutazione |
| DeepSeek | Chiave API e modello | Fasi LLM e valutazione |
| DeepL | Chiave API e opzioni di traduzione | Prima traduzione in DeepL Hybrid |
| Ollama | URL del server e modello installato | Fasi LLM e valutazione |
| Custom | Profilo endpoint, modello e credenziali se richieste | Fasi compatibili con il servizio configurato |

## Configurazione delle credenziali

Apri **Impostazioni → Provider**. Le chiavi sono conservate nel portachiavi
del sistema quando disponibile; se non è accessibile, Glossa usa un archivio
locale cifrato. Non sono incluse nei backup dell’applicazione.

Le richieste inviano al provider selezionato i testi e il contesto necessari
alla fase. Impostare Ollama per la traduzione non rende locali le altre
operazioni: verifica anche valutatore, rifinitura dei prompt ed eventuali
servizi della memoria. Un server Ollama configurato su un altro computer
riceve le richieste a quell’indirizzo.

## Endpoint personalizzati

Un profilo Custom contiene nome, URL base, necessità di autenticazione e
relativa chiave. Nome e URL devono essere validi prima del salvataggio o del
test. Gli endpoint remoti richiedono HTTPS; HTTP è ammesso solo per
`localhost`, `127.0.0.1` e `::1`.

Nella fase seleziona Custom, scegli il profilo e inserisci l’identificativo
del modello. La compatibilità OpenAI riguarda il protocollo: non garantisce
che ogni endpoint supporti tutte le opzioni o gli stessi formati di risposta.
Usa il test di connessione e una prova su un frammento per verificare la
configurazione.

## Ollama

Installa Ollama e scarica un modello adatto al tuo hardware seguendo le
istruzioni della sua distribuzione. In Glossa configura l’URL del server e
aggiorna l’elenco dei modelli. Il server deve essere in esecuzione prima
dell’elaborazione; se la tua installazione non lo avvia automaticamente,
puoi avviarlo con `ollama serve`.

Prestazioni e capacità dipendono dal modello, dalla memoria disponibile e
dalla lunghezza delle richieste. Le opzioni di ragionamento vanno usate solo
con modelli che le supportano. Non è necessaria una chiave API per il normale
server locale.

## Scelta e diagnosi

Valuta un modello su passaggi rappresentativi del documento, considerando
fedeltà, registro, rispetto del glossario, latenza e consumo. Mantieni gli
stessi criteri mentre confronti le configurazioni. Disponibilità dei modelli,
quote e tariffe dipendono dal servizio; il catalogo dell’app non sostituisce
le condizioni del tuo account.

Per errori di connessione, quota o risposta, consulta
[Risoluzione dei problemi](./troubleshooting).
