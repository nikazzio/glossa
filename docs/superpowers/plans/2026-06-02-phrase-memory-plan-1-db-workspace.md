# Phrase Memory — Piano 1: DB Foundation + Workspace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare il DB schema completo, integrare sqlite-vec in Tauri, e costruire workspace CRUD + UI (wizard + guard).

**Architecture:** sqlite-vec caricato via rusqlite in un modulo Rust separato (connessione propria in WAL mode); tabelle regolari gestite via @tauri-apps/plugin-sql dal lato TS; workspace è il container di tutto.

**Tech Stack:** rusqlite, sqlite-vec, @tauri-apps/plugin-sql, Zustand, Vitest, React 19, TypeScript

---

## Piani correlati

| Piano | Cosa costruisce |
|-------|----------------|
| **Piano 1** (questo) | DB schema, sqlite-vec spike, workspace CRUD + UI |
| Piano 2 | Embedding generation, phrase memory search, lock → store |
| Piano 3 | Tab Memoria UI, pre-pipeline review, pipeline injection, Estrai termine |
| Piano 4 | Preset management UI, pipeline config UI |

---

## File Structure

**Nuovi file:**
- `src-tauri/src/vector/mod.rs` — rusqlite + sqlite-vec connection, Tauri commands per vector ops
- `src/services/workspaceService.ts` — workspace CRUD
- `src/services/phraseMemoryPresetService.ts` — preset CRUD + seed built-in
- `src/store/workspaceStore.ts` — stato workspace attivo
- `src/components/workspace/WorkspaceWizard.tsx` — wizard primo avvio

**File modificati:**
- `src-tauri/Cargo.toml` — dipendenze rusqlite
- `src-tauri/src/lib.rs` — registra modulo vector
- `src/services/dbService.ts` — nuove tabelle in initDatabase() + WAL mode
- `src/types.ts` — tipi Workspace, PhraseMemoryPreset
- `src/App.tsx` — workspace guard

**Test:**
- `src/services/__tests__/workspaceService.test.ts`
- `src/services/__tests__/phraseMemoryPresetService.test.ts`

---

### Task 1: sqlite-vec spike in Tauri

Valida che sqlite-vec funzioni dentro Tauri prima di tutto il resto. Task critico — sblocca o ridisegna Piano 2.

**File:**
- Modifica: `src-tauri/Cargo.toml`
- Crea: `src-tauri/src/vector/mod.rs`
- Modifica: `src-tauri/src/lib.rs`
- Modifica: `src/services/dbService.ts`

- [ ] **Step 1: Aggiungi rusqlite a Cargo.toml**

```toml
[dependencies]
# aggiungere dopo le dipendenze esistenti:
rusqlite = { version = "0.32", features = ["bundled"] }
```

Run: `cd src-tauri && cargo check`
Expected: compila senza errori

- [ ] **Step 2: Crea il modulo vector**

Crea `src-tauri/src/vector/mod.rs`:

```rust
use rusqlite::{Connection, Result as RusqliteResult};
use std::path::PathBuf;

pub fn open_vec_connection(db_path: &PathBuf) -> RusqliteResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
    Ok(conn)
}

#[tauri::command]
pub fn vec_ping(app: tauri::AppHandle) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    open_vec_connection(&db_path)
        .map(|_| "ok".to_string())
        .map_err(|e| e.to_string())
}

pub fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("glossa.db"))
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Registra modulo e comando in lib.rs**

In `src-tauri/src/lib.rs`:

```rust
// aggiungere con gli altri mod:
mod vector;

// aggiungere in .invoke_handler(tauri::generate_handler![...]):
vector::vec_ping,
```

- [ ] **Step 4: WAL mode in dbService.ts**

In `src/services/dbService.ts`, all'inizio di `initDatabase()` prima di qualsiasi altra query:

```typescript
await db.execute('PRAGMA journal_mode=WAL;');
await db.execute('PRAGMA busy_timeout=5000;');
```

- [ ] **Step 5: Ricerca sqlite-vec loading**

Controlla se esiste un crate Rust per sqlite-vec:

```bash
cd src-tauri && cargo search sqlite-vec
```

Se `sqlite-vec` esiste come crate Rust, aggiungilo a Cargo.toml e caricalo:
```toml
sqlite-vec = "0.0.1-alpha.8"  # usa la versione più recente trovata
```
```rust
// in open_vec_connection, dopo l'apertura della connessione:
sqlite_vec::load(&conn).map_err(|e| rusqlite::Error::SqliteFailure(e, None))?;
```

Se non esiste come crate Rust, documenta questo in un commento in `vector/mod.rs` — Piano 2 dovrà risolvere l'integrazione via dynamic loading prima di procedere con gli embedding.

- [ ] **Step 6: Test manuale vec_ping**

Avvia `npm run tauri dev`, apri la dev console del browser:

```javascript
const { invoke } = window.__TAURI__.core
const result = await invoke('vec_ping')
console.log(result) // atteso: "ok"
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/vector/ src-tauri/src/lib.rs src/services/dbService.ts
git commit -m "feat: sqlite-vec spike + WAL mode (#7)"
```

---

### Task 2: Nuove tabelle DB

**File:**
- Modifica: `src/services/dbService.ts`

- [ ] **Step 1: Aggiungi tabella workspaces**

In `dbService.ts:initDatabase()`, dopo le tabelle esistenti:

```typescript
await db.execute(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    created_at TEXT NOT NULL
  );
