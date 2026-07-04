---
layout: home
title: Glossa
description: Public documentation for the Glossa desktop app.

hero:
  name: Glossa
  text: Editorial translation for long-form text
  tagline: Desktop translation workflow for scholars, editors, and long-form review — staged translation, chunk-aware document processing, audit, glossary, and phrase memory in one local desktop app.
  image:
    src: /glossa-app-icon.png
    alt: Glossa
  actions:
    - theme: brand
      text: Get started
      link: /en/intro/getting-started
    - theme: alt
      text: Workflow guide
      link: /en/guides/document-pipeline
    - theme: alt
      text: GitHub
      link: https://github.com/nikazzio/glossa

features:
  - title: Workflow-first
    details: Configure a pipeline, test one chunk, run a batch, then review the result without leaving the same document workspace.
  - title: Editorial control
    details: Keep provider choice, prompts, glossary entries, audit findings, and notes visible while you iterate on difficult passages.
  - title: Long-document support
    details: Import plain text, Markdown, DOCX, or PDF, chunk the text, and process it progressively instead of pasting the whole work into a chat box.
---

## Read this first

- [Download the app](./intro/getting-started#download-the-app) to install the right release for Windows, macOS, or Linux
- [Getting started](./intro/getting-started) for install, development, and local build commands
- [Document pipeline](./guides/document-pipeline) for the end-to-end workflow
- [LLMs and pipelines](./guides/llm-and-pipelines) for how models behave and why Glossa splits work into stages
- [Projects and workspace](./guides/projects-and-workspace) for state, saved work, and shared resources
- [Glossary and phrase memory](./guides/glossary-and-memory) for terminology control
- [Audit and review](./guides/audit-review) for judge output, iteration, and review loops
- [Troubleshooting](./reference/troubleshooting) for common setup and provider failures

## What Glossa covers

- Standard mode for a single translation pass plus audit
- Editorial mode for translation, refinement, formatting, and review
- DeepL Hybrid mode for a DeepL first pass and LLM refinement
- Chunk-based document processing with test and production runs
- Glossary enforcement and reusable phrase memory
- Typed annotations anchored to translated text
- Cloud, local, and custom provider support through Gemini, OpenAI, Anthropic, DeepSeek, DeepL, Ollama, and OpenAI-compatible endpoints

> Public site only. Internal architecture notes and the UI design system stay under `docs-dev/`.
