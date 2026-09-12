---
title: Library and IIIF sources
---

# Library and IIIF sources

The Library is your personal catalogue of the sources you chose to keep. It holds the bibliographic record of every work, the digital copies libraries make available, the images you downloaded to your computer and the links to your workspaces.

This guide follows the whole path: find a source, add it to the catalogue, read it in the viewer, download it, manage the space it takes. The settings that govern sizes and network pace are described in [Storage and jobs](/en/guides/storage-and-jobs).

## Work, digitisation and local version

Three different levels, kept apart because they answer different questions.

- **Work** — the book as a bibliographic object: title, author, date, language, shelfmark. It is the catalogue record.
- **Digitisation** — the digital copy produced by a library. Two libraries that photographed the same manuscript give two distinct works in the catalogue, because their shelfmarks differ; the same library may instead offer the same copy in different formats, for example as a sequence of images and as a PDF.
- **Local version** — the images on your computer, at a given size in pixels. You can hold more than one for the same book: the one downloaded from the library and the one Glossa derived to take less space.

## Search for a source

Search starts from the Dashboard: choose a library, type what you are looking for, start it with the search icon. Searching downloads nothing.

Libraries do not have the same capabilities, and Glossa states what each one accepts:

- **Europeana** — keywords. Not a library but the index of hundreds of European institutions: it finds a work without knowing in advance who holds it. It needs its own key, free of charge, pasted into **Settings → Library → Libraries**. Glossa keeps only results that declare a readable reproduction, and states for each who holds the original, which may be a different institution from the one that answered.
- **Wellcome Collection** — keywords. Its catalogue also describes books kept in stores and never digitised: Glossa asks from the start only for those with a reproduction, so every result you see can be opened.
- **Internet Archive** — keywords, or the address of the detail page.
- **Vatican Library** — the shelfmark, however you write it (`Urb. lat. 1779`, `urb-lat-1779`, `Urblat1779` all reach the same manuscript), the address of the reading page, or words to search its catalogue.
- **Gallica** — the ARK identifier, a Gallica address in any shape, or words to search by title. If you type a word that looks like an identifier, Gallica searches first: better a few results than a work that does not exist.
- **e-codices** — the compound shelfmark (`bbb-0264`), the address of the reading page, or words to search.
- **Library of Congress** — keywords, or the address of a catalogue item (`loc.gov/item/...`, `loc.gov/resource/...`). The catalogue holds far more than Glossa can open: results without a readable reproduction are not listed.
- **Harvard Library** — the object token (`drs:123456`, `ids:123456`), which also appears inside its viewer addresses. No keyword search: its interface answers "too many requests" to every attempt, tried from two different networks. The general catalogue number does not work: it does not lead to a reproduction.
- **Cambridge University Digital Library** — the viewer address or the shelfmark in its dashed form (`MS-ADD-03996`). No keyword search: its site blocks automated requests after a few queries.
- **Digital Bodleian** — keywords or the object address. It is the only one that declares the manifest address of each result itself, instead of having it derived from the identifier.
- **Heidelberg** — the shelfmark (`cpg848`) or the viewer address. No keyword search: its public search cannot be queried by a program.
- **Biblioteca Estense** — keywords or the work identifier, including one taken from a Mirador viewer address.
- **Institut de France** — keywords, the record number (`17837`) or one of its addresses.
- **e-rara** — the record number (`198`) or one of its addresses. Swiss early printed books. No keyword search: its search page answers with a bot check.
- **e-manuscripta** — the record number (`992548`) or one of its addresses, for Swiss manuscripts. Same platform as e-rara, same limit on search.
- **Bayerische Staatsbibliothek (MDZ)** — the Munich identifier (`bsb00026283`) or one of its addresses. It publishes manifests and metadata harvesting, not a search that can be queried live.
- **Direct IIIF URL** — the full address of a manifest, from any institution, including ones not listed.

Results appear as a list, each with a thumbnail and essential data: author, date, **how many pages the work has**, and which library it comes from. The page count is visible without expanding the row, because that is what makes you decide whether the work is worth a look. When the catalogue does not declare it — which happens with manuscripts — the entry is simply absent, rather than showing a zero that would be untrue. Selecting a result expands the row to show its full title, description, and all available metadata.

