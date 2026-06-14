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
| Cloud | Best when you need managed APIs and hosted models |
| Ollama | Local-first option for offline or private setups |

## Practical guidance

- Use the same provider/model combination consistently within a project when you want stable output.
- If a provider is unavailable, verify the API key or local server before changing the rest of the pipeline.
- Keep the provider choice documented in the project if the project is meant to be shared later.
