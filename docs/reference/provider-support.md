---
title: Provider supportati
---

# Provider supportati

Glossa supporta provider cloud, inferenza locale ed endpoint OpenAI-compatibili personalizzati. L'insieme supportato nell'app include:

- Gemini
- OpenAI
- Anthropic
- DeepSeek
- Ollama
- Endpoint custom (qualsiasi API OpenAI-compatibile)

## Locale contro cloud contro custom

| Tipo provider | Note |
|---|---|
| Cloud | Ideale quando vuoi API gestite, capacità remota e meno setup macchina |
| Ollama | Opzione locale per workflow offline o privati sul tuo hardware |
| Custom | Endpoint OpenAI-compatibili di terze parti o auto-ospitati (OpenRouter, Groq, LM Studio, vLLM, proxy aziendali) |

## Endpoint custom

Tramite **Impostazioni → Custom** puoi definire profili endpoint arbitrari. Ogni profilo ha:

- **Nome** — etichetta identificativa del profilo
- **URL base** — radice dell'endpoint OpenAI-compatibile (es. `https://openrouter.ai/api/v1`)
- **Richiede API key** — toggle; se attivo la chiave viene salvata nel portachiavi OS
- **Test connessione** — verifica la raggiungibilità dell'endpoint con un modello di tua scelta

Nello stage della pipeline, selezionando il provider *Custom* appare un secondo menu a tendina per scegliere il profilo e un campo di testo libero per il nome del modello.

## Guida alla scelta del provider

| Esigenza | Scelta pratica |
|---|---|
| Minimo attrito di setup | Provider cloud con API key |
| Workflow solo locale | Ollama |
| Review intensa e reasoning | Modelli hosted più grandi o un buon modello locale se l'hardware lo regge |
| Coerenza su corpus ampi | Scelta stabile provider/modello per tutto il progetto |

## Criteri di scelta del modello

La scelta del modello dipende dal tipo di lavoro e dal volume:

- **Volume alto, testo tecnico o ripetitivo** — usa i modelli *flash* o *mini* di ciascun provider (es. Gemini Flash, GPT-4o Mini). Sono veloci, economici e sufficientemente precisi per testi strutturati.
- **Rifinitura letteraria o testi ad alta densità stilistica** — preferisci i modelli *flagship* o *reasoning* (es. Gemini Pro, GPT-4o, Claude Sonnet/Opus). Gestiscono meglio il tono, il registro e le sfumature.
- **Stage Audit e giudizio qualità** — usa modelli con buone capacità di *judge* (valutazione critica), tipicamente i modelli flagship con contesto lungo. Un modello mini nell'audit tende a produrre giudizi poco calibrati.
- **Coerenza di corpus** — non cambiare modello a metà progetto se vuoi output stilisticamente omogenei.

## Differenze operative

- I provider cloud dipendono da API key e stabilità di rete.
- Ollama dipende dalla disponibilità del server locale e dal budget hardware.
- Provider diversi possono comportarsi in modo diverso su contesti lunghi, formattazione e rigidità della review.

## Indicazioni pratiche

- Usa la stessa combinazione provider/modello all'interno di un progetto se vuoi output stabili.
- Se un provider è indisponibile, verifica API key o server locale prima di cambiare il resto della pipeline.
- Tieni documentata la scelta del provider nel progetto se quel progetto dovrà essere condiviso.
- Se Ollama è lento o instabile, riduci il chunk size o passa a un modello locale più piccolo prima di cambiare i prompt.
