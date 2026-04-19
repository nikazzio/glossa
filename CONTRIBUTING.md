# Contributing to Glossa

## Development setup

### Prerequisites

- Node.js ≥ 18
- Rust (via [rustup](https://rustup.rs/))
- System dependencies:
  - **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev`
  - **Windows**: WebView2 (included in Windows 10/11)

### Getting started

```bash
git clone https://github.com/nikazzio/glossa.git
cd glossa
npm install
npm run tauri:dev    # dev mode with hot reload
npm run tauri:build  # production build
```

### Checks

```bash
npm run lint                      # TypeScript type-check
cd src-tauri && cargo check       # Rust type-check
```

Both checks run automatically on every push via CI.

---

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) to generate changelogs and determine version bumps automatically.

### Format

```
<type>: <description>

[optional body]
```

### Types

| Type | Description | Version bump |
|------|-------------|-------------|
| `feat` | New feature | minor (0.1.0 → 0.**2**.0) |
| `fix` | Bug fix | patch (0.1.0 → 0.1.**1**) |
| `perf` | Performance improvement | patch |
| `refactor` | Code restructuring (no behavior change) | patch |
| `docs` | Documentation only | no release |
| `chore` | Build, CI, tooling | no release |
| `test` | Adding or fixing tests | no release |
| `style` | Formatting, whitespace | no release |

### Examples

```bash
git commit -m "feat: add glossary term management"
git commit -m "fix: prevent crash when importing empty files"
git commit -m "docs: update Ollama setup instructions"
git commit -m "refactor: extract streaming logic into separate module"
```

### Breaking changes

For major version bumps, add `!` after the type or include `BREAKING CHANGE:` in the body:

```bash
git commit -m "feat!: redesign project file format"
```

---

## Release process

Releases are fully automated via [release-please](https://github.com/googleapis/release-please).

### How it works

1. **You commit and push to `main`** using conventional commits
2. **release-please** automatically creates (or updates) a PR titled `chore(main): release X.Y.Z`
   - This PR contains the version bump across all files (`package.json`, `Cargo.toml`, `tauri.conf.json`)
   - It includes a generated `CHANGELOG.md` with all changes since the last release
   - The PR accumulates changes — every new push to main updates it
3. **When you're ready to release**, merge the release PR
4. **Automatically**:
   - A git tag `vX.Y.Z` is created
   - GitHub Actions builds the app on Linux and Windows in parallel
   - Binaries (`.deb`, `.rpm`, `.AppImage`, `.msi`, `.exe`) are uploaded to a GitHub Release
   - Platform-specific `SHA256SUMS-*.txt` files are uploaded for integrity verification
   - Release builds also generate signed Tauri updater artifacts when updater signing secrets are configured

### Build targets

| Platform | Artifacts |
|----------|-----------|
| Linux | `.deb`, `.rpm`, `.AppImage` |
| Windows | `.msi`, `.exe` (NSIS installer) |

### Workflow

```
feat: add glossary support   ──┐
fix: correct export encoding ──┤  push to main
refactor: clean up stores    ──┘
                                │
              ┌─────────────────▼──────────────────┐
              │  release-please opens/updates       │
              │  PR "chore(main): release 0.2.0"    │
              │  with CHANGELOG listing all changes │
              └─────────────────┬──────────────────┘
                                │
                   you merge when ready
                                │
              ┌─────────────────▼──────────────────┐
              │  tag v0.2.0 created                 │
              │  🐧 Linux build  → .deb .rpm .AppImage │
              │  🪟 Windows build → .msi .exe       │
              │  📦 uploaded to GitHub Releases      │
              └────────────────────────────────────┘
```

---

## Branching

- `main` — stable, CI-checked. All work merges here.
- Feature branches — `feat/glossary-support`, `fix/crash-large-files`, etc.
- Release PR — managed by release-please, do not edit manually.

## Pull requests

1. Create a branch from `main`
2. Make your changes with conventional commits
3. Push and open a PR
4. CI runs lint + cargo check automatically
5. After review, merge to `main`

## Release secrets

The automated release workflow expects these repository secrets for Tauri updater artifact signing:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (optional if the private key has no password)

These are used for Tauri updater artifact signing only. They do **not** replace Windows Authenticode code signing.
