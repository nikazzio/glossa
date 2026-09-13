---
title: Source search
---

# Source search

The Dashboard provides two search modes: **Federated search** queries multiple
services, while **Single search / identifier** targets one source or a known
address. Results remain separate from your personal catalogue until you add
them to the Library.

## Searching multiple sources

Set keywords and sources in the criteria panel. Libraries and aggregators are
selected separately; Europeana and Internet Archive are not automatically
included in the initial library selection. Europeana requires an API key under
**Settings → Library → Libraries**.

Starting a search records its criteria. Each provider’s result page is processed
as an independent job, so a slow or failed source does not prevent others from
returning results. The execution monitor shows status, attempts and errors.
Per-source controls support pausing, resuming, cancelling, retrying, restarting
from the first page and loading further results.

## Bibliographic filters

Title, author, publisher, holding institution, language, material and year range
filter the returned metadata. They are not uniform query fields across remote
catalogues and do not make a search exhaustive.

Missing values or dates that cannot be interpreted produce an unverified match
status. A generic value such as `text` is not automatically classified as a
manuscript or printed work. Check completed and failed source counts before
interpreting an absence of results.

## Identity and provenance

Grouping uses exact IIIF manifest identity. Similar titles are not enough to
merge results. Occurrences and the services that returned them remain available.
The queried service, holding institution and image service may be different
organisations.

Title ordering lets you explicitly incorporate newly arrived results. History
keeps earlier executions separate from the current one. **Extend to aggregators**
creates a linked search with the same criteria, restricted to selected
aggregators that were not already included.

## Opening an identifier

Single-source search interprets input according to the selected service.
The field’s example shows the accepted syntax.

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
response caching is separate from search history; the refresh control in
single-source search requests a fresh response from the service.
