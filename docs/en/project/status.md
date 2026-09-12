---
title: Beta status
---

# Beta status

Glossa is in beta. Version numbers, including 2.x, do not certify that all
planned features are complete: numbering advanced during automated release tests.

These guides follow development on main. Your downloaded build may be older:
compare the version shown in the app with the
[release notes](https://github.com/nikazzio/glossa/releases).

## Available today

- Create workspaces and projects, import text and translate it in stages.
- Test a passage before processing a document, then edit and review.
- Use glossaries, phrase memory, annotations and translation history.
- Search supported libraries and organise sources in a personal catalogue.
- Read IIIF images, keep local versions and read available pages offline.
- Follow, pause and resume downloads; verify and optimise local images.
- Export translations and back up the whole application.

## Still being completed

| Area | Current limitation |
| --- | --- |
| Transcription | Full studio, page correction workflow and OCR/HTR remain in development |
| Source → translation | The approved-transcription bridge is not complete |
| Library PDFs | Copies can be listed, but downloading and reading them is unavailable |
| Individual pages | Saving the open page works; advanced actions and multiple selection are unfinished |
| Search | Capabilities vary by library; full aggregated search is unavailable. Results with no reproduction are marked “not viewable” rather than hidden |
| Workspace transfer | Backup covers the whole app; single-workspace import/export is unfinished |
| Export Studio and Analysis | Advanced workflows remain in development |

Importing text from a PDF into a translation project already works. This is
separate from reading a PDF in the Library. A scanned PDF needs text recognition,
which is not yet a complete workflow.

## Data and backups

Current backups do not accept earlier formats. Restore replaces all application
data; it does not merge workspaces. Vault images and provider credentials are
excluded. Keep important source materials separately, including those that may
stop being available online.

Password-protected backups are encrypted; the Glossa-only format is obfuscated,
not encrypted. Read [Storage and jobs](../guides/storage-and-jobs) before restoring
data or changing the vault.

## Towards completion

The target workflow is source → reading → transcription → reviewed translation
→ export. Features arrive progressively; a visible area does not mean every
action is available.

The [development roadmap](https://github.com/nikazzio/glossa/blob/main/docs-dev/ROADMAP_2_0.md)
records order, dependencies and acceptance criteria. When reporting an issue,
include the app version, operating system, attempted action and outcome.