`);
```

- [ ] **Step 2: Aggiungi workspace_id a projects**

```typescript
try {
  await db.execute(
    `ALTER TABLE projects ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);`
  );
} catch (_) {
  // colonna già esistente — ok, operazione idempotente
}
```

- [ ] **Step 3: Aggiungi phrase_memory_presets**

```typescript
await db.execute(`
  CREATE TABLE IF NOT EXISTS phrase_memory_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);
```

- [ ] **Step 4: Aggiungi phrase_memory**

```typescript
await db.execute(`
  CREATE TABLE IF NOT EXISTS phrase_memory (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    source_phrase TEXT NOT NULL,
    target_phrase TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    author TEXT,
    work TEXT,
    domain TEXT,
    tags TEXT,
    notes TEXT,
    chunk_id TEXT,
    project_id TEXT REFERENCES projects(id),
    embedding BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
`);
```

- [ ] **Step 5: Aggiungi source_phrase_embeddings**

```typescript
await db.execute(`
  CREATE TABLE IF NOT EXISTS source_phrase_embeddings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    chunk_id TEXT,
    source_phrase TEXT NOT NULL,
    embedding BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
`);
```

- [ ] **Step 6: Aggiungi historical_techniques + technique_tags**

```typescript
await db.execute(`
  CREATE TABLE IF NOT EXISTS historical_techniques (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    author TEXT,
    work TEXT,
    year TEXT,
    embedding_source BLOB NOT NULL,
    embedding_translated BLOB NOT NULL,
    source_chunk_id TEXT,
    translation_stale INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

await db.execute(`
  CREATE TABLE IF NOT EXISTS technique_tags (
    technique_id TEXT NOT NULL REFERENCES historical_techniques(id),
    category TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (technique_id, category, value)
  );
`);

await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_technique_tags_category_value
  ON technique_tags(category, value);
`);
```

- [ ] **Step 7: Inizializza active_workspace_id in app_settings**

```typescript
const wsKeyCheck = await db.select<Array<{ count: number }>>(
  `SELECT COUNT(*) as count FROM app_settings WHERE key = 'active_workspace_id'`
);
if (wsKeyCheck[0].count === 0) {
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ('active_workspace_id', '')`
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/services/dbService.ts
git commit -m "feat: add workspace, phrase_memory, historical_techniques schema (#7)"
```

---

### Task 3: TypeScript types

**File:**
- Modifica: `src/types.ts`

- [ ] **Step 1: Aggiungi tipi**

```typescript
export type EmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large'

export type PhraseMemorySplitter = 'regex' | 'llm' | 'none'

export type Workspace = {
  id: string
  name: string
  description?: string
  embeddingModel: EmbeddingModel
  createdAt: string
}

export type PhraseMemoryPresetConfig = {
  splitter: PhraseMemorySplitter
  similarityThreshold: number
  maxResults: number
  minPhraseLength: number
}

export type PhraseMemoryPreset = {
  id: string
  name: string
  isBuiltin: boolean
  config: PhraseMemoryPresetConfig
  createdAt: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: Workspace + PhraseMemoryPreset types (#7)"
```

---

### Task 4: Workspace service

**File:**
- Crea: `src/services/workspaceService.ts`
- Crea: `src/services/__tests__/workspaceService.test.ts`

- [ ] **Step 1: Scrivi test fallimenti**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWorkspace, listWorkspaces, getActiveWorkspaceId, setActiveWorkspaceId } from '../workspaceService'

const mockDb = {
  execute: vi.fn().mockResolvedValue({}),
  select: vi.fn().mockResolvedValue([]),
}
vi.mock('../dbService', () => ({ getDb: vi.fn(() => mockDb) }))

