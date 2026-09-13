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