For every result Glossa keeps **everything the library said**, including data no screen shows today: searching again tomorrow to recover it would be wasted work, and the library might not give it back the same.

## Adding a source to the catalogue

Every result has two actions:

- **Add to Library** — saves it to your personal catalogue, without linking it to any workspace.
- **Add to a workspace** — opens your list of workspaces: pick one to link the source there right away, in addition to saving it to the Library.

A source is unique per manifest: adding it again never creates a duplicate — it just links the newly chosen workspace.

## The catalogue

The Library is a catalogue, not the view of a workspace: it shows works from every workspace together. Archived works stay out until you ask to see them, with the dedicated command among the filters. The command above the results switches between list and grid.

### What a row says

The whole informative part of the row — cover, title, data — opens the work with one click, and behaves the same in list and in grid.

Under the title there is a **data line** with separators: source library, declared pages, sizes present on your computer, space used. For example:

```
Vatican Library · 328 pp. · 2000+4000 px · 742 MB
```

With nothing local, the last entry reads `online`. When something is there, a **short bar** appears at the end of the same line with the count beside it: green and `100%` for a complete book, amber and `120/328` when pages are missing.

Below the data line sit the **link chips**: the workspaces the work belongs to and the collections it is part of. Clicking one unlinks it; the two commands beside them open the list of workspaces and collections the work is not in yet. **A work can sit in several workspaces and several collections at once** and is never duplicated: linking it in two places does not create two copies, neither of the data nor of the files.

### Row commands

The commands that act on files and on the record all live in the **"···"** menu — download, check, shrink images, free space, and further down, after a separating line, archive and remove. Only the links stay on the row itself: the workspace and collection chips, with the two commands to add more. The ones that do not apply right now stay in place, disabled, so you always know what can be done. Keeping the trash icon outside the menu would mean having it one click away on every row of a long catalogue.

### Filters, sorting and saved views

**Filters** live in a right-hand column that resizes and collapses like the other side panels: its width and open state are remembered, and when it is closed a count says how many filters are active. Search sits at the top — type a title or an author — and below it work type, language, source library, availability, workspace and collection. The workspace filter shows the works linked to the one you pick, or — with the last entry — only those in no workspace at all. Filters work on what you already have in front of you, with no reload. Language and source library only offer values actually present in your catalogue; work type and availability always list every supported entry, and workspace and collection list the ones you created even when no work uses them. The eraser command clears everything.

**Sorting** — The last dropdown decides the order: by title (as it starts), by author (works without an author go last) or by date added, newest first. The chosen order is part of saved views too.

**Saved views** — The bookmark command opens saved views: give a name to the filter combination you are using and find it there with one click. Every view can be deleted. A view saved when filters were different keeps working: whatever is no longer recognised simply goes neutral.

**Collections** — A collection is a label that gathers works, and it keeps materials from the same research together without moving them. You add it from the catalogue row or from the work's record, and a work can sit in several collections at once: nothing is merged and nothing is duplicated, and removing a label touches neither the work nor the other collections.

## The work's record

Clicking the informative part of a row opens the **work's record**, full width. The screen is split in two: the page viewer in the middle, and on the right a column of information in tabs that can be resized and collapsed.

At the top, on a single row: on the left the command back to the catalogue, the title and the date; in the middle **which digitisation you are reading**, with the link to the library site and, when there is more than one, the dropdown to switch; on the right the work's commands. The open copy is always stated, even when it is the only one.

### The four tabs

- **Work** — the bibliographic data: title, kind of work, author, date, language, publisher, other contributors, rights, physical description, subjects, volume, description, place of origin, provenance, notes, series, genre and form, standard identifier, coverage, related works. A field the library does not declare shows "—" instead of disappearing, so every record reads the same way. Rarely used fields sit under **Other metadata**; internal references — manifest address, protocol, technical identifiers — sit under **Technical data**, closed on open and with a command to copy them.
- **Digitisations** — the recorded digital copies and the local versions. The download command with its size sits at the top; below it, one row per version present on your computer.
- **Organisation** — the workspaces and collections the work is linked to.
- **Notes** — a formatted editor for your own notes on the work. It opens in preview and saves on its own; the saving state is written next to the title.

Next to the tab icons the name of the open tab is written out, as in the other panels of the application.

