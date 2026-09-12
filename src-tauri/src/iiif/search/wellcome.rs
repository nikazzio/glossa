//! Wellcome Collection: catalogo aperto, con filtro sul digitalizzato.

use reqwest::Client;

use super::super::discovery::{Gate, SearchPage};
use super::{fetch_json, first_string, result_from, SearchEndpoints, PAGE_SIZE};

/// Wellcome ha un'interfaccia pensata per chi programma, aperta e senza chiave.
///
/// Il suo catalogo descrive anche i libri che stanno in magazzino e non sono
/// stati digitalizzati: su una ricerca di prova, quattro risultati su cinque.
/// Il filtro `items.locations.locationType=iiif-presentation` li toglie **alla
/// fonte**, quindi non si scartano dopo averli mostrati, e ogni risultato porta
/// già l'indirizzo del suo manifesto.
pub(super) async fn wellcome(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let value = fetch_json(
        client,
        &endpoints.wellcome_search,
        &[
            ("query", query),
            ("pageSize", &PAGE_SIZE.to_string()),
            ("page", &page.max(1).to_string()),
            ("include", "items,production,languages,subjects"),
            ("items.locations.locationType", "iiif-presentation"),
        ],
        None,
        "Wellcome Collection",
        gate,
    )
    .await?;

    let mut results = Vec::new();
    for work in value
        .get("results")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let Some(id) = work.get("id").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let Some(manifest_url) = wellcome_manifest(work) else {
            continue;
        };
        let title = first_string(work.get("title")).unwrap_or_else(|| id.to_string());
        let mut result = result_from(id.to_string(), title, manifest_url);
        result.creator = wellcome_first_label(work.pointer("/production/0/agents"));
        result.date = wellcome_first_label(work.pointer("/production/0/dates"));
        result.description = first_string(work.get("description"));
        result.physical_description = first_string(work.get("physicalDescription"));
        result.media_type = work
            .pointer("/workType/label")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string);
        result.language = work
            .pointer("/languages/0/label")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string);
        result.subjects = wellcome_labels(work.get("subjects"));
        result.thumbnail_url = work
            .pointer("/thumbnail/url")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string);
        result.holding_institution = first_string(work.get("referenceNumber"));
        result.page_url = Some(format!("https://wellcomecollection.org/works/{id}"));
        result.publisher = Some("Wellcome Collection".to_string());
        results.push(result);
    }

    let total = value
        .get("totalResults")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    log::info!("discovery wellcome search found={}", results.len());
    Ok(SearchPage {
        has_more: u64::from(page.max(1) * PAGE_SIZE) < total,
        results,
    })
}

/// L'indirizzo del manifesto sta fra i luoghi dove l'opera si trova: uno di
/// quelli è la riproduzione digitale, gli altri sono scaffali veri.
fn wellcome_manifest(work: &serde_json::Value) -> Option<String> {
    work.get("items")?
        .as_array()?
        .iter()
        .filter_map(|item| item.get("locations")?.as_array().cloned())
        .flatten()
        .find(|location| {
            location
                .pointer("/locationType/id")
                .and_then(serde_json::Value::as_str)
                == Some("iiif-presentation")
        })
        .and_then(|location| {
            location
                .get("url")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
}

/// Wellcome descrive persone, date e soggetti come oggetti con un'etichetta.
fn wellcome_first_label(value: Option<&serde_json::Value>) -> Option<String> {
    value?
        .as_array()?
        .iter()
        .find_map(|entry| entry.get("label").and_then(serde_json::Value::as_str))
        .map(str::to_string)
}

fn wellcome_labels(value: Option<&serde_json::Value>) -> Vec<String> {
    value
        .and_then(serde_json::Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.get("label").and_then(serde_json::Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

// ── Europeana: molte biblioteche in una richiesta sola ───────────────────
