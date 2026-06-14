---
title: Provider supportati
---

# Provider supportati

Glossa supporta sia provider cloud sia provider locali. L'insieme supportato nell'app include:

- Gemini
- OpenAI
- Anthropic
- DeepSeek
- Ollama

## Locale contro cloud

| Tipo provider | Note |
|---|---|
| Cloud | Ideale quando vuoi API gestite, capacità remota e meno setup macchina |
| Ollama | Opzione locale per workflow offline o privati sul tuo hardware |

## Guida alla scelta del provider

| Esigenza | Scelta pratica |
|---|---|
| Minimo attrito di setup | Provider cloud con API key |
| Workflow solo locale | Ollama |
| Review intensa e reasoning | Modelli hosted più grandi o un buon modello locale se l'hardware lo regge |
| Coerenza su corpus ampi | Scelta stabile provider/modello per tutto il progetto |

## Differenze operative

- I provider cloud dipendono da API key e stabilità di rete.
- Ollama dipende dalla disponibilità del server locale e dal budget hardware.
- Provider diversi possono comportarsi in modo diverso su contesti lunghi, formattazione e rigidità della review.

## Indicazioni pratiche

- Usa la stessa combinazione provider/modello all'interno di un progetto se vuoi output stabili.
- Se un provider è indisponibile, verifica API key o server locale prima di cambiare il resto della pipeline.
- Tieni documentata la scelta del provider nel progetto se quel progetto dovrà essere condiviso.
- Se Ollama è lento o instabile, riduci il chunk size o passa a un modello locale più piccolo prima di cambiare i prompt.
