---
title: Source search
---

# Source search

The Dashboard provides a single **Search** screen: one field to look for works
in the libraries and to open directly a work whose identifier or address you
know. Results remain separate from your personal catalogue until you add them
to the Library.

## Searching

Search opens from the left-hand rail, under Dashboard.

To the left of the field you choose **where to search**: all libraries, a
single one, or a custom choice. “All” means the libraries that search by
words, not aggregators: Europeana and Internet Archive multiply results from
other institutions and are added on purpose in the **advanced criteria**, the
first tab of the right-hand column, where sources are ticked one by one.
Europeana requires an API key under **Settings → Library → Libraries**. The
chosen sources stay for later searches.

Words go in the field and the control beside it starts the search. The
advanced criteria control opens title, author, printer, holding institution,
language, material and years. You can also search by fields alone, without
free words. Another control starts a new search, clearing words and criteria
while keeping the chosen sources.

Above the results you choose the order: **by relevance** (the order in which
libraries answer), **by year**, **by author** or **by title**; results without
the value go last. When some source has more results, the command at the
bottom of the list asks every source that has them: it stays in place and spins
until the new pages have arrived, and the added results come in with a short
fade.

Starting a search records its criteria. Each result page from each source is an
independent job, so a slow or failed source does not prevent others from
returning results. The **Sources** tab, on the right, has one row per library
with state, number of results received, a “retry” command after an error, and
the filter to look at that source only. Pausing, restarting and attempts live
in the jobs panel. Earlier searches reopen from the **Searches** tab, which
keeps their criteria and results.

## Bibliographic criteria

Libraries that can search field by field receive the criteria as written.
Today that is Gallica: title, author and printer go to the matching catalogue
fields, “manuscript” and “printed” to the document type, years to the date.
Searching “Le guidon des capitaines” as a title, Gallica answers with 5 works;
the same phrase searched everywhere, page text included, returned 17,427. The
free words in the top field remain a general search.

Other sources receive the free words, or title, author and printer when the
search uses fields only. The criteria then drop results whose data state
something else. Language and holding institution always filter arriving
results: Gallica expects language as codes nobody types by hand. The hint next
to each criterion tells which of the chosen sources really search it.

When the data needed to decide is missing — a catalogue without a year, a
century-only date — the result stays in the list marked **incomplete data**. A
generic value such as `text` is not converted to “manuscript” or “printed”.
Check completed and failed source counts before interpreting an absence of
results.

## Identity and provenance

Every result shows author, year, place and printer, then the title; in small
print the library, pages, and “PDF available” when there is one. Grouping uses
exact IIIF manifest identity: the same work arriving from several libraries is
a single row with the number of copies, and opening the row lets you choose
which copy to use. Similar titles are not enough to merge results. The queried
service, holding institution and image service may be different organisations.

**Extend to aggregators** creates a linked search with the same criteria,
restricted to selected aggregators that were not already included.

## Opening an identifier or address

The same field accepts a work identifier, a shelfmark or an address. While you
type, Glossa checks which libraries recognise it — without any network request
— and for each one shows an **Open on …** row above the results: the command
next to it opens the work, ready to add to the Library. Word searches show
nothing extra.

An unambiguous form, such as an address or an ARK, is always offered. A bare
identifier is offered only when it is a single word with at least one digit: on
Gallica any six-letter word has the shape of an identifier, and offering to
open “Rabelais” as a work would be noise. A full address also opens with Enter;
an IIIF manifest from an institution not listed opens the same way, by pasting
its address.

| Source | Keyword search | Direct reference example |
| --- | --- | --- |
| Europeana | Yes, with an API key | Record URL |
| Internet Archive | Yes | `archive.org/details/…` URL |
| Wellcome Collection | Yes | IIIF manifest URL |
| Vatican Library | Yes | `Urb.lat.1779` |
| Gallica | Yes | ARK identifier or Gallica URL |
| e-codices | Yes | `bbb-0264` |
| Bodleian Libraries | Yes | Object URL |
| Biblioteca Estense | Yes | Identifier or viewer URL |
| Institut de France | Yes | `17837` |
| Cambridge University Digital Library | Yes | `MS-ADD-03996` |
| Bayerische Staatsbibliothek | Yes | `bsb00026283` |
| Library of Congress | Yes | `loc.gov/item/…` or `loc.gov/resource/…` URL |
| Harvard Library | Suspended in this integration | `drs:123456` or `ids:123456` |
| Heidelberg University Library | No | `cpg848` |
| e-rara | No | Record number |
| e-manuscripta | No | Record number |
| National Library of Scotland | Yes, over the titles of the digital collections | The work number, for example `133475158` |
| University of Glasgow | No | The IIIF manifest address, offered by the item page |
| Direct IIIF | No | Full manifest URL |

This table describes capabilities implemented in Glossa, not live service
availability. Network restrictions and anti-automation checks can block a
request even for a supported source.

## Digital copy availability

A bibliographic record does not imply that an accessible digital copy exists.
Glossa checks visible results and distinguishes unchecked items, successfully
opened items and items explicitly reported as unavailable. Unavailable records
remain visible with an **unavailable** indication. A timeout or rate limit is
not treated as evidence that the work is absent.

## Keeping results

**Add to Library** saves the source in the catalogue. **Add to workspace**
also creates a workspace link. Adding the same manifest again does not
duplicate the source.

Persistent searches retain criteria, executions and results between sessions
and are included in backups. Jobs stop when the application closes. Network
response caching is separate from search history: the refresh control rereads
the search state, while “retry” and a new search query the sources again.

## Searching on the library's own site

Next to every library there is a command that opens its search page in the
browser, carrying the words already typed where the library accepts them in the
address. It is there for when the internal search is not enough: what Glossa
queries is what the library exposes to a program, which rarely matches its whole
catalogue. Search on their site, copy the address of the work, paste it here to
open it.

The command appears when the result list stays empty, when the results of a
single library are being read, and on the page of a work that does not carry
the address of its own page.

## Availability of reproductions