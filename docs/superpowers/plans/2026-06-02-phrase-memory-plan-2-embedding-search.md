# Phrase Memory — Piano 2: Embedding Generation + Phrase Memory Search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare la generazione di embedding per frasi sorgente al momento dell'import, la ricerca vettoriale in phrase_memory durante la pipeline, e il salvataggio automatico di coppie frasi al lock del chunk.

**Architecture:** Il lato TypeScript gestisce la chiamata all'API embedding (riutilizzando le chiavi API già presenti nel keystore) e l'orchestrazione del job; il lato Rust (rusqlite + sqlite-vec) espone tre comandi Tauri atomici: `vec_upsert_source_phrase`, `vec_search_phrase_memory`, `vec_save_locked_phrases`. Lo store `phraseMemoryStore` mantiene i match per chunk e lo stato del job di pre-generazione.

**Tech Stack:** TypeScript, React 19, Zustand, @tauri-apps/plugin-sql, @tauri-apps/api/core (invoke), Vitest + Testing Library, Rust, rusqlite, sqlite-vec, reqwest (già presente), serde, thiserror

---

## Piani correlati

| Piano | Cosa costruisce |
|-------|----------------|
| Piano 1 | DB schema, sqlite-vec spike, workspace CRUD + UI |
| **Piano 2** (questo) | Embedding generation, phrase memory search, lock → store |
| Piano 3 | Tab Memoria UI, pre-pipeline review, pipeline injection, Estrai termine |
| Piano 4 | Preset management UI, pipeline config UI |

---

## File Structure

**Nuovi file:**
- `src/services/embeddingService.ts` — chiamata API embedding (OpenAI-compatible endpoint)
- `src/services/phraseMemoryService.ts` — split frasi, orchestrazione job pre-gen, search, save-on-lock
- `src/stores/phraseMemoryStore.ts` — match per chunk, stato job
- `src-tauri/src/vector/embedding.rs` — Tauri commands: upsert source phrase, search, save locked pairs
- `src/services/__tests__/embeddingService.test.ts`
- `src/services/__tests__/phraseMemoryService.test.ts`
- `src/stores/__tests__/phraseMemoryStore.test.ts`

**File modificati:**
- `src-tauri/src/vector/mod.rs` — aggiunge `pub mod embedding;` e re-export dei comandi
- `src-tauri/src/lib.rs` — registra i tre nuovi comandi nel `invoke_handler`
- `src-tauri/Cargo.toml` — aggiunge `serde`, `serde_json` se non già presenti (verifica prima)
- `src/types.ts` — aggiunge tipi `EmbeddingModel`, `PhraseMemorySplitter`, `PhraseMemoryPreset`, `Workspace`, `PhraseMatch`, `EmbeddingJobStatus`
- `src/services/dbService.ts` — `ALLOWED_MIGRATIONS` estesa con le nuove colonne se necessario
- `src/services/pipelineService.ts` — chiama `phraseMemoryService.saveLockedPhrases` al lock del chunk

---

## Task 1: Tipi condivisi in types.ts

Aggiunge i tipi mancanti usati in tutto il Piano 2. Nessun comportamento — solo contratto.

**File modificati:**
- `src/types.ts`

- [ ] **Step 1.1: Aggiungi tipi in src/types.ts**

Apri `src/types.ts` e aggiungi in coda (dopo l'ultimo export esistente):

```typescript
// ── Phrase Memory ─────────────────────────────────────────────────────

export type EmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large';

export type PhraseMemorySplitter = 'regex' | 'llm' | 'none';

export interface PhraseMemoryPresetConfig {
  splitter: PhraseMemorySplitter;
  similarityThreshold: number;
  maxResults: number;
  minPhraseLength: number;
}

export interface PhraseMemoryPreset {
  id: string;
  name: string;
  isBuiltin: boolean;
  config: PhraseMemoryPresetConfig;
}

export interface Workspace {
  id: string;
  name: string;
  embeddingModel: EmbeddingModel;
  createdAt: string;
}

/** Un singolo match restituito dalla ricerca vettoriale. */
export interface PhraseMatch {
  phraseMemoryId: string;
  sourcePhrase: string;
  targetPhrase: string;
  distance: number;
}

/** Stato del job di pre-generazione embedding per un documento. */
export type EmbeddingJobStatus =
  | { kind: 'idle' }
  | { kind: 'running'; processed: number; total: number; estimatedCostUsd: number }
  | { kind: 'done'; totalPhrases: number }
  | { kind: 'error'; message: string };
```

- [ ] **Step 1.2: Verifica compilazione TypeScript**

```bash
cd /home/niki/workspace/personal/glossa && npx tsc --noEmit 2>&1 | head -30
```

Expected: nessun errore sui nuovi tipi.

- [ ] **Commit Task 1**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src/types.ts && rtk git commit -m "feat(phrase-memory): aggiungi tipi condivisi Piano 2 (EmbeddingModel, PhraseMatch, EmbeddingJobStatus)"
```

---

## Task 2: embeddingService.ts — chiamata API embedding

Servizio puro: prende un array di stringhe, restituisce array di vettori float. Usa l'endpoint OpenAI-compatible già presente nell'app.

**File creati:**
- `src/services/__tests__/embeddingService.test.ts`
- `src/services/embeddingService.ts`

### Step 2.1 — Test prima (TDD)

Crea `src/services/__tests__/embeddingService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEmbeddings, estimateEmbeddingCostUsd } from '../embeddingService';

// Mock invoke di Tauri
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const mockInvoke = vi.mocked(invoke);

