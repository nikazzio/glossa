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

Every library has its own pace: how many requests in a minute, how many at once,
how many pages of the same book to fetch at a time, how long to stop when it asks
you to slow down, how many attempts to make.

Between one successful request and the next there is **no pause at all**: the
pace comes from the number of requests at once, the per-minute limit and the long
stop after a refusal. A pause on every request multiplied by all the pieces of a
zoomed page, and made the viewer unusable.

These are a few different paces applied to many libraries, so **Settings →
Libraries** governs them as **profiles**.

Two profiles ship with Glossa, with values proven in the field: **Normal**,
used by almost all of them, and **Slow**, tuned on Gallica, the strictest one.
You can change them, create others and name each one; next to the name Glossa
says how many libraries use it.

Below, the list of libraries: for each one you pick its profile from a menu. A
profile someone is using cannot be deleted — move the libraries that follow it
first — and the two that ship with the application cannot be deleted at all.

**Requests at the same time never go above four**, whatever you write: the
limit depends on their server and it keeps you from being blocked. A download
never takes them all: one seat always stays with the page you are looking at, so
you can keep browsing a book while another one downloads.

At the bottom right, next to the jobs, a small indicator tells you whether the
network is actually moving. Hovering it opens a panel: how many images are in
progress and how many are waiting their turn, keeping the page you are looking
at separate from the thumbnails; how many seats are taken towards each library
and how many requests you have already spent in the current minute; and where
the images came from so far — the vault, the working memory or the network —
with the share of requests you spared yourself. It tells a slow job from a stuck
one.

## Covers and searches kept aside

The covers you see in search results and in the Library are not requested from
the library every time you look at them: Glossa keeps them aside and draws them
from there. The same goes for searches — running the same search twice does not
go back to the network.

This does two things. First, the covers **show up**: in the installed version
they used to be empty boxes. Second, forty results are no longer forty requests
fired at a library all at once, but requests that respect the same pauses as a
download.

**This material is not yours.** It never counts as downloaded, it does not
appear in a work's page count, it is never part of a backup, and it gets dropped
when space is needed — starting with whatever has gone unread the longest. The
way to **keep** a book is still to download it.

In **Settings → Data** you can see how much is used right now, choose the size
limit (512 MB by default) and how long searches are worth before being run again
(24 hours by default). Next to it is the command to empty it: you can do that at
any time without losing anything. Images, on the other hand, never expire — the
pixels of a sixteenth-century manuscript do not change — only the size limit
governs them.

If you want to know **whether something new has appeared in the meantime**, a
line above the results tells you how old what you are looking at is, and next to
it a command runs the search for real, skipping what had been kept aside.

## How many pages you actually have

The number you read in the Library is the files on your computer: Glossa looks at
the folder, not at a list kept aside. The benefit shows when something goes wrong
— an interruption, a copy made by hand, a disk unplugged and plugged back in: the
count cannot tell a different story from what is there.

**Pages the library does not serve do not count as missing.** A manuscript may
declare 328 pages and the server return twenty fewer: that is not your fault, and
downloading again would not conjure them up. Glossa notes it, stops asking for
them at every resume, and reads the book as complete for as much as the library
serves. Every now and then — about once a week — it tries them again, because
libraries do fix things.

**Pages taken at full resolution are an addition, not a gap.** If you wanted the
larger version of three pages, the record says «plus 3 at full resolution» next to
the count, instead of making the book look half-finished.

## Compressing to free up space, without losing the original

A book downloaded at full resolution takes three times more room than it needs.
One downloaded months ago with a higher cap than you need now holds detail you
never look at. In both cases **compressing beats downloading again**, because the
library does not pay the price for it.

In the work's record, on the **Digital copies** tab, the "compress" command
opens a small panel: which already-downloaded resolution to start from (only
if there is more than one), which smaller resolution to arrive at, and at
what quality. The command queues the job immediately.

**No longer irreversible: a new copy is born, the original is never touched.**
Compression used to replace the downloaded pages in place, for good; now the
compressed copy shows up next to the work's other resolutions, each with its
own command to free just that one — keep the light copy and drop the heavy
original, or the other way round, whenever you like.

On a long book it runs for minutes, so it is a job like a download: you follow it
from the panel at the bottom right, and you can pause or cancel it. The job
works on several pages together (as many as your processor's cores, minus
one), not one at a time.

While it runs, the panel says how many pages it has shrunk and how big the
copy will be; the value remains on the completed job.

If a page cannot be read, the job ends in error instead of hiding it: its
details keep the number of unprocessed pages, while successful pages remain
safely stored in the copy.

While a download or optimisation can still change a work, commands that free
its space or remove it are refused. Let the job finish or cancel it first;
pausing is not enough.

## The backup

**Settings → Backup** saves a file with everything that
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

You can save a file that only Glossa opens: it prevents accidental opening but
does not protect sensitive material. For sensitive data use the lock: it asks
for a password and, after saving, shows a recovery code once. Keep that code
outside the app: you can select it or use the copy button beside it. Either the
password or code opens the encrypted backup, but
losing both makes its contents unrecoverable.

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
