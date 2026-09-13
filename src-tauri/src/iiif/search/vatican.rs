//! Biblioteca Vaticana: la sua pagina di ricerca dei manoscritti, letta
//! come farebbe un browser — non ha un servizio di ricerca.

use reqwest::Client;
use std::collections::BTreeMap;

use super::super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::{between, strip_tags, SearchEndpoints};

pub(super) async fn vatican(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
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
        .query(&[("k_f", "0"), ("k_v", query)])
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
        // La pagina di ricerca della Vaticana non dichiara un totale: si
        // mostra quello che ha dato, senza promettere una pagina successiva.
        has_more: false,
        results,
    })
}

fn parse_vatican_results(body: &str, manifest_base: &str) -> Vec<DiscoveryResult> {
    let mut results = Vec::new();
    for chunk in body.split("row-search-result-record").skip(1) {
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
        let description =
            between(chunk, "<div class=\"title\">", '<').map(|value| strip_tags(&value));
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
            openable: None,
            id: doc_id,
        });
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vatican_results_carry_shelfmark_title_and_cover() {
        let html = r#"
          <div class="row-search-result-record">
            <a href="/mss/edition/MSS_Vat.lat.3225" class="link-search-result-record-view">Vergilius Vaticanus</a>
            <div class="title">Membranaceo, sec. IV</div>
            <img src="/pub/digit/MSS_Vat.lat.3225/cover/cover.jpg" />
          </div>"#;

        let results = parse_vatican_results(html, "https://digi.vatlib.it");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "MSS_Vat.lat.3225");
        assert_eq!(results[0].title, "Vergilius Vaticanus");
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
}
