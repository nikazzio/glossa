---
title: Installazione e primo progetto
---

# Installazione e primo progetto

Glossa è un’applicazione desktop per consultare fonti digitalizzate e tradurre
documenti con modelli linguistici. Il frontend React comunica con un backend
Rust tramite Tauri; i dati di lavoro sono conservati in un database SQLite locale.

La documentazione segue il branch `main` e può descrivere funzioni successive
alla versione installata. Consulta lo [stato del progetto](../project/status)
per conoscere i limiti della beta.

## Installazione

Scarica il pacchetto per il tuo sistema dalla pagina delle
[release](https://github.com/nikazzio/glossa/releases). Sono previsti installer
per Windows, immagini disco per macOS e pacchetti AppImage, DEB e RPM per Linux;
verifica gli allegati della release scelta.

Per usare un servizio di traduzione remoto occorrono le relative credenziali.
Per l’elaborazione locale occorrono un server Ollama in esecuzione e un modello
già scaricato. La scelta si configura in **Impostazioni → Provider**.

## Primo progetto di traduzione

1. Crea un workspace, cioè un gruppo di progetti e risorse condivise.
2. Crea un progetto nel workspace e importa un documento.
3. Controlla il testo estratto e la suddivisione in frammenti nell’anteprima.
4. Configura lingue, modalità della pipeline, provider e modelli per le fasi attive.
5. Esegui una prova su un frammento rappresentativo e confronta il risultato con l’originale.
6. Avvia l’elaborazione degli altri frammenti, rivedi le traduzioni ed esporta il documento.

La [guida alla traduzione](../guides/document-pipeline) descrive stati e
comportamento dell’esecuzione. Per lavorare con riproduzioni digitali, parti
dalla [ricerca delle fonti](../guides/source-search).

## Sviluppo da sorgente

Sono richiesti Node.js `^20.19.0` oppure `>=22.12.0`, npm `>=11`, Rust e le
dipendenze di sistema Tauri. I vincoli Node.js e npm sono dichiarati in
`package.json`; le istruzioni per le dipendenze di sistema sono nel
[README](https://github.com/nikazzio/glossa#develop).

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm install
npm run tauri:dev
```

`tauri:dev` avvia sia Vite sia l’applicazione desktop. `npm run tauri:build`
genera i pacchetti di distribuzione usando la configurazione di rilascio.

## Documentazione locale e pubblicazione

```bash
npm run docs:start
npm run docs:build
```

Il primo comando avvia VitePress su `127.0.0.1:3001`; il secondo genera il sito
in `docs/.vitepress/dist`. I contenuti italiani sono in `docs/`, quelli inglesi
in `docs/en/`; navigazione e lingue sono configurate in `docs/.vitepress/config.ts`.

Il workflow GitHub Actions della documentazione pubblica il sito su GitHub Pages
dopo un push su `main` che modifica i percorsi configurati, fra cui `docs/`,
il workflow stesso e i manifesti npm. Un merge che non modifica questi percorsi
non avvia la pubblicazione. Le note interne di sviluppo sono in `docs-dev/`.
