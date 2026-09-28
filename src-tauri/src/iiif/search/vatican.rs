//! Biblioteca Vaticana: la sua pagina di ricerca dei manoscritti, letta
//! come farebbe un browser — non ha un servizio di ricerca.

use reqwest::Client;
use std::collections::BTreeMap;

use super::super::discovery::{DiscoveryResult, Gate, MatchHint, SearchPage};
use super::{between, strip_tags, unescape, SearchEndpoints};

const RECORD_MARKER: &str = "<div class=\"row-search-result-record";
const ROW_MARKER: &str = "<div class=\"row-mss-title\">";
const TITLE_MARKER: &str = "<div class=\"title\">";
const LABEL_MARKER: &str = "<span class=\"search-result-detail-label\">";
/// Nel paginatore «Next» è un collegamento solo se c'è una pagina dopo.
const NEXT_LINK_MARKER: &str = "<li class=\"link-neighbour next\"><a ";

pub(super) async fn vatican(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    // La ricerca vive di una sessione aperta da questa pagina: senza averla
    // visitata prima, il sito la rifiuta come se non venisse da un browser
    // vero. Un guasto qui non è motivo per rinunciare subito: la richiesta
    // sotto proverà comunque, e dirà lei se la biblioteca non risponde.
    let _home_turn = super::super::discovery::wait_if_gated(gate, &endpoints.vatican_home).await;
    if let Err(error) = client.get(&endpoints.vatican_home).send().await {
        log::warn!("discovery vatican home visit failed error={error}");
    }

    let _search_turn =
        super::super::discovery::wait_if_gated(gate, &endpoints.vatican_search).await;
    let body = client
        .get(&endpoints.vatican_search)
        .query(&[
            ("k_f", "0"),
            ("k_v", query),
            ("p", &page.max(1).to_string()),
        ])
        .header("Referer", &endpoints.vatican_home)
        .send()
        .await
        .map_err(|error| {
            log::warn!("discovery vatican request failed error={error}");
            super::SEARCH_UNREACHABLE.to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery vatican response failed error={error}");
            super::reason_for(&error)
        })?
        .text()
        .await
        .map_err(|error| {
            log::warn!("discovery vatican body failed error={error}");
            super::SEARCH_INVALID_DATA.to_string()
        })?;

    let results = parse_vatican_results(&body, &endpoints.vatican_manifest_base);
    log::info!("discovery vatican search found={}", results.len());
    Ok(SearchPage {
        has_more: body.contains(NEXT_LINK_MARKER),
        results,
    })
}

fn parse_vatican_results(body: &str, manifest_base: &str) -> Vec<DiscoveryResult> {
    let mut results = Vec::new();
    for chunk in body.split(RECORD_MARKER).skip(1) {
        let Some(doc_id) = between(chunk, "/mss/edition/", '"') else {
            continue;
        };
        if !doc_id.starts_with("MSS_") {
            continue;
        }
        let title = between(chunk, "class=\"link-search-result-record-view\">", '<')
            .map(|value| strip_tags(&value))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| doc_id.clone());
        let match_hints = vatican_match_hints(chunk);
        let description = match_hints.first().map(|hint| hint.text.clone());
        let thumbnail = between(chunk, "<img src=\"/pub/digit/", '"')
            .map(|rest| format!("https://digi.vatlib.it/pub/digit/{rest}"));

        results.push(DiscoveryResult {
            title,
            creator: None,
            date: None,
            description,
            thumbnail_url: thumbnail,
            media_type: Some("manuscript".to_string()),
            collection: None,
            language: None,
            volume: None,
            subjects: Vec::new(),
            item_count: None,
            manifest_url: format!("{manifest_base}/iiif/{doc_id}/manifest.json"),
            contributors: Vec::new(),
            publisher: None,
            rights: Vec::new(),
            physical_description: None,
            holding_institution: None,
            catalog_url: None,
            page_url: Some(format!("https://digi.vatlib.it/view/{doc_id}")),
            // Questa ricerca si legge raschiando la pagina web: non c'è una
            // risposta strutturata da cui conservare il resto.
            raw: BTreeMap::new(),
            match_hints,
            openable: None,
            id: doc_id,
        });
    }
    results
}

/// Le righe della scheda in cui il catalogo ha trovato le parole (con le
/// parole dentro `<mark>`), intere e non fino al primo marcatore, ognuna col
/// nome del gruppo sopra di lei quando il catalogo lo scrive («Bibliographic
/// References:»). Il numero d'ordine che precede il testo («1)») si salta.
fn vatican_match_hints(chunk: &str) -> Vec<MatchHint> {
    chunk
        .match_indices(ROW_MARKER)
        .filter_map(|(start, _)| {
            let row = &chunk[start + ROW_MARKER.len()..];
            let row = &row[..row.find("</li>").unwrap_or(row.len())];
            let content = row
                .find(TITLE_MARKER)
                .map_or(row, |title| &row[title + TITLE_MARKER.len()..]);
            let text = unescape(&strip_tags(content));
            (!text.is_empty()).then(|| MatchHint {
                section: row_label(&chunk[..start]),
                text,
            })
        })
        .collect()
}

