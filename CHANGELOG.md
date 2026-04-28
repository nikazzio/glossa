# Changelog

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
