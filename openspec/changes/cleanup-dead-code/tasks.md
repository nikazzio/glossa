# Tasks

## 1. Interfaccia: servizi dati

- [x] 1.1 Riverificare e togliere `listSegments`, `initializeVault`, `deleteVersionFiles`, `countGlossaryEntries`, `countPhraseMemoryEntries`; verificare con ricerca a parola intera che non restino riferimenti
- [x] 1.2 Riverificare e togliere `listAllProjects`, `listRecentPipelineRuns`, `getDashboardOverviewStats` e i casi di `getDashboardOverviewStats` in `projectService.test.ts`; verificare che i test rimasti del file passino

## 2. Interfaccia: utilità, store, componenti, tipi, testi

- [x] 2.1 Togliere `recommendChunkCount`, `relativeDateUnit` con il tipo `RelativeUnit`, `buildSplitPreview`, `listRunsForCategory`, `providerNeedsApiKey`, `isWaiting` e i loro casi di test; verificare che i test mirati dei file toccati passino (`getMissingPricingModels` resta: vedi design)
- [x] 2.2 Togliere `ChunkMetric` e i tipi `IconButtonDisabledStyle`, `DownloadedSize`, `CustomProviderProfileInput`; verificare con typecheck
- [x] 2.3 Togliere le chiavi `common.relative.*` da `it.json` e `en.json` dopo aver verificato che nessuna chiave composta le usi; verificare che i due file restino JSON validi e allineati
- [x] 2.4 Controllare gli orfani a cascata delle voci tolte (aiuti interni, import, tipi) e togliere solo quelli senza altri usi e non legati alle voci che restano; verificare con `npm run lint:all`

## 3. Motore

- [x] 3.1 Togliere i comandi `initialize_vault`, `delete_version_files`, `vec_ping` e la loro registrazione; verificare con ricerca che nessuna stringa di comando resti in `src/` ed `e2e/`
- [x] 3.2 Togliere il metodo `api_key_env_var` dal trait dei provider e da tutte le implementazioni, compreso il provider di prova; verificare con `cargo clippy --all-targets -- -D warnings`
- [x] 3.3 Controllare a mano gli aiuti usati dai comandi tolti (funzioni `pub` non segnalate dal compilatore) e togliere solo quelli rimasti senza usi; verificare con `cargo fmt --check` e clippy
- [x] 3.4 Correggere in `docs-dev/ARCHITECTURE.md` i paragrafi che indicano `delete_version_files` come strada della rimozione di un'opera; verificare che il testo corrisponda a `delete_source_files`

## 4. Verifica finale

- [x] 4.1 Eseguire una volta `npm run lint:all`, `npm test`, `cargo test` e confermare che tutto passa
- [x] 4.2 Rifare la ricerca dei nomi esportati senza usi e confermare che restano solo le voci dichiarate nella proposta

## Workflow follow-up

- Decisione del maintainer sulle «possibili evoluzioni» e sulle «funzioni a metà» elencate nella proposta.
- Prova dal vivo del maintainer: l'app si comporta come prima.
- Commit, push e PR solo su richiesta del maintainer; archiviare il change dopo l'unione.
