---
title: Library and IIIF sources
---

# Library and IIIF sources

Source research starts from the Dashboard. The Library is your personal catalogue of sources you've chosen to add.

## Search for a source

On the Dashboard, choose a library, type what you are looking for, and start it with the search icon.

What each one accepts:

- **Internet Archive** — keywords, or the address of the detail page.
- **Vatican Library** — the shelfmark, however you write it (`Urb. lat. 1779`, `urb-lat-1779`, `Urblat1779` all reach the same manuscript), the address of the reading page, or words to search its catalogue.
- **Gallica** — the ARK identifier, a Gallica address in any shape, or words to search by title. If you type a word that looks like an identifier, Gallica searches first: better a few results than a work that does not exist.
- **e-codices** — the compound shelfmark (`bbb-0264`), the address of the reading page, or words to search.
- **the other libraries listed** — for now only the full IIIF manifest address.

Searching downloads nothing.

Results appear as a list, each with a thumbnail and essential data: author, date, **how many pages the work has**, and which library it comes from. The page count is visible without expanding the row, because that is what makes you decide whether the work is worth a look. When the catalogue does not declare it — which happens with manuscripts — the entry is simply absent, rather than showing a zero that would be untrue. Selecting a result expands the row to show its full title, description, and all available metadata.

For every result Glossa keeps **everything the library said**, including data no screen shows today: searching again tomorrow to recover it would be wasted work, and the library might not give it back the same.

Searching never downloads material.

## Adding a source to the Library

Every result has two actions:

- **Add to Library** — saves it to your personal catalogue, without linking it to any workspace.
- **Add to a workspace** — opens your list of workspaces: pick one to link the source there right away, in addition to saving it to the Library.

A source is unique per manifest: adding it again never creates a duplicate — it just links the newly chosen workspace.

## Personal Library

The Library always shows **every book**: it is a catalogue, not the view of a workspace.

On each card, next to the commands, you see **which workspaces that book belongs to**: one label each. Clicking a label unlinks it from there; the command beside them opens the list of workspaces it is not in yet, to link it. **A work can live in several workspaces at once** and is never duplicated: linking it in two places does not make two copies, neither of the data nor of the files.

The card's commands come in two groups: first what you do to the book — download, check, shrink images, free space, archive, delete — then where it lives.

The **filters** live in a column on the right, which resizes and folds away like the other side panels: its width and its open or closed state are remembered, and when it is closed a count tells you how many filters are active. Search sits at the top — type a title or an author — and below it the kind of work, language, source library, availability, workspace and collection. The workspace filter shows the works linked to the one you pick, or — with the last entry — only the works that sit in no workspace at all. Filters work on what is already in front of you, with nothing to reload, and the dropdowns only offer values actually present in your catalogue. The eraser command clears them all.

**Sorting** — The last dropdown sets the order: by title (the starting point), by author (works with no author go last), or by date added, most recent first. The chosen order is part of a saved view too.

**Saved views** — The bookmark command opens your saved views: give the current filter combination a name and find it there with one click. Any view can be deleted. A view saved when the filters were different still works: whatever is no longer recognised simply goes neutral.

**Images on your computer** — On each work's row, next to the page count, a **round green icon** says what you already downloaded: filled when every image is there, dashed with the count beside it when some are missing. No icon means the work only exists online. Hovering it, Glossa spells it out.

**Collections** — A collection is a label that gathers works. You add one from the work's page, and a work can sit in **several collections at once**: nothing is merged and nothing is duplicated, and removing a label touches neither the work nor the other collections. From the search bar you can show only the works in one collection.

Clicking the title opens the **work's page**, full width, with every bibliographic detail Glossa knows for that book: title, kind of work, author, date, language, publisher, other contributors, rights, physical description, subjects, volume, description, place of origin, provenance, notes, series, genre/form, standard identifier, coverage, related works — a field the library does not declare shows "—" instead of disappearing, so every work's page reads the same way. There is also availability, space used and status, the recorded digital copies with their quality cap, the workspaces you can link it to or unlink it from, and the work's commands gathered at the top. The large part of the page holds the **page viewer**: you browse the book page by page, with thumbnails alongside, previous and next commands, a field to jump to a number, and zoom. Glossa remembers where you were: reopening the book takes you back there.

The viewer **uses what you have on your computer**. If you downloaded the book, pages and thumbnails are read from disk: they appear at once, cost the library no request at all, and work with no connection. If you have nothing, the page is asked for **in a single request**, as a whole image: it is the fastest way to see it. Zoom past its sharpness and the viewer switches to tiled zoom on its own, asking the library only for the detail you need. Some libraries build the images the moment you ask for them: there the first opening can take a minute, and Glossa knocks a second time instead of giving up — which is why some books would not open at all before. On those libraries a single page at a particular size sometimes never arrives: Glossa asks for it at another size, which usually does, instead of calling it broken. The notice about the long wait appears only where that explanation is true, not for every library.

**Zoom** now goes well past the page's real size: magnify a lot and the image gets grainy, but a marginal note becomes readable. Reading online, once you pass the real size Glossa switches on its own to the true detail asked of the library — it never got there before, because the zoom limit sat below that threshold. On a book read from disk, magnification stays bound to the size you downloaded: bigger, not sharper.

