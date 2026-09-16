---
title: Library and IIIF viewer
---

# Library and IIIF viewer

The Library contains sources added to your personal catalogue, their metadata
and workspace links. [Search](./source-search) is available in the Dashboard.
IIIF is the protocol used to describe and display many supported digital
copies: a manifest provides metadata, page order and image references.

## Catalogue structure

| Element | Purpose |
| --- | --- |
| Work | Bibliographic record with title, author, date, language and identifiers |
| Digitisation | Digital representation linked to the record, such as an IIIF manifest or PDF |
| Local version | Images from a digitisation stored in the file repository at a particular resolution |

The catalogue does not automatically merge works by title. Manifest identity
prevents the same source from being added twice. A digitisation may have
several local versions, including versions created by resizing images rather
than downloading them.

## Organisation

List and grid views show provenance, declared page count, local resolutions,
disk usage and links. An unavailable count is not equivalent to zero.
Filters narrow the catalogue and can include archived works; saved views retain
filter combinations. Collections group works without moving or duplicating them.

A work can belong to several workspaces and collections. Removing a link does
not delete the record or its files. Download, verification, image reduction,
storage cleanup, archive and deletion controls are in the work’s menu.

## Work details

The detail view places the viewer alongside a panel with four sections:

- **Work:** bibliographic metadata, additional fields and technical references.
- **Digitisations:** registered copies, downloads and local versions.
- **Organisation:** workspace and collection links.
- **Notes:** notes about the work, saved automatically.

Title, author, date and language can be edited manually. Overrides are stored
separately from the original values and can be removed. **Resynchronise with
the library** retrieves fresh metadata and clears manual overrides. Notes and
downloaded files are retained.

## Reading pages

The viewer provides thumbnails, page-number navigation and zoom, and remembers
the reading position. It uses local images when available. Online reading
loads a page image first and may request higher-detail tiles as you zoom in.
Enlarging a local image does not increase its resolution.

A command in the viewer toolbar opens **the page you are looking at** in the
library's own viewer, where the address shape has been verified — today Gallica
and Internet Archive. The link to the whole work sits at the top of the item
page, next to the other commands.

The **Local file / Online file** indicator distinguishes repository files from
remote reading. Its tooltip provides the source, cache status and image
dimensions. Viewer caching is not a permanent download.

When local-only reading is enabled, missing pages display a notice and the
viewer does not request images from the library. This setting applies to the
open work and resets when it closes.

## Saving pages and managing versions

Saving the current page writes the bytes already displayed. It does not request
a new image at the configured resolution; the tooltip shows the actual
dimensions. Reading a partially downloaded version can fill gaps with pages
retrieved during browsing.

Downloading a complete digitisation creates a background job. Requesting a
different resolution creates a separate local version. Each version has its
own controls for opening, resizing and deletion. Resolution policies are
described under [Storage and jobs](./storage-and-jobs).

## Documents served as a single file

Some libraries do not serve the work as a sequence of images but as a single
document. The record then shows a copy of its own, with its own download
command: there are no resolutions to choose, because the file is one and
arrives as it is.

Once the document has arrived, the record states its pages — counted from the
file, not from what the library declares — the space it takes and its status.
Deleting it frees the space and does not touch the images of the same work,
which stay where they are. A command opens the document with the system reader.

Reading happens in the viewer, with the same zoom and page turning as the
images, but it stays **separate**: the pages of the document and those of the
image sequence do not guarantee the same identity, so they are not merged into a
single browsing sequence and the bar always states which of the two copies is on
screen. The selector at the top lists both, with the kind next to the name.

Stated limits: a document over 256 MB does not open inside Glossa and must be
read with the system reader; for a password-protected or malformed document the
pages are not counted, and the record says so rather than inventing a number.
The document page is drawn at a fixed resolution: a scan magnified to the
maximum looks less sharp than IIIF tiles.

## Archiving and deletion

| Action | Effect |
| --- | --- |
| Archive | Hides the work from the active catalogue and retains files; freeing space is a separate choice |
| Free space | Deletes downloaded images while retaining the record, manifest and thumbnails |
| Delete a local version | Removes only the selected version’s files |
| Delete the work | Removes the record, links, repository files and associated cache |

Deletion does not use a recycle bin. Destructive file operations require jobs
that could modify those files to finish or be cancelled; pausing them is not
sufficient.

## Limitations

Importing text from a PDF into a translation project remains a separate
feature: a transcription cannot yet be started from a document kept in the
Library. Advanced page management and multiple-page selection are incomplete.
Institutional download restrictions are not enforced automatically; consult
the source’s conditions of use.

On the item page, under **Digital copies**, the collapsible «Technical data»
section gathers every address of that copy — IIIF manifest, work page,
catalogue record, the open page in the library's viewer, the image of that page,
the library site — each marked by its own symbol, copyable and openable in the
browser. Long addresses read in full on hover.

The library's manifest can be requested there too: it is not dumped as it comes
— its address is right above for that — but read and shown as the library's
statement about the work, with page count, description, catalogue entries and
rights.

## Work data

The item page shows **every** field it knows about, including those the library
did not fill in: an empty field states that the information never arrived, and
from there you can write it yourself. Each row is corrected with the pencil and
keeps the library's original value, which stays readable and restorable.

The essential fields — title, kind of work, author, date, publisher, language —
are always in view. The rest is gathered into collapsible groups: content, copy,
provenance, rights and notes. The groups remember whether they are open, and
that choice applies across the whole Library.

The kind of work is chosen among the expected values, because the catalogue
filters rely on them. Fields holding several values — subjects, other
contributors, rights, provenance — are written on a single line separated by
«·», exactly as they are shown.

