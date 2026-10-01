---
title: Transcribing a document
---

# Transcribing a document

The Transcription Studio is the focused mode for writing and correcting a
document's text: viewer on the left, text in the middle, tools on the right.
It follows the same idea as Translation, applied to transcription.

## The Transcriptions catalogue

The **Transcriptions** area gathers the transcriptions of every workspace and
is organised like the Library: shelves on the right, search and quick filters
above the list, three views — list, covers, table — at the end of the title
row.

Each row shows the transcription name in italics and, below it, the
transcribed work: author, year, place and printer, title. When the name is the
work's own title, which is the name suggested at creation, it is not repeated.
At the end of the row are the workspace, the pages written out of the work's
total, the verified pages and the completion bar. A transcription with no
linked work has no total: it only counts the written pages.

The shelves are **All**, **Recent** (edited in the last 30 days), **Not
started**, **In progress**, **Verified** (every page verified), **No work**
(started from scratch) and **Archived**; archived transcriptions only appear
on their own shelf. Search looks at the name and at every field of the work.
Quick filters narrow by workspace, library and century of the work, with the
count next to each value; the list sorts by name, author, year, last edit or
progress, and groups by workspace or library.

Clicking a row opens the Studio. Hovering a row shows its commands: open the
work in the Library, rename — the name turns into a field, Enter saves, Esc
cancels —, archive or restore, delete. In covers and table view the same
commands are in the three-dots menu. Selecting several transcriptions at once
is not available yet.

## Creating a transcription

From the **Transcriptions** area, use the **+** command next to the title and give it a name.
You can also link it right away to a work already in the Library, searching
by title in the same dialog — optional: without it, the document has no
viewer, a single block of text. From a work's page in the **Library** you
can instead create a transcription directly from that digitization, with
the title already filled in. If the work has both images and a PDF on your
computer, choose which to start from; with only one copy available there's
no choice to make.

From a workspace **Overview**, the Transcriptions section shows only the
documents assigned to that workspace. Open one from the list or use the **+**
command to create one already assigned there.

## The viewer on the left, one text per page

A document created from a work's page in the Library shows the linked
digitization's page on the left, with zoom and panning — change page in the
viewer, and the text on the right changes with it: each page has its own
block of text and its own history. A document created from scratch in
Transcriptions has no digitization to show: a notice appears in place of the
viewer, not an error, and it stays a single block of text.

At the top, a document tied to a work presents it as the Library page does —
author, year, place, and printer above, title below — with the link out to the library's site.
The three-dot command offers only "Remove transcription": downloading,
verifying, or archiving the work stay commands of the Library page, not of
the Studio.

## Writing and saving

Text saves after 30 seconds without changes. The indicator in the top right
distinguishes unsaved text from a save in progress, completed, or failed, with
a command to retry on failure. To save a version to the history right away,
use the disk command next to the indicator, or **Ctrl + S** even while typing
on the page: the command stays off when there is nothing new to save, and the
version is created without a name — pin it in the history to give it one.
Changing page or leaving the Studio normally
saves pending text immediately. A forced shutdown before a save can lose the
latest edits.

When the text is ready, mark it as **verified** with the lock next to the
"Page N" title: the text becomes locked, so an already-checked transcription
doesn't get overwritten by accident. You can return it to draft at any time
with the same command.

While the viewer is still opening the chosen page, a veil covers the text
and history with a spinner in the middle: writing or restoring stay
disabled until the page is actually shown. If opening fails, a warning
appears in place of the spinner, with the same block.

## Switching source, images or PDF

If the work has both copies, two commands in the viewer's bar switch
between them. If the two declare the same number of pages, the switch is
smooth: same numbering, the text follows. If the number doesn't match,
switching to the secondary copy detaches the viewer from the text — browse
it freely to find what you need, while the text pages through its own
arrows, next to the "Page N" title. Switching back to the main copy
restores the link on its own.

A third command detaches the link **regardless** of page counts, even
while staying on the main copy: handy for glancing at a different page
without moving where you're writing.

## Automatic page reading (OCR)

