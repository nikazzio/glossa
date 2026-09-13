//! Library of Congress: il catalogo risponde in JSON con `fo=json`.

use reqwest::Client;
use std::collections::BTreeMap;

use super::super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::super::resolvers;
use super::{fetch_json, first_string, strings, SearchEndpoints, PAGE_SIZE};

/// La ricerca del sito, chiesta in JSON (`fo=json`).
///
/// Il catalogo contiene molto più di quello che Glossa sa aprire — registrazioni
/// sonore, mappe, giornali microfilmati — e la scheda non dichiara se esista un
/// manifesto IIIF. Si tiene solo quello che ha un indirizzo di elemento
/// (`/item/<id>/`), da cui il manifesto si costruisce per convenzione, come fa
/// Scriptoria (`resolvers/search/loc.py` e `resolvers/loc.py`). Chiedere più
/// schede di quelle che servono è voluto: una buona parte viene scartata qui.
///
/// **Il manifesto non viene verificato**: controllarne uno per risultato
/// significherebbe venti richieste in più per ogni ricerca. Un elemento senza
/// riproduzione passa quindi il filtro e si scopre aprendolo — la lettura del
/// manifesto che completa autore e copertina lo lascerà spoglio.
pub(super) async fn loc(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let wanted = PAGE_SIZE as usize;
    let asked = (wanted * 5).min(100).to_string();
    let value = fetch_json(
        client,
        &endpoints.loc_search,
        &[
            ("q", query),
            ("fo", "json"),
            ("sp", &page.max(1).to_string()),
            ("c", &asked),
        ],
        None,
        "The Library of Congress",
        gate,
    )
    .await?;

    let entries = value
        .get("results")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let mut results = Vec::new();
    for entry in entries {
        let Some(page_url) = loc_page_url(entry) else {
            continue;
        };
        let Some(id) = resolvers::loc_item_id(&page_url) else {
            continue;
        };
        if results.len() >= wanted {
            break;
        }
        results.push(DiscoveryResult {
            title: first_string(entry.get("title")).unwrap_or_else(|| id.clone()),
            creator: first_string(entry.get("contributor")),
            date: first_string(entry.get("date")),
            description: first_string(entry.get("description")),
            thumbnail_url: first_string(entry.get("image_url")),
            media_type: first_string(entry.get("original_format")),
            collection: first_string(entry.get("partof")),
            language: first_string(entry.get("language")),
            volume: None,
            subjects: strings(entry.get("subject")),
            item_count: None,
            manifest_url: resolvers::loc_manifest_url(&id),
            contributors: strings(entry.get("contributor")),
            publisher: None,
            rights: strings(entry.get("rights")),
            physical_description: None,
            holding_institution: None,
            catalog_url: None,
            page_url: Some(page_url),
            raw: BTreeMap::new(),
            openable: None,
            id,
        });
    }

    let has_more = entries.len() > results.len();
    log::info!("discovery loc search found={}", results.len());
    Ok(SearchPage { has_more, results })
}

/// L'indirizzo della scheda: il catalogo lo mette in `id`, e su qualche
/// risposta in `url`.
fn loc_page_url(entry: &serde_json::Value) -> Option<String> {
    ["id", "url"]
        .into_iter()
        .find_map(|field| first_string(entry.get(field)))
        .filter(|value| value.starts_with("http"))
}
