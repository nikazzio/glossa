# Storage and background jobs

Glossa keeps data in two distinct places and runs long operations in a queue you
can pause and resume.

## Two folders, not one

**Data folder** — holds the database: records, translations, glossaries,
settings. It is small and belongs on a local disk.

**Vault folder** — holds the images and documents downloaded from libraries.
Those are gigabytes, and they can live elsewhere: another partition, an external
drive, a synced folder.

Keeping them apart protects the database: wanting the images in the cloud no
longer forces the database there too, where it risks corruption.

## Changing folder

In **Settings → Storage**. Glossa opens the picker itself, not the page: the
path never travels through the interface.

When you pick a folder for the vault:

- **empty** → the vault structure is created;
- **already a Glossa vault** → it is reconnected without copying anything, handy
  for moving a disk between two computers;
- **holding something else** → it is refused, so thousands of files never land
  in a folder picked by mistake.

Changing folder **does not move** files already downloaded: moving them will
arrive as a background job.

If the chosen folder is unreachable — disk unplugged, share not mounted — Glossa
says so and blocks vault operations. It does not treat the files as lost and
downloads nothing again.

## Synced folders

The vault can sit on Drive, OneDrive or iCloud, **on one condition**: the client
must keep a real copy on disk. In online-only mode files are placeholders — they
look present, with the right size, and take zero bytes. Glossa would call a
source complete while nothing is there.

**Never put the database in a synced folder.**

## The job queue

Downloads, vault checks and long generations do not block the application: they
become queued jobs.

**Where to see them** — in the bottom bar on the right, in every section.
Clicking opens the panel with the list split into *running*, *waiting*,
*finished today*.

**How to control them** — pause, resume, cancel and retry per job, or for all of
them at once from the controls at the top of the panel.

**How they are named** — every row carries the work's name while it is still
waiting its turn, and adds progress and downloaded size while it runs: *I diarii
di Marino Sanuto · 34/374 · 46 MB*. Next to it you see what it is doing right
now: starting, reading the manifest, choosing the resolution, downloading. A tag
says which kind of job it is — pages, thumbnails, check — and the numbers keep
what has arrived separate from what is expected in total.

**Clicking a row** opens it and shows the details: the resolution the library
accepted, its server address, the attempts made, the timestamps.

Pausing is not instant: the job finishes the piece it is on — the page it is
downloading — saves it and stops. That is why the state goes from *pausing…* to
*paused*.

A cancelled job is final: it can be repeated from scratch, not resumed. Pages
already downloaded stay.

## Closing and reopening

Closing Glossa with active jobs brings up a confirmation with the list. The jobs
are **paused**, not cancelled, saving the point they reached.

On reopening **no job restarts on its own**: you find them stopped and decide.
The only exception is optional — in **Settings → Jobs** you can let interrupted
downloads restart automatically.

## Checking the vault

**Settings → Storage** has two controls.

The **quick check** looks at whether the files Glossa registered are still in place: milliseconds even for a large manuscript. The **full check** opens every file and recomputes its fingerprint, so it also finds the ones truncated by an interrupted download — but it is slow in proportion to the gigabytes, and on a synced folder it forces the service to download everything.

Both become queued jobs: follow them from the bottom panel, pause them, cancel them. The result is a four-part count — intact, missing, corrupt, orphans — where *orphans* are files left in the vault that no record claims. **Neither one deletes or re-downloads anything on its own.**

A switch runs the quick check at every startup. It is off by default: it makes opening slower on large or networked vaults.

## How many jobs at once

In **Settings → Jobs**, one limit per resource type: downloads, processing, disk
writes, language services, document generation. *Automatic* lets Glossa choose.

The **download** limit does not depend on your computer's power but on the
library's server: raising it too much triggers temporary blocks.

## Stopped does not mean broken

A job can sit still for minutes while respecting a library's limits. The
indicator then reads *waiting · resumes in 8 min* and the bar **does not move**:
it is not an error, and it resumes by itself. A failed job says so differently,
with the reason and the option to retry.