describe('embeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchEmbeddings', () => {
    it('restituisce array di vettori per input valido', async () => {
      const fakeVectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      mockInvoke.mockResolvedValueOnce(fakeVectors);

      const result = await fetchEmbeddings(
        ['ciao mondo', 'hello world'],
        'text-embedding-3-small',
      );

      expect(mockInvoke).toHaveBeenCalledWith('get_embeddings', {
        texts: ['ciao mondo', 'hello world'],
        model: 'text-embedding-3-small',
      });
      expect(result).toEqual(fakeVectors);
    });

    it('propaga errore se invoke fallisce', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('API key missing'));

      await expect(
        fetchEmbeddings(['testo'], 'text-embedding-3-small'),
      ).rejects.toThrow('API key missing');
    });

    it('restituisce array vuoto per input vuoto', async () => {
      mockInvoke.mockResolvedValueOnce([]);

      const result = await fetchEmbeddings([], 'text-embedding-3-small');
      expect(result).toEqual([]);
    });
  });

  describe('estimateEmbeddingCostUsd', () => {
    it('stima correttamente il costo per text-embedding-3-small', () => {
      // 1000 token × $0.02/MTok = $0.00002
      const cost = estimateEmbeddingCostUsd(1000, 'text-embedding-3-small');
      expect(cost).toBeCloseTo(0.00002, 8);
    });

    it('stima correttamente il costo per text-embedding-3-large', () => {
      // 1000 token × $0.13/MTok = $0.00013
      const cost = estimateEmbeddingCostUsd(1000, 'text-embedding-3-large');
      expect(cost).toBeCloseTo(0.00013, 8);
    });

    it('restituisce 0 per 0 token', () => {
      expect(estimateEmbeddingCostUsd(0, 'text-embedding-3-small')).toBe(0);
    });
  });
});
```

Esegui test (deve fallire — RED):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/__tests__/embeddingService.test.ts 2>&1 | tail -20
```

Expected: `Cannot find module '../embeddingService'`

### Step 2.2 — Implementazione

Crea `src/services/embeddingService.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { EmbeddingModel } from '../types';

/** Costo per milione di token in USD, per modello. */
const COST_PER_MILLION_TOKENS: Record<EmbeddingModel, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
};

/**
 * Chiama il comando Tauri `get_embeddings` che delega all'API OpenAI.
 * Restituisce un vettore float per ogni testo in input, nello stesso ordine.
 */
export async function fetchEmbeddings(
  texts: string[],
  model: EmbeddingModel,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  return invoke<number[][]>('get_embeddings', { texts, model });
}

/**
 * Stima il costo in USD per embeddare `tokenCount` token con il modello dato.
 * Approssimazione: 1 parola ≈ 1.3 token.
 */
export function estimateEmbeddingCostUsd(
  tokenCount: number,
  model: EmbeddingModel,
): number {
  const costPerToken = COST_PER_MILLION_TOKENS[model] / 1_000_000;
  return tokenCount * costPerToken;
}

/**
 * Stima il numero approssimativo di token da un testo grezzo.
 * Usato per la progress bar del job di pre-generazione.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}
```

Esegui test (GREEN):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/__tests__/embeddingService.test.ts 2>&1 | tail -10
```

Expected: `3 passed`

### Step 2.3 — Comando Tauri get_embeddings (Rust)

Il comando Tauri lato Rust non è ancora presente — lo creiamo in `src-tauri/src/vector/embedding.rs`. Prima però verifichiamo le dipendenze in Cargo.toml:

```bash
cd /home/niki/workspace/personal/glossa/src-tauri && grep -E "serde|reqwest|rusqlite" Cargo.toml
```

Se `serde` con feature `derive` non è presente, aggiungilo. Se `reqwest` non è presente, aggiungilo con `json`. Il progetto usa già `reqwest` per le chiamate LLM — verificare quale crate lo espone e se è accessibile dal modulo vector.

Crea `src-tauri/src/vector/embedding.rs`:

```rust
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::keystore;

#[derive(Debug, thiserror::Error)]
pub enum EmbeddingError {
    #[error("API key not found for provider openai")]
    MissingApiKey,
    #[error("HTTP request failed: {0}")]
    Http(String),
    #[error("Unexpected API response: {0}")]
    Parse(String),
}

impl Serialize for EmbeddingError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Deserialize)]
struct EmbeddingObject {
    embedding: Vec<f32>,
}

#[derive(Deserialize)]
struct OpenAiEmbeddingResponse {
    data: Vec<EmbeddingObject>,
}

/// Tauri command: invia `texts` all'API OpenAI embeddings e restituisce
/// un vettore float per ogni testo, nello stesso ordine.
#[tauri::command]
pub async fn get_embeddings(
    app: tauri::AppHandle,
    texts: Vec<String>,
    model: String,
) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    if texts.is_empty() {
        return Ok(vec![]);
    }

    let api_key = keystore::get_api_key_value(&app, "openai")
        .map_err(|_| EmbeddingError::MissingApiKey)?
        .ok_or(EmbeddingError::MissingApiKey)?;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "input": texts,
        "model": model,
        "encoding_format": "float"
    });

    let response = client
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(EmbeddingError::Http(format!("{status}: {text}")));
    }

    let parsed: OpenAiEmbeddingResponse = response
        .json()
        .await
        .map_err(|e| EmbeddingError::Parse(e.to_string()))?;

    Ok(parsed.data.into_iter().map(|o| o.embedding).collect())
}
```

**Nota:** `keystore::get_api_key_value` potrebbe non essere pubblica — verificare la firma in `src-tauri/src/keystore.rs` e adattare la chiamata se necessario (potrebbe richiedere invocare via un metodo interno diverso o esporre una funzione helper `pub(crate)`).

Compila:

```bash
cd /home/niki/workspace/personal/glossa/src-tauri && cargo check 2>&1 | tail -20
```

Expected: nessun errore.

- [ ] **Commit Task 2**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src/services/embeddingService.ts src/services/__tests__/embeddingService.test.ts src-tauri/src/vector/embedding.rs && rtk git commit -m "feat(phrase-memory): embeddingService + comando Tauri get_embeddings"
```

