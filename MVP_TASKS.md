# Glossa — MVP Hardening Tasks

> Roadmap operativa per portare Glossa da alpha (v0.2.x) a MVP rilasciabile.
> Origine: audit completo del 2026-04-25.

## Come usare questo file

**Per agenti AI** (Claude Code, Codex, ecc.):
1. Leggi tutta la sezione `## Convenzioni` prima di iniziare un task.
2. Quando affronti un task, **leggi prima** lo stato `Status` e i `Linked PRs/commits`. Non rifare lavoro già fatto.
3. Aggiorna lo `Status` del task quando lo prendi in carico (`in-progress`) e quando lo completi (`done` con riferimento al commit/PR).
4. Se trovi un blocker non previsto, aggiungi una nota `> [!warning]` sotto il task invece di silenziare.
5. Non modificare la severity senza accordo umano.
6. Niente "while we're at it" refactor: completa il task come specificato e ferma. Modifiche fuori scope vanno in un task separato proposto a fondo file.

**Per Niki**:
- Spunta i task completati nella sezione `## Progress overview` a fondo file.
- I task sono ordinati per priorità di sprint, non per severity assoluta.
- I task `BLOCKER` vanno tutti chiusi prima di taggare la prima release pubblica.

## Convenzioni

- **Severity**: `BLOCKER` (no release senza), `MAJOR` (no v1.0 senza), `MINOR` (nice-to-have).
- **Status**: `todo` | `in-progress` | `blocked` | `done`.
- **File reference**: sempre `path:linea` come la trovi nel codice attuale; se la linea cambia per refactor precedenti, riallineala.
- Tutti i fix devono mantenere `npm run lint`, `npm test`, `cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings && cargo test` verdi.
- Aggiungere test nuovi quando si tocca logica testabile (target: ≥1 test per fix non-trivial).

---

## Sprint 1 — Sicurezza & robustezza (priorità massima, BLOCKER)

### S1-T1 — Abilitare Content Security Policy
- **Severity**: BLOCKER
- **Status**: todo
- **File**: `src-tauri/tauri.conf.json:24-26`
- **Problema**: `"csp": null`. Una XSS in qualsiasi dipendenza npm può chiamare `invoke()` ed esfiltrare keychain/DB.
- **Fix**:
  1. Sostituire `"csp": null` con una CSP whitelist:
     ```json
     "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ipc: https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.deepseek.com http://localhost:11434 http://127.0.0.1:11434; img-src 'self' data:; font-src 'self' data:;"
     ```
  2. Verificare lo stesso valore (o uno più stretto) anche in `src-tauri/tauri.release.conf.json` se necessario.
  3. `npm run tauri:dev` e fare un giro completo di feature: pipeline, settings, project save/load, import/export.
- **Acceptance**:
  - L'app si avvia senza errori CSP in DevTools.
  - Tutti i provider (Gemini, OpenAI, Anthropic, DeepSeek, Ollama) funzionano.
  - Tailwind 4 continua a iniettare gli stili (potrebbe richiedere `style-src 'self' 'unsafe-inline'` come sopra; rimuovere `'unsafe-inline'` se non è realmente necessario — verificare).
- **Linked PRs/commits**: _(da compilare)_

### S1-T2 — Restringere lo scope delle capabilities filesystem
- **Severity**: BLOCKER
- **Status**: todo
- **File**: `src-tauri/capabilities/default.json:18-20`
- **Problema**: `fs:allow-read-text-file` e `fs:allow-write-text-file` senza `scope`: webview legge/scrive qualunque file di testo accessibile al processo.
- **Fix**:
  1. Sostituire le voci stringa con object form e aggiungere `allow`:
     ```json
     {
       "identifier": "fs:allow-read-text-file",
       "allow": [{ "path": "$APPDATA/**" }, { "path": "$DOCUMENT/**" }, { "path": "$DOWNLOAD/**" }]
     },
     {
       "identifier": "fs:allow-write-text-file",
       "allow": [{ "path": "$APPDATA/**" }, { "path": "$DOCUMENT/**" }, { "path": "$DOWNLOAD/**" }]
     }
     ```
  2. I file scelti dal dialog `tauri-plugin-dialog` bypassano lo scope di default; verificare comportamento attuale di Import/Export.
  3. Aggiornare la documentazione in `README.md` se i path diventano vincolati.
- **Acceptance**:
  - Import/export `.txt` e `.md` da `~/Documents` e `~/Downloads` funziona.
  - Tentativo di lettura fuori scope (es. `/etc/passwd`) viene bloccato dal capability system.
- **Linked PRs/commits**: _(da compilare)_

