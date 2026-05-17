# Stato sessione — epic/engine-refactor-147

**Data ultimo aggiornamento**: 2026-05-17  
**Branch**: `epic/engine-refactor-147`  
**Issue epic**: #171 — "feat: rebuild model/runtime architecture for May 2026 provider reality"

---

## Stato issue #171 — cosa è completato

| Fase | Descrizione | Stato |
|------|-------------|-------|
| A — Inventory & removal | Catalogo unico, discovery rimosso, modelli stale eliminati | ✅ |
| B — Registry & capability layer | `catalog.ts` con reasoning class, pricing, context window, stage-fit | ✅ |
| C — Discovery & sync | Deciso di non implementare: lista curata è sufficiente | ✅ (deliberato) |
| D — Backend modernization | OpenAI → Responses API; reasoning effort wired per OpenAI/Gemini/DeepSeek | ✅ |
| E — UI replacement | Settings: lista dal catalogo, provider grayed out senza chiave. Pipeline: reasoning selector, icone capability | ✅ |
| F — Defaults & tests | Default aggiornati; 311 test passati | ✅ |

**Gap residuo E/D**: Anthropic extended thinking non cablato nel backend. I modelli Claude 4 sono marcati `optional` nel catalogo (corretto), ma il selettore reasoning per Anthropic è cosmetic-only — il backend non invia il parametro `thinking`. Da fare come issue separata se si vuole il supporto pieno.

---

## Ultime modifiche (questa sessione)

### PR #172 — feat/provider-model-registry (mergeata nell'epic)
- Reasoning effort wired alle API provider: OpenAI Responses API (`reasoning.effort`), Gemini (`thinkingConfig.thinkingBudget`), DeepSeek (`reasoning_effort`)
- Rimosso livello `auto` da `ReasoningEffortLevel` — valori: `none | low | medium | high`
- Default reasoning: `none` per modelli `optional`, `medium` per `reasoning`
- `handleModelChange` / `handleJudgeModelChange`: resetta solo il campo reasoning alla selezione del modello, non tutte le opzioni provider
- `useProviderKeyStatus`: aggiunto `refresh()` via tick counter; `ApiKeyInput` chiama `refresh` dopo save/delete
- Streaming rimosso da `judge_translation` e `run_coherence_for_chunk` — ora usano `provider.call()` + `tokio::select!` per la cancellazione
- `StreamResult` semplificato a solo `content: String` (campi usage erano dead code)
- `simple-icons` rimosso dalle dipendenze npm

### Aggiornamento catalogo (commit 28f3e84)
- **Anthropic**: IDs aggiornati a Claude 4 (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-7`). Sonnet/Opus context window 200K → 1M. Pricing corretto. Reasoning class → `optional` per tutti e tre.
- **Gemini**: `gemini-2.5-pro` reasoning → `optional`. Aggiunti `gemini-3-flash-preview`, `gemini-3.1-flash-lite` (stable), `gemini-3.1-pro-preview` (2M ctx).
- **Caching verificato**: Anthropic (`cache_control: ephemeral`), Gemini (explicit cached content), OpenAI (automatico via Responses API), DeepSeek (`prompt_cache_key`) — tutti coerenti e corretti.

---

## Gap tecnici aperti

| ID | Descrizione | Priorità |
|----|-------------|----------|
| T1 | Test unitari per `buildStagesForMode` in `pipelineModes.ts` | alta |
| T2 | Test Rust per `build_coherence_prompts` in `prompts.rs` | alta |
| G1 | Anthropic extended thinking: aggiungere `AnthropicConfig { thinkingBudget }`, wirare nel backend, gestire blocchi `<thinking>` nella response | media |
| G2 | `operationLogStore`: troncare `meta`/`detail` all'append (aligned col cap 10k già in dbService) | media |

---

## Prossimi passi

1. Aprire PR dall'epic verso `main` (include tutto il lavoro della issue #171 + #154 + altri)
2. T1 e T2 prima del merge se si vuole copertura pulita
3. G1 (Anthropic thinking) come issue separata post-merge

---

## Contesto architetturale

- **Streaming**: attivo solo per Ollama (`run_stage_stream`). Tutti gli altri provider usano `provider.call()` non-streaming. Judge e coherence sempre non-streaming.
- **Cancellazione**: `tokio::select!` con `CancelToken` sia per streaming che non-streaming.
- **Catalog**: `src/models/catalog.ts` è l'unica fonte di verità per tutti i modelli. Il backend non ha una propria lista di modelli noti — li riceve dal frontend via `req.model`.
- **Reasoning effort mapping**:
  - OpenAI: `reasoning.effort` (Responses API) o `reasoning_effort` (Chat Completions)
  - Gemini: `thinkingConfig.thinkingBudget` (0=off, 1024=low, 8192=medium, -1=high)
  - DeepSeek: `reasoning_effort` nel body Chat Completions
  - Anthropic: non ancora implementato
