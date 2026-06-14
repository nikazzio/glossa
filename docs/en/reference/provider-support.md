---
title: Provider support
---

# Provider support

Glossa supports both cloud and local providers. The supported set in the app
includes:

- Gemini
- OpenAI
- Anthropic
- DeepSeek
- Ollama

## Local versus cloud

| Provider type | Notes |
|---|---|
| Cloud | Best when you need managed APIs, remote capacity, and less machine setup |
| Ollama | Local-first option for offline or private setups on your own hardware |

## Provider selection guide

| Need | Practical choice |
|---|---|
| Lowest setup friction | Cloud provider with an API key |
| Local-only workflow | Ollama |
| Heavy review and reasoning | Larger hosted models or a strong local model if hardware allows it |
| Corpus-scale consistency | Stable provider/model choice across the whole project |

## Operational differences

- Cloud providers depend on API keys and network stability.
- Ollama depends on local server availability and local hardware budget.
- Different providers may behave differently on long contexts, formatting, and review strictness.

## Practical guidance

- Use the same provider/model combination consistently within a project when you want stable output.
- If a provider is unavailable, verify the API key or local server before changing the rest of the pipeline.
- Keep the provider choice documented in the project if the project is meant to be shared later.
- If Ollama is slow or unstable, reduce chunk size or switch to a smaller local model before changing prompts.
