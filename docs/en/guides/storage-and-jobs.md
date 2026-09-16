---
title: Storage and jobs
---

# Storage and jobs

Glossa separates the working database, downloaded file repository and network
cache. A persistent queue handles long operations without requiring their
screens to remain open.

## Data locations

| Component | Contents | Storage |
| --- | --- | --- |
| Database | Projects, translations, catalogue, resources and settings | Local data directory |
| File repository | Manifests, images, thumbnails and local versions | Selectable directory, including an external drive |
| Network cache | Reusable search responses and images | Temporary storage with a configurable limit |

View and change locations under **Settings → Data**. Changing the data
directory copies the database, checks the copy and records the new location
for the next restart; the original is not deleted automatically. Changing
the file repository selects an empty directory or reconnects an existing
Glossa repository without transferring files from the previous location.

Keep the database on a local drive outside synchronised folders. The file
repository can be synchronised only when files remain physically available
on disk; cloud placeholders do not guarantee that images can be read.

## Job lifecycle

The status-bar panel lists queued, running and finished jobs. Details include
progress, the current step, attempts, timestamps and errors. Downloads, image
reduction, repository checks and searches have dedicated jobs.

| State or command | Behaviour |
| --- | --- |
| Waiting | The job is waiting for resources or a remote rate limit to expire |
| Pause | Requests a stop at the next checkpoint |
| Resume | Continues a paused job |
| Cancel | Ends the job; files already saved remain available |
| Retry | Starts another attempt after a failure |

A user-requested pause is distinct from waiting for an automatic retry. A
retry countdown is not an estimate of the time required to finish the job.

Closing the application pauses active jobs after confirmation. They remain
paused on restart. **Settings → Jobs** can enable automatic download recovery
and configure limits by resource category.

## Image dimensions

**Settings → Library → Images** defines page and thumbnail dimensions and
image-reduction settings. A per-work selection overrides the general setting.
The numeric value specifies the desired long edge, not guaranteed dimensions
for the received files.

| Library mode | Request rule |
| --- | --- |
| Automatic | Uses the nearest declared halving level when available; otherwise calculates width from the desired long edge |
| Ready-made sizes only | Uses declared halving levels; requests full size if none are available |
| Exact size | Calculates a proportional width from the requested long edge |
| Maximum resolution for the work | Requests full size regardless of the library mode |

Pages smaller than the target and pages without valid dimensions are requested
at full size. A predefined size can be larger or smaller than the target.
If the service rejects the requested dimensions, a download may use full size
and preserve it without local resizing. Thumbnails are generated from downloaded pages.

Requesting another resolution creates a separate version. Saving a page from
the viewer instead uses the image already loaded. Changing the configured
resolution does not alter existing files.

## Network profiles

**Settings → Library → Settings** manages concurrency, requests per minute,
cooldown after a rejection, retry limits and timeouts. Changes require an
explicit save. The **Libraries** tab assigns a profile and image request mode
to each service.

Built-in profiles can be edited but not deleted. A custom profile must be
unassigned before deletion. Concurrent requests to an individual host are
capped at four, with capacity reserved for interactive reading. Job limits
do not override these network constraints. The status-bar indicator shows
active and waiting requests and image provenance.

## Coverage and integrity

Local page counts are derived from repository files. The expected total comes
from the manifest and is recorded when the viewer opens as well as during
downloads. Pages reported as unavailable by the service are counted separately;
completeness refers to pages that can be retrieved.

A quick check verifies file presence. A full check reads file contents,
validates their format and compares available checksums. Both report intact,
missing, corrupt and unassociated files. Neither automatically deletes or
downloads files. Cleaning up files without an associated work is a separate
command that rechecks the repository before proceeding.

## Image reduction and caching

Image reduction creates a new version at the selected dimensions and quality,
preserving the original. Reclaiming space requires deleting a version after
checking the result. If some pages cannot be processed, the job reports an
error and retains the pages produced successfully.

The network cache reuses responses and images. Its default size limit is
512 MB, and search responses are valid for 24 hours by default. Images are
subject to the size limit without the same time-based expiry. Change these
values or clear the cache under **Settings → Data**. Cached data does not
increase downloaded-page counts and is excluded from
[backups](../reference/backup-and-restore).


## One copy per work

