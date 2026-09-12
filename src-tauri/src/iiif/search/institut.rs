//! Institut de France: i numeri di scheda si leggono dalla sua pagina.

use reqwest::Client;

use super::super::discovery::{Gate, SearchPage};
use super::super::resolvers;
use super::{fetch_text, link_text, result_from, SearchEndpoints, PAGE_SIZE};

/// Institut de France: la pagina delle schede porta agli identificativi
/// numerici, da cui il manifesto si costruisce.
pub(super) async fn institut(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let body = fetch_text(
        client,
        &endpoints.institut_search,
        &[("search", query)],
        None,
        "Institut de France",
        gate,
    )
    .await?;

    let mut seen = std::collections::BTreeSet::new();
    let mut results = Vec::new();
    for chunk in body.split("/records/item/").skip(1) {
        let id: String = chunk.chars().take_while(char::is_ascii_digit).collect();
        if id.is_empty() || !seen.insert(id.clone()) {
            continue;
        }
        results.push(result_from(
            id.clone(),
            link_text(chunk).unwrap_or_else(|| id.clone()),
            resolvers::institut_manifest_url(&id),
        ));
        if results.len() >= PAGE_SIZE as usize {
            break;
        }
    }
    log::info!("discovery institut search found={}", results.len());
    Ok(SearchPage {
        has_more: false,
        results,
    })
}
