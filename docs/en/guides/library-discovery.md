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
the library** retrieves fresh metadata and clears manual overrides **only for
the fields the library declares** in that reading: a correction on a field the
library does not provide is kept, along with notes and downloaded files.

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

## The PDF of the work

Some libraries, next to the images, offer the same work as a PDF. They declare
it in their manifest — on the root or on the sequence, depending on the version
of the standard — and that is where Glossa finds it: no addresses built by
analogy.

In **search results** every row states the status, always: “PDF available”,
“PDF not available”, or “PDF not verified” when the manifest could not be read.
The expanded row adds the declared pages and the pixel size of the first page,
the only hint about scan quality available before downloading. The manifest is
read once per work, only for rows on screen, at most two reads at a time, and
never for a result the catalogue already declares without a reproduction.

In the **work record** the PDF is a row of the book section, below the image
copies. It states availability and local status; a command checks with the
library again — useful when the PDF was published later — and the same check
runs on resynchronisation. When the PDF is available it is downloaded from the
same row; when it is on disk, the row states its pages and size and offers the
commands to display it, open it with the system application or delete it.
Deleting it does not touch the images of the same work.

From the same row you choose **what to display**: the PDF or the images. The
viewer always states which of the two copies is on screen, because the pages of
the PDF and those of the image sequence do not correspond and are not merged
into a single browsing sequence.

Stated limits: a PDF over 256 MB does not open in the built-in viewer and must
be read with the system application; for a password-protected or malformed PDF
the pages are not counted, and the record says so rather than inventing a
number. The page is drawn at a fixed resolution: magnified to the maximum it
looks less sharp than IIIF tiles.

Every check has a **deadline**: if the library is busy or does not answer, the
status stays “not verified” and you can try again. No wait is left hanging, and
a slow request does not block the others.

## Archiving and deletion

| Action | Effect |
| --- | --- |
| Archive | Hides the work from the active catalogue and retains files; freeing space is a separate choice |
| Free space | Deletes downloaded images while retaining the record, manifest and thumbnails |
| Delete a local version | Removes only the selected version’s files |
| Delete the work | Removes the record, links, the files of **all** copies — images and document — and the associated cache |

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

