---
layout: home
title: Glossa
description: Documentazione pubblica dell'app desktop Glossa.

hero:
  name: Glossa
  text: Traduzione editoriale per testi lunghi
  tagline: Workflow desktop di traduzione per studiosi, editor professionisti e revisori di testi lunghi — traduzione a stadi, gestione documenti a chunk, audit, glossario e phrase memory in un'unica app locale.
  image:
    src: /glossa-app-icon.png
    alt: Glossa
  actions:
    - theme: brand
      text: Per iniziare
      link: /intro/getting-started
    - theme: alt
      text: Guida workflow
      link: /guides/document-pipeline
    - theme: alt
      text: GitHub
      link: https://github.com/nikazzio/glossa

features:
  - title: Workflow prima di tutto
    details: Configura una pipeline, prova un chunk, esegui il batch e revisiona il risultato senza uscire dallo stesso workspace documento.
  - title: Controllo editoriale
    details: Tieni visibili provider, prompt, glossario, audit e note mentre lavori sui passaggi più difficili.
  - title: Supporto ai testi lunghi
    details: Importa testo, Markdown, DOCX o PDF, segmenta il contenuto e processalo progressivamente invece di incollare tutto in una chat.
---

## Leggi prima questi

- [Scarica l'app](./intro/getting-started#scarica-lapp) per installare la release giusta per Windows, macOS o Linux
- [Per iniziare](./intro/getting-started) per installazione, sviluppo e build locale
- [Pipeline documento](./guides/document-pipeline) per il workflow end-to-end
- [LLM e pipeline](./guides/llm-and-pipelines) per capire come ragionano i modelli e perché Glossa divide il lavoro in stadi
- [Progetti e workspace](./guides/projects-and-workspace) per stato, salvataggi e risorse condivise
- [Glossario e phrase memory](./guides/glossary-and-memory) per il controllo terminologico
- [Audit e revisione](./guides/audit-review) per output del judge, iterazione e review loop
- [Risoluzione problemi](./reference/troubleshooting) per i guasti più comuni

## Cosa copre Glossa

- Modalità Standard per una singola traduzione più audit
- Modalità Editoriale per traduzione, refine, format e review
- Modalità DeepL Hybrid per prima passata DeepL e rifinitura LLM
- Elaborazione documenti a chunk con run di test e di produzione
- Glossario vincolante e phrase memory riutilizzabile
- Annotazioni tipizzate ancorate al testo tradotto
- Inferenza cloud, locale e personalizzata tramite Gemini, OpenAI, Anthropic, DeepSeek, DeepL, Ollama ed endpoint OpenAI-compatibili

> Questo è il sito pubblico. Le note interne di architettura e design restano in `docs-dev/`.