---

## Task 3: Sentence Splitter in phraseMemoryService.ts

Due modalità di split: `regex` (locale, puro TS) e `llm` (invoca Haiku/Flash via il sistema LLM esistente). La modalità `none` restituisce il testo originale come unica frase.

**File creati:**
- `src/services/__tests__/phraseMemoryService.test.ts` (sezione splitter)
- `src/services/phraseMemoryService.ts` (parziale — solo splitter)

### Step 3.1 — Test (RED)

Crea `src/services/__tests__/phraseMemoryService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { splitPhrases } from '../phraseMemoryService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../embeddingService', () => ({
  fetchEmbeddings: vi.fn(),
  estimateTokenCount: vi.fn((t: string) => t.split(/\s+/).length),
  estimateEmbeddingCostUsd: vi.fn(() => 0.001),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

const SAMPLE_TEXT =
  'Il gatto dorme sul tetto. La luna brilla nel cielo; le stelle sono molte: sono infinite.';

describe('splitPhrases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('modalità none restituisce il testo intero come unica frase', async () => {
    const result = await splitPhrases(SAMPLE_TEXT, 'none');
    expect(result).toEqual([SAMPLE_TEXT]);
  });

  it('modalità regex split su . ; :', async () => {
    const result = await splitPhrases(SAMPLE_TEXT, 'regex');
    // Almeno 4 frasi dal campione
    expect(result.length).toBeGreaterThanOrEqual(4);
    // Ogni frase è non vuota
    result.forEach((p) => expect(p.trim().length).toBeGreaterThan(0));
    // Ogni frase è contenuta nel testo originale
    result.forEach((p) => expect(SAMPLE_TEXT).toContain(p.trim()));
  });

  it('modalità regex scarta frasi troppo corte (< 3 char)', async () => {
    const result = await splitPhrases('A. BB. Una frase lunga abbastanza.', 'regex');
    result.forEach((p) => expect(p.trim().length).toBeGreaterThanOrEqual(3));
  });

  it('modalità llm chiama invoke validate_llm_phrases e restituisce frasi validate', async () => {
    const phrases = ['Il gatto dorme sul tetto', 'La luna brilla nel cielo'];
    mockInvoke.mockResolvedValueOnce(phrases);

    const result = await splitPhrases(SAMPLE_TEXT, 'llm');

    expect(mockInvoke).toHaveBeenCalledWith('split_phrases_llm', {
      sourceText: SAMPLE_TEXT,
    });
    expect(result).toEqual(phrases);
  });

  it('modalità llm: se invoke fallisce, fa fallback a regex', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('LLM timeout'));
    const result = await splitPhrases(SAMPLE_TEXT, 'llm');
    // Fallback: risultato non vuoto
    expect(result.length).toBeGreaterThan(0);
  });
});
```

Esegui (RED):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/__tests__/phraseMemoryService.test.ts 2>&1 | tail -15
```

Expected: `Cannot find module '../phraseMemoryService'`

### Step 3.2 — Implementazione splitter

Crea `src/services/phraseMemoryService.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { PhraseMemorySplitter, PhraseMatch, EmbeddingModel } from '../types';
import { fetchEmbeddings, estimateTokenCount, estimateEmbeddingCostUsd } from './embeddingService';

const MIN_PHRASE_CHARS = 3;

// ── Sentence Splitter ────────────────────────────────────────────────

function splitByRegex(text: string): string[] {
  return text
    .split(/[.;:]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_PHRASE_CHARS);
}

/**
 * Divide il testo sorgente in frasi secondo la modalità scelta.
 * - `none`: testo intero come unica frase
 * - `regex`: split su . ; :
 * - `llm`: chiama il comando Tauri `split_phrases_llm`; fallback a regex in caso di errore
 */
export async function splitPhrases(
  sourceText: string,
  splitter: PhraseMemorySplitter,
): Promise<string[]> {
  switch (splitter) {
    case 'none':
      return [sourceText];

    case 'regex':
      return splitByRegex(sourceText);

    case 'llm': {
      try {
        const phrases = await invoke<string[]>('split_phrases_llm', { sourceText });
        return phrases;
      } catch (err) {
        logger.warn('split_phrases_llm failed, falling back to regex', err);
        return splitByRegex(sourceText);
      }
    }
  }
}
```

Esegui test (GREEN):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/__tests__/phraseMemoryService.test.ts 2>&1 | tail -10
```

Expected: `5 passed`

### Step 3.3 — Comando Rust split_phrases_llm

Il comando Rust invoca il modello LLM (Haiku/Flash) con un prompt che restituisce JSON array di frasi, poi valida ogni frase con `source_text.contains(&phrase)`.

Aggiungi in `src-tauri/src/vector/embedding.rs`:

