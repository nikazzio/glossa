# PR Review: #112 — fix: UI improvements and bug fixes (issue #111)

**Reviewed**: 2026-05-10
**Author**: nikazzio
**Branch**: fix/issue-111-ui-improvements → main
**Decision**: APPROVE (with comments)

## Summary

Comprehensive set of UI and architecture improvements: the import dialog gains a full segment editor with card/view toggle and manual boundary editing; the Insights panel gets a Glossary tab; the ghost-glossary duplication bug is fixed at the root by removing `saveProjectGlossary` from the save path; and the Ollama stream timeout is correctly increased. Code is well-structured, immutable patterns are respected, i18n is mostly complete, and all 199 tests pass with clean TypeScript.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

**1. Dead parameter in `splitChunkAtMid`**
- File: `src/components/document/ImportPreviewDialog.tsx:541`
- `paraChunks: ParagraphChunks` is declared but never referenced inside the callback. The call site at line 817 passes `activeParaChunks` unnecessarily.
- Fix: remove the parameter from the signature and the call site.
```typescript
// Before
const splitChunkAtMid = useCallback((i: number, paraChunks: ParagraphChunks) => {
// After
const splitChunkAtMid = useCallback((i: number) => {
// Call site: onSplit={() => splitChunkAtMid(i)}
```

**2. Hardcoded Italian strings in tooltip titles**
- File: `src/components/document/ImportPreviewDialog.tsx:121-124` (ChunkCard) and `280-283` (SegmentEditor)
- `anomalyTitle` is built with hardcoded Italian: `"sotto il minimo"` / `"sopra il massimo"`. These are shown as `title` attributes on hover targets, so they need translation.
- Fix: use `t()` with keys already present in the i18n files (or add new short keys, e.g. `files.anomalyTooShort` / `files.anomalyTooLong`).

**3. Unused imports in `InsightsDrawer.tsx`**
- File: `src/components/document/InsightsDrawer.tsx:9,35`
- `ChevronDown` (line 9) and `useState` (line 35) are imported but have no usage anywhere in the file. `noUnusedLocals` is not set in tsconfig so TypeScript does not flag them.
- Fix: remove both unused imports.

### LOW

**4. Index-based React keys in chunk/paragraph lists**
- File: `src/components/document/ImportPreviewDialog.tsx` (card view: `key={i}`, segment editor: `key={chunkIdx}`, `key={localIdx}`)
- When chunks are merged/split/reordered React will reuse existing DOM nodes rather than remounting them, which can produce stale expand state and visual glitches.
- Fix: derive a stable key from content (e.g., first 40 chars of the first paragraph) or a cheaply computed hash.

**5. No redirect when glossary tab loses its glossary**
- File: `src/components/document/InsightsDrawer.tsx`
- If the user has the `glossary` tab active and then removes the assigned glossary from the project, `documentDrawerTab` remains `'glossary'` and the panel shows an empty table. Keyboard nav correctly excludes the tab via `enabledDocTabOrder`, but the active state is stale.
- Fix: add a `useEffect` that falls back to `'index'` when `!hasGlossary && documentDrawerTab === 'glossary'`.

## Validation Results

| Check          | Result                |
|----------------|-----------------------|
| Type check     | Pass                  |
| Tests (Vitest) | Pass (199/199)        |
| Build          | Skipped (Tauri build not available in this env) |
| Lint (tsc)     | Pass                  |

## Files Reviewed

| File | Change |
|------|--------|
| `src-tauri/src/llm.rs` | Modified — Ollama stream timeouts |
| `src/components/common/ConfirmDialog.tsx` | Modified — z-index fix |
| `src/components/document/ImportPreviewDialog.tsx` | Modified — segment editor, card view, manual boundaries |
| `src/components/document/InsightsDrawer.tsx` | Modified — glossary tab, processing indicator |
| `src/components/help/HelpGuide.tsx` | Modified — segmentation docs |
| `src/components/layout/Header.tsx` | Modified — wires manual chunks to loadDocument |
| `src/components/pipeline/PipelineConfig.tsx` | Modified — removes inline glossary editor |
| `src/components/pipeline/ProviderRuntimeEditor.tsx` | Modified — collapsible Ollama override |
| `src/components/settings/ApiKeyInput.tsx` | Modified |
| `src/components/settings/SettingsModal.tsx` | Modified — segmentation defaults section |
| `src/i18n/en.json` | Modified — new keys |
| `src/i18n/it.json` | Modified — new keys |
| `src/index.css` | Modified — DM Sans font |
| `src/services/dbService.ts` | Modified — ghost glossary cleanup migration |
| `src/services/projectService.test.ts` | Modified — updated test expectations |
| `src/services/projectService.ts` | Modified — removes saveProjectGlossary |
| `src/stores/chunksStore.ts` | Modified — precomputedChunks param |
| `src/stores/pipelineStore.test.ts` | Modified — removes glossary action tests |
| `src/stores/pipelineStore.ts` | Modified — removes addGlossaryEntry/updateGlossaryEntry/removeGlossaryEntry |
| `src/stores/uiStore.ts` | Modified — defaultMinWords/defaultMaxWords, glossary tab type |