beforeEach(() => { vi.clearAllMocks() })

describe('workspaceService', () => {
  it('createWorkspace returns workspace with ws_ prefix id', async () => {
    const ws = await createWorkspace({ name: 'Test', embeddingModel: 'text-embedding-3-small' })
    expect(ws.id).toMatch(/^ws_/)
    expect(ws.name).toBe('Test')
    expect(ws.embeddingModel).toBe('text-embedding-3-small')
  })

  it('listWorkspaces returns empty array when db returns nothing', async () => {
    mockDb.select.mockResolvedValueOnce([])
    const result = await listWorkspaces()
    expect(result).toEqual([])
  })

  it('getActiveWorkspaceId returns null when value is empty string', async () => {
    mockDb.select.mockResolvedValueOnce([{ value: '' }])
    const id = await getActiveWorkspaceId()
    expect(id).toBeNull()
  })

  it('setActiveWorkspaceId calls execute with active_workspace_id key', async () => {
    await setActiveWorkspaceId('ws_abc123')
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('active_workspace_id'),
      ['ws_abc123']
    )
  })
})
```

- [ ] **Step 2: Esegui test — verifica fallimento**

```bash
npm test -- workspaceService
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementa workspaceService.ts**

```typescript
import { getDb } from './dbService'
import type { Workspace, EmbeddingModel } from '../types'

const generateId = () =>
  `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