```rust
/// Tauri command: usa il modello LLM configurato per splittare `source_text`
/// in frasi verbatim. Valida ogni frase assicurando che sia contenuta nel testo
/// originale. Le frasi non validate vengono scartate con un warning.
#[tauri::command]
pub async fn split_phrases_llm(
    app: tauri::AppHandle,
    source_text: String,
) -> Result<Vec<String>, EmbeddingError> {
    let api_key = keystore::get_api_key_value(&app, "openai")
        .map_err(|_| EmbeddingError::MissingApiKey)?
        .ok_or(EmbeddingError::MissingApiKey)?;

    let prompt = format!(
        "Split the following text into individual sentences or meaningful phrases. \
        Return ONLY a JSON array of strings. Each string must be an exact verbatim \
        copy from the source text — no paraphrasing, no added punctuation. \
        Example output: [\"First sentence.\", \"Second phrase\"]\n\nText:\n{source_text}"
    );

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "response_format": {"type": "json_object"}
    });

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| EmbeddingError::Parse(e.to_string()))?;

    let raw_content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| EmbeddingError::Parse("missing content".into()))?;

    let parsed: serde_json::Value =
        serde_json::from_str(raw_content).map_err(|e| EmbeddingError::Parse(e.to_string()))?;

    // Il modello può restituire {"phrases": [...]} oppure direttamente [...]
    let arr = parsed
        .as_array()
        .or_else(|| parsed.get("phrases").and_then(|v| v.as_array()))
        .or_else(|| parsed.get("sentences").and_then(|v| v.as_array()))
        .ok_or_else(|| EmbeddingError::Parse("response is not an array".into()))?;

    let validated: Vec<String> = arr
        .iter()
        .filter_map(|v| v.as_str())
        .filter(|phrase| {
            let ok = source_text.contains(*phrase);
            if !ok {
                log::warn!("split_phrases_llm: discarding non-verbatim phrase: {phrase:?}");
            }
            ok
        })
        .map(|s| s.to_string())
        .collect();

    Ok(validated)
}
```

Compila:

```bash
cd /home/niki/workspace/personal/glossa/src-tauri && cargo check 2>&1 | tail -15
```

Expected: nessun errore.

- [ ] **Commit Task 3**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src/services/phraseMemoryService.ts src/services/__tests__/phraseMemoryService.test.ts src-tauri/src/vector/embedding.rs && rtk git commit -m "feat(phrase-memory): sentence splitter (regex/llm/none) + comando Rust split_phrases_llm"
```

---

## Task 4: Comandi Rust per operazioni vettoriali

Tre comandi atomici: upsert source phrase embedding, search phrase memory, save locked pairs. Vivono in `src-tauri/src/vector/embedding.rs`.

**Prerequisito:** il modulo `vector/mod.rs` da Piano 1 espone `open_vec_connection(db_path)`. Se il file non esiste ancora, crearlo con la firma minima (vedi sotto).

### Step 4.1 — Verifica / crea vector/mod.rs

Verifica che esista:

```bash
ls /home/niki/workspace/personal/glossa/src-tauri/src/vector/
```

Se non esiste, crea `src-tauri/src/vector/mod.rs`:

```rust
pub mod embedding;

use rusqlite::{Connection, Result as RusqliteResult};
use std::path::PathBuf;

pub fn open_vec_connection(db_path: &PathBuf) -> RusqliteResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
    Ok(conn)
}
```

Se esiste già da Piano 1, aggiungi solo la riga `pub mod embedding;` in cima.

### Step 4.2 — Aggiorna lib.rs

Apri `src-tauri/src/lib.rs`. Aggiungi `mod vector;` insieme agli altri mod, e registra i comandi nel `invoke_handler`:

```rust
// In cima, accanto agli altri mod:
mod vector;

// Nel invoke_handler, aggiungi:
vector::embedding::get_embeddings,
vector::embedding::split_phrases_llm,
vector::embedding::vec_upsert_source_phrase,
vector::embedding::vec_search_phrase_memory,
vector::embedding::vec_save_locked_phrases,
```

### Step 4.3 — Strutture dati condivise in embedding.rs

Prima dei comandi esistenti, aggiungi le strutture dati:

```rust
use std::path::PathBuf;
use tauri::Manager;

/// Recupera il path del DB SQLite dall'AppHandle.
fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, EmbeddingError> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("glossa.db"))
        .map_err(|e| EmbeddingError::Http(format!("cannot resolve db path: {e}")))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PhraseMatchResult {
    pub phrase_memory_id: String,
    pub source_phrase: String,
    pub target_phrase: String,
    pub distance: f64,
}
```

### Step 4.4 — vec_upsert_source_phrase

Inserisce o sostituisce un embedding in `source_phrase_embeddings`. Il vettore viene serializzato come BLOB little-endian f32 (formato atteso da sqlite-vec).

Aggiungi in `embedding.rs`:

```rust
/// Upsert di un embedding sorgente. Chiamato durante il job di pre-generazione.
/// Usa INSERT OR REPLACE per idempotenza.
#[tauri::command]
pub async fn vec_upsert_source_phrase(
    app: tauri::AppHandle,
    workspace_id: String,
    chunk_id: String,
    phrase: String,
    embedding: Vec<f32>,
) -> Result<(), EmbeddingError> {
    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    let embedding_blob = floats_to_blob(&embedding);

    conn.execute(
        "INSERT OR REPLACE INTO source_phrase_embeddings \
         (id, workspace_id, chunk_id, phrase, embedding, created_at) \
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, datetime('now'))",
        rusqlite::params![workspace_id, chunk_id, phrase, embedding_blob],
    )
    .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    Ok(())
}