fn row_label(before_row: &str) -> Option<String> {
    let start = before_row.rfind(LABEL_MARKER)? + LABEL_MARKER.len();
    let rest = &before_row[start..];
    let end = rest.find('<')?;
    let label = unescape(rest[..end].trim().trim_end_matches(':'));
    (!label.is_empty()).then_some(label)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vatican_results_carry_shelfmark_title_and_cover() {
        let html = r#"
          <div class="row-search-result-record">
            <a href="/mss/edition/MSS_Vat.lat.3225" class="link-search-result-record-view">Vergilius Vaticanus</a>
            <div class="box-search-result-details"><ul><li><a href="/mss/detail/1"><div class="row-mss-title"><div class="order">1)</div><div class="title">1r-76v: <span class='italic'>Vergilius</span>, Georgica</div></div></a></li></ul></div>
            <img src="/pub/digit/MSS_Vat.lat.3225/cover/cover.jpg" />
          </div>"#;

        let results = parse_vatican_results(html, "https://digi.vatlib.it");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "MSS_Vat.lat.3225");
        assert_eq!(results[0].title, "Vergilius Vaticanus");
        assert_eq!(
            results[0].description.as_deref(),
            Some("1r-76v: Vergilius, Georgica")
        );
        assert_eq!(
            results[0].manifest_url,
            "https://digi.vatlib.it/iiif/MSS_Vat.lat.3225/manifest.json"
        );
        assert_eq!(
            results[0].thumbnail_url.as_deref(),
            Some("https://digi.vatlib.it/pub/digit/MSS_Vat.lat.3225/cover/cover.jpg")
        );
        assert_eq!(
            results[0].page_url.as_deref(),
            Some("https://digi.vatlib.it/view/MSS_Vat.lat.3225")
        );
    }

    #[test]
    fn a_vatican_page_without_manuscripts_gives_nothing() {
        assert!(parse_vatican_results(
            "<html><body>nessun risultato</body></html>",
            "https://digi.vatlib.it"
        )
        .is_empty());
    }

    const LABELLED_RECORD: &str = r#"<div class="list-search-result-record"><div class="row-search-result-record row-search-result-record-overflow mode-partial"><div class="block-search-result-record-header"><span class="block-search-result-record-title"><a href="/mss/detail/Ott.lat.1290" class="link-search-result-record-view">Ott.lat.1290</a></span></div><div class="block-search-result-record-body collection-mss"><a href="/mss/edition/MSS_Ott.lat.1290" class="box-search-result-view-link"></a><div class="box-search-result-details"><span class="search-result-detail-label">Bibliographic References:</span><ul><li><a href="/mss/detail/290218"><div class="row-mss-title"><div class="order">1)</div><div class="title">Thilo, Georg <span class='italic'>Beiträge zur Kritik der Scholiasten des <mark>Vergilius</mark></span> In <span class='italic'>Rheinisches Museum</span></div></div></a></li><li><a href="/mss/detail/290219"><div class="row-mss-title"><div class="order">2)</div><div class="title">Servius &amp; <mark>Vergilius</mark></div></div></a></li></ul></div></div></div>"#;

    #[test]
    fn vatican_rows_are_read_whole_with_their_group_label() {
        let results = parse_vatican_results(LABELLED_RECORD, "https://digi.vatlib.it");

        assert_eq!(results.len(), 1);
        let full_row =
            "Thilo, Georg Beiträge zur Kritik der Scholiasten des Vergilius In Rheinisches Museum";
        assert_eq!(results[0].description.as_deref(), Some(full_row));
        assert_eq!(
            results[0].match_hints,
            vec![
                MatchHint {
                    section: Some("Bibliographic References".to_string()),
                    text: full_row.to_string(),
                },
                MatchHint {
                    section: Some("Bibliographic References".to_string()),
                    text: "Servius & Vergilius".to_string(),
                },
            ]
        );
    }

    async fn vatican_page(pager: &str) -> SearchPage {
        use wiremock::matchers::{method, path, query_param};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/mss/search"))
            .and(query_param("p", "2"))
            .respond_with(
                ResponseTemplate::new(200).set_body_string(format!("{pager}{LABELLED_RECORD}")),
            )
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            vatican_home: format!("{}/mss/", server.uri()),
            vatican_search: format!("{}/mss/search", server.uri()),
            ..SearchEndpoints::default()
        };
        vatican(&Client::new(), &endpoints, "Vergilius", 2, None)
            .await
            .expect("pagina finta")
    }

    #[tokio::test]
    async fn vatican_asks_for_the_requested_page_and_follows_the_next_link() {
        let page = vatican_page(
            r#"<div class="pager"><ul><li class="current"><span class="page-no">2 </span>of 8</li><li class="link-neighbour next"><a href="/mss/search?k_f=0&amp;k_v=Vergilius&amp;p=3">Next</a></li></ul></div>"#,
        )
        .await;

        assert!(page.has_more);
        assert_eq!(page.results.len(), 1);
    }

    #[tokio::test]
    async fn vatican_last_page_promises_nothing_more() {
        let page = vatican_page(
            r#"<div class="pager"><ul><li class="current"><span class="page-no">8 </span>of 8</li><li class="link-neighbour next">Next<i class="bav-icon-arrow1-right"></i></li></ul></div>"#,
        )
        .await;

        assert!(!page.has_more);
    }
}