### S1-T3 — Cancellation token per stream LLM nel backend Rust
- **Severity**: BLOCKER
- **Status**: todo
- **File**: `src-tauri/src/llm.rs` (in particolare la funzione `stream_response` / `run_stage_stream`); `src-tauri/src/lib.rs` (registrazione comando)
- **Problema**: Lo stream non si interrompe quando l'utente clicca "Stop". Verificato con grep: zero `AbortHandle`/`tokio::sync` nel codice. Conseguenze: spreco di crediti API, UI bloccata fino al timeout.
- **Fix proposto**:
  1. Mantenere una `Mutex<HashMap<String, AbortHandle>>` nello state Tauri (`#[tauri::Manager]` o `Arc<Mutex<...>>` come state).
  2. In `run_stage_stream`, generare uno `stream_id` (già esiste come correlation ID per gli eventi), creare un `tokio::spawn` con `abort_handle()`, registrare nella mappa, rimuovere a fine stream.
  3. Aggiungere comando `cancel_stream(stream_id: String)` che chiama `.abort()`.
  4. Frontend: in `pipelineStore.requestCancel()` invocare `invoke('cancel_stream', { streamId })` per lo stream attivo.
  5. Nel loop SSE, controllare periodicamente se il task è stato abortito e propagare un errore distinguibile (`StreamCancelled`).
- **Acceptance**:
  - Cliccare "Stop" durante uno stream attivo termina la richiesta HTTP entro 1s.
  - Nessun token aggiuntivo viene emesso nel frontend dopo il cancel.
  - Test: `cargo test` con un mock provider che blocca, verifica che `abort` lo interrompa.
- **Linked PRs/commits**: _(da compilare)_

### S1-T4 — Sanificare i messaggi di errore HTTP
- **Severity**: BLOCKER
- **Status**: todo
- **File**: `src-tauri/src/llm.rs:234, 281, 327, 660`
- **Problema**: `Err(format!("API error ({status}): {text}"))` rilancia il body completo della response al frontend. Il body può contenere il prompt utente (testo accademico riservato), header echoati, PII.
- **Fix**:
  1. Rimuovere `{text}` dai 4 messaggi:
     ```rust
     return Err(format!("API error ({status})"));
     ```
  2. Loggare il body **solo** in debug (`#[cfg(debug_assertions)]`) tramite `log::debug!`.
  3. Mappare i codici di stato comuni a messaggi user-friendly (`401` → "API key not authorized", `429` → "Rate limited", `500..=599` → "Provider unavailable").
- **Acceptance**:
  - Errore 401 → toast "API key not authorized" senza key/prompt nella stringa.
  - Test in `llm.rs` che verifica che il messaggio non contenga il body.
- **Linked PRs/commits**: _(da compilare)_

### S1-T5 — Guard idempotente su runPipeline / runAuditOnly
- **Severity**: MAJOR (vicino BLOCKER per UX)
- **Status**: todo
- **File**: `src/hooks/usePipeline.ts:31-35, 148-152`
- **Problema**: nessun `if (isProcessing) return` come prima riga. Doppio click rapido può scatenare due esecuzioni parallele prima che React batching propaghi `setIsProcessing(true)`.
- **Fix**:
  ```ts
  const runPipeline = useCallback(async () => {
    if (usePipelineStore.getState().isProcessing) return;
    if (chunks.length === 0) return;
    // ...
  ```
  Stesso pattern in `runAuditOnly`.
- **Acceptance**:
  - Test in `usePipeline.test.ts`: chiamare `runPipeline()` due volte di fila in un microtask deve produrre una sola esecuzione.
- **Linked PRs/commits**: _(da compilare)_

---

## Sprint 2 — Release readiness

### S2-T1 — Aggiungere build macOS al workflow di release
- **Severity**: MAJOR
- **Status**: todo
- **File**: `.github/workflows/release.yml`
- **Problema**: `release.yml` builda solo Linux e Windows. Nessun `.dmg` per macOS.
- **Fix**:
  1. Aggiungere job `build-macos` (matrix `macos-latest` + `macos-13` per Intel).
  2. Riusare lo stesso pattern di `build-linux`/`build-windows` (tauri-action con signing key).
  3. Generare `SHA256SUMS-macos.txt` con lo stesso script.
  4. Per ora **niente Apple notarization** (richiede Apple Developer account a pagamento): il `.dmg` sarà unsigned; documentare nel README la procedura per bypassare Gatekeeper (`xattr -cr Glossa.app`).
- **Acceptance**:
  - Una release di test produce `.dmg` per arm64 e (idealmente) x64.
  - Checksums file pubblicato.
- **Linked PRs/commits**: _(da compilare)_