export async function createWorkspace(params: {
  name: string
  description?: string
  embeddingModel: EmbeddingModel
}): Promise<Workspace> {
  const db = await getDb()
  const workspace: Workspace = {
    id: generateId(),
    name: params.name,
    description: params.description,
    embeddingModel: params.embeddingModel,
    createdAt: new Date().toISOString(),
  }
  await db.execute(
    `INSERT INTO workspaces (id, name, description, embedding_model, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [workspace.id, workspace.name, workspace.description ?? null,
     workspace.embeddingModel, workspace.createdAt]
  )
  return workspace
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await getDb()
  const rows = await db.select<Array<{
    id: string; name: string; description: string | null
    embedding_model: string; created_at: string
  }>>(`SELECT id, name, description, embedding_model, created_at
       FROM workspaces ORDER BY created_at ASC`)
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    embeddingModel: r.embedding_model as EmbeddingModel,
    createdAt: r.created_at,
  }))
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Array<{ value: string }>>(
    `SELECT value FROM app_settings WHERE key = 'active_workspace_id'`
  )
  return rows[0]?.value || null
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    `UPDATE app_settings SET value = ? WHERE key = 'active_workspace_id'`,
    [id]
  )
}

export async function getActiveWorkspace(): Promise<Workspace | null> {
  const id = await getActiveWorkspaceId()
  if (!id) return null
  const db = await getDb()
  const rows = await db.select<Array<{
    id: string; name: string; description: string | null
    embedding_model: string; created_at: string
  }>>(
    `SELECT id, name, description, embedding_model, created_at
     FROM workspaces WHERE id = ?`,
    [id]
  )
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id, name: r.name, description: r.description ?? undefined,
    embeddingModel: r.embedding_model as EmbeddingModel, createdAt: r.created_at,
  }
}
```

- [ ] **Step 4: Esegui test — verifica passaggio**

```bash
npm test -- workspaceService
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/workspaceService.ts src/services/__tests__/workspaceService.test.ts
git commit -m "feat: workspace service CRUD + active workspace (#7)"
```

---

### Task 5: Workspace Zustand store

**File:**
- Crea: `src/store/workspaceStore.ts`

- [ ] **Step 1: Implementa store**

```typescript
import { create } from 'zustand'
import type { Workspace } from '../types'
import { listWorkspaces, getActiveWorkspaceId, setActiveWorkspaceId } from '../services/workspaceService'

type WorkspaceStore = {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean
  loadWorkspaces: () => Promise<void>
  setActive: (workspace: Workspace) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  loading: false,

  loadWorkspaces: async () => {
    set({ loading: true })
    const [workspaces, activeId] = await Promise.all([
      listWorkspaces(),
      getActiveWorkspaceId(),
    ])
    const activeWorkspace = workspaces.find(w => w.id === activeId) ?? null
    set({ workspaces, activeWorkspace, loading: false })
  },

  setActive: async (workspace) => {
    await setActiveWorkspaceId(workspace.id)
    set({ activeWorkspace: workspace })
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/store/workspaceStore.ts
git commit -m "feat: workspace Zustand store (#7)"
```

---

### Task 6: Phrase memory preset service + seed

**File:**
- Crea: `src/services/phraseMemoryPresetService.ts`
- Crea: `src/services/__tests__/phraseMemoryPresetService.test.ts`

- [ ] **Step 1: Scrivi test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedBuiltinPresets, listPresets } from '../phraseMemoryPresetService'

const mockDb = { execute: vi.fn().mockResolvedValue({}), select: vi.fn() }
vi.mock('../dbService', () => ({ getDb: vi.fn(() => mockDb) }))

beforeEach(() => { vi.clearAllMocks() })

describe('phraseMemoryPresetService', () => {
  it('seedBuiltinPresets chiama execute 4 volte (uno per preset)', async () => {
    await seedBuiltinPresets()
    expect(mockDb.execute).toHaveBeenCalledTimes(4)
  })

  it('listPresets mappa is_builtin integer a boolean', async () => {
    mockDb.select.mockResolvedValueOnce([{
      id: 'pmp_builtin_modern', name: 'Moderno', is_builtin: 1,
      config: '{"splitter":"regex","similarityThreshold":0.85,"maxResults":5,"minPhraseLength":20}',
      created_at: '2026-01-01T00:00:00.000Z',
    }])
    const presets = await listPresets()
    expect(presets[0].isBuiltin).toBe(true)
    expect(presets[0].config.splitter).toBe('regex')
    expect(presets[0].config.similarityThreshold).toBe(0.85)
  })
})
```

- [ ] **Step 2: Esegui test — verifica fallimento**

```bash
npm test -- phraseMemoryPresetService
```
Expected: FAIL

- [ ] **Step 3: Implementa phraseMemoryPresetService.ts**

```typescript
import { getDb } from './dbService'
import type { PhraseMemoryPreset, PhraseMemoryPresetConfig } from '../types'

const BUILTIN_PRESETS: Array<Omit<PhraseMemoryPreset, 'createdAt'>> = [
  {
    id: 'pmp_builtin_modern', name: 'Moderno', isBuiltin: true,
    config: { splitter: 'regex', similarityThreshold: 0.85, maxResults: 5, minPhraseLength: 20 },
  },
  {
    id: 'pmp_builtin_medieval_it', name: 'Medievale IT', isBuiltin: true,
    config: { splitter: 'llm', similarityThreshold: 0.70, maxResults: 10, minPhraseLength: 10 },
  },
  {
    id: 'pmp_builtin_latin', name: 'Latino', isBuiltin: true,
    config: { splitter: 'llm', similarityThreshold: 0.65, maxResults: 10, minPhraseLength: 10 },
  },
  {
    id: 'pmp_builtin_legal', name: 'Legale', isBuiltin: true,
    config: { splitter: 'regex', similarityThreshold: 0.90, maxResults: 3, minPhraseLength: 30 },
  },
]

export async function seedBuiltinPresets(): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  for (const preset of BUILTIN_PRESETS) {
    await db.execute(
      `INSERT OR IGNORE INTO phrase_memory_presets (id, name, is_builtin, config, created_at)
       VALUES (?, ?, 1, ?, ?)`,
      [preset.id, preset.name, JSON.stringify(preset.config), now]
    )
  }
}

export async function listPresets(): Promise<PhraseMemoryPreset[]> {
  const db = await getDb()
  const rows = await db.select<Array<{
    id: string; name: string; is_builtin: number; config: string; created_at: string
  }>>(`SELECT * FROM phrase_memory_presets ORDER BY is_builtin DESC, name ASC`)
  return rows.map(r => ({
    id: r.id, name: r.name, isBuiltin: r.is_builtin === 1,
    config: JSON.parse(r.config) as PhraseMemoryPresetConfig,
    createdAt: r.created_at,
  }))
}

export async function createCustomPreset(
  name: string,
  config: PhraseMemoryPresetConfig
): Promise<PhraseMemoryPreset> {
  const db = await getDb()
  const id = `pmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO phrase_memory_presets (id, name, is_builtin, config, created_at)
     VALUES (?, ?, 0, ?, ?)`,
    [id, name, JSON.stringify(config), now]
  )
  return { id, name, isBuiltin: false, config, createdAt: now }
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    `DELETE FROM phrase_memory_presets WHERE id = ? AND is_builtin = 0`,
    [id]
  )
}
```

- [ ] **Step 4: Chiama seedBuiltinPresets da dbService**

In `src/services/dbService.ts`, alla fine di `initDatabase()`:

```typescript
import { seedBuiltinPresets } from './phraseMemoryPresetService'
// alla fine di initDatabase():
await seedBuiltinPresets()
```

- [ ] **Step 5: Esegui test — verifica passaggio**

```bash
npm test -- phraseMemoryPresetService
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/phraseMemoryPresetService.ts src/services/__tests__/phraseMemoryPresetService.test.ts src/services/dbService.ts
git commit -m "feat: phrase memory preset service + 4 preset built-in (#7)"
```

---

### Task 7: Workspace wizard UI

**File:**
- Crea: `src/components/workspace/WorkspaceWizard.tsx`

- [ ] **Step 1: Implementa wizard**

```tsx
import { useState } from 'react'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { createWorkspace } from '../../services/workspaceService'
import type { EmbeddingModel } from '../../types'

