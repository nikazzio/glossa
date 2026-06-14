# Changelog

## [1.0.0](https://github.com/nikazzio/glossa/compare/glossa-v0.11.0...glossa-v1.0.0) (2026-06-14)


### ✨ Features

* a11y gate [#255](https://github.com/nikazzio/glossa/issues/255) + typography rebalance & UI font picker ([#268](https://github.com/nikazzio/glossa/issues/268)) ([c76448a](https://github.com/nikazzio/glossa/commit/c76448aa074328e026a88a0341eb8187901cd967))
* multibar UI shell + resizable panels ([#243](https://github.com/nikazzio/glossa/issues/243), [#252](https://github.com/nikazzio/glossa/issues/252), [#258](https://github.com/nikazzio/glossa/issues/258)) ([#271](https://github.com/nikazzio/glossa/issues/271)) ([f708bd7](https://github.com/nikazzio/glossa/commit/f708bd737f0900e741fe7a69768dba785b35caaa))
* polish multibar shell — a11y, resize, overlay & motion ([#272](https://github.com/nikazzio/glossa/issues/272)) ([#274](https://github.com/nikazzio/glossa/issues/274)) ([f18c2e4](https://github.com/nikazzio/glossa/commit/f18c2e42e25bc40612bcec96104584e2a1f4de17))


### ♻️ Refactoring

* harden pipeline streaming path ([#267](https://github.com/nikazzio/glossa/issues/267)) ([54b4569](https://github.com/nikazzio/glossa/commit/54b45696e9da4560eebe551269943a3d9ddd6baf))


### 🔧 Maintenance

* release 1.0.0 ([#275](https://github.com/nikazzio/glossa/issues/275)) ([e75d7a5](https://github.com/nikazzio/glossa/commit/e75d7a561a6bbdfa09ddc540a670627deb930b3f))

## [0.11.0](https://github.com/nikazzio/glossa/compare/glossa-v0.10.0...glossa-v0.11.0) (2026-06-12)


### ✨ Features

* add localization for memories management in English and Italian ([a56be37](https://github.com/nikazzio/glossa/commit/a56be37daae7aa8d3554e56e844adbff17b4f7b2))
* add MemoriesTab component to manage phrase memory entries ([a56be37](https://github.com/nikazzio/glossa/commit/a56be37daae7aa8d3554e56e844adbff17b4f7b2))
* annotation context menu + NotesTab redesign ([#23](https://github.com/nikazzio/glossa/issues/23) [#263](https://github.com/nikazzio/glossa/issues/263)) ([9d284c8](https://github.com/nikazzio/glossa/commit/9d284c81e735012577565594fb7fa250dc0070b4))
* annotation UX improvements ([713c798](https://github.com/nikazzio/glossa/commit/713c798525909e2ae40a8dedfbccccc7f260f215))
* audit results — exhaustive judge, refine loop ([#244](https://github.com/nikazzio/glossa/issues/244) + [#259](https://github.com/nikazzio/glossa/issues/259) + [#231](https://github.com/nikazzio/glossa/issues/231)) ([#249](https://github.com/nikazzio/glossa/issues/249)) ([c06e72a](https://github.com/nikazzio/glossa/commit/c06e72a69bd5de7c7d546368a7b45c1fa226403b))
* auto-insert markdown footnote in translation on annotation save ([c80cbb6](https://github.com/nikazzio/glossa/commit/c80cbb6a6a90cd0fc9a99e71c87be180e072aaab))
* chunk annotations system ([#23](https://github.com/nikazzio/glossa/issues/23)) ([132e8dc](https://github.com/nikazzio/glossa/commit/132e8dc9d930f99e0b054790cace5513b9cba34d))
* create annotation from audit issue with pre-filled anchor and content ([8e34fb2](https://github.com/nikazzio/glossa/commit/8e34fb2302f2b6671caf586e9a8f9da3fc1a022c))
* enhance loading screen with dynamic height and width variables ([a56be37](https://github.com/nikazzio/glossa/commit/a56be37daae7aa8d3554e56e844adbff17b4f7b2))
* implement cost panel in PipelineSidebar with improved positioning logic ([a56be37](https://github.com/nikazzio/glossa/commit/a56be37daae7aa8d3554e56e844adbff17b4f7b2))
* integrate phrase memory management functions in phraseMemoryService ([a56be37](https://github.com/nikazzio/glossa/commit/a56be37daae7aa8d3554e56e844adbff17b4f7b2))
* keyboard shortcuts for power users ([#10](https://github.com/nikazzio/glossa/issues/10)) ([#251](https://github.com/nikazzio/glossa/issues/251)) ([a0cc6c1](https://github.com/nikazzio/glossa/commit/a0cc6c1ef1a05c7293709a9f1af6afab3d801cde))
* phrase memory foundation + semantic search workspace shell ([#7](https://github.com/nikazzio/glossa/issues/7)) ([#205](https://github.com/nikazzio/glossa/issues/205)) ([5c1b0c6](https://github.com/nikazzio/glossa/commit/5c1b0c6c14ae1c5f19d9d84fc39f8bc0f68c3a10))
* remove manual add-annotation button from NotesTab — entry only via context menu ([c740234](https://github.com/nikazzio/glossa/commit/c740234d9f7e0255a1fb41dab25bd3ce19bcc5c5))
* unify footnote rendering via remark-gfm, render annotation notes out-of-text ([5ef5fca](https://github.com/nikazzio/glossa/commit/5ef5fcaebe4015fc0d4469f4eb7bfb123fce5d81))


### 🐛 Bug Fixes

* annotation highlight as background + fix settings color crash + uniform markers ([e94f594](https://github.com/nikazzio/glossa/commit/e94f59438a288dc8a3d3ce432ea8961cd7d1e4e2))
* **annotations:** separate annotation-locate focus from audit focus ([36d99b2](https://github.com/nikazzio/glossa/commit/36d99b253db0aa96f52481b7a159ab033de60082))
* audit highlight stale, date format EU 24h, embedding regen UX ([#265](https://github.com/nikazzio/glossa/issues/265)) ([a77339e](https://github.com/nikazzio/glossa/commit/a77339eaaa1959ed2c4055dfb65b77eb8040fab8))
* clear audit highlight on resolve/chunk-nav; chunk summary shows aggregated stats ([#262](https://github.com/nikazzio/glossa/issues/262) partial) ([1fc3cc3](https://github.com/nikazzio/glossa/commit/1fc3cc35c9b5bc5fad28e104dd780c8572db0602))
* increase non-streaming request timeout 120s → 300s ([#230](https://github.com/nikazzio/glossa/issues/230)) ([9a94057](https://github.com/nikazzio/glossa/commit/9a94057240796b88a08394c07610b26a7428b91c))
* restore footnote numbers in preview + show note number in panel + icon-only locate ([e494487](https://github.com/nikazzio/glossa/commit/e494487bf8b751b3c043d3e20910b6bde66dde21))
* revert schema version bump — ALTER TABLE migration is sufficient for nullable column ([7aa480a](https://github.com/nikazzio/glossa/commit/7aa480a25129e6959f30adea0c8cb3cf1ebfe6c1))
* surface memory logs in the chunk console ([#240](https://github.com/nikazzio/glossa/issues/240)) ([4224a42](https://github.com/nikazzio/glossa/commit/4224a423ed55f480f789b3b797f5ac5a827d803c))
* unify note rendering across source/translation pages ([4233805](https://github.com/nikazzio/glossa/commit/42338050225ce049b8664542eb13afc91f45e284))
* update libraryStore to include memories tab in state management ([a56be37](https://github.com/nikazzio/glossa/commit/a56be37daae7aa8d3554e56e844adbff17b4f7b2))


### ⚡ Performance

* abilita prompt caching OpenAI su path Responses API ([#253](https://github.com/nikazzio/glossa/issues/253)) ([#260](https://github.com/nikazzio/glossa/issues/260)) ([5d732f1](https://github.com/nikazzio/glossa/commit/5d732f155293528f8985c42b93da4284bf2e029b))


### ♻️ Refactoring

* fase 2 structural — split monoliths into focused modules ([#247](https://github.com/nikazzio/glossa/issues/247)) ([ae4acc7](https://github.com/nikazzio/glossa/commit/ae4acc7cbce833067e9ee81519f60e85a49eb849))

## [0.10.0](https://github.com/nikazzio/glossa/compare/glossa-v0.9.0...glossa-v0.10.0) (2026-06-01)


### ✨ Features

* **#139:** backup e ripristino snapshot completo del workspace ([#204](https://github.com/nikazzio/glossa/issues/204)) ([65519a7](https://github.com/nikazzio/glossa/commit/65519a7ea5d1bc8779bf773da1d9dd8b37087ef2))
* ricerca globale documento + sistema evidenziazioni unificato ([#140](https://github.com/nikazzio/glossa/issues/140)) ([#196](https://github.com/nikazzio/glossa/issues/196)) ([45204e3](https://github.com/nikazzio/glossa/commit/45204e30cd8aefb66314633e68273faa760b14a7))


### 🐛 Bug Fixes

* **#197:** document view UX — nav, lock toggle, diff buttons, tooltip ([#200](https://github.com/nikazzio/glossa/issues/200)) ([9b1683f](https://github.com/nikazzio/glossa/commit/9b1683f895ac8b224cc191a5df5009ae46ee1e39))


### ♻️ Refactoring

* **#199:** consolida primitive UI — IconButton CVA, Tooltip, StatusDot, SectionLabel ([#201](https://github.com/nikazzio/glossa/issues/201)) ([dc48d43](https://github.com/nikazzio/glossa/commit/dc48d431c94f8b3b39c6e01c7dcf27f901b033cb))
* **#202:** cleanup UI post-[#199](https://github.com/nikazzio/glossa/issues/199) — split file monolitici, token CSS, err typing ([#203](https://github.com/nikazzio/glossa/issues/203)) ([ff2c2aa](https://github.com/nikazzio/glossa/commit/ff2c2aac807f433b50c81e3f336c957a1dafaa94))

## [0.9.0](https://github.com/nikazzio/glossa/compare/glossa-v0.8.0...glossa-v0.9.0) (2026-05-27)


### ✨ Features

* import robusto DOCX/PDF + rendering tabelle markdown ([#194](https://github.com/nikazzio/glossa/issues/194)) ([bcb5c84](https://github.com/nikazzio/glossa/commit/bcb5c84b03886719ef190cd4ead362b6ee75d7ed))
* pipeline multiple per progetto con PipelineBar ([#162](https://github.com/nikazzio/glossa/issues/162)) ([#179](https://github.com/nikazzio/glossa/issues/179)) ([9a86267](https://github.com/nikazzio/glossa/commit/9a86267bb11572bcea2bf2c859aa051c54e9613e))
* UI style unification — palette, font, design system ([#26](https://github.com/nikazzio/glossa/issues/26), [#129](https://github.com/nikazzio/glossa/issues/129)) ([#195](https://github.com/nikazzio/glossa/issues/195)) ([4a39c82](https://github.com/nikazzio/glossa/commit/4a39c829854bc6244d47dccc131fd029f2379c29))


### 🐛 Bug Fixes

* focus trap + ESC in ConfigDrawer (post-merge) ([ea83f86](https://github.com/nikazzio/glossa/commit/ea83f86e70815f25433077ddd654f5a0e44a691b))

## [0.8.0](https://github.com/nikazzio/glossa/compare/glossa-v0.7.0...glossa-v0.8.0) (2026-05-19)


### ✨ Features

* epic engine refactor — model registry, provider modernization, pipeline architecture ([371ed72](https://github.com/nikazzio/glossa/commit/371ed725d0627e15fcd62e15f8eeae8b0930c97d))
* normalizeImportedText — cleanup testo grezzo prima del chunking ([#158](https://github.com/nikazzio/glossa/issues/158)) ([0f03840](https://github.com/nikazzio/glossa/commit/0f0384017d494a0ba0bb50f5577971e15f034f0d))
* translation workflow redesign — preview status, dry run, full reset ([#176](https://github.com/nikazzio/glossa/issues/176)) ([72b05bd](https://github.com/nikazzio/glossa/commit/72b05bdc605b942d88dbcd379198986f001ad118))

## [0.7.0](https://github.com/nikazzio/glossa/compare/glossa-v0.6.2...glossa-v0.7.0) (2026-05-13)


### ✨ Features

* checkpoint & resume interrupted translations ([#134](https://github.com/nikazzio/glossa/issues/134)) ([e9ef24a](https://github.com/nikazzio/glossa/commit/e9ef24ada5d7eee59575294d643ef1fe79eed70a))
* configurable Ollama host + retry UI feedback ([#125](https://github.com/nikazzio/glossa/issues/125), [#122](https://github.com/nikazzio/glossa/issues/122)) ([#135](https://github.com/nikazzio/glossa/issues/135)) ([ff03bf5](https://github.com/nikazzio/glossa/commit/ff03bf5eb9ed88c8c69611d099c2d137a5c6b18b))
* per-project configurable persona ([#131](https://github.com/nikazzio/glossa/issues/131)) ([93cb88c](https://github.com/nikazzio/glossa/commit/93cb88cb0e8c8dc687c1ffe975bc3baa7a6b67b4))
* pre-flight validation of all pipeline providers before run ([#133](https://github.com/nikazzio/glossa/issues/133)) ([8cc23bf](https://github.com/nikazzio/glossa/commit/8cc23bfec5bb3059e41dc0b04b73c559392a63b9))
* token context overflow detection ([#121](https://github.com/nikazzio/glossa/issues/121)) ([#136](https://github.com/nikazzio/glossa/issues/136)) ([40489df](https://github.com/nikazzio/glossa/commit/40489dfdac1c04d560ef505022d5807a0acbdf8f))


### ♻️ Refactoring

* LlmProvider trait — elimina match provider duplicati (issue [#61](https://github.com/nikazzio/glossa/issues/61)) ([#118](https://github.com/nikazzio/glossa/issues/118)) ([34c8289](https://github.com/nikazzio/glossa/commit/34c828947ee5051e7cb17bd934a7469c12c75660))

## [0.6.2](https://github.com/nikazzio/glossa/compare/glossa-v0.6.1...glossa-v0.6.2) (2026-05-10)


### 🐛 Bug Fixes

* debounce glossary highlight to prevent typing lag (issue [#81](https://github.com/nikazzio/glossa/issues/81)) ([#113](https://github.com/nikazzio/glossa/issues/113)) ([7912035](https://github.com/nikazzio/glossa/commit/79120353b3f563546182ee878fb8461e000cc632))
* structured file logging with rotation and RUST_LOG override ([#114](https://github.com/nikazzio/glossa/issues/114)) ([26f077c](https://github.com/nikazzio/glossa/commit/26f077c3a4f22239f65e8dc9f30e476b0786c4dd))
* UI improvements and bug fixes (issue [#111](https://github.com/nikazzio/glossa/issues/111)) ([#112](https://github.com/nikazzio/glossa/issues/112)) ([a8ae940](https://github.com/nikazzio/glossa/commit/a8ae9401ac1b1006156ab150055fb83a9af64eff))


### ⚡ Performance

* O(1) chunk index + RAF token batching (issue [#101](https://github.com/nikazzio/glossa/issues/101)) ([#117](https://github.com/nikazzio/glossa/issues/117)) ([e9966b7](https://github.com/nikazzio/glossa/commit/e9966b74eaa59c277f1633e2f07f258e429646cb))

## [0.6.1](https://github.com/nikazzio/glossa/compare/glossa-v0.6.0...glossa-v0.6.1) (2026-05-09)


### 🐛 Bug Fixes

* add Ollama backend timeout coverage ([#109](https://github.com/nikazzio/glossa/issues/109)) ([b5069db](https://github.com/nikazzio/glossa/commit/b5069db88f8c35464772789cae48e071c8c3e767))
* bug vari issue [#98](https://github.com/nikazzio/glossa/issues/98) ([#100](https://github.com/nikazzio/glossa/issues/100)) ([883db4c](https://github.com/nikazzio/glossa/commit/883db4c8c0e39a28c8e83783d7cf4bc8dffb3c34))
* logging, DOCX export, API keys WSL2, bug cancellazione traduzioni ([#97](https://github.com/nikazzio/glossa/issues/97)) ([ef460bb](https://github.com/nikazzio/glossa/commit/ef460bb661a640419a59c9250a154ceb8b1bd3e1))

## [0.6.0](https://github.com/nikazzio/glossa/compare/glossa-v0.5.0...glossa-v0.6.0) (2026-05-04)


### ✨ Features

* export dialog, empty states, chunk badge improvements ([#94](https://github.com/nikazzio/glossa/issues/94)) ([a4e9c80](https://github.com/nikazzio/glossa/commit/a4e9c80bf8e47d89fc66821367a5588477dd4f5d))
* InsightsDrawer UX improvements (issue [#91](https://github.com/nikazzio/glossa/issues/91)) ([#92](https://github.com/nikazzio/glossa/issues/92)) ([f41e24b](https://github.com/nikazzio/glossa/commit/f41e24b29049fc2fc242a17c86cdfb839989017d))
* model catalog + token cost estimation ([#77](https://github.com/nikazzio/glossa/issues/77)) ([20a67af](https://github.com/nikazzio/glossa/commit/20a67af8d9f4c02e948050f931519eb6fdd2d613))
* smarter chunking, ImportPreviewDialog refactor, virtual IndexTab ([#90](https://github.com/nikazzio/glossa/issues/90)) ([4bc0215](https://github.com/nikazzio/glossa/commit/4bc0215cbbb35246e207c02b6a6e0c7cf1904efd))


### 🐛 Bug Fixes

* encrypted file fallback when OS keychain is unavailable ([#86](https://github.com/nikazzio/glossa/issues/86)) ([49e6c90](https://github.com/nikazzio/glossa/commit/49e6c90a652a4d6b80e411004fabd4064cc11442))
* frontend watchdog per chunk bloccato in processing ([#95](https://github.com/nikazzio/glossa/issues/95)) ([a84279c](https://github.com/nikazzio/glossa/commit/a84279cb5c9a113dee8addf001710edb89b3d5a8))
* make project persistence resilient to partial saves and corrupt config JSON ([#79](https://github.com/nikazzio/glossa/issues/79)) ([56c7f7b](https://github.com/nikazzio/glossa/commit/56c7f7b0a01b47eee692e267e7a69f44024097ed))
* rifiniture UI/UX configurazione progetto ([#96](https://github.com/nikazzio/glossa/issues/96)) ([bb647ed](https://github.com/nikazzio/glossa/commit/bb647ed2bf83a3ff377bc12f2862da4ec4822be0))


### ⚡ Performance

* split large frontend bundle into vendor chunks ([#76](https://github.com/nikazzio/glossa/issues/76)) ([597321f](https://github.com/nikazzio/glossa/commit/597321f94d17f71ead6e57a201e06004452b8843))

## [0.5.0](https://github.com/nikazzio/glossa/compare/glossa-v0.4.0...glossa-v0.5.0) (2026-04-29)


### ✨ Features

* add markdown-first document pipeline ([#69](https://github.com/nikazzio/glossa/issues/69)) ([82d98ee](https://github.com/nikazzio/glossa/commit/82d98eef9b70111fe4903e6d2c1d68e65c8e0b2a))

## [0.4.0](https://github.com/nikazzio/glossa/compare/glossa-v0.3.1...glossa-v0.4.0) (2026-04-28)


### ✨ Features

* cross-project glossary library, CSV import, glossary highlighting ([#53](https://github.com/nikazzio/glossa/issues/53)) ([249c17b](https://github.com/nikazzio/glossa/commit/249c17bf57e7b0fb41348663c858b4f41d9475e5))
* token tracking, prompt template library, ConfigDrawer redesign (S4-T5a) ([#48](https://github.com/nikazzio/glossa/issues/48)) ([98d2bad](https://github.com/nikazzio/glossa/commit/98d2bad525b26e11d580abea811fe1aff0de71b6))


### 🐛 Bug Fixes

* **judge:** resilient JSON parsing for markdown-wrapped LLM responses ([#54](https://github.com/nikazzio/glossa/issues/54)) ([d51bf0c](https://github.com/nikazzio/glossa/commit/d51bf0cccd756de2a27958c7d0a68786ad5841c3))

## [0.3.1](https://github.com/nikazzio/glossa/compare/glossa-v0.3.0...glossa-v0.3.1) (2026-04-27)


### 🐛 Bug Fixes

* SQLite lock contention, header UI refactor, settings persistence ([#46](https://github.com/nikazzio/glossa/issues/46)) ([f997f4b](https://github.com/nikazzio/glossa/commit/f997f4bbce7e6672cf864f7f90cebddb73102674))

## [0.3.0](https://github.com/nikazzio/glossa/compare/glossa-v0.2.2...glossa-v0.3.0) (2026-04-27)


### ✨ Features

* **chunks:** Step 1 — protect completed translations from silent data loss ([#37](https://github.com/nikazzio/glossa/issues/37)) ([190aa11](https://github.com/nikazzio/glossa/commit/190aa11ad5da7f3645757f1067c168332eeab397))
* enhance project autosave and database schema ([#44](https://github.com/nikazzio/glossa/issues/44)) ([5ba746d](https://github.com/nikazzio/glossa/commit/5ba746daa98363fcd0554c6f57f13e57c608ffca))
* enhance translation pipeline with chunking and quality assessment ([#34](https://github.com/nikazzio/glossa/issues/34)) ([7b5cbf7](https://github.com/nikazzio/glossa/commit/7b5cbf746ec62a3a76acbb010e94e11fe3547d09))
* **pipeline:** Step 2 — per-chunk replay & audit drill-down ([#38](https://github.com/nikazzio/glossa/issues/38)) ([572dd17](https://github.com/nikazzio/glossa/commit/572dd179ae83154bd1ebdef446713e4ee91d872e))
* Sprint 1 — security & robustness hardening ([#36](https://github.com/nikazzio/glossa/issues/36)) ([dfd4383](https://github.com/nikazzio/glossa/commit/dfd438300253fd418ca67a026841ef441b90bcda))


### ♻️ Refactoring

* extract chunk management logic into a dedicated chunksStore… ([#39](https://github.com/nikazzio/glossa/issues/39)) ([3521ef3](https://github.com/nikazzio/glossa/commit/3521ef3981f4cf0b75a948f11533a179cf7c1e14))

## [0.2.2](https://github.com/nikazzio/glossa/compare/glossa-v0.2.1...glossa-v0.2.2) (2026-04-19)


### 🐛 Bug Fixes

* configure tauri updater for release builds ([#31](https://github.com/nikazzio/glossa/issues/31)) ([3a0a9d6](https://github.com/nikazzio/glossa/commit/3a0a9d6e50b1b706693ef061792f03cc3f3c9fdd))

## [0.2.1](https://github.com/nikazzio/glossa/compare/glossa-v0.2.0...glossa-v0.2.1) (2026-04-19)


### 🐛 Bug Fixes

* restore saved translations when reopening projects ([#27](https://github.com/nikazzio/glossa/issues/27)) ([a549c68](https://github.com/nikazzio/glossa/commit/a549c686d7c073eef163d64ddb1a430ca3f27119))

## [0.2.0](https://github.com/nikazzio/glossa/compare/glossa-v0.1.0...glossa-v0.2.0) (2026-04-18)


### ✨ Features

* add accessibility and UI polish ([0286b4f](https://github.com/nikazzio/glossa/commit/0286b4f457fb286a5d30743deaa09cd0f40e114c))
* add accessibility and UI polish ([63d16af](https://github.com/nikazzio/glossa/commit/63d16afb15e3f1fe4be7e378dea93b90d3f996c2))
* Add chunking toggle and language support ([d146591](https://github.com/nikazzio/glossa/commit/d14659171a6ada38cc077104f39c98d61a17653e))
* add CI/CD with release-please and cross-platform builds ([01ed4e0](https://github.com/nikazzio/glossa/commit/01ed4e00dc362abbef61cf31d9b2241712212699))
* add Ollama support and streaming responses ([9c5fcf1](https://github.com/nikazzio/glossa/commit/9c5fcf19febcb892f8c99ec565c99850cb78d80e))
* add project management and file import/export ([a2ac668](https://github.com/nikazzio/glossa/commit/a2ac6686c5e26ad384cadc7fbcc2a2c781c5c773))
* add Tauri v2 desktop shell ([7124120](https://github.com/nikazzio/glossa/commit/7124120770d2ec24ee6dd667e4341937ad0425f6))
* complete i18n integration with English and Italian translations ([3adb805](https://github.com/nikazzio/glossa/commit/3adb805fcf0ac3300707612a419ef1f53668677c))
* Initialize TransLab AI Studio application ([6fbae65](https://github.com/nikazzio/glossa/commit/6fbae656bb3605cc88a6d883ef091c1be60ffcd1))
* migrate LLM calls to Rust backend, add SQLite data layer ([e833670](https://github.com/nikazzio/glossa/commit/e8336707b3b12de9cc5f33d820a76507551a88f1))
* secure API keys via OS Keychain (keyring crate) ([a28a9f9](https://github.com/nikazzio/glossa/commit/a28a9f9354f8763f2f0c4f9ed32a5f821aeb57b9))
* structured error handling with retry, toasts, and inline errors ([9598e3c](https://github.com/nikazzio/glossa/commit/9598e3ceb553d45e9c5572b71a6ca00bc99c2e66))


### ♻️ Refactoring

* decompose monolithic App into modular architecture ([fb6611b](https://github.com/nikazzio/glossa/commit/fb6611b5376426be6eae30d021f4e4486fda5278))
