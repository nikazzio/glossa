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
says which kind of job it is — pages, check — and the numbers keep
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

The **quick check** looks at whether the files Glossa registered are still in place: milliseconds even for a large manuscript. The **full check** opens every file, checks its shape and compares its fingerprint with the one recorded when it arrived: it is the only one that catches a file truncated by an interrupted download or gone rotten on disk. It is slow in proportion to the gigabytes, and on a synced folder it forces the service to download everything. If nothing is damaged the two counts match, and only the time differs.

Both become queued jobs: follow them from the bottom panel, pause them, cancel them. The result is a four-part count — intact, missing, corrupt, orphans — where *orphans* are files left in the vault that no record claims. **Neither one deletes or re-downloads anything on its own.**

The outcome of the last check **stays in the settings**, below the two commands, until you run another one: when it ran, which kind, and the four numbers. Next to the files without a work there is the command that deletes them, with a confirmation saying how many they are and how much they take. Glossa looks at the vault again the moment you press — it does not trust the earlier count — and tells you how many it really removed: between the check and the deletion a download may have finished, and those files are no longer unclaimed.

A switch runs the quick check at every startup. It is off by default: it makes opening slower on large or networked vaults.

## How many jobs at once

In **Settings → Jobs**, one limit per resource type: downloads, processing, disk
writes, language services, document generation. *Automatic* lets Glossa choose.

The **download** limit does not depend on your computer's power but on the
library's server: raising it too much triggers temporary blocks.

## How large the pages

In **Settings → Download** you choose the page size and the thumbnail size.

The page size is a **target, not an exact number**: Glossa asks the library for
the one it declares closest, above or below. Asking for an invented size would
force the service to produce it on the spot — measured: twenty-three seconds
against one.

The same choice can be made on the **single work**, by opening its card in the
Library, and there it wins: the size depends on the material — a wide-set
printed book reads at far less than a cramped minuscule — not on who keeps the
book.

Pages already downloaded stay as they are: the choice applies to what is
downloaded from now on.

**Thumbnails** are not asked of the library: Glossa derives them from the pages
it has downloaded, on your computer. Larger ones take more space and browse
better; they cost no request at all.

## The pace towards libraries

Every library has its own pace: how long to wait between requests, how many
requests in a minute, how long to stop when it asks you to slow down, how many
attempts to make. These are a few different paces applied to many libraries, so
**Settings → Libraries** governs them as **profiles**.

Two profiles ship with Glossa, with values proven in the field: **Normal**,
used by almost all of them, and **Slow**, tuned on Gallica, the strictest one.
You can change them, create others and name each one; next to the name Glossa
says how many libraries use it.

Below, the list of libraries: for each one you pick its profile from a menu. A
profile someone is using cannot be deleted — move the libraries that follow it
first — and the two that ship with the application cannot be deleted at all.

**Requests at the same time never go above four**, whatever you write: the
limit depends on their server and it keeps you from being blocked.

## The backup

**Settings → Storage → Backup and restore** saves a file with everything that
cannot be downloaded again: the works' records, notes, transcriptions,
translations with their history, glossaries, phrase memory and the record of the
work done.

**It covers the whole of Glossa, not a single workspace.** The file holds every
workspace you have, and restoring replaces them all.

**The images are not in it, on purpose.** They come back from the library: a
40 GB backup is a backup nobody makes, a few-megabyte one gets made every week.
The file does know **which works were on your computer and at what size**, and
on restore Glossa offers to download them again. If you want the images safe
too, the way is to keep the vault in a synced folder.

The file is compressed — the content is text, and compresses about tenfold —
and carries a fingerprint: a backup interrupted while being written is
recognised **before** the restore starts, instead of leaving you halfway with
your data already cleared.

**Restoring replaces everything**: every workspace there is now is replaced by
what is in the file. The confirmation says so, and there is no going back.
Closing the save dialog without choosing a file writes nothing, and Glossa does
not claim to have saved.

**The pages you had on your computer stay where they were.** The restore keeps
them, for the works the backup contains, and right after it queues a vault check
to see whether those files are really there. When the check ends — even much
later, or on the next launch — Glossa tells you how it went: if nothing is
missing it says so, and if something is missing it offers to take back **only
that**, at the size it had. Files left without a work are counted in the
settings, with the command to remove them.

## Stopped does not mean broken

A job can sit still for minutes while respecting a library's limits. The
indicator then reads *waiting · resumes in 8 min* and the bar **does not move**:
it is not an error, and it resumes by itself. A failed job says so differently,
with the reason and the option to retry.