/// Serializza Vec<f32> in BLOB little-endian (formato sqlite-vec).
fn floats_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}
```

### Step 4.5 — vec_search_phrase_memory

Esegue la query vettoriale su `phrase_memory` usando sqlite-vec KNN.

```rust
/// Cerca le frasi più simili in phrase_memory per il workspace dato.
/// Restituisce al massimo `max_results` match con distance < threshold.
#[tauri::command]
pub async fn vec_search_phrase_memory(
    app: tauri::AppHandle,
    workspace_id: String,
    query_embedding: Vec<f32>,
    threshold: f64,
    max_results: u32,
) -> Result<Vec<PhraseMatchResult>, EmbeddingError> {
    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    let blob = floats_to_blob(&query_embedding);

    // sqlite-vec: query KNN con filtro su workspace_id e distance
    let mut stmt = conn
        .prepare(
            "SELECT pm.id, pm.source_phrase, pm.target_phrase, \
                    vec_distance_cosine(pm.source_embedding, ?1) AS distance \
             FROM phrase_memory pm \
             WHERE pm.workspace_id = ?2 \
               AND vec_distance_cosine(pm.source_embedding, ?1) < ?3 \
             ORDER BY distance ASC \
             LIMIT ?4",
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    let results = stmt
        .query_map(
            rusqlite::params![blob, workspace_id, threshold, max_results],
            |row| {
                Ok(PhraseMatchResult {
                    phrase_memory_id: row.get(0)?,
                    source_phrase: row.get(1)?,
                    target_phrase: row.get(2)?,
                    distance: row.get(3)?,
                })
            },
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}
```

### Step 4.6 — vec_save_locked_phrases

Al lock del chunk: inserisce coppie (source, target) in `phrase_memory`, riusa embedding da `source_phrase_embeddings` se disponibile, poi cancella i record sorgente per quel chunk.

```rust
#[derive(Debug, Deserialize)]
pub struct PhrasePair {
    pub source_phrase: String,
    pub target_phrase: String,
    pub source_embedding: Vec<f32>,
}

/// Salva le coppie frase sorgente/target in phrase_memory.
/// Cancella i source_phrase_embeddings corrispondenti al chunk_id.
#[tauri::command]
pub async fn vec_save_locked_phrases(
    app: tauri::AppHandle,
    workspace_id: String,
    chunk_id: String,
    pairs: Vec<PhrasePair>,
    min_phrase_length: u32,
) -> Result<u32, EmbeddingError> {
    if pairs.is_empty() {
        return Ok(0);
    }

    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    let mut saved: u32 = 0;

    for pair in &pairs {
        if (pair.source_phrase.len() as u32) < min_phrase_length {
            continue;
        }

        let embedding_blob = floats_to_blob(&pair.source_embedding);

        conn.execute(
            "INSERT OR IGNORE INTO phrase_memory \
             (id, workspace_id, source_phrase, target_phrase, source_embedding, created_at) \
             VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, datetime('now'))",
            rusqlite::params![
                workspace_id,
                pair.source_phrase,
                pair.target_phrase,
                embedding_blob
            ],
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

        saved += 1;
    }

    // Rimuovi le source phrase embeddings temporanee per questo chunk
    conn.execute(
        "DELETE FROM source_phrase_embeddings WHERE chunk_id = ?1 AND workspace_id = ?2",
        rusqlite::params![chunk_id, workspace_id],
    )
    .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    Ok(saved)
}
```

### Step 4.7 — Compila tutto

```bash
cd /home/niki/workspace/personal/glossa/src-tauri && cargo check 2>&1 | tail -20
```

Expected: nessun errore. Se ci sono errori di visibilità su `keystore` o `open_vec_connection`, esponi le funzioni come `pub(crate)`.

- [ ] **Commit Task 4**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src-tauri/src/vector/ src-tauri/src/lib.rs && rtk git commit -m "feat(phrase-memory): comandi Tauri vec_upsert_source_phrase, vec_search_phrase_memory, vec_save_locked_phrases"
```

---

## Task 5: phraseMemoryStore.ts — stato match e job

Store Zustand per i match per chunk e lo stato del job di pre-generazione.

**File creati:**
- `src/stores/__tests__/phraseMemoryStore.test.ts`
- `src/stores/phraseMemoryStore.ts`

### Step 5.1 — Test (RED)

Crea `src/stores/__tests__/phraseMemoryStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePhraseMemoryStore } from '../phraseMemoryStore';

describe('phraseMemoryStore', () => {
  beforeEach(() => {
    usePhraseMemoryStore.getState().reset();
  });

  it('stato iniziale è corretto', () => {
    const state = usePhraseMemoryStore.getState();
    expect(state.matchesByChunkId).toEqual({});
    expect(state.jobStatus).toEqual({ kind: 'idle' });
  });

  it('setMatches aggiorna i match per un chunk', () => {
    const { result } = renderHook(() => usePhraseMemoryStore());

    const matches = [
      {
        phraseMemoryId: 'pm-1',
        sourcePhrase: 'ciao',
        targetPhrase: 'hello',
        distance: 0.1,
      },
    ];

    act(() => {
      result.current.setMatches('chunk-1', matches);
    });

    expect(result.current.matchesByChunkId['chunk-1']).toEqual(matches);
  });

  it('clearMatches rimuove i match di un chunk specifico', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('chunk-1', [
      { phraseMemoryId: 'pm-1', sourcePhrase: 'a', targetPhrase: 'b', distance: 0.1 },
    ]);
    store.setMatches('chunk-2', [
      { phraseMemoryId: 'pm-2', sourcePhrase: 'c', targetPhrase: 'd', distance: 0.2 },
    ]);

    store.clearMatches('chunk-1');

    const state = usePhraseMemoryStore.getState();
    expect(state.matchesByChunkId['chunk-1']).toBeUndefined();
    expect(state.matchesByChunkId['chunk-2']).toBeDefined();
  });

  it('setJobStatus aggiorna lo stato del job', () => {
    const { result } = renderHook(() => usePhraseMemoryStore());

    act(() => {
      result.current.setJobStatus({
        kind: 'running',
        processed: 5,
        total: 20,
        estimatedCostUsd: 0.002,
      });
    });

    expect(result.current.jobStatus).toMatchObject({
      kind: 'running',
      processed: 5,
      total: 20,
    });
  });

  it('reset ripristina lo stato iniziale', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('chunk-1', [
      { phraseMemoryId: 'pm-1', sourcePhrase: 'x', targetPhrase: 'y', distance: 0.05 },
    ]);
    store.setJobStatus({ kind: 'done', totalPhrases: 42 });

    store.reset();

    const state = usePhraseMemoryStore.getState();
    expect(state.matchesByChunkId).toEqual({});
    expect(state.jobStatus).toEqual({ kind: 'idle' });
  });
});
```

Esegui (RED):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/stores/__tests__/phraseMemoryStore.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '../phraseMemoryStore'`

### Step 5.2 — Implementazione

Crea `src/stores/phraseMemoryStore.ts`:

```typescript
import { create } from 'zustand';
import type { PhraseMatch, EmbeddingJobStatus } from '../types';

interface PhraseMemoryState {
  /** Map chunkId → array di match trovati durante la ricerca pre-pipeline. */
  matchesByChunkId: Record<string, PhraseMatch[]>;
  /** Stato del job di pre-generazione embedding per il documento corrente. */
  jobStatus: EmbeddingJobStatus;

  setMatches: (chunkId: string, matches: PhraseMatch[]) => void;
  clearMatches: (chunkId: string) => void;
  setJobStatus: (status: EmbeddingJobStatus) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  matchesByChunkId: {} as Record<string, PhraseMatch[]>,
  jobStatus: { kind: 'idle' } as EmbeddingJobStatus,
};

export const usePhraseMemoryStore = create<PhraseMemoryState>((set) => ({
  ...INITIAL_STATE,

  setMatches: (chunkId, matches) =>
    set((state) => ({
      matchesByChunkId: { ...state.matchesByChunkId, [chunkId]: matches },
    })),

  clearMatches: (chunkId) =>
    set((state) => {
      const { [chunkId]: _removed, ...rest } = state.matchesByChunkId;
      return { matchesByChunkId: rest };
    }),

  setJobStatus: (status) => set({ jobStatus: status }),

  reset: () => set({ ...INITIAL_STATE }),
}));
```

Esegui test (GREEN):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/stores/__tests__/phraseMemoryStore.test.ts 2>&1 | tail -10
```

Expected: `5 passed`

- [ ] **Commit Task 5**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src/stores/phraseMemoryStore.ts src/stores/__tests__/phraseMemoryStore.test.ts && rtk git commit -m "feat(phrase-memory): phraseMemoryStore con match per chunk e stato job"
```

---

## Task 6: phraseMemoryService — job pre-generazione e search

Completa `phraseMemoryService.ts` con il job di embedding pre-gen e la funzione di search pre-pipeline.

### Step 6.1 — Test per job e search (RED)

Aggiungi in `src/services/__tests__/phraseMemoryService.test.ts`:

```typescript
import {
  splitPhrases,
  runEmbeddingJob,
  searchPhraseMemory,
  saveLockedPhrases,
} from '../phraseMemoryService';

// (le mock di invoke e embeddingService sono già definite sopra)

describe('runEmbeddingJob', () => {
  it('processa chunk in batch e aggiorna lo store', async () => {
    // fetchEmbeddings restituisce vettori fake
    const { fetchEmbeddings } = await import('../embeddingService');
    vi.mocked(fetchEmbeddings).mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
    // vec_upsert_source_phrase non fallisce
    mockInvoke.mockResolvedValue(undefined);

    const chunks = [
      { id: 'c1', text: 'Ciao. Mondo.' },
      { id: 'c2', text: 'Hello. World.' },
    ];

    await runEmbeddingJob({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      splitter: 'regex',
      chunks,
      onProgress: vi.fn(),
    });

    // vec_upsert_source_phrase chiamato per ogni frase trovata
    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_upsert_source_phrase',
      expect.objectContaining({ workspaceId: 'ws-1' }),
    );
  });

  it('chiama onProgress con valori aggiornati', async () => {
    const { fetchEmbeddings } = await import('../embeddingService');
    vi.mocked(fetchEmbeddings).mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValue(undefined);

    const onProgress = vi.fn();
    await runEmbeddingJob({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      splitter: 'none',
      chunks: [{ id: 'c1', text: 'Una frase.' }],
      onProgress,
    });

    expect(onProgress).toHaveBeenCalled();
  });
});

describe('searchPhraseMemory', () => {
  it('chiama vec_search_phrase_memory e restituisce PhraseMatch[]', async () => {
    const { fetchEmbeddings } = await import('../embeddingService');
    vi.mocked(fetchEmbeddings).mockResolvedValue([[0.1, 0.2, 0.3]]);

    mockInvoke.mockResolvedValueOnce([
      {
        phrase_memory_id: 'pm-1',
        source_phrase: 'ciao',
        target_phrase: 'hello',
        distance: 0.05,
      },
    ]);

    const results = await searchPhraseMemory({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      queryText: 'ciao mondo',
      threshold: 0.3,
      maxResults: 5,
    });

    expect(results[0]).toMatchObject({ sourcePhrase: 'ciao', targetPhrase: 'hello' });
  });

  it('restituisce array vuoto se invoke restituisce []', async () => {
    const { fetchEmbeddings } = await import('../embeddingService');
    vi.mocked(fetchEmbeddings).mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValueOnce([]);

    const results = await searchPhraseMemory({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      queryText: 'testo',
      threshold: 0.3,
      maxResults: 5,
    });

    expect(results).toEqual([]);
  });
});

describe('saveLockedPhrases', () => {
  it('chiama vec_save_locked_phrases con le coppie corrette', async () => {
    const { fetchEmbeddings } = await import('../embeddingService');
    vi.mocked(fetchEmbeddings).mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValueOnce(1);

    await saveLockedPhrases({
      workspaceId: 'ws-1',
      chunkId: 'c1',
      embeddingModel: 'text-embedding-3-small',
      splitter: 'regex',
      sourceText: 'Ciao mondo.',
      targetText: 'Hello world.',
      minPhraseLength: 3,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_save_locked_phrases',
      expect.objectContaining({ workspaceId: 'ws-1', chunkId: 'c1' }),
    );
  });
});
```

Esegui (RED):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/__tests__/phraseMemoryService.test.ts 2>&1 | tail -15
```

Expected: `Cannot find 'runEmbeddingJob'` (o simile)

### Step 6.2 — Implementazione: aggiungi funzioni a phraseMemoryService.ts

Appendi a `src/services/phraseMemoryService.ts`:

```typescript
// ── Job pre-generazione embedding ───────────────────────────────────

export interface EmbeddingJobOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  splitter: PhraseMemorySplitter;
  chunks: Array<{ id: string; text: string }>;
  onProgress: (processed: number, total: number, estimatedCostUsd: number) => void;
}

/** Dimensione batch per le chiamate all'API embedding. */
const EMBEDDING_BATCH_SIZE = 20;

/**
 * Job di pre-generazione: per ogni chunk, splitta in frasi, embeddisce in batch,
 * inserisce in source_phrase_embeddings via Tauri.
 * Non blocca — chiama onProgress a ogni batch completato.
 */
export async function runEmbeddingJob(options: EmbeddingJobOptions): Promise<void> {
  const { workspaceId, embeddingModel, splitter, chunks, onProgress } = options;

  // Raccoglie tutte le frasi con il loro chunk di appartenenza
  const allPhrases: Array<{ chunkId: string; phrase: string }> = [];

  for (const chunk of chunks) {
    const phrases = await splitPhrases(chunk.text, splitter);
    for (const phrase of phrases) {
      allPhrases.push({ chunkId: chunk.id, phrase });
    }
  }

  const total = allPhrases.length;
  let processed = 0;
  let totalTokens = 0;

  // Processa a batch
  for (let i = 0; i < allPhrases.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = allPhrases.slice(i, i + EMBEDDING_BATCH_SIZE);
    const texts = batch.map((p) => p.phrase);

    const vectors = await fetchEmbeddings(texts, embeddingModel);

    for (let j = 0; j < batch.length; j++) {
      const { chunkId, phrase } = batch[j];
      const embedding = vectors[j];
      if (!embedding) continue;

      await invoke('vec_upsert_source_phrase', {
        workspaceId,
        chunkId,
        phrase,
        embedding,
      });

      totalTokens += estimateTokenCount(phrase);
    }

    processed += batch.length;
    const estimatedCostUsd = estimateEmbeddingCostUsd(totalTokens, embeddingModel);
    onProgress(Math.min(processed, total), total, estimatedCostUsd);
  }
}

// ── Search pre-pipeline ──────────────────────────────────────────────

export interface SearchOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  queryText: string;
  threshold: number;
  maxResults: number;
}

interface RawPhraseMatch {
  phrase_memory_id: string;
  source_phrase: string;
  target_phrase: string;
  distance: number;
}

/**
 * Embeddisce queryText e cerca i match più vicini in phrase_memory.
 * Restituisce PhraseMatch[] già convertiti in camelCase.
 */
export async function searchPhraseMemory(options: SearchOptions): Promise<PhraseMatch[]> {
  const { workspaceId, embeddingModel, queryText, threshold, maxResults } = options;

  const [queryEmbedding] = await fetchEmbeddings([queryText], embeddingModel);
  if (!queryEmbedding) return [];

  const raw = await invoke<RawPhraseMatch[]>('vec_search_phrase_memory', {
    workspaceId,
    queryEmbedding,
    threshold,
    maxResults,
  });

  return raw.map((r) => ({
    phraseMemoryId: r.phrase_memory_id,
    sourcePhrase: r.source_phrase,
    targetPhrase: r.target_phrase,
    distance: r.distance,
  }));
}

// ── Save on lock ─────────────────────────────────────────────────────

export interface SaveLockedPhrasesOptions {
  workspaceId: string;
  chunkId: string;
  embeddingModel: EmbeddingModel;
  splitter: PhraseMemorySplitter;
  sourceText: string;
  targetText: string;
  minPhraseLength: number;
}

/**
 * Al lock del chunk: splitta entrambi i testi, allinea le frasi per indice,
 * embeddisce le sorgenti e salva in phrase_memory via Tauri.
 */
export async function saveLockedPhrases(options: SaveLockedPhrasesOptions): Promise<void> {
  const {
    workspaceId,
    chunkId,
    embeddingModel,
    splitter,
    sourceText,
    targetText,
    minPhraseLength,
  } = options;

  const sourcePhrases = await splitPhrases(sourceText, splitter);
  const targetPhrases = await splitPhrases(targetText, splitter);

  // Allineamento per indice: usa la lunghezza minima per sicurezza
  const pairCount = Math.min(sourcePhrases.length, targetPhrases.length);
  if (pairCount === 0) return;

  const paired = sourcePhrases.slice(0, pairCount).map((sp, i) => ({
    sourcePhrase: sp,
    targetPhrase: targetPhrases[i],
  }));

  const sourceTexts = paired.map((p) => p.sourcePhrase);
  const sourceVectors = await fetchEmbeddings(sourceTexts, embeddingModel);

  const pairs = paired.map((p, i) => ({
    sourcePhrase: p.sourcePhrase,
    targetPhrase: p.targetPhrase,
    sourceEmbedding: sourceVectors[i] ?? [],
  }));

  await invoke('vec_save_locked_phrases', {
    workspaceId,
    chunkId,
    pairs,
    minPhraseLength,
  });
}
```

Esegui test (GREEN):

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/__tests__/phraseMemoryService.test.ts 2>&1 | tail -10
```

Expected: tutti i test passano.

- [ ] **Commit Task 6**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src/services/phraseMemoryService.ts src/services/__tests__/phraseMemoryService.test.ts && rtk git commit -m "feat(phrase-memory): phraseMemoryService — job pre-gen embedding, search pre-pipeline, save-on-lock"
```

---

## Task 7: Hook lock del chunk in pipelineService.ts

Al lock del chunk, se il workspace è attivo e `use_phrase_memory` è abilitato, chiama `saveLockedPhrases`.

**File modificati:**
- `src/services/pipelineService.ts`

### Step 7.1 — Individua il punto di lock

Cerca in `pipelineService.ts` dove viene aggiornato `translationLocked = true`. È la funzione che persiste il lock sul DB. Il nome esatto potrebbe essere `lockChunkTranslation`, `saveChunkLock` o simile — verificare leggendo il file.

```bash
grep -n "translationLocked\|lockChunk\|translation_locked" /home/niki/workspace/personal/glossa/src/services/pipelineService.ts | head -20
```

### Step 7.2 — Aggiungi chiamata saveLockedPhrases

Trova la funzione di lock (es. `lockChunkTranslation`). Dopo che il lock è salvato su DB, aggiungi:

```typescript
// Import da aggiungere in cima al file:
import { saveLockedPhrases } from './phraseMemoryService';
import { useWorkspaceStore } from '../stores/workspaceStore';

// Dentro la funzione di lock, dopo il salvataggio DB:
const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
const phraseMemoryConfig = useWorkspaceStore.getState().phraseMemoryConfig; // se presente

if (activeWorkspace && phraseMemoryConfig?.usePhraseMemory) {
  // Fire-and-forget: non blocca il lock, errori loggati
  saveLockedPhrases({
    workspaceId: activeWorkspace.id,
    chunkId: chunk.id,
    embeddingModel: activeWorkspace.embeddingModel,
    splitter: phraseMemoryConfig.splitter ?? 'regex',
    sourceText: chunk.sourceProcessingText,
    targetText: chunk.translationProcessingText ?? chunk.translationDisplayText,
    minPhraseLength: phraseMemoryConfig.minPhraseLength ?? 10,
  }).catch((err) => {
    logger.warn('saveLockedPhrases failed (non-blocking)', err);
  });
}
```

**Nota:** `useWorkspaceStore` e `phraseMemoryConfig` potrebbero avere nomi diversi a seconda di quanto implementato in Piano 1. Adattare i path di accesso allo store leggendo `src/stores/workspaceStore.ts`.

### Step 7.3 — Verifica integrazione (nessun errore TS)

```bash
cd /home/niki/workspace/personal/glossa && npx tsc --noEmit 2>&1 | head -20
```

Expected: nessun errore.

- [ ] **Commit Task 7**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src/services/pipelineService.ts && rtk git commit -m "feat(phrase-memory): trigger saveLockedPhrases al lock del chunk"
```

---

## Task 8: Suite di test finale e verifica copertura

Assicura che tutti i test passino e che la copertura delle nuove funzioni sia >= 80%.

### Step 8.1 — Run completo test frontend

```bash
cd /home/niki/workspace/personal/glossa && npx vitest run src/services/__tests__/embeddingService.test.ts src/services/__tests__/phraseMemoryService.test.ts src/stores/__tests__/phraseMemoryStore.test.ts 2>&1
```

Expected: tutti i test passano, 0 fallimenti.

### Step 8.2 — Verifica build TypeScript

```bash
cd /home/niki/workspace/personal/glossa && npx tsc --noEmit 2>&1 | head -30
```

Expected: nessun errore.

### Step 8.3 — Verifica build Rust

```bash
cd /home/niki/workspace/personal/glossa/src-tauri && cargo check 2>&1 | tail -10
```

Expected: `warning: ...` accettabili, nessun errore.

### Step 8.4 — Clippy

```bash
cd /home/niki/workspace/personal/glossa/src-tauri && cargo clippy -- -D warnings 2>&1 | tail -20
```

Expected: zero errori. Fix eventuali warning clippy prima di procedere.

- [ ] **Commit Task 8 (se fix clippy)**

```bash
cd /home/niki/workspace/personal/glossa && rtk git add src-tauri/src/ && rtk git commit -m "fix(phrase-memory): clippy warnings Piano 2"
```

---

## Checklist finale Piano 2

Prima di considerare Piano 2 completo:

- [ ] `src/types.ts` — tipi `EmbeddingModel`, `PhraseMemorySplitter`, `PhraseMatch`, `EmbeddingJobStatus`, `Workspace`, `PhraseMemoryPreset` presenti
- [ ] `src/services/embeddingService.ts` — `fetchEmbeddings`, `estimateEmbeddingCostUsd`, `estimateTokenCount` implementati e testati
- [ ] `src/services/phraseMemoryService.ts` — `splitPhrases`, `runEmbeddingJob`, `searchPhraseMemory`, `saveLockedPhrases` implementati e testati
- [ ] `src/stores/phraseMemoryStore.ts` — `matchesByChunkId`, `jobStatus`, `setMatches`, `clearMatches`, `setJobStatus`, `reset` implementati e testati
- [ ] `src-tauri/src/vector/embedding.rs` — `get_embeddings`, `split_phrases_llm`, `vec_upsert_source_phrase`, `vec_search_phrase_memory`, `vec_save_locked_phrases` compilano senza errori
- [ ] `src-tauri/src/lib.rs` — tutti i 5 comandi registrati nel `invoke_handler`
- [ ] `src/services/pipelineService.ts` — hook lock chiama `saveLockedPhrases`
- [ ] `cargo clippy` — zero errori
- [ ] `npx tsc --noEmit` — zero errori
- [ ] Tutti i test frontend passano

---

## Dipendenze verso Piano 3

Piano 3 (Tab Memoria UI + pre-pipeline review) si aspetta da questo piano:

- `usePhraseMemoryStore` — `matchesByChunkId` e `jobStatus` disponibili nello store
- `phraseMemoryService.searchPhraseMemory` — funzione stabile per triggherare ricerca
- `phraseMemoryService.runEmbeddingJob` — funzione stabile per il job di import
- Comando `vec_search_phrase_memory` — risponde correttamente con `PhraseMatchResult[]`
- Badge "N match" su chunk — verrà aggiunto in Piano 3 leggendo `matchesByChunkId[chunkId]?.length`
