---
title: Risoluzione problemi
---

# Risoluzione problemi

Questa pagina copre i problemi più comuni che puoi incontrare durante setup o run di Glossa.

## L'app non parte

- Verifica che `npm install` sia terminato correttamente
- Rilancia `npm run tauri:dev`
- Su Linux installa i pacchetti di sistema Tauri elencati nel `README.md` principale

## L'app si apre ma mostra un errore di connessione

- Il dev server usa la porta dedicata `48123`; se un altro processo la occupa già, Vite si ferma con un errore leggibile invece di aprire una finestra rotta
- Se il messaggio riguarda una porta diversa da 48123, sovrascrivi la porta: `GLOSSA_DEV_PORT=9999 npm run tauri:dev` (Linux/macOS) — su Windows PowerShell `$env:GLOSSA_DEV_PORT=9999; npm run tauri:dev`, su cmd.exe `set GLOSSA_DEV_PORT=9999 && npm run tauri:dev`
- Questo riguarda solo lo sviluppo da sorgente: l'app installata (`.deb`/`.AppImage`/`.msi`/`.dmg`) non usa un dev server e non è soggetta a questo problema

## Un provider non parte

- Controlla che l'API key esista in Settings
- Verifica che il modello scelto sia valido per quel provider
- Tieni fisso il provider durante il debug; non cambiare prompt e provider insieme

## L'audit è rumoroso o incoerente

- Riesegui il test su un chunk rappresentativo
- Semplifica il prompt di traduzione prima di riscrivere quello del giudice
- Rimuovi i match deboli della phrase memory
- Controlla se il glossario è troppo vago per essere applicato con costanza

## Ollama non è disponibile

- Avvia il server locale con `ollama serve`
- Verifica che il modello sia installato con `ollama list`
- Usa un modello più piccolo o riduci il chunk size se l'inferenza locale va in timeout

## DeepL Hybrid non parte

- Verifica che la API key DeepL sia configurata in Settings.
- Controlla quota caratteri e piano DeepL: errori di quota bloccano lo stage prima del refine LLM.
- Se un glossario DeepL non viene creato, controlla che la coppia linguistica sia supportata da DeepL per i glossari.
- Se il refine LLM funziona ma lo stage DeepL no, debugga DeepL separatamente: non cambiare anche prompt, judge e provider LLM nello stesso tentativo.

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