### Correcting bibliographic data

Title, author, date and language can be corrected by hand: the pencil command opens the field, Enter saves, Esc cancels. A corrected field carries a mark next to its label; hovering it you read what the library said, and the command next to the value restores the original.

**The original data is never overwritten**: the correction lives separately, so you can always go back. Retyping exactly the library's value leaves no correction mark, because there is nothing to flag. The other fields do not have an edit command in this record yet.

**Resync with the library** — The command in the data section header asks the library for the record again and rewrites the data with what just arrived. **Corrections made by hand are discarded**: after a resync the record says what the library says, and a title you had fixed must be fixed again. Your notes stay, and downloaded pages stay: resyncing concerns bibliographic data, not files.

### Local versions

Every version present on your computer has its own row, stating the size in pixels, its origin (downloaded from the library or derived by Glossa), page coverage, space used and state. The commands sit **on that row** — read it in the viewer, shrink it, delete only it — because in the section header it would not be clear which version they act on.

The list is always re-read from the vault, so a version created a moment ago appears right away, without reopening the work.

## The page viewer

You browse the book page by page, with thumbnails in the left column. The viewer bar keeps navigation on the left — the command to open and close thumbnails, previous and next page, a field to jump to a number, the current page number — the image's origin in the middle and the commands on the right.

Glossa remembers where you were: reopening the book takes you back to that page.

### Where the image comes from

In the middle of the bar it says **where the page you are looking at comes from**, in two words: **Local file** when the page is on your computer, **Online file** when it is not. The dot next to it says the rest: off for a file of yours, **amber** when the page comes from the cache — you already saw it in this session, but it will not survive closing — and **green** when it has just arrived from the library. Hover it to read the full origin and the pixels you are actually looking at.

The viewer **uses what you have on your computer**. If you downloaded the book, pages and thumbnails are read from disk: they appear at once, cost no request to the library and work with no connection at all. If you have nothing, the page is requested from the library **in one go**, as a whole image: that is the fastest way to see it.

If a page is on your computer at a better size than the one you set, that is the one you see: the size chosen in the settings says what to ask the library for, not how much to degrade what you already own.

If you delete the local pages while reading, Glossa notices that the copy is gone: the page stays readable, and the following ones are requested from the library instead of being looked for in a folder that no longer exists.

### Read local files only

Among the commands on the right, next to the one that saves the page, there is **read local files only**: switched on, the viewer stops asking the library anything and a page you do not have shows a notice instead of the image; switched off, missing pages come from the library again. It applies to the open book and turns off when you close it.

### Saving the open page

The command that saves the page keeps **only the open one**, using the same bytes you are already looking at: it does not request them twice. While it saves, the icon spins; once the page is on your computer the command gives way to a green mark, which is a state and not a disabled button. The tooltip writes **how many pixels** will be saved: those of the page in front of you, which on a book still entirely online may not match the configured size.

The Digitisations tab updates right away: space, count and local versions do not wait for the work to be reopened.

**Browsing a half-downloaded book, the gaps fill themselves.** The missing pages stay on your computer without you starting anything: the count on the record grows as you read, and reopening those pages costs no request at all.

### Zoom and detail

Zoom goes well beyond the page's real size: magnifying a lot makes the image grainy, but a marginal note becomes readable. Reading online, past the real size Glossa switches on its own to the true detail requested from the library. On a book read from disk, magnification stays that of the size you downloaded: bigger on screen, not sharper.

When the book's index declares ready-made sizes, Glossa uses the smallest one that stays sharp in the viewer. Otherwise it immediately uses a halving of the page, without waiting for an extra technical request before showing you the image. Thumbnails already shown stay available as you scroll back and forth; pages already seen are taken from the cache, not from the library.

Some libraries build images at the moment you ask for them: there the first opening can take a minute, and Glossa knocks once more instead of giving up. On those libraries a single page, at a given size, sometimes never arrives: Glossa asks for it at another size, which usually does arrive, instead of declaring it broken. The notice about a long wait appears only where that explanation is true.

## Downloading a source

The **download** command queues the real job: you can change screen, pause it, resume it. While it runs, a percentage replaces the command; the jobs panel at the bottom shows the same thing with the work's name and how much it has downloaded.

