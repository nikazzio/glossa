//! Cambridge University Digital Library: il servizio di ricerca del suo visore.
//!
//! La pagina pubblica di ricerca è dietro un filtro anti-robot che blocca dopo
//! poche richieste — per questo la ricerca era stata spenta. Il visore
//! ufficiale però interroga un servizio proprio, che risponde in JSON e non
//! chiede chiavi: è quello che si usa qui.

use reqwest::Client;

use super::super::discovery::{Gate, SearchPage};
use super::super::resolvers;
use super::{fetch_json, first_string, result_from, SearchEndpoints};

/// Il servizio risponde per pagine di otto o venti schede: un numero diverso
/// viene riportato a venti, quindi si chiede direttamente quello.
const CUDL_PAGE_SIZE: u32 = 20;

pub(super) async fn cambridge(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    // Una segnatura scritta per esteso è già l'opera: chiederla al servizio
    // costerebbe una richiesta per sapere quello che sappiamo già.
    if let Some(direct) = resolvers::resolve(super::super::ResolverKind::Cambridge, query) {
        return Ok(SearchPage {
            has_more: false,
            results: vec![result_from(
                direct.doc_id.clone(),
                direct.doc_id,
                direct.manifest_url,
            )],
        });
    }

    let start = ((page.max(1) - 1) * CUDL_PAGE_SIZE).to_string();
    let value = fetch_json(
        client,
        &endpoints.cambridge_search,
        &[
            ("q", query),
            // Senza il livello, fra i risultati compaiono le singole pagine di
            // un libro: cento carte diventerebbero cento risultati.
            ("fq", "itemLevel:true"),
            // Una scheda senza riproduzione non si apre in Glossa.
            ("fq", "hasImage:Yes"),
            ("rows", &CUDL_PAGE_SIZE.to_string()),
            ("start", &start),
        ],
        None,
        "Cambridge University Digital Library",
        gate,
    )
    .await?;

    let mut seen = std::collections::BTreeSet::new();
    let mut results = Vec::new();
    for doc in value
        .pointer("/response/docs")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let Some(id) = doc.get("fileID").and_then(serde_json::Value::as_str) else {
            continue;
        };
        if !seen.insert(id.to_string()) {
            continue;
        }
        let title = first_string(doc.get("documentTitle"))
            .or_else(|| first_string(doc.get("documentShelfLocator")))
            .unwrap_or_else(|| id.to_string());
        let mut result = result_from(id.to_string(), title, resolvers::cambridge_manifest_url(id));
        result.holding_institution = first_string(doc.get("documentShelfLocator"));
        result.collection = first_string(doc.get("collection"));
        result.item_count = doc
            .get("numberOfPages")
            .and_then(|value| match value {
                serde_json::Value::Array(items) => {
                    items.first().and_then(serde_json::Value::as_u64)
                }
                other => other.as_u64(),
            })
            .map(|count| count as usize);
        result.thumbnail_url = first_string(doc.get("documentThumbnailUrl")).map(thumbnail_url);
        result.page_url = Some(format!("https://cudl.lib.cam.ac.uk/view/{id}"));
        results.push(result);
    }

    let total = value
        .pointer("/response/numFound")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    log::info!("discovery cambridge search found={}", results.len());
    Ok(SearchPage {
        has_more: u64::from(page.max(1) * CUDL_PAGE_SIZE) < total,
        results,
    })
}

/// Il servizio dà il nome dell'immagine di copertina, non il suo indirizzo: il
/// servizio immagini di Cambridge lo compone aggiungendo l'estensione e la
/// misura, come qualunque servizio IIIF.
fn thumbnail_url(image_id: String) -> String {
    format!("https://images.lib.cam.ac.uk/iiif/{image_id}.jp2/full/!400,400/0/default.jpg")
}
