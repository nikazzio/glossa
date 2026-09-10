# Contributing to Glossa

Glossa is a beta under active development. Version numbers reflect automated release experiments, not a declaration that the planned product is complete.

## Setup

Follow the [README](README.md) for platform dependencies and startup. Node and npm requirements are declared in `package.json` under `engines`: Node 20.19+ or 22.12+, npm 11, current stable Rust. CI runs Node 22.

Read [development documentation](docs-dev/README.md) and the repository instructions before changing code. Start from updated `main`, use a focused branch and keep each pull request independently understandable.

## Verification

During implementation, run tests for the affected behaviour. Before handing off a change spanning multiple areas, run the relevant full suites once.

```bash
npm run lint:all
npm test
# From src-tauri:
cargo check --all-targets
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

CI runs these checks on pull requests and pushes to main, plus browser smoke tests, production npm dependency auditing, Rust dependency auditing and release security configuration checks. Rust audit exceptions are documented in the workflow; green audit status includes those exceptions.

The 80% coverage target is a development objective, not a currently enforced CI threshold. Test count alone does not establish coverage.

Browser smoke tests simulate the desktop bridge. Test installed desktop workflows separately when native storage, networking, recovery or platform behaviour changes. Do not run app/documentation builds, E2E or dependency installations routinely unless requested or necessary to diagnose a failure.

## Documentation

User behaviour changes update the in-app guide and public guides in Italian and English. Describe present behaviour, limitations and meaningful choices; keep development history out of user guides.

Architecture records current contracts. Product architecture records the target and domain boundaries. The roadmap owns remaining work. Session notes are a short handoff, not a second roadmap or a commit diary.

For source acquisition, jobs, transcription and export, consult relevant Scriptoria modules and record what was adopted, adapted or rejected. It is a reference, not an automatic requirement to copy every feature.

## Pull requests and issues

Use Conventional Commits, for example `fix(library): preserve offline page selection`. The type decides what release-please proposes:

| Type | Meaning | Version bump |
|------|---------|--------------|
| `feat` | New capability | minor |
| `fix`, `perf`, `refactor` | Bug fix, speed, restructuring | patch |
| `docs`, `chore`, `test`, `style`, `ci` | No user-visible change | none |

Add `!` after the type, or `BREAKING CHANGE:` in the body, for a major bump. A CI check enforces the convention on pull request titles.

Describe the user-visible result, scope and checks. Link implementation issues and close only work actually completed on main. An epic with unfinished children stays open.

Update stale issue descriptions when implementation resolves a decision. Separate implemented work from remaining acceptance criteria. The beta completion milestone describes product scope independently of package version numbers.

## Releases

GitHub Actions uses **release-please** to propose version and changelog changes. Merging its release PR creates the tag and triggers Linux, Windows and macOS Apple Silicon builds, checksums and configured updater artifacts. Tags use the `glossa-v` prefix.

A release proposal is not a completion gate and must not be merged merely because it exists. Keep the current numbering; beta completion is defined in the [roadmap](docs-dev/ROADMAP_2_0.md).

Before distributing a build, state included capabilities, remaining limitations and data/backup compatibility. Verify fresh installation, restart and recovery on representative data. During this private beta, do not promise compatibility that has not been implemented.

Updater signing uses `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Updater signatures are separate from Windows Authenticode signing.

Public docs deploy from main when their workflow is triggered. Therefore they describe development state and may be ahead of downloadable builds.