A work keeps **one image copy**, at the size chosen when downloading, with **one
file per page**. Asking for the book at another size says so first and replaces
what you have: the old sizes are deleted only once the download succeeds, so a
network failure does not leave you with nothing.

The repository can still hold several sizes at once, but no command creates more
than one.

## The document next to the images

When the library serves the work as a single document, that file lives in the
repository next to the image pages of the same work, not among the resolutions:
it is another copy, not another resolution. It takes space of its own, is
deleted on its own, and does not disappear when you free the images.

The download is a job like the others and respects the same library network
limits: the file is written to a staging area, checked — signature and proper
ending — and only then enters the repository, so a dropped connection never
leaves half a document among your files. Pages are counted from the document as
soon as it arrives. If the library declared a different number, the count from
the file wins, and the difference stays in the operations log without on-screen
warnings.

Repository verification checks the document the way it checks pages, comparing
the checksum recorded when it arrived.

## Acting on the page you are reading

The commands for a single page live in the right-hand panel, under **Digital
copies**, in the section at the top about the page open in the viewer. They are
icon commands: the name appears on hover. They stay visible, disabled, when the
viewer is showing another copy.

With a page open you can:

- **download it**, even when the book is not on disk: the page goes into the
  folder of the resolution chosen for that work;
- **download it at maximum resolution**: it is requested again and **replaces**
  the one present, staying the only file for that page;
- **download it again at the book resolution**, which recovers the space when
  the detail is no longer needed;
- **delete it from disk**: the page is excluded and does not come back with a
  new download of the book, nor on its own. Asking for it again readmits it.

When the book is already at maximum resolution both resolution commands are
disabled: they would request the same image.

Below, the real size of that page — the pixels it actually has, which after a
retake are no longer the book's — and its weight. The viewer toolbar keeps only
the reading commands: local-only reading, zoom, thumbnails and the link to the
page on the library site.

The commands about the pages on disk — check, recompress, delete — sit on the
resolution row, not in the section header: that is where you can see what they
act on.

On the item page the copy states how many pages you removed on purpose: without
that line an incomplete copy would look broken.

## Making the pages lighter

The recompression command rewrites **every** page of the copy at a lower
quality, **without changing its dimensions**: it is for when the size is right
and space is the problem. It does not create a second copy of the book and it is
not reversible — to get the previous quality back you download from the library
again.

If a page turns out to need better quality after that, take it at the highest
resolution: it replaces the recompressed one.


## Messages and system log

The bottom panel holds three tabs: messages from the running translation, the
**system log**, and jobs. The system log is available in every area and shows
what the program wrote while working — library searches, downloads, storage,
saves — reading the application log file directly, including the rotated files
from previous sessions.

Filters narrow by area (Library, Translation, Jobs, Interface) and by level
(error, warning, info, debug); the search box works on the text of each line.
Lines produced by third-party libraries — database queries, keyring, network
connections — stay hidden until explicitly requested: on their own they are most
of the file.

"Clear the view" empties the window without touching the file on disk: reloading
brings the lines back. "Load earlier messages" continues reading backwards. The
log folder path is shown in the in-app guide, under troubleshooting.

## Job history and retention

The bottom panel is the operational view: it shows jobs that have not finished
yet plus those completed in the last 24 hours, with pause, resume and retry. The
bin command in its header **takes the finished rows out of the view**, so new
jobs read clearly: it deletes nothing, and a hidden job that starts again comes
back on its own. The cleanup lasts for the current session.

The **full history** lives in the right-hand column of the Overview: it lists
everything that went through the queue, reads in pages and can be narrowed,
widened or closed like the other side columns. Every row expands like in the
bottom panel, with phase, attempts, times, outcome and error.

At the top of the column there is a free-text search over the job name and two
rows of commands: the first filters by outcome (running, succeeded, failed,
interrupted), the second by kind of work. Several choices can be active at once;
the state of each row is a symbol explained on hover, not a word.

No job is ever deleted automatically and there is no cap on the number of rows
kept. Deletion is always explicit: a single row, or — with the bin at the top of
the column — **every finished job the filters are showing**, so all of them when
the filters are off and only the selected ones otherwise. Jobs another surface
still depends on stay — today the executions of a stored search, which will be
removed together with the search itself.