### S2-T2 — `cargo audit` e `npm audit` nel CI
- **Severity**: MAJOR
- **Status**: todo
- **File**: `.github/workflows/ci.yml`
- **Fix**:
  1. Aggiungere job `audit-frontend` con `npm audit --audit-level=high` (non bloccante per `moderate`).
  2. Aggiungere job `audit-backend` con `cargo install cargo-audit` + `cd src-tauri && cargo audit`.
  3. Configurare entrambi su `schedule: cron` settimanale oltre che su push, così le advisory nuove emergono anche senza commit.
- **Acceptance**:
  - CI fallisce su CVE `high`/`critical`.
  - Entrambi i job sono visibili in `gh pr checks`.
- **Linked PRs/commits**: _(da compilare)_

### S2-T3 — Profilo di release ottimizzato in Cargo
- **Severity**: MINOR (size/perf, non funzionale)
- **Status**: todo
- **File**: `src-tauri/Cargo.toml`
- **Fix**: aggiungere in fondo:
  ```toml
  [profile.release]
  lto = true
  codegen-units = 1
  panic = "abort"
  strip = true
  opt-level = "z"  # oppure 3 se la dimensione non è priorità
  ```
- **Acceptance**:
  - Build release passa.
  - Binario finale ≥ 20% più piccolo (verifica con `ls -la src-tauri/target/release/glossa`).
- **Linked PRs/commits**: _(da compilare)_

### S2-T4 — Watchdog timeout per chunk stuck nel frontend
- **Severity**: MAJOR
- **Status**: todo
- **File**: `src/services/llmService.ts:35-62`, `src/hooks/usePipeline.ts`
- **Problema**: se il backend Tauri muore senza emettere errore, l'UI resta in loading senza feedback.
- **Fix proposto**:
  1. In `runStageStream`, avvolgere la promise in un `Promise.race` con un timeout (configurabile, default 180s) che ritorna un errore custom `StreamWatchdogTimeout`.
  2. Resettare il timeout ad ogni token ricevuto (idle timeout, non absolute).
  3. Mostrare toast specifico in caso di trigger.
- **Acceptance**:
  - Test con event listener che non emette mai → la promise rigetta entro il timeout.
- **Linked PRs/commits**: _(da compilare)_

### S2-T5 — Whitelist tabella/colonna in `ensureColumn`
- **Severity**: MAJOR (defense in depth)
- **Status**: todo
- **File**: `src/services/dbService.ts:12-20`
- **Problema**: SQL identifier injection teorica (oggi safe perché chiamato solo con literal).
- **Fix**:
  ```ts
  const ALLOWED_COLUMNS: Record<string, string[]> = {
    pipeline_configs: ['target_chunk_count'],
    translations: ['chunk_status', 'judge_status', 'judge_rating'],
  };
  async function ensureColumn(table: keyof typeof ALLOWED_COLUMNS, column: string, definition: string) {
    if (!ALLOWED_COLUMNS[table]?.includes(column)) {
      throw new Error(`Refusing to alter unknown table/column: ${table}.${column}`);
    }
    // ... resto invariato
  }
  ```
- **Acceptance**:
  - `dbService.test.ts` aggiunge un caso che verifica il throw su input non whitelisted.
- **Linked PRs/commits**: _(da compilare)_

---

## Sprint 3 — Qualità del codice

### S3-T1 — Refactor `llm.rs` con trait `LlmProvider`
- **Severity**: MAJOR
- **Status**: todo
- **File**: `src-tauri/src/llm.rs` (1043 righe)
- **Problema**: 4 funzioni `call_*` con duplicazione di HTTP body building, error handling e parsing.
- **Fix proposto**:
  1. Definire un trait:
     ```rust
     trait LlmProvider {
         fn build_request(&self, client: &Client, body: &PromptBody, api_key: Option<&str>) -> RequestBuilder;
         fn extract_text(&self, response: &Value) -> Result<String, String>;
         fn parse_stream_chunk(&self, chunk: &str) -> Option<String>;
     }
     ```
  2. Implementare per `Gemini`, `OpenAICompatible` (DeepSeek riusa), `Anthropic`, `Ollama`.
  3. Definire response shape con `#[derive(Deserialize)]` per ogni provider invece di accedere a `serde_json::Value` con array indexing.
  4. Splittare in moduli: `llm/mod.rs`, `llm/gemini.rs`, `llm/openai.rs`, `llm/anthropic.rs`, `llm/ollama.rs`, `llm/keychain.rs`, `llm/stream.rs`.
- **Acceptance**:
  - Tutti i 79 test esistenti continuano a passare.
  - LoC totale del modulo ridotto di ≥30%.
  - Nessun `panic` su response malformata (test con JSON inventato).
