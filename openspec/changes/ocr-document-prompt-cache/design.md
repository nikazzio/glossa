# Design

## Context

Motivazione in proposal.md. Lo stato attuale, letto dal codice:

- `llm/prompts.rs::build_ocr_prompt` compone due blocchi di sistema: `OCR_SYSTEM_PERSONA` (fisso, `cacheable: true`) e `"Core Instructions:\n" + prompt` (`cacheable: false`). Il messaggio utente è `OCR_USER_MESSAGE` più l'immagine.
- `ocr/handler.rs` costruisce la `LlmRequest` con `provider_options: None`.
- Effetti sulla cache, per servizio:
  - **Anthropic:** `cache_control` si aggiunge solo se `provider_options.anthropic.enable_caching` è vero, quindi oggi non c'è cache.
  - **OpenAI e DeepSeek:** `prompt_cache_key` è sempre inviato, ricavato dall'hash del testo dei blocchi cacheable. Oggi coincide con la sola persona ed è quindi uguale per tutti i documenti. La cache automatica di OpenAI scatta solo sopra una lunghezza minima del prefisso che la persona da sola non raggiunge.
  - **Gemini:** la cache esplicita richiede `provider_options.gemini` e una soglia di token (2048, o 8192 per i modelli «pro»). Senza opzioni resta solo la cache implicita del servizio.
- `ocr/log.rs` registra già `cached_input_tokens` e `cache_miss_input_tokens` dichiarati dal servizio.
- Il prompt in vigore è risolto nel frontend (`transcriptionService.resolveOcrSettings`: documento → workspace → `DEFAULT_OCR_PROMPT`) e congelato nella configurazione del lavoro.

## Goals / Non-Goals

**Goals:**
- Un solo blocco di sistema, il prompt in vigore, marcato cacheable.
- Cache attiva per la lettura OCR: Anthropic con durata di 1 ora, OpenAI come nella traduzione.

**Non-Goals:**
- Rendere configurabili dall'interfaccia le opzioni di cache dell'OCR.
- Toccare la composizione dei prompt di traduzione e il loro ordine `static → blob → stage instructions`.

## Decisions

1. **Rimuovere `OCR_SYSTEM_PERSONA` e il prefisso «Core Instructions:».** `build_ocr_prompt` produce un unico `PromptBlock { text: prompt, cacheable: true }`. Il prefisso serviva a separare il prompt dalla persona: senza persona non ha più ruolo, e il testo inviato coincide con quello scritto dall'utente.
   - *Alternativa scartata:* persona neutra e più corta. Resterebbe comunque un'istruzione fissa non modificabile, e la sua lunghezza non basterebbe alla cache.
2. **`OCR_USER_MESSAGE` resta.** Alcuni servizi rifiutano un messaggio utente senza testo. La frase «Transcribe the page in the attached image.» è neutra e non contraddice nessun metodo.
3. **Opzioni di cache costruite dal gestore OCR,** non dall'utente. Il gestore passa una `ProviderRuntimeConfig` con `anthropic.enable_caching = true` e `extended_cache_ttl = true` (1 ora): fra una pagina e l'altra il controllo visivo può durare 20-30 minuti, oltre la durata breve di 5 minuti.
   - Per OpenAI e DeepSeek, stessa cache della traduzione: nessuna opzione, `prompt_cache_key` ricavata dal blocco cacheable, quindi per documento.
   - Per Gemini nessuna opzione: la cache esplicita ha un costo di conservazione orario e soglie alte; si resta sulla cache implicita.
   - L'indirizzo di Ollama oggi non passa da `provider_options`. Va controllato in implementazione che la nuova configurazione non lo cambi.
   - *Alternativa scartata:* esporre le opzioni nell'interfaccia OCR. È fuori perimetro: prima si misura dal vivo con il log.

5. **Costo con la cache.** Il catalogo modelli guadagna un campo facoltativo: il rapporto fra prezzo dei token in cache e prezzo di input. È valorizzato solo dove il listino ufficiale è verificato (22 novembre 2026):
   - OpenAI `gpt-5.4-nano` e `gpt-5.6-*`: 0,1;
   - Anthropic, i cinque modelli del catalogo: 0,1;
   - DeepSeek: `v4-flash` 0,02, `v4-pro` 0,033;
   - Gemini: nessuno, listino non letto.

   `costForEntry` riceve `cachedInputTokens` e applica il rapporto, preso dal catalogo anche quando il prezzo di input è personalizzato dall'utente. La semantica dei token cambia per servizio: OpenAI, DeepSeek e Gemini includono i token in cache nell'input, Anthropic no (`input_tokens` esclude `cache_read_input_tokens`). Si passano i token in cache in tutti i punti che oggi calcolano il costo: log della traduzione alla scrittura, statistiche, Riepilogo, log della trascrizione.
   - *Alternativa scartata:* prezzo dei token in cache come terzo prezzo assoluto, anche nelle personalizzazioni. È più preciso ma tocca l'interfaccia dei prezzi personalizzati; il rapporto copre il caso reale senza cambiarla.
