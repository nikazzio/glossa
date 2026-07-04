---
title: Glossa
description: Documentazione pubblica dell'app desktop Glossa.
---

<div class="docsHero">
  <p class="docsHero__eyebrow">Documentazione ufficiale</p>
  <img class="docsHero__brand" src="./public/glossa-wordmark.svg" alt="Glossa" />
  <p class="docsHero__lead">
    Workflow desktop di traduzione per studiosi, editor professionisti e revisori di testi lunghi.
  </p>
  <p class="docsHero__text">
    Glossa unisce traduzione a stadi, gestione documenti a chunk, audit,
    glossario, annotazioni e phrase memory in una sola app desktop locale.
  </p>
  <div class="docsHero__actions">
    <a class="docsButton docsButton--primary" href="./intro/getting-started">
      Per iniziare
    </a>
    <a class="docsButton docsButton--secondary" href="./guides/document-pipeline">
      Guida workflow
    </a>
    <a class="docsButton docsButton--secondary" href="https://github.com/nikazzio/glossa">
      GitHub
    </a>
  </div>
</div>

<div class="docsCardGrid">
  <div class="docsCard">
    <h2>Workflow prima di tutto</h2>
    <p>
      Configura una pipeline, prova un chunk, esegui il batch e revisiona il risultato
      senza uscire dallo stesso workspace documento.
    </p>
  </div>
  <div class="docsCard">
    <h2>Controllo editoriale</h2>
    <p>
      Tieni visibili provider, prompt, glossario, audit e note mentre lavori
      sui passaggi più difficili.
    </p>
  </div>
  <div class="docsCard">
    <h2>Supporto ai testi lunghi</h2>
    <p>
      Importa testo, Markdown, DOCX o PDF, segmenta il contenuto e processalo
      progressivamente invece di incollare tutto in una chat.
    </p>
  </div>
</div>

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
