---
title: Translation providers
---

# Translation providers

Glossa integrates remote LLM services, Ollama and OpenAI-compatible endpoints.
DeepL is available as the initial stage in DeepL Hybrid mode. This table
describes implemented roles without ranking model quality by brand.

| Provider | Configuration | Role |
| --- | --- | --- |
| Gemini | API key and model | LLM stages and assessment |
| OpenAI | API key and model | LLM stages and assessment |
| Anthropic | API key and model | LLM stages and assessment |
| DeepSeek | API key and model | LLM stages and assessment |
| DeepL | API key and translation options | Initial translation in DeepL Hybrid |
| Ollama | Server URL and installed model | LLM stages and assessment |
| Custom | Endpoint profile, model and credentials if required | Stages supported by the configured service |

## Credentials

Open **Settings → Provider**. Keys are stored in the operating system’s
credential store when available; otherwise Glossa uses an encrypted local
store. Keys are not included in application backups.

Requests send the text and context required by a stage to its selected provider.
Choosing Ollama for translation does not make other operations local: also
check the evaluator, prompt refinement and any memory services. An Ollama
server configured on another computer receives requests at that address.

## Custom endpoints

A Custom profile contains a name, base URL, authentication requirement and
associated key. The name and URL must be valid before saving or testing.
Remote endpoints require HTTPS; HTTP is accepted only for `localhost`,
`127.0.0.1` and `::1`.

In a stage, select Custom, choose the profile and enter the model identifier.
OpenAI compatibility describes the protocol; it does not guarantee support
for every option or response format. Use the connection test and a segment
trial to verify the configuration.

## Ollama

Install Ollama and download a model suitable for your hardware using the
instructions for your distribution. Configure its server URL in Glossa and
refresh the model list. The server must be running before processing; if
your installation does not start it automatically, use `ollama serve`.

Performance and capabilities depend on the model, available memory and
request length. Use reasoning options only with models that support them.
A standard local server does not require an API key.

## Selection and diagnosis

Evaluate a model on representative passages, considering accuracy, register,
glossary compliance, latency and usage. Keep the assessment criteria fixed
while comparing configurations. Model availability, quotas and pricing depend
on the service; the application’s catalogue does not replace your account’s
terms.

See [Troubleshooting](./troubleshooting) for connection, quota and response errors.