6. **Riga del log.** Stessa riga e stessi colori del terminale; le voci diventano testo tradotto («inviati N token (M dalla cache)», «ricevuti K», «≈ costo»), separate da «·». Il nome del servizio usa l'etichetta già mostrata altrove nell'app.
7. **Riepilogo.**
   - I dati del documento vengono da una sola funzione del servizio di trascrizione, estesa: righe `end` del log, sia riuscite sia in errore, con segmento, durata e token in cache.
   - I dati della pagina vengono dalle revisioni già passate allo Studio (autore `ocr` o `user`) e dalle righe del log filtrate per segmento.
   - Layout invariato: `PanelSection` e `StatRow` esistenti, nessun nuovo componente.

## Risks / Trade-offs

- **Pagine lette a più di un'ora di distanza su Anthropic.** La cache scade e la lettura riscrive la cache, con il sovrapprezzo di scrittura della durata di 1 ora. → Si osserva dal vivo con i token in cache del log.
- **Prompt corti sotto la soglia minima di cache del servizio.** Niente cache, ma il costo resta quello di oggi. → Nessuna azione.
- **Prompt personali che non dicono «solo testo».** Senza istruzioni fisse, il modello fa ciò che chiede il prompt. È lo scopo della modifica.
- **Prezzi del catalogo diversi dal listino attuale.** Il listino ufficiale OpenAI letto per il rapporto riporta per `gpt-5.6-terra` 2,00 $ di input e 12,00 $ di output, mentre il catalogo ne ha 2,50 e 15,00. → Fuori perimetro: si segnala al maintainer; si aggiorna il catalogo solo su sua richiesta.
- **Anthropic: token di scrittura in cache non registrati.** Il costo stimato resta per difetto su quelle chiamate. → Lavoro a parte (proposal, Fuori perimetro).
- **Il test di byte-equivalenza della traduzione** non copre l'OCR. → Test dedicati alla composizione OCR e alle opzioni passate alla richiesta.

## Migration Plan

Nessuna migrazione dati. Il rilascio cambia solo le richieste successive. Rollback: ripristinare la persona e `provider_options: None`.

## Verifica sulla documentazione ufficiale (22 novembre 2026)

**OpenAI** (developers.openai.com/api/docs/guides/prompt-caching):
- **GPT-5.6 e successivi** (compreso il modello OCR predefinito `gpt-5.6-terra`):
  - soglia minima 1.024 token;
  - durata predefinita `"30m"`, garantita come minimo; OpenAI può tenere la cache più a lungo;
  - opzione `"12h"` con `prompt_cache_options.ttl`, solo con la Responses API;
  - scrittura in cache 1,25× il prezzo di input con `"30m"`, 2,5× con `"12h"`; lettura 0,1× (0,05× su alcuni modelli 6.x);
  - `prompt_cache_key` non serve a ottimizzare la cache.
- **Modelli precedenti:**
  - `prompt_cache_retention` con `in_memory` (di solito 5-10 minuti di inattività, al massimo un'ora) oppure `24h`, predefinito per le organizzazioni senza Zero Data Retention;
  - nessun costo di scrittura.
- Glossa oggi invia solo `prompt_cache_retention` e non conosce `prompt_cache_options.ttl`. Con il predefinito `"30m"` una pausa di 20-30 minuti fra due pagine resta coperta, quindi per l'OCR basta la cache come nella traduzione.

**Anthropic** (platform.claude.com/docs/en/build-with-claude/prompt-caching):
- durata predefinita 5 minuti; durata di 1 ora con `"ttl": "1h"`, già supportata da Glossa;
- scrittura 1,25× (5 minuti) o 2× (1 ora); lettura 0,1× (0,05× o 0,025× su alcuni modelli);
- la durata riparte gratis a ogni lettura;
- soglia minima da 512 a 4.096 token secondo il modello. Sotto soglia nessun errore: la cache semplicemente non avviene.