- **Linked PRs/commits**: _(da compilare)_

### S3-T2 — Idle timeout sullo stream HTTP
- **Severity**: MAJOR
- **Status**: todo
- **File**: `src-tauri/src/llm.rs` (loop SSE)
- **Problema**: timeout assoluto a 120s, ma nessun idle timeout. Provider lento ma vivo viene tagliato anche se sta producendo.
- **Fix**: usare `tokio::time::timeout` su ogni `read` del body stream, default 30s di idle. Configurabile via const.
- **Acceptance**: stream con pause < 30s funziona, pause > 30s viene chiusa con errore distinguibile.
- **Linked PRs/commits**: _(da compilare)_

### S3-T3 — Test E2E della pipeline con mock provider HTTP
- **Severity**: MAJOR
- **Status**: todo
- **File**: nuovo `src-tauri/tests/pipeline_e2e.rs` o `src/__tests__/pipeline.e2e.test.ts`
- **Fix**: usare `wiremock-rs` (Rust) o `msw` (frontend) per simulare le risposte SSE dei provider e testare il flow completo da `runPipeline()` al toast di completamento.
- **Acceptance**: almeno 3 scenari: success, retry-then-success, error-after-retries.
- **Linked PRs/commits**: _(da compilare)_

### S3-T4 — Test integration di `llmService` e modali critici
- **Severity**: MINOR
- **Status**: todo
- **File**: nuovi test in `src/services/llmService.test.ts`, `src/components/settings/SettingsModal.test.tsx`, `src/components/projects/ProjectPanel.test.tsx`
- **Acceptance**: coverage frontend ≥ 60%.
- **Linked PRs/commits**: _(da compilare)_

### S3-T5 — Allineare timeout Ollama con il resto
- **Severity**: MINOR
- **Status**: todo
- **File**: `src-tauri/src/llm.rs:507, 535` (Ollama 3s hardcoded)
- **Fix**: usare la stessa costante `HTTP_REQUEST_TIMEOUT_SECS` o una `OLLAMA_PROBE_TIMEOUT_SECS` dedicata, ma esplicita.
- **Acceptance**: nessun magic number duplicato.
- **Linked PRs/commits**: _(da compilare)_

---

## Backlog post-MVP

- **B-1** — Cifrare il DB SQLite con SQLCipher (utile se i testi sono inediti).
- **B-2** — Logging strutturato anche in release, opt-in dall'utente.
- **B-3** — Telemetria opt-in per crash report.
- **B-4** — `optimize_prompt` rispetta le settings invece di hardcoded Gemini (`llm.rs:724`).
- **B-5** — Memoize `useJudgeModelOptions` in `PipelineConfig.tsx`.
- **B-6** — Split di `PipelineConfig.tsx` (351) e `HelpGuide.tsx` (359) in sub-componenti se cambiano spesso.
- **B-7** — Sostituire `console.log` in `dbService.ts:108` con logger condizionale.
- **B-8** — i18n init guard per evitare `t()` undefined nei toast errore early-stage.

---

## Progress overview

### Sprint 1 (BLOCKER per MVP)
- [ ] S1-T1 — CSP abilitata
- [ ] S1-T2 — fs capabilities scoped
- [ ] S1-T3 — Stream cancellation (Rust)
- [ ] S1-T4 — Error message sanitization
- [ ] S1-T5 — runPipeline guard idempotente

### Sprint 2 (release readiness)
- [ ] S2-T1 — macOS build in release.yml
- [ ] S2-T2 — cargo/npm audit in CI
- [ ] S2-T3 — Cargo release profile
- [ ] S2-T4 — Frontend stream watchdog
- [ ] S2-T5 — ensureColumn whitelist

### Sprint 3 (qualità)
- [ ] S3-T1 — Refactor llm.rs (trait + struct typing)
- [ ] S3-T2 — Idle timeout streaming
- [ ] S3-T3 — Test E2E pipeline
- [ ] S3-T4 — Test integration frontend
- [ ] S3-T5 — Ollama timeout consistency

### Backlog
- [ ] B-1 SQLCipher
- [ ] B-2 Logging release opt-in
- [ ] B-3 Telemetria opt-in
- [ ] B-4 optimize_prompt rispetta settings
- [ ] B-5 Memoize useJudgeModelOptions
- [ ] B-6 Split componenti grandi
- [ ] B-7 Logger condizionale
- [ ] B-8 i18n init guard

---

## Cambi di scope proposti (da revisionare con Niki)

> Aggiungere qui task nati durante l'implementazione che escono dallo scope originale.
> Formato: `- [proposto] descrizione (origine: T-id)`

_(vuoto)_
