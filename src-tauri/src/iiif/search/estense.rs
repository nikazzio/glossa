//! Biblioteca Estense: catalogo in JSON, con le pagine che contano da zero.

use reqwest::Client;

use super::super::discovery::{Gate, SearchPage};
use super::super::resolvers;
use super::{fetch_json, first_string, result_from, SearchEndpoints, PAGE_SIZE};

/// Biblioteca Estense: catalogo in JSON, con le schede dentro `_embedded`.
pub(super) async fn estense(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    // Le pagine del suo catalogo contano da zero.
    let index = (page.max(1) - 1).to_string();
    let value = fetch_json(
        client,
        &endpoints.estense_search,
        &[
            ("text", query),
            ("size", &PAGE_SIZE.to_string()),
            ("page", &index),
        ],
        None,
        "Biblioteca Estense",
        gate,
    )
    .await?;

    let mut results = Vec::new();
    for item in value
        .pointer("/_embedded/culturalItems")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let Some(id) = estense_uuid_of(item) else {
            continue;
        };
        // Il catalogo non usa i nomi consueti: il titolo è `sgtt` e la
        // segnatura `pressmark`. Autore e data non ci sono in questa risposta:
        // arrivano dalla lettura del manifesto, come per la Vaticana.
        let title = first_string(item.get("sgtt"))
            .or_else(|| first_string(item.get("pressmark")))
            .unwrap_or_else(|| id.clone());
        let mut result = result_from(id.clone(), title, resolvers::estense_manifest_url(&id));
        result.holding_institution = first_string(item.get("pressmark"));
        results.push(result);
    }

    let total = value
        .pointer("/page/totalPages")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(1);
    log::info!("discovery estense search found={}", results.len());
    Ok(SearchPage {
        has_more: u64::from(page.max(1)) < total,
        results,
    })
}

/// L'identificativo di una scheda dell'Estense, dove che sia scritto: il
/// catalogo lo mette ora in `uuid`, ora dentro l'indirizzo del manifesto.
fn estense_uuid_of(item: &serde_json::Value) -> Option<String> {
    for field in ["uuid", "id", "manifest", "manifestUrl"] {
        if let Some(value) = first_string(item.get(field)) {
            if let Some(uuid) = resolvers::estense_uuid(&value) {
                return Some(uuid);
            }
        }
    }
    None
}
