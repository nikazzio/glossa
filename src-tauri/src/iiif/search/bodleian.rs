//! Digital Bodleian: la ricerca risponde in JSON-LD e dichiara il manifesto
//! di ogni risultato — l'unica che non lo fa costruire dall'identificativo.

use reqwest::Client;

use super::super::discovery::{Gate, SearchPage};
use super::super::resolvers;
use super::{fetch_json, first_string, result_from, strip_tags, SearchEndpoints, PAGE_SIZE};

/// Bodleian: la ricerca sa rispondere in JSON-LD, e lì il manifesto di ogni
/// risultato è dichiarato. È l'unica delle sei che non lo fa indovinare.
pub(super) async fn bodleian(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let value = fetch_json(
        client,
        &endpoints.bodleian_search,
        &[("q", query)],
        Some("application/ld+json"),
        "Digital Bodleian",
        gate,
    )
    .await?;

    let mut results = Vec::new();
    for member in value
        .get("member")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let Some(manifest_url) = member
            .pointer("/manifest/id")
            .and_then(serde_json::Value::as_str)
        else {
            continue;
        };
        let page_url = member.get("id").and_then(serde_json::Value::as_str);
        let Some(id) = page_url.and_then(resolvers::bodleian_uuid) else {
            continue;
        };
        let fields = member.get("displayFields");
        // I campi arrivano con le parole cercate marcate (`<em>`): sono
        // evidenziazioni della ricerca, non parte del titolo.
        let field = |name: &str| {
            fields
                .and_then(|fields| first_string(fields.get(name)))
                .map(|value| strip_tags(&value))
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        };
        let shelfmark = first_string(member.get("shelfmark")).map(|value| strip_tags(&value));
        let title = field("title")
            .or_else(|| shelfmark.clone())
            .unwrap_or_else(|| id.clone());
        let mut result = result_from(id, title, manifest_url.to_string());
        result.creator = field("people");
        result.date = field("dateStatement");
        result.description = field("snippet");
        // La segnatura è quello che distingue due copie della stessa opera:
        // di «Divine comedy» la Bodleian ne ha una manciata.
        result.holding_institution = shelfmark;
        result.language = field("languages");
        result.item_count = member
            .get("surfaceCount")
            .and_then(serde_json::Value::as_u64)
            .map(|count| count as usize);
        result.thumbnail_url = member
            .get("thumbnail")
            .and_then(super::super::discovery::thumbnail_of);
        result.page_url = page_url.map(str::to_string);
        // L'istituzione che conserva sta nel suo campo: come editore avrebbe
        // detto che la Bodleian ha stampato un manoscritto del Trecento.
        result.holding_institution = result
            .holding_institution
            .clone()
            .or_else(|| Some("Bodleian Libraries".to_string()));
        results.push(result);
        if results.len() >= PAGE_SIZE as usize {
            break;
        }
    }
    log::info!("discovery bodleian search found={}", results.len());
    Ok(SearchPage {
        has_more: false,
        results,
    })
}
