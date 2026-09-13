# Code review instructions for Glossa

Write review comments in English. Cite `file:line` for every finding, state the
defect in one sentence, and give a concrete failing scenario (inputs → wrong
result). Rank findings by real cost. Prefer a few high-confidence findings over
a long list; do not restate the diff and do not add praise.

## What Glossa is

Desktop application for translating and studying historical documents: Tauri v2
with a Rust backend (SQLite through SQLx and rusqlite, `reqwest`) and a React 19
+ TypeScript + Tailwind v4 + Zustand frontend. It searches IIIF libraries,
stores works locally, transcribes and translates them through LLM pipelines.

It is a **private beta with a single maintainer and no external users**. The
development documentation is written in Italian, as are code comments and commit
messages; the interface exists in Italian and English.

## Deliberate decisions — do not report these as defects

- **No backward compatibility.** Rejecting backups written by an older schema
  version, dropping legacy code paths, and changing the database schema without
  a data-migration path for end users are all intentional during the beta.
- **No speculative generality.** Missing extension points, missing
  configuration, and "this will not scale to a future case" are not findings.
- **User-facing text never names code.** Help articles, `docs/`, `docs/en/` and
  interface strings deliberately avoid file, function, component, store, table
  and command names. This is a hard product rule, not an omission.
- **Long Italian comments** that explain a hidden constraint, a workaround or a
  decision are wanted. Only flag comments that are wrong or stale.
- **Italian identifiers and messages** in development documentation and logs are
  intentional.

## Always report — hard invariants

- **An existing migration file was modified.** Files in `src-tauri/migrations/`
  are frozen once applied: changing one makes every existing database refuse to
  open. A correction must be a new migration. `src-tauri/migrations.lock` must
  list every migration with its fingerprint; the test `migrations_are_frozen`
  enforces this.
- **The system-prompt block order changed.** It is always
  `static → blob → stage-instructions`. Any reordering breaks provider prefix
  caching and multiplies cost.
- **Rust**: `.unwrap()` or `.expect()` on a path that can run in production,
  errors swallowed instead of propagated with `?`, `clone()` in a hot loop,
  transactions held longer than needed, N+1 queries, JSON deserialised only to
  count something.
- **TypeScript**: `any`, unchecked `null`/`undefined`, external input used
  without validation, mutation of existing objects instead of returning new ones.
- **Secrets and addresses in logs.** Manifest URLs can carry signed parameters;
  API keys live in the system keychain and must never be logged, serialised or
  written into a backup. The technical reason for a failure belongs in the log,
  never on screen; the screen gets a translated message.
- **Visible behaviour changed without documentation.** Any new, removed or
  changed user-visible behaviour must be documented in the same pull request in
  three places: the in-app guide (`src/components/help/HelpGuide.tsx` plus
  `help.*` keys in **both** `src/i18n/it.json` and `src/i18n/en.json`), the
  public pages (`docs/` **and** `docs/en/`, with a sidebar entry in
  `docs/.vitepress/config.ts` for a new page), and the relevant file in
  `docs-dev/`. Report the ones that are missing.
- **Translation keys out of parity.** A key present in one language file only,
  or a key used in code and missing from both, is a defect: the interface then
  shows the raw key or the wrong language.
- **Size and shape**: files beyond ~800 lines, functions doing several unrelated
  jobs, nesting beyond four levels.
- **Missing tests for new domain logic** (jobs, database access, providers,
  parsing). Wiring-only UI changes do not need a test.

## Design system — `docs-dev/UI_DESIGN_SYSTEM.md` is the contract

Read it before reviewing anything visual, and report violations:

- Visual commands are neutral **icon-only** `IconButton` with a tooltip. No
  text buttons, no coloured pills.
- **No command without an action.** An element that exists only to carry an
  explanation must be the shared `Hint` primitive, which opens its text when
  pressed; a button with no handler is a promise the keyboard user cannot keep.
- Colour roles: `editorial-accent` (green) only for selection, focus and active
  state; `editorial-danger` only for destructive actions and blocking errors;
  `editorial-warning` for caution; `editorial-running` for work in progress.
  Raw Tailwind colours and hex values in components are forbidden.
- Reuse the shared primitives in `src/components/ui/` — `IconButton`, `Tooltip`,
  `Hint`, `Select`, `Dialog`, `TabStrip`, `InspectorShell`, `SettingRow`,
  `StatRow`, `StatBlock`, `EmptyState`, field classes. A local reimplementation
  of any of these is a finding.
- Readable text is at least `text-xs`; `text-[11px]` is allowed only for
  uppercase captions.
- Accessibility is part of the component: visible focus ring, `role`/
  `aria-selected`/`aria-controls` on tabs, panels that exist for every
  `aria-controls`, keyboard reachability.
- Layout: every intermediate flex or grid container needs `min-w-0` so columns
  can shrink; without it the content pushes horizontal scrollbars. Do not nest a
  scroll container inside another scroll container.

## Text and documentation

- User-facing text (in-app guide, `docs/`, `docs/en/`, interface strings) must
  never name a file, function, component, store, table or command.
- No walls of text: short paragraphs, one idea each. Newlines inside a
  translation string are not rendered, so a long multi-block string reads as a
  single block on screen — report it.
- Italian and English must say the same thing. English is an original text, not
  a word-by-word translation.
- Documentation describes present behaviour and real limits — never the history
  of development, never features that do not exist yet.
- Use the terminology already visible in the interface (Dashboard, workspace,
  cache, log). Do not invent words to avoid a technical term.

## Where things live

- `src-tauri/src/` — Rust: `federation/` (search across sources), `iiif/`
  (providers, discovery, viewer), `jobs/` (persistent queue), `download/`,
  `optimize/`, `llm/`, `db.rs`, `backup/`.
- `src/` — React: `components/` by domain, `services/` (Tauri commands),
  `stores/` (Zustand), `hooks/`, `i18n/`, `schemas/` (Zod validation).
- `docs-dev/` — architecture, design system, roadmap: the technical contracts.
- `docs/`, `docs/en/` — the published VitePress site.

Verification commands used by the project: `npm run lint` (typecheck + ESLint),
`npx vitest run`, `cargo clippy --all-targets`, `cargo fmt`, `cargo test`.
