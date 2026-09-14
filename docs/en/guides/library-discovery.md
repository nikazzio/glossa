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

A command in the viewer toolbar opens the work on the library's own site in the
browser: that link used to live only among the item's information, far from
where it is needed.

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

PDF digitisations can be registered, but Library download and viewing are not
available. Importing text from a PDF into a translation project is a separate
feature. Advanced page management and multiple-page selection are incomplete.
Institutional download restrictions are not enforced automatically; consult
the source’s conditions of use.