When a source is entirely on your computer the command **disappears**, and a check mark stays in its place: there is nothing left to ask the library, and with courtesy limits a whole manuscript can cost a quarter of an hour of network time.

**At what resolution** — Glossa **calculates** the size to request: from the page dimensions the library's manifest declares, it derives the width that brings the long edge to the size chosen in the settings, and asks for that. There is no negotiation and no extra request per page.

At the start of each book it asks the library a single question, which costs a few seconds on a job of hours, to learn whether that library already keeps reduced sizes ready: if it does, asking for one is twice as fast. If the question gets no answer, the calculation carries on, and it works everywhere.

If the library refuses the requested size, Glossa takes the page at its full dimension and **keeps it as it is**: it does not shrink anything by itself, because reducing an image loses something and that must not happen behind your back. That book will take more space, and you recover it whenever you want with the command that shrinks images. The refusal is paid **once per book**, not per page.

Asking for a size different from one already present creates a **second local version** beside the first, it does not replace what you have. If a download for that book is already running, the command says so instead of ignoring the request.

With some libraries' limits, downloading is slow by design: see [Storage and jobs](/en/guides/storage-and-jobs).

## Checking and freeing space

**Check** compares what Glossa recorded against what is really on disk. If something is missing it tells you and offers to download it again: pages already present are not requested twice.

From every page it downloads, Glossa derives its **thumbnail**, without asking the library for anything more: thumbnails let you browse the book offline. Until you download, thumbnails are viewed online like the pages.

**Shrink images** starts from a local version and derives a smaller one at the chosen size and quality, without changing the original. The two stay side by side, each with its own commands.

**Free space** deletes the downloaded pages, right away and for real. The record, the manifest and the thumbnails stay, so the book is still browsable and pages come back when you need them. The confirmation tells you how much you are freeing.

## Archiving a work

When a work is no longer part of your daily work but you do not want to lose it, **archive** it: it leaves the list without leaving the Library. To see archived works again, switch on the box command among the filters; from there the same command on the row brings it back to the catalogue.

Archiving concerns **the list only**: pages already downloaded stay where they were. Since that is the moment you think about it, Glossa then asks whether you also want to free the space that work takes. You can say no and do it later, or never: nothing is deleted unless you ask.

## Removing a source

The removal command takes the work away **entirely**: the record, the workspace links, everything it holds in the vault — manifest, thumbnails and downloaded pages — **and the pages kept in the cache too**. It is the only moment when Glossa throws away what it had set aside: that way space is really freed, and adding the same work again means its pages are requested from the library once more. The confirmation tells you how much space you are removing.

If you want to keep the work and only recover space, the command is a different one: **free space**. If you only want it out of the way without losing it, **archive** it: removal has no second thoughts, the archive does.

## Library settings

They live in **Settings → Library**, in three tabs:

- **Libraries** — one row per library, with the network profile it follows and the way images are requested from it.
- **Images** — the size of pages, the size of thumbnails and the values used to derive reduced versions.
- **Settings** — the network profiles, that is the pacing shared by several libraries, with explicit saving.

The page size is a cap, not an obligation: pages already smaller are taken as they are. The same choice can be made on a single work, and there it wins, because the size depends on the material and not on who keeps the book. Details of profiles and network controls are in [Storage and jobs](/en/guides/storage-and-jobs).

## Current limitations

- **PDF** — a PDF digitisation appears among the copies, with its name and the link to the library, but it is not downloaded and not read inside Glossa. The download command is not offered for those copies, instead of letting it fail. Importing the text of a PDF into a translation project is a different thing, and it already works.
- **Search** — six sources search by keyword: Europeana, Wellcome Collection, Internet Archive, Vatican, Gallica and e-codices. Library of Congress depends on your network. The others — Harvard, Cambridge, Heidelberg, e-rara, e-manuscripta, MDZ — open by identifier or address, and say so in the field's example: their searches either cannot be queried by a program or refuse automated requests. There is still no single search across several sources, but Europeana covers many of them in one request.
- **Single page** — saving the open page is possible; choosing the size for that page, replacing it, deleting it or selecting several from the thumbnails are still to be completed.
- **Download restrictions** declared by institutions are not enforced automatically yet.

The current state of what is missing is on the [beta status](/en/project/status) page.
