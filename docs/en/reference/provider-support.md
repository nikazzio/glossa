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

## Model selection criteria

The right model depends on the type of work and expected volume:

- **High volume, technical or repetitive text** — use each provider's *flash* or *mini* models (e.g. Gemini Flash, GPT-4o Mini). They are fast, cost-effective, and accurate enough for structured content.
- **Literary refinement or stylistically dense text** — prefer *flagship* or *reasoning* models (e.g. Gemini Pro, GPT-4o, Claude Sonnet/Opus). They handle tone, register, and nuance more reliably.
- **Audit stage and quality judgement** — use models with strong *judge* capabilities (critical evaluation), typically flagship models with a long context window. A mini model in the audit stage tends to produce poorly calibrated judgements.
- **Corpus consistency** — avoid changing the model mid-project if you want stylistically homogeneous output.

## Operational differences

- Cloud providers depend on API keys and network stability.
- Ollama depends on local server availability and local hardware budget.
- Different providers may behave differently on long contexts, formatting, and review strictness.

## Practical guidance

- Use the same provider/model combination consistently within a project when you want stable output.
- If a provider is unavailable, verify the API key or local server before changing the rest of the pipeline.
- Keep the provider choice documented in the project if the project is meant to be shared later.
- If Ollama is slow or unstable, reduce chunk size or switch to a smaller local model before changing prompts.