In the **OCR** tab, on the right, you can have the text of the open page
read by a connected AI model — the same mechanism already used for
Translation, with providers and keys already configured. The command
appears disabled until the conditions are met: the page must belong to a
digitization linked to the document, and a provider and model that can read
images must be chosen, either for the document or inherited from the
workspace settings. The reason a command is disabled is always in its
tooltip.

The text that comes back enters the history as a normal revision, marked
"Automatic recognition": it never overwrites what's there, it stays
editable like any other version, and a later manual correction simply
creates the next revision.

The prompt that guides the reading belongs **to the document**: you edit it
from any page and it applies to every page of that document, but to no other.
A new document starts from the prompt chosen in the workspace settings, under
OCR, where you can also load one from the prompt library. To reuse a prompt in
another document, save it to the library from the edit command, then load it
there. The reset command brings the document back to the workspace prompt.

The model receives the page image and the prompt, without the page number: the
library's printed numbering rarely matches the position in the scan and would
only confuse the reading.

Under the model, two small circles choose which image is sent:

- **optimised**: reduced to the long side chosen in Settings, Transcriptions
  tab (1500, 2000, 2500 or 3000 pixels), and recompressed. A smaller image is
  not enlarged;
- **copy on this computer**: the same image as the viewer, unchanged — the
  downloaded book's page, or the one saved in the cache while browsing online.
  Online it can be smaller than the optimised one, because the viewer asks the
  library for a ready-made size. If the copy is missing (cache emptied by its
  space limit, book only partly downloaded) the optimised one is sent.

The starting choice is in Settings; in the Studio you change it for the
session, without it being saved in the document. With the right panel closed,
the reading command stays under the reopen command.

While a page is being read its sheet is veiled and stays read-only, even
after a cancellation request, until the job actually stops.
Text you are still editing on another page is not replaced when reading finishes.
A pill in the top row of the text column names the page being read, and stays visible even if you page
ahead in the meantime.

The reading starts in the queue, like a download: you'll find it in the
jobs panel while it runs, with the option to pause or cancel it the same
way. A passing problem — the service asking you to slow down, a connection
dropping for a moment — is retried on its own; a wrong key, a missing model or
an empty answer is not, because retrying would give the same answer. An empty
answer usually means the model found no text on the page.

Open the bottom panel and choose **Transcription log** — it only shows up
here, inside a transcription document, mirroring the Translation log you see
inside a project. Every reading leaves four rows: the start with provider and
model, the image that was sent with its real size, weight and origin (downloaded book, cache or library), the full prompt that
was sent (expandable row by row), and the outcome with duration, tokens,
estimated cost and the number of the revision created. On top there are
search, filters by row type and by level, and grouping by page.

## History, summary and metadata

Every save stays in that page's history, in the panel on the right: it
shows who wrote that version — manual correction, automatic recognition, or
import — and when. The command on each history entry brings that version's
text back as a new save, without overwriting earlier versions, even after a
restore. Changing page changes the history shown, too.
You can consolidate any version and give it a name, which you can edit later.
Consolidated versions appear above ordinary saves without duplicating their
text. Remove a name to move a version back to ordinary history. You can
delete older versions one by one, or use **Clear history** to delete older
ordinary saves. Consolidated, current, and verified versions survive the
cleanup. The current and verified versions cannot be deleted. Deleting a
version removes the ability to restore its text.

The **Summary** tab follows the Translation summary layout: it shows pages
with text, word count, verified pages, and progress. It also shows completed
OCR readings, tokens, and estimated cost.

The **Metadata** tab, next to History, shows the raw data saved for the
current page: position, label, status, and revision count. It's there to
show what's recorded today; how it's presented will change.

## Current limits

Automatic recognition reads one page at a time, picked by hand in the
Studio: there's no command yet to read a range of pages in one pass, or to
read the whole document. It only works on digitizations linked through an
IIIF manifest — a single-file work (PDF) isn't supported yet. The model
doesn't yet receive the text of nearby pages as continuity context — only
the current page's image and the configured prompt. The viewer doesn't yet
have visual filters (brightness, contrast, inversion).
