# Glossa — guidance for AI coding agents

Glossa is a desktop application for scholars working on historical texts:
discover and collect sources (Library), transcribe them with optional OCR/HTR
assistance (Transcriptions), translate them through configurable LLM/DeepL
pipelines with glossaries and phrase memory (Translations), and export the
results. It is a private beta: the 2.x version numbers come from release-automation
tests and do not indicate completeness. Product order of work: Library →
Transcriptions → Translations → Export (see `docs-dev/ROADMAP_2_0.md`).

The interface, in-app guide and developer documentation are written in
Italian; public documentation is published in Italian and English.

## Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Zustand, Radix UI, Vite.
- **Backend:** Rust, Tauri v2. SQLite through `@tauri-apps/plugin-sql` from the
  frontend (`src/services/dbService.ts`) and through `rusqlite` + `sqlite-vec` in
  the backend for the text corpus and embeddings (`src-tauri/src/vector/`).
- **Tests:** Vitest + Testing Library (frontend), `cargo test` with tokio-test and
  wiremock (backend), Playwright with a Tauri mock (`e2e/`).
- **Docs:** VitePress (`docs/` Italian, `docs/en/` English).

## Repository layout

| Path | Content |
|---|---|
| `src/components/` | UI by domain (`library`, `transcription`, `translation`, `pipeline`, `document`, `settings`, …); shared primitives in `src/components/ui/` |
| `src/stores/`, `src/hooks/`, `src/services/` | Zustand stores (global state only), domain hooks, data and Tauri-command services |
| `src/i18n/it.json`, `src/i18n/en.json` | All UI strings, including the in-app guide (`help.*`) |
| `src/languages/` | Bundled ISO 639-3 and Glottolog language lists; regenerate with `npx tsx scripts/update-languages.ts` (in the app: Settings → Languages) |
| `src-tauri/src/` | Backend modules by domain (`llm`, `deepl`, `vector`, `federation`, `iiif`, `ocr`, `jobs`, …) |
| `src-tauri/migrations/` | SQLx migrations, fingerprinted in `src-tauri/migrations.lock` |
| `docs-dev/` | Developer documentation; start from `docs-dev/README.md` |

## Commands

```bash
npm run tauri:dev          # run the desktop app in development
npm run lint:all           # typecheck + ESLint
npm test                   # Vitest
npx vitest run <path>      # targeted frontend tests
cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test # backend tests (includes the migration lock test)
npx vitepress build docs   # public docs; fails on dead links
```

Run the checks relevant to what you changed; run full suites once, before
committing work that touches several areas. Do not run app builds, Tauri
builds, E2E or dependency installs unless asked or needed to diagnose a failure.

## Engineering principles

- **Simplicity:** minimal code, no speculative features or abstractions.
- **TypeScript:** explicit types, never `any`; explicit `null`/`undefined`
  handling; validate external input (API responses, files, bundled data).
- **Rust:** no `.unwrap()` in production code; propagate errors with `?` and
  `thiserror`; zero `clippy` warnings; avoid needless `clone()`.
- **Immutability:** prefer `let` over `let mut`; spread and functional methods in
  TypeScript.
- **Size and structure:** files of 400–800 lines at most, organised by domain.
  Backend handlers stay thin; logic lives in domain modules. Frontend logic in
  custom hooks.
- **Comments:** only for non-obvious logic, hidden constraints and workarounds.
- **Testing:** descriptive test names stating the expected behaviour; never
  silence errors. Target 80% coverage on new logic.

## Invariants

- **Prompt cache order (critical):** the system prompt blocks are always ordered
  `static → blob → stage instructions`. Changing the order breaks provider prompt
  caching and multiplies costs. The composed prompts are covered by a
  byte-equivalence test (`src-tauri/src/llm/legacy_prompts_test.rs`).
- **Migrations:** an applied migration is never edited. Add a new migration and
  its line in `migrations.lock`. Use migrations only for real schema changes,
  never for one-off data fixes. Do not recreate tables (`DROP TABLE`) inside a
  migration: SQLx runs it in a transaction where `PRAGMA foreign_keys=OFF` has no
  effect, so cascades delete data. Pre-release consolidation of migrations is
  done only on explicit request by the maintainer.
- **Text corpus:** text revisions are immutable; a correction (text or language)
  creates a new revision. Embeddings always record provider, model, dimensions
  and input profile; similarity search only compares compatible measures.
- **Languages:** a work's languages belong to the work (ISO 639-3 code, optional
  Glottolog variety, free note), not to its pipelines. DeepL keeps its own
  language pair in its phase options.

## UI rules

Read `docs-dev/UI_DESIGN_SYSTEM.md` before any visual change.

- Commands are neutral icon-only `IconButton`s with a tooltip. No pills, no
  coloured or text buttons outside dialogs.
- Green (accent) only for tabs, selectors and active states.
- Explanations go in hover hints, not permanent paragraphs.
- Reuse the shared primitives in `src/components/ui/` (`Dialog`, `SettingRow`,
  `SearchPicker`, `ClickPopover`, `ChoiceDots`, …); no local variants.
- Every UI string exists in both `it.json` and `en.json`.

## Documentation rule (mandatory)

Every feature that is added, removed or changes visible behaviour is documented
in the same task, in three places:

1. **In-app guide:** `src/components/help/HelpGuide.tsx` and the `help.*` strings
   in both `src/i18n/it.json` and `src/i18n/en.json`. A new section also needs its
   navigation entry, renderer case and the `HelpSection` type in
   `src/stores/uiStore.ts`.
2. **Public docs:** `docs/` (Italian) and `docs/en/` (English). A new page needs an
   entry in both sidebars of `docs/.vitepress/config.ts`.
3. **Developer docs:** the relevant file per `docs-dev/README.md` — architecture
   for flows, commands and schema; design system for visual rules; roadmap for
   remaining work.

The three surfaces have different readers and are not copies of each other.
Always describe present behaviour and real limits, never development history.

## Git

- Never work on `main`. Branch from an up-to-date `main`
  (`git checkout main && git pull origin main && git checkout -b <branch>`),
  unless the maintainer names a different base.
- Conventional commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`,
  `perf`, `ci`, with an optional scope.
- Base and target branch of a pull request are chosen by the maintainer;
  opening a PR never implies merging it.

## References

Scriptoria remains the technical reference for sources, storage, jobs,
transcription and export (#186, #446).
