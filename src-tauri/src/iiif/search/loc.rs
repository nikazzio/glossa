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
/// Scriptoria (`resolvers/search/loc.py` e `resolvers/loc.py`). Una pagina del
/// catalogo è una pagina di Glossa: quello che il filtro scarta la lascia più
/// corta, ma nessuna scheda utile resta fra una pagina e l'altra senza essere
/// mostrata.
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
    let asked = PAGE_SIZE.to_string();
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
    let results: Vec<DiscoveryResult> = entries
        .iter()
        .filter_map(|entry| {
            let page_url = loc_page_url(entry)?;
            let id = resolvers::loc_item_id(&page_url)?;
            Some(loc_result(entry, id, page_url))
        })
        .collect();

    // Il catalogo dice da sé se c'è un'altra pagina: contare le schede non
    // basta, perché una pagina tutta scartata dal filtro non è l'ultima.
    let has_more = value
        .pointer("/pagination/next")
        .is_some_and(|next| !next.is_null());
    log::info!(
        "discovery loc search page={page} found={} of={}",
        results.len(),
        entries.len()
    );
    Ok(SearchPage { has_more, results })
}

fn loc_result(entry: &serde_json::Value, id: String, page_url: String) -> DiscoveryResult {
    DiscoveryResult {
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
        match_hints: Vec::new(),
        openable: None,
        id,
    }
}

/// L'indirizzo della scheda: il catalogo lo mette in `id`, e su qualche
/// risposta in `url`.
fn loc_page_url(entry: &serde_json::Value) -> Option<String> {
    ["id", "url"]
        .into_iter()
        .find_map(|field| first_string(entry.get(field)))
        .filter(|value| value.starts_with("http"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{method, path, query_param},
        Mock, MockServer, ResponseTemplate,
    };

    fn item(id: &str) -> serde_json::Value {
        serde_json::json!({
            "id": format!("https://www.loc.gov/item/{id}/"),
            "title": format!("Opera {id}")
        })
    }

    async fn search_page(server: &MockServer, page: u32) -> Result<SearchPage, String> {
        let endpoints = SearchEndpoints {
            loc_search: format!("{}/search/", server.uri()),
            ..SearchEndpoints::default()
        };
        loc(&Client::new(), &endpoints, "marozzo", page, None).await
    }

    #[tokio::test]
    async fn each_page_asks_the_catalog_for_one_page_and_keeps_every_usable_item() {
        let server = MockServer::start().await;
        let entries: Vec<serde_json::Value> = (0..PAGE_SIZE)
            .map(|index| {
                if index % 4 == 0 {
                    serde_json::json!({"id": format!("https://www.loc.gov/audio/{index}/")})
                } else {
                    item(&format!("2021{index:04}"))
                }
            })
            .collect();
        Mock::given(method("GET"))
            .and(path("/search/"))
            .and(query_param("sp", "2"))
            .and(query_param("c", PAGE_SIZE.to_string()))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "results": entries,
                "pagination": {"next": "https://www.loc.gov/search/?sp=3"}
            })))
            .expect(1)
            .mount(&server)
            .await;

        let outcome = search_page(&server, 2).await.expect("la ricerca risponde");

        assert_eq!(outcome.results.len(), 15);
        assert_eq!(outcome.results[0].id, "20210001");
        assert!(outcome.has_more);
    }

    #[tokio::test]
    async fn a_page_all_discarded_is_not_the_last_one() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "results": [{"id": "https://www.loc.gov/audio/1/"}],
                "pagination": {"next": "https://www.loc.gov/search/?sp=2"}
            })))
            .mount(&server)
            .await;

        let outcome = search_page(&server, 1).await.expect("la ricerca risponde");

        assert!(outcome.results.is_empty());
        assert!(outcome.has_more);
    }

    #[tokio::test]
    async fn the_last_page_of_the_catalog_ends_the_search() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "results": [item("2021000001")],
                "pagination": {"next": null}
            })))
            .mount(&server)
            .await;

        let outcome = search_page(&server, 1).await.expect("la ricerca risponde");

        assert_eq!(outcome.results.len(), 1);
        assert!(!outcome.has_more);
    }

    #[tokio::test]
    async fn an_anti_robot_challenge_is_a_refusal() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/"))
            .respond_with(ResponseTemplate::new(403).insert_header("cf-mitigated", "challenge"))
            .mount(&server)
            .await;

        let outcome = search_page(&server, 1).await;

        assert_eq!(outcome.err().as_deref(), Some(super::super::SEARCH_REFUSED));
    }
}