When the book index already declares ready-made sizes, Glossa uses the smallest
one that remains sharp in the viewer. Otherwise it immediately uses a halving
of the page: it does not wait for an extra technical request before showing the
image.
Thumbnails that have already appeared remain available while you scroll back
and forth; previously viewed pages are also read from the working cache, not
from the library again.

The download command in the viewer keeps **only the open page**, using the same
bytes you are already looking at: it does not request them twice. While it
saves, the icon spins; once the page is on your computer the command gives way
to a green mark, which is a state and not a disabled button. The tooltip always
says **at what size** it keeps — the size the page arrived at, which on a book
still entirely online may differ from the configured one. The Digitisations tab
updates right away: space, count and local versions do not wait for the work to
be reopened.

The viewer's commands all sit on the right — keep the page, zoom out, zoom in,
more zoom options — the image's origin sits in the middle, and page navigation
on the left, with the thumbnails.

In the middle of the bar it says **where the page you are looking at comes from**, and these are three different things: **Local file** when it is yours, **Temporary memory** when it is a page you already saw of a book you never downloaded, **Library online** when it has just arrived — green while the library answers, dimmed when nothing arrives. Hover it to also read the size that was requested.

If you delete the local pages while you are reading, Glossa notices by itself that the copy is gone: the page stays readable, and the next ones are asked of the library instead of being looked for in a folder that no longer exists.

**Browsing a half-downloaded book, the gaps fill themselves.** The missing pages stay on your computer without you starting anything: the count on the card grows as you read, and reopening those pages costs no request at all. The arrow command takes you back to the catalogue.

**Correcting the details** — Title, author, date and language can be corrected by hand: the pencil command opens the field, Enter saves, Esc cancels. A corrected field carries a mark next to its label; hover it to read what the library said, and the command next to the value restores the original. **The original is never overwritten**: the correction lives apart, like glossary corrections, so you can always go back. Typing exactly the library's value leaves no correction mark, because there is nothing to flag. The other fields have no edit command on this page yet.

## Downloading a source

Every row in the catalogue says **how many pages are actually on your computer**: *online only*, *34 of 210 pages on your computer*, or *all pages on your computer*.

The **download** command queues the real job: you can switch screen, pause it, resume it. While it runs the command is replaced by the percentage; the jobs panel at the bottom shows the same thing with the work's name and how much has been downloaded.

When a source is entirely on your computer the command **disappears** and a tick takes its place: there is nothing left to ask the library, and with courtesy limits a whole manuscript can cost a quarter of an hour of network time.

**At what resolution** — Glossa **computes** the size to ask for: from the page dimensions declared in the library's manifest it works out the width that brings the long side to 2000 pixels, and asks for that. There is no negotiation and no extra request per page.

At the start of every book it asks the library one single question, which costs a few seconds on a job that lasts hours, and it serves one purpose: finding out whether that library keeps reduced sizes ready — if it does, asking for one is twice as fast. If the question goes unanswered it is not a problem: the computation carries on, and it works everywhere.

If the library refuses the size asked for, Glossa takes the page at its full size and **keeps it exactly as it is**: it never shrinks anything on its own, because shrinking an image loses something and that must not happen behind your back. That book will take more room, and you get it back whenever you want with the command that shrinks images, which tells you how many pages it touches and how much it frees. That refusal is paid **once per book**, not on every page: from the next one on, Glossa already knows what to do.

Some libraries are slow on purpose: see [Storage and jobs](/en/guides/storage-and-jobs).

## Checking and freeing space

Every row in the Library has six commands, always present: **download**, **check**, **shrink images**, **free space**, **archive**, **remove**. The ones that do not apply right now stay in place, disabled — so you always know what can be done.

**Check** compares what Glossa registered with what is actually on disk. If something is missing it says so and offers to download it again: pages already there are not requested twice.

From every page it downloads, Glossa derives its **thumbnail**, without asking the library for anything more: thumbnails let you browse the book offline. Until you download, thumbnails are viewed online like the pages.

**Free space** deletes the downloaded pages, right away and for real. The record, the manifest and the thumbnails stay, so the book is still browsable and pages come back when you need them. The confirmation tells you how much you are freeing.

## Archiving a work

When a work is no longer part of your daily work but you do not want to lose it, **archive** it: it leaves the list without leaving the Library. To see archived works again, switch on the box command in the search bar; from there the same command on the row brings it back to the catalogue.

Archiving is **about the list only**: pages already downloaded stay where they were. Since this is the moment you notice them, Glossa then asks whether you also want to free the space that work takes. You can say no and do it later, or never: nothing is deleted unless you ask.

## Removing a source

Removing takes the work away **entirely**: the record, its workspace links, everything it has in the vault — manifest, thumbnails and downloaded pages — **and the pages held in working memory too**. It is the only moment when Glossa throws away what it had set aside: that way the space is really freed, and adding the same work again means asking the library for its pages once more. The confirmation tells you how much space you are deleting.

To keep the work and only get the space back, the command is a different one: **free space**. To simply get it out of the way without losing it, **archive** it: removal has no second thoughts, the archive does.
