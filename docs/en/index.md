---
title: Glossa
description: Public documentation for the Glossa desktop app.
---

<div class="docsHero">
  <p class="docsHero__eyebrow">Official documentation</p>
  <div class="docsHero__identity">
    <img class="docsHero__icon" src="../public/glossa-app-icon.png" alt="" />
    <img class="docsHero__brand" src="../public/glossa-wordmark.svg" alt="Glossa" />
  </div>
  <p class="docsHero__lead">
    Desktop translation workflow for scholars, editors, and long-form review.
  </p>
  <p class="docsHero__text">
    Glossa combines staged translation, chunk-aware document processing, audit
    review, glossary control, annotations, and phrase memory in one local desktop app.
  </p>
  <div class="docsHero__actions">
    <a class="docsButton docsButton--primary" href="./intro/getting-started">
      Get started
    </a>
    <a class="docsButton docsButton--secondary" href="./guides/document-pipeline">
      Workflow guide
    </a>
    <a class="docsButton docsButton--secondary" href="https://github.com/nikazzio/glossa">
      GitHub
    </a>
  </div>
</div>

<div class="docsCardGrid">
  <div class="docsCard">
    <h2>Workflow-first</h2>
    <p>
      Configure a pipeline, test one chunk, run a batch, then review the result
      without leaving the same document workspace.
    </p>
  </div>
  <div class="docsCard">
    <h2>Editorial control</h2>
    <p>
      Keep provider choice, prompts, glossary entries, audit findings, and notes
      visible while you iterate on difficult passages.
    </p>
  </div>
  <div class="docsCard">
    <h2>Long-document support</h2>
    <p>
      Import plain text, Markdown, DOCX, or PDF, chunk the text, and process it
      progressively instead of pasting the whole work into a chat box.
    </p>
  </div>
</div>

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