export function WorkspaceWizard() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState<EmbeddingModel>('text-embedding-3-small')
  const [loading, setLoading] = useState(false)
  const { loadWorkspaces, setActive } = useWorkspaceStore()

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const ws = await createWorkspace({
        name: name.trim(),
        description: description.trim() || undefined,
        embeddingModel: model,
      })
      await setActive(ws)
      await loadWorkspaces()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-semibold">Crea il tuo primo workspace</h1>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        Un workspace raggruppa tutti i tuoi libri e condivide la phrase memory tra di essi.
      </p>
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <input
          className="input"
          placeholder="Nome workspace"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Descrizione (opzionale)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Modello di embedding</label>
          <select
            className="input"
            value={model}
            onChange={e => setModel(e.target.value as EmbeddingModel)}
          >
            <option value="text-embedding-3-small">
              text-embedding-3-small (testi nella stessa lingua)
            </option>
            <option value="text-embedding-3-large">
              text-embedding-3-large (lingue diverse, es. italiano antico → inglese)
            </option>
          </select>
          {model === 'text-embedding-3-small' && (
            <p className="text-xs text-amber-500 mt-1">
              Se traduci tra lingue diverse usa text-embedding-3-large per risultati migliori.
            </p>
          )}
        </div>
        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading ? 'Creazione...' : 'Crea workspace'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/workspace/WorkspaceWizard.tsx
git commit -m "feat: workspace creation wizard UI (#7)"
```

---

### Task 8: Workspace guard in App.tsx

**File:**
- Modifica: `src/App.tsx`

- [ ] **Step 1: Aggiungi guard**

In `src/App.tsx`, aggiungere import e logica guard:

```tsx
import { useEffect } from 'react'
import { useWorkspaceStore } from './store/workspaceStore'
import { WorkspaceWizard } from './components/workspace/WorkspaceWizard'

// Dentro il componente App, prima del return principale:
const { activeWorkspace, loading, loadWorkspaces } = useWorkspaceStore()

useEffect(() => {
  loadWorkspaces()
}, [loadWorkspaces])

if (loading) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <span className="text-muted-foreground text-sm">Caricamento...</span>
    </div>
  )
}

if (!activeWorkspace) {
  return <WorkspaceWizard />
}

// ... resto del JSX esistente invariato
```

- [ ] **Step 2: Test manuale**

```bash
npm run tauri dev
```

Verifica:
- Prima apertura → mostra WorkspaceWizard
- Crea workspace → app normale
- Riavvia → skip wizard

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: workspace guard — wizard al primo avvio (#7)"
```

---

## Self-Review

**Copertura spec:**
- ✓ workspaces table con embedding_model
- ✓ projects.workspace_id (ALTER idempotente)
- ✓ phrase_memory table
- ✓ phrase_memory_presets con 4 preset built-in
- ✓ source_phrase_embeddings
- ✓ historical_techniques con embedding_source + embedding_translated
- ✓ technique_tags con indice composito
- ✓ active_workspace_id in app_settings
- ✓ WAL mode + busy_timeout
- ✓ sqlite-vec spike (Task 1)
- ✓ Workspace CRUD service con test
- ✓ Workspace Zustand store
- ✓ Workspace wizard con warning modello multilingue
- ✓ App guard

**Non in questo piano:**
- Embedding generation (Piano 2)
- Phrase memory search (Piano 2)
- Tab Memoria UI (Piano 3)
- Pipeline injection (Piano 3)
- Estrai termine #137 (Piano 3)
- Preset management UI (Piano 4)

**Type consistency:** `Workspace`, `EmbeddingModel`, `PhraseMemoryPreset`, `PhraseMemoryPresetConfig`, `PhraseMemorySplitter` definiti in Task 3, usati identicamente in Task 4, 5, 6, 7.
