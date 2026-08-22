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

**At what resolution** — Glossa **computes** the size to ask for: from the page dimensions declared in the library's manifest it works out the width that brings the long side to 2000 pixels, and asks for that. There is no negotiation and no extra request per page.

At the start of every book it asks the library one single question, which costs a few seconds on a job that lasts hours, and it serves one purpose: finding out whether that library keeps reduced sizes ready — if it does, asking for one is twice as fast. If the question goes unanswered it is not a problem: the computation carries on, and it works everywhere.

If the library refuses the size asked for, Glossa takes the page at its full size and **keeps it exactly as it is**: it never shrinks anything on its own, because shrinking an image loses something and that must not happen behind your back. That book will take more room, and you get it back whenever you want with the command that shrinks images, which tells you how many pages it touches and how much it frees. That refusal is paid **once per book**, not on every page: from the next one on, Glossa already knows what to do.

Some libraries are slow on purpose: see [Storage and jobs](/en/guides/storage-and-jobs).

## Checking and freeing space

Every row in the Library has five commands, always present: **download**, **check**, **shrink images**, **free space**, **remove**. The ones that do not apply right now stay in place, disabled — so you always know what can be done.

**Check** compares what Glossa registered with what is actually on disk. If something is missing it says so and offers to download it again: pages already there are not requested twice.

From every page it downloads, Glossa derives its **thumbnail**, without asking the library for anything more: thumbnails let you browse the book offline. Until you download, thumbnails are viewed online like the pages.

**Free space** deletes the downloaded pages, right away and for real. The record, the manifest and the thumbnails stay, so the book is still browsable and pages come back when you need them. The confirmation tells you how much you are freeing.

## Removing a source

Removing takes the work away **entirely**: the record, its workspace links, and everything it has in the vault — manifest, thumbnails and downloaded pages. The confirmation tells you how much space you are deleting.

To keep the work and only get the space back, the command is a different one: **free space**.
