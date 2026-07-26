---
title: Per iniziare
---

# Per iniziare

Glossa è un'app desktop Tauri. Gira in locale: configuri una pipeline di traduzione,
importi o prepari il testo sorgente e lavori per chunk, testando prima un passaggio
rappresentativo e poi lanciando il batch completo.

> **Nota terminologica**: questa documentazione mantiene in inglese i termini tecnici
> usati nell'interfaccia — *chunk*, *stage*, *batch*, *run*, *provider* — perché sono
> i nomi effettivi che vedi nell'app. Tutte le spiegazioni sono in italiano.

## Scarica l'app

Se vuoi usare Glossa, il percorso corretto è scaricare una release binaria da GitHub. Il repository serve per sviluppo e contributi, non come percorso principale per gli utenti finali.

- Windows: installer `.exe` oppure pacchetto `.msi`
- macOS: `.dmg`
- Linux: `.AppImage`, `.deb` oppure `.rpm`

Link utili:

- [Ultima release](https://github.com/nikazzio/glossa/releases/latest)
- Release corrente al 25 luglio 2026: [`glossa-v1.3.0`](https://github.com/nikazzio/glossa/releases/tag/glossa-v1.3.0)

## Per sviluppatori e contributori

Le sezioni seguenti riguardano chi vuole modificare il codice, testare modifiche locali
o contribuire al progetto. Se stai solo usando Glossa, salta al
[primo percorso consigliato](#primo-percorso-consigliato).

### Prerequisiti

- Node.js 18 o superiore
- Rust 1.77 o superiore
- `npm` per le dipendenze frontend
- Su Linux servono anche le librerie di sistema Tauri elencate nel `README.md` principale

### Sviluppo da sorgente

Clona il repository solo se vuoi sviluppare Glossa, testare modifiche locali o contribuire al codice.

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm install
```

### Avvia l'app desktop in sviluppo

```bash
npm run tauri:dev
```

Questo comando avvia insieme il frontend Vite e la shell Tauri.

### Build locale dell'app

```bash
npm run tauri:build
```

### Avvia la documentazione in locale

```bash
npm run docs:start
```

Per buildare il sito statico:

```bash
npm run docs:build
```

### Check di sviluppo

```bash
npm run lint:all
npm test
npm run build
```

Controlli backend, da eseguire da `src-tauri/`:

```bash
cargo check --all-targets
cargo test
```

---

## Primo percorso consigliato

1. Apri l'app e configura le credenziali provider in **Settings**.
2. Crea o apri un workspace e poi crea un progetto.
3. Imposta lingua sorgente e lingua target.
4. Scegli provider e modello per il primo stage.
5. Importa un documento. Per una prova breve, importa o incolla solo un campione e usa **Test** su un chunk.
6. Esegui un chunk di test prima di lanciare un batch completo.

## Cosa configurare per prima cosa

- **Chiavi provider** in Settings
- **Modalità pipeline**: Standard per lavori più semplici, Editoriale per rifinitura multi-stage, DeepL Hybrid quando vuoi una prima passata DeepL seguita da rifinitura LLM
- **Glossario** se la terminologia è vincolante
- **Chunking** se il testo sorgente è lungo o strutturalmente delicato

## Ambito docs e codice

- `docs/` contiene il sito pubblico statico
- `docs-dev/` contiene note interne per i maintainer
- `src/` e `src-tauri/` sono i codebase reali dell'app

## Prossimi passi

- Leggi la [guida pipeline documento](../guides/document-pipeline)
- Leggi [glossario e phrase memory](../guides/glossary-and-memory)
- Leggi [audit e revisione](../guides/audit-review)
- Consulta le [scorciatoie da tastiera](../guides/keyboard-shortcuts)
- Controlla i [provider supportati](../reference/provider-support)
