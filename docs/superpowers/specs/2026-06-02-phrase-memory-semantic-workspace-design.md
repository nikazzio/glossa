# Phrase Memory + Semantic Workspace — Design Spec

**Issue**: #7 (phrase memory), #137 (promozione glossario)  
**Data**: 2026-06-02  
**Stato**: in revisione

---

## Scope

Due sistemi distinti, stessa infrastruttura sottostante (SQLite + sqlite-vec):

1. **Phrase Memory** — translation memory per segmenti. Cerca frasi simili durante la traduzione. Mostra match al traduttore. Mai automatico.
2. **Semantic Workspace** (corpus analitico) — database curato manualmente di tecniche/espressioni per dominio. Usato per analisi comparativa tra autori e come oracolo terminologico durante la traduzione.

Promozione a glossario (#137): rimossa come azione dedicata. Se l'utente vuole aggiungere un termine al glossario lo fa direttamente dal tab glossario.

---

## Breaking Changes

Pre-1.0, zero retrocompatibilità obbligatoria. Le modifiche al DB sono distruttive.

---

## Architettura DB — Schema Completo

### Nuova tabella: `workspaces`

L'embedding model è a livello workspace — tutti i vettori del workspace usano lo stesso modello. Cambiare modello richiede rigenerazione completa del corpus (operazione rara, con warning esplicito in UI).

**Modello multilingue obbligatorio** se source_language ≠ target_language. Il wizard di creazione workspace segnala e suggerisce `text-embedding-3-large` in questo caso. I modelli text-embedding-3-small/large di OpenAI sono multilingue: cercano italiano contro testo inglese nello stesso spazio vettoriale.

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TEXT NOT NULL
);
```

### Modifica: `projects`

```sql
ALTER TABLE projects ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
```

### Nuova tabella: `phrase_memory`

Scoped al workspace. Condivisa tra tutti i progetti (libri) del workspace.

```sql
CREATE TABLE phrase_memory (
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
```

### Nuova tabella: `phrase_memory_presets`

```sql
CREATE TABLE phrase_memory_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Config JSON per preset (embedding_model escluso — è del workspace):
```json
{
  "splitter": "regex | llm | none",
  "similarity_threshold": 0.85,
  "max_results": 5,
  "min_phrase_length": 20
}
```

La strategia di splitting è per-libro (ogni progetto può usare splitter diverso).

Preset built-in (seed al primo avvio):

| Nome | splitter | threshold | max_results | min_len |
|------|----------|-----------|-------------|---------|
| Moderno | regex | 0.85 | 5 | 20 |
| Medievale IT | llm | 0.70 | 10 | 10 |
| Latino | llm | 0.65 | 10 | 10 |
| Legale | regex | 0.90 | 3 | 30 |

### Modifica: `pipelines`

```sql
ALTER TABLE pipelines ADD COLUMN use_phrase_memory INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pipelines ADD COLUMN phrase_memory_preset_id TEXT REFERENCES phrase_memory_presets(id);
ALTER TABLE pipelines ADD COLUMN phrase_memory_overrides TEXT;
```

### Nuova tabella: `historical_techniques`

Silos separati da phrase_memory — nessuna condivisione dati.

Dual embedding: `embedding_source` per comparazione filologica esatta tra manoscritti; `embedding_translated` per ricerca semantica dalla UI in lingua moderna (anche cross-lingua — i modelli text-embedding-3 sono multilingue, cercano italiano contro testo inglese correttamente).

```sql
CREATE TABLE historical_techniques (
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
```

### Nuova tabella: `technique_tags`

Categorie flessibili — non hardcodate.

```sql
CREATE TABLE technique_tags (
  technique_id TEXT NOT NULL REFERENCES historical_techniques(id),
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (technique_id, category, value)
);

CREATE INDEX idx_technique_tags_category_value ON technique_tags(category, value);
```

### Nuova tabella: `source_phrase_embeddings`

Staging: frasi sorgente pre-embeddizzate al momento dell'import, prima della traduzione. Al lock del chunk le coppie complete migrano in `phrase_memory`.

```sql
CREATE TABLE source_phrase_embeddings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  chunk_id TEXT,
  source_phrase TEXT NOT NULL,
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL
);
```

### `app_settings` — chiave aggiunta

`active_workspace_id TEXT` — un solo workspace attivo per volta.

---

## Flusso 0 — Pre-generazione Embedding (Import)

Al momento dell'import del documento, opzione "Genera embedding frasi sorgente":
- Scelta splitter per questo libro (regex / llm / nessuno)
- Job in background: split ogni chunk → embed ogni frase (modello dal workspace) → INSERT `source_phrase_embeddings`
- Progress indicator con stima costo in UI
- Non blocca l'import — il documento è usabile subito

**Gestione** (settings del libro): cancella embedding / rigenera con strategia diversa / genera se non ancora fatto.

**Nota**: se il workspace cambia `embedding_model`, tutti gli embedding esistenti (phrase_memory + source_phrase_embeddings) devono essere rigenerati. UI mostra warning esplicito con stima costo prima di consentire il cambio.

---

## Flusso 1 — Phrase Memory Search (pre-pipeline)

Avviene dopo Flusso 0 (embedding generati), prima di lanciare la pipeline di traduzione.

```
1. Utente apre la lista chunk del documento
2. Con use_phrase_memory attivo: ricerca automatica su tutti i chunk
   - Recupera source_phrase_embeddings già generate
   - Query sqlite-vec phrase_memory WHERE workspace_id = ? AND distance < threshold
   - Risultati salvati in store per ogni chunk
3. Nella lista chunk: badge su ogni chunk che ha match ("N match trovati")
4. Utente apre un chunk → InsightsDrawer tab "Memoria" mostra:
   - Lista match: score, source_phrase evidenziata, target_phrase, autore, opera
   - Checkbox per abilitare/disabilitare ogni match
   - Sezione "Technique Context" collassabile (Flusso 4)
5. Utente configura match chunk per chunk, poi lancia la pipeline
6. Warning pre-lancio se: match trovati ma tutti disabilitati su uno o più chunk
7. Pipeline gira una volta sola con i match abilitati già iniettati in fondo
   a stage-instructions per ogni chunk (static + blob intatti → caching preservato)
```

**Fallback on-the-fly**: se Flusso 0 non è stato eseguito, la ricerca avviene comunque ma in parallelo durante la traduzione (più lenta, costo embedding aggiuntivo).

**Re-run singolo chunk**: rimane disponibile dopo la pipeline (già esiste nell'app). Utente può cambiare selezione match e ri-lanciare un chunk specifico.

**Cold start**: phrase_memory vuota → badge assente, tab Memoria mostra placeholder "La memoria si costruisce man mano che approvi le traduzioni."

**Al lock del chunk**:
- Coppie (source_phrase + target_phrase) → INSERT phrase_memory
- Embedding source riusato da source_phrase_embeddings se disponibile, altrimenti calcolato
- DELETE source_phrase_embeddings per quel chunk
- Solo frasi >= min_phrase_length

---

## Flusso 2 — Sentence Splitter (LLM mode)

Prompt Haiku/Flash (structured output):

```
Analyze this text and split it into logical phrases.
Return a JSON array of strings.
Each string MUST be copied exactly as it appears in the original text, character by character.
Do NOT paraphrase, summarize, shorten, or modify any word or punctuation.

Text: {chunk_text}

Return: ["phrase one verbatim", "phrase two verbatim", ...]
```

Rust valida ogni frase con `source_text.contains(&phrase)`. Se fallisce → scarta, log warning, continua.

---

## Flusso 3 — Semantic Workspace / Curator Mode

Accessibile solo da documenti completamente tradotti e approvati.

La vista Curator Mode usa la lettura affiancata (sorgente | traduzione) già presente nell'app, con scroll sincronizzato già implementato. Nessuna nuova infrastruttura di layout necessaria.

```
1. Utente apre documento in Curator Mode (read-only, no editing)
2. Vista affiancata sorgente | traduzione con scroll sincronizzato (già esistente)
3. Utente seleziona blocco nel pannello sorgente
4. Il blocco corrispondente nella traduzione viene evidenziato automaticamente
   per rapporto di posizione (offset% nel chunk sorgente → stesso offset% nel chunk tradotto)
5. Utente aggiusta la selezione nella traduzione se necessario
6. LLM estrae tag strutturati dal blocco sorgente (structured output):
   {"tags": [{"category": "action", "value": "Fendente"}, ...]}
7. Modale validazione: utente vede source_block + target_block + tag estratti, corregge, conferma
8. Rust calcola due embedding (max 6000 char ciascuno, log se troncati):
   - embedding_source ← source_text
   - embedding_translated ← translated_text
9. INSERT historical_techniques + technique_tags
10. Snapshot congelato — immutabile
```

**Flag staleness**: se la traduzione del chunk sorgente viene modificata dopo l'estrazione → `translation_stale = 1` + badge UI.

---

## Flusso 4 — Technique Context (Techniques → Traduzione)

Stesso comportamento di Flusso 1 — cerca in parallelo, mostra dopo, utente decide. Mai automatico.

```
1. In parallelo alla phrase memory search (prima della traduzione):
   - Embedding chunk intero → query vec_historical_techniques
   - Threshold più alta: distance < 0.75 (solo match forti — testi antichi rischiano falsi positivi)
2. Match trovati → salvati in store per il chunk corrente
3. Dopo la traduzione: sezione "Technique Context" nel tab Memoria mostra:
   - Tecniche simili trovate con score e metadati (autore, opera, tag: action/weapon/stance)
   - Checkbox per selezionare quali includere
   - Bottone "Rielabora con contesti terminologici selezionati" → re-run pipeline
     con metadati strutturati iniettati in fondo a stage-instructions
     (MAI il testo della tecnica — solo tag categoria/valore)
4. Nessuna iniezione automatica nel prompt iniziale
```

Testo iniettato nel re-run (esempio):
```
Terminological context from historical corpus:
Use these key terms consistently:
- action: "Fendente" → "Downward cut"
- stance: "Porta di ferro" → "Iron Gate"
Do not copy previous translations. Use as terminology anchors only.
```

La struttura del prompt e la chiamata API effettiva sono loggati in `operation_logs` con `detail_kind: "prompt_structure"`.

---

## Preset System — UI

**Settings globali** (nuova sezione):
- Lista preset: built-in read-only (clonabili), custom (crea/modifica/elimina)

**Config pipeline**:
- Toggle `use_phrase_memory`
- Dropdown preset (visibile se toggle on)
- Sezione "Avanzate" collassata: override singoli parametri, badge se override attivo

---

## Workspace — UI

- Un workspace attivo per volta (`app_settings.active_workspace_id`)
- Dashboard: lista workspaces → seleziona → mostra progetti del workspace
- Phrase memory e historical_techniques appartengono al workspace, condivise tra tutti i libri
- Se nessun workspace → wizard creazione al primo avvio
- Progetto (libro) sempre figlio di un workspace

---

## Estrai Termine dal Match (#137)

Per ogni match nel tab Memoria: bottone "Estrai termine". Non promuove la frase intera — estrae un termine specifico con il contesto del match.

```
1. Utente clicca "Estrai termine" su un match
2. LLM suggerisce il termine chiave dalla source_phrase (structured output, 1-3 parole)
3. Dialog pre-compilata:
   - Termine (editabile, pre-suggerito dall'LLM)
   - Traduzione (editabile, pre-compilata da target_phrase o parte di essa)
   - Note opzionali (contesto: autore, opera, data del match)
   - Selezione glossario di destinazione
4. Utente conferma → INSERT glossary_entries
5. Reversibile: voce eliminabile dal tab glossario normalmente
```

---

## Fuori scope (issue separate)

- Import batch da progetti esistenti
- Curator Mode UI completa (filtri, vista comparativa autori)
- Fine-tuning embedding per italiano medievale
- UI workspace switcher (multi-workspace navigation)
- Traduzione sentence-by-sentence (il chunk rimane l'unità di traduzione — il splitting in Flusso 1 è solo per phrase memory, non cambia la pipeline)
