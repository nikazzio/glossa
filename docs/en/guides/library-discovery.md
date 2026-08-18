---
title: Library and IIIF sources
---

# Library and IIIF sources

Source research starts from the Dashboard. The Library is your personal catalogue of sources you've chosen to add.

## Search for a source

On the Dashboard, choose an archive, enter a query, and start it with the search icon. Internet Archive currently supports keyword search; the generic IIIF provider instead opens an IIIF manifest URL.

Each result shows a thumbnail and essential data. Select it to expand the card with its full title, description, and all available metadata. Switch view from the icon next to the search: three or four cards per row, or a compact list — the icon always shows the one currently active.

Searching never downloads material.

## Adding a source to the Library

Every result has two actions:

- **Add to Library** — saves it to your personal catalogue, without linking it to any workspace.
- **Add to a workspace** — opens your list of workspaces: pick one to link the source there right away, in addition to saving it to the Library.

A source is unique per manifest: adding it again never creates a duplicate — it just links the newly chosen workspace.

## Personal Library

The Library always shows **every book**: it is a catalogue, not the view of a workspace.

On each card, next to the commands, you see **which workspaces that book belongs to**: one label each. Clicking a label unlinks it from there; the command beside them opens the list of workspaces it is not in yet, to link it. **A work can live in several workspaces at once** and is never duplicated: linking it in two places does not make two copies, neither of the data nor of the files.

The card's commands come in two groups: first what you do to the book — download, check, free space, delete — then where it lives.

Opening a source shows its detail with recorded versions and the list of all your workspaces, where you can link or unlink it from each one.

## Downloading a source

Every row in the catalogue says **how many pages are actually on your computer**: *online only*, *34 of 210 pages on your computer*, or *all pages on your computer*.

The **download** command queues the real job: you can switch screen, pause it, resume it. While it runs the command is replaced by the percentage; the jobs panel at the bottom shows the same thing with the work's name and how much has been downloaded.

When a source is entirely on your computer the command **disappears** and a tick takes its place: there is nothing left to ask the library, and with courtesy limits a whole manuscript can cost a quarter of an hour of network time.

**At what resolution** — Glossa asks for the size closest to 2000 pixels on the long side among those the library declares it can produce. If the library refuses that request, Glossa asks what it can produce and retries with the closest size: this is not an error and needs nothing from you.

Some libraries are slow on purpose: see [Storage and jobs](/en/guides/storage-and-jobs).

## Checking and freeing space

Every row in the Library has four commands, always present: **download**, **check**, **free space**, **remove**. The ones that do not apply right now stay in place, disabled — so you always know what can be done.

**Check** compares what Glossa registered with what is actually on disk. If something is missing it says so and offers to download it again: pages already there are not requested twice.

From every page it downloads, Glossa derives its **thumbnail**, without asking the library for anything more: thumbnails let you browse the book offline. Until you download, thumbnails are viewed online like the pages.

**Free space** deletes the downloaded pages, right away and for real. The record, the manifest and the thumbnails stay, so the book is still browsable and pages come back when you need them. The confirmation tells you how much you are freeing. If some page cannot be deleted — a write-protected disk, a file held open by another program — Glossa says so and frees **nothing**: the page count and the files on disk stay in agreement, instead of claiming space you did not get back.

## Removing a source

Removing takes the work away **entirely**: the record, its workspace links, and everything it has in the vault — manifest, thumbnails and downloaded pages. The confirmation tells you how much space you are deleting. If the folders cannot be deleted, the work **stays in the Library** and you can try again: vanishing while leaving the files behind would mean gigabytes on the disk that no screen can show you any more.

To keep the work and only get the space back, the command is a different one: **free space**.
