---
title: Risoluzione problemi
---

# Risoluzione problemi

Questa pagina copre i problemi più comuni che puoi incontrare durante setup o run di Glossa.

## L'app non parte

- Verifica che `npm install` sia terminato correttamente
- Rilancia `npm run tauri:dev`
- Su Linux installa i pacchetti di sistema Tauri elencati nel `README.md` principale

## Un provider non parte

- Controlla che l'API key esista in Settings
- Verifica che il modello scelto sia valido per quel provider
- Tieni fisso il provider durante il debug; non cambiare prompt e provider insieme

## L'audit è rumoroso o incoerente

- Riesegui il test su un chunk rappresentativo
- Semplifica il prompt di traduzione prima di riscrivere quello del judge
- Rimuovi i match deboli della phrase memory
- Controlla se il glossario è troppo vago per essere applicato con costanza

## Ollama non è disponibile

- Avvia il server locale con `ollama serve`
- Verifica che il modello sia installato con `ollama list`
- Usa un modello più piccolo o riduci il chunk size se l'inferenza locale va in timeout

## La qualità dell'output è instabile

- Torna al Test mode
- Riduci la complessità del prompt
- Restringi il glossario ai soli termini obbligatori
- Rivedi i match phrase memory prima di riusarli

## L'import documento sembra sbagliato

- Riapri l'anteprima di import e ispeziona il chunking
- Preferisci l'import Markdown quando contano heading e struttura
- Usa chunk più piccoli se passaggi lunghi vengono raggruppati troppo aggressivamente

## Problemi di build o CI

- `npm run lint` controlla la superficie TypeScript del frontend
- `npm test` esegue la suite test frontend
- `npm run docs:build` valida il sito VitePress
- `cargo check --all-targets` e `cargo test` validano il backend Tauri
- Il sito docs è statico; se si rompe, controlla prima `docs/.vitepress/config.ts`, i link markdown e gli asset pubblici
