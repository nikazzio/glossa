---
title: Backup and restore
---

# Backup and restore

A backup saves application data to a `.glossa-backup` file. It is available
under **Settings → Backup** and includes all workspaces. Restoring replaces
the existing application data with the backup’s contents; it does not merge
datasets or import an individual workspace.

## Contents

| Included | Excluded |
| --- | --- |
| Workspaces, projects, pipelines, translations and revisions | Images and other repository files |
| Catalogue, metadata, links and annotations | Exported document files |
| Dictionaries, phrase memory and prompt templates | API keys and credentials |
| Persistent searches, results and associated jobs | Network cache |
| Saved settings, custom profiles, operation history and the artifact register | A complete copy of the environment or operating system |

The artifact register records what was produced without embedding its files.
Similarly, the backup records downloaded resolutions so Glossa can offer to
retrieve images again, but it does not contain the image bytes.

## Protection options

- **Glossa only:** a compressed, obfuscated archive that discourages accidental
  opening; it does not provide cryptographic confidentiality.
- **Password protected:** an encrypted archive that can be opened with the
  password or the recovery code displayed after saving.

Keep the recovery code outside the application. If both the code and password
are lost, the encrypted contents cannot be recovered. Cancelling the save
dialog does not create a backup.

## Validation and restoration

Glossa validates the archive and payload before asking for confirmation to
replace data. The payload must use the current schema version
(`schema_version: 5`); other formats and invalid contents are rejected before
any database writes.

Tables are restored in a transaction that respects relational constraints.
The current database migration marker is not replaced by the value from the
backup. Active searches must be paused before restoration, and restored search
jobs do not restart automatically.

## Local files after restoration

Restoration does not delete files already in the repository. A subsequent
check verifies files associated with restored works. If images are missing,
Glossa offers to retrieve them at the recorded resolutions. Files without an
associated work can be reviewed and removed through repository settings.

Downloading again depends on the remote source remaining available. To retain
images and exports independently of that source, copy the repository and
exported documents separately. Re-enter the necessary credentials when
restoring to another installation.

See [Storage and jobs](../guides/storage-and-jobs) for directory locations and
integrity checks.
