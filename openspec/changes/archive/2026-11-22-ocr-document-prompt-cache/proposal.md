# Proposal

Issue di origine: #501.

## Why

Quando legge una pagina, Glossa manda al modello tre cose: istruzioni fisse non modificabili, il prompt del documento e l'immagine. Le istruzioni fisse chiedono «conserva gli a capo» e «nessun commento, nessuna intestazione». Un metodo editoriale reale, come la trascrizione minuta, chiede invece testo continuo, commenti e segni di pagina, quindi il modello riceve due ordini opposti. Inoltre il prompt del documento è uguale per tutte le pagine, ma si paga per intero a ogni pagina. Nella lettura automatica la cache del servizio è spenta su Anthropic, e su OpenAI è legata alle sole istruzioni fisse, troppo corte per essere messe in cache. La trascrizione minuta è ora il lavoro principale: serve un prompt unico che comandi davvero la lettura e che costi meno su un documento intero.

## What Changes

- Al modello arrivano solo il prompt del documento e l'immagine della pagina. Le istruzioni fisse vengono tolte. Resta la frase fissa nel messaggio utente che accompagna l'immagine, perché alcuni servizi rifiutano un messaggio senza testo.
- La regola su quale prompt si usa non cambia: quello del documento, altrimenti quello del workspace, altrimenti il prompt di partenza di Glossa.
- Il prompt di partenza di Glossa resta quello attuale, senza modifiche.
- Il prompt del documento diventa la parte tenuta in cache dal servizio.
  - **OpenAI:** stessa cache della traduzione, con la chiave ricavata dal prompt, quindi una per documento.
  - **Anthropic:** cache attiva con durata di 1 ora, perché fra una pagina e l'altra possono passare 20-30 minuti di controllo visivo.
  - **Gemini:** resta la cache implicita del servizio, senza cache esplicita.
- Il log della trascrizione mostra già i token letti dalla cache: è il modo per verificare che la cache funzioni.
- **Costo stimato con lo sconto della cache.** Oggi Glossa calcola ogni chiamata come se la cache non ci fosse: un token letto dalla cache costa come uno normale. Il costo stimato applica il prezzo ridotto dei token in cache dove il listino ufficiale è verificato. La correzione vale per trascrizione, traduzione e statistiche.
- **Righe del log della trascrizione più chiare,** sempre su una riga: servizio e modello, durata, token inviati (con quanti dalla cache), token ricevuti, costo stimato, in parole invece che in simboli.
- **Riepilogo della trascrizione arricchito** (scheda a destra nello Studio):
  - pagina: versioni divise fra lettura automatica e mano, letture automatiche della pagina con l'ultima, costo della pagina;
  - documento: caratteri oltre a parole;
  - lettura automatica: letture riuscite ed errori, pagine lette e rilette, token inviati con la quota dalla cache, token ricevuti, costo totale e per pagina, tempo medio, modelli usati.
- Si aggiornano la guida in-app, se descrive cosa parte verso il modello, la documentazione pubblica (lettura OCR e cache, in italiano e in inglese) e quella per sviluppatori (architettura OCR, roadmap con i riferimenti alle issue chiuse #220 e #388).

## Fuori perimetro

- Testo delle pagine vicine come contesto della lettura (#502).
- Lettura di più pagine o del documento intero (#499).
- Esportazione della trascrizione (#500).
- Cache esplicita di Gemini e impostazioni di cache configurabili per l'OCR.
- Token di scrittura in cache di Anthropic: oggi non vengono registrati, quindi il loro sovrapprezzo non entra nel costo stimato. Serve un campo nuovo nei log: è un lavoro a parte.
- Sconto della cache per i modelli Gemini: il listino ufficiale non è stato verificato, quindi resta il calcolo attuale, senza sconto.
- Catena di traduzione: le sue istruzioni e l'ordine dei blocchi non cambiano.

## Capabilities

### New Capabilities
- `transcription`: Trascrizione dei documenti, compresa la lettura automatica delle pagine. Copre quali istruzioni partono verso il modello, la loro precedenza e l'uso della cache.

### Modified Capabilities
<!-- Nessuna: non esistono ancora specifiche per la trascrizione. -->

## Impact

- Backend: composizione del prompt OCR (le istruzioni fisse vengono rimosse), opzioni di cache passate alla chiamata OCR, test della composizione e della richiesta.
- Frontend: calcolo del costo con la cache (catalogo modelli con il rapporto di prezzo dei token in cache), riga del log della trascrizione, scheda Riepilogo e i suoi dati, stringhe in italiano e inglese.
- Comportamento visibile: al modello arriva solo il prompt in vigore, personale o di partenza. Il log mostra token in cache dalla seconda pagina letta, se la lettura avviene entro la durata della cache.
- Nessuna modifica allo schema del database.
- Documentazione: guida in-app (da verificare), `docs/` e `docs/en/` (guida trascrizione, contesto e cache), `docs-dev/` (architettura, roadmap).
