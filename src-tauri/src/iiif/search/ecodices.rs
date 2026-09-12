//! e-codices: la sua pagina di ricerca, letta come farebbe un browser.

use reqwest::Client;
use std::collections::BTreeMap;

use super::super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::super::resolvers;
use super::super::ResolverKind;
use super::{between, strip_tags, SearchEndpoints, PAGE_SIZE};

pub(super) async fn ecodices(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let _turn = super::super::discovery::wait_if_gated(gate, &endpoints.ecodices_search).await;
    let body = client
        .get(&endpoints.ecodices_search)
        .query(&[
            ("sQueryString", query),
            ("sSearchField", "fullText"),
            ("iResultsPerPage", &PAGE_SIZE.to_string()),
            ("sSortField", "score"),
        ])
        .send()
        .await
        .map_err(|error| {
            log::warn!("discovery ecodices request failed error={error}");
            "e-codices could not be reached.".to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery ecodices response failed error={error}");
            "The e-codices search failed.".to_string()
        })?
        .text()
        .await
        .map_err(|error| {
            log::warn!("discovery ecodices body failed error={error}");
            "e-codices returned invalid data.".to_string()
        })?;

    let results = parse_ecodices_results(&body);
    log::info!("discovery ecodices search found={}", results.len());
    Ok(SearchPage {
        has_more: false,
        results,
    })
}

fn parse_ecodices_results(body: &str) -> Vec<DiscoveryResult> {
    let mut results = Vec::new();
    for chunk in body.split("<div class=\"search-result\">").skip(1) {
        let Some(viewer_url) =
            ecodices_facsimile_href(chunk).filter(|href| href.contains("e-codices"))
        else {
            continue;
        };
        let Some(resolved) = resolvers::resolve(ResolverKind::Ecodices, &viewer_url) else {
            continue;
        };
        let title = between(chunk, "<div class=\"document-ms-title\">", '<')
            .or_else(|| between(chunk, "<div class=\"document-headline\">", '<'))
            .map(|value| strip_tags(&value))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| resolved.doc_id.clone());
        let collection = between(chunk, "<div class=\"collection-shelfmark\">", '<')
            .map(|value| strip_tags(&value));
        let description = between(chunk, "<p class=\"document-summary-search\">", '<')
            .map(|value| strip_tags(&value));

        results.push(DiscoveryResult {
            title,
            creator: None,
            date: None,
            description,
            thumbnail_url: ecodices_thumbnail(chunk),
            media_type: Some("manuscript".to_string()),
            collection,
            language: None,
            volume: None,
            subjects: Vec::new(),
            item_count: None,
            manifest_url: resolved.manifest_url,
            contributors: Vec::new(),
            publisher: None,
            rights: Vec::new(),
            physical_description: None,
            holding_institution: None,
            catalog_url: None,
            page_url: Some(viewer_url),
            // Come la Vaticana: pagina web raschiata, niente risposta
            // strutturata da conservare.
            raw: BTreeMap::new(),
            id: resolved.doc_id,
        });
    }
    results
}

/// Il primo link del risultato porta all'anteprima, non alla scheda: il vero
/// indirizzo dell'opera è quello etichettato «Facsimile».
fn ecodices_facsimile_href(chunk: &str) -> Option<String> {
    let marker_start = chunk.find(">Facsimile</a>")?;
    let before = &chunk[..marker_start];
    let href_start = before.rfind("<a href=\"")? + "<a href=\"".len();
    let href = before[href_start..].trim_end_matches('"');
    (!href.is_empty()).then(|| href.to_string())
}

fn ecodices_thumbnail(chunk: &str) -> Option<String> {
    let base = between(chunk, "image-server-base-url=\"", '"')?;
    let path = between(chunk, "image-file-path=\"", '"')?;
    let base = base.trim_end_matches('/');
    let path = path.trim_start_matches('/');
    if base.is_empty() || path.is_empty() {
        return None;
    }
    Some(format!("{base}/{path}/full/180,/0/default.jpg"))
}

// ── Aiuti ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ecodices_results_become_manifests_with_their_shelfmark() {
        let html = r#"
          <div class="search-result">
            <a href="https://www.e-codices.unifr.ch/en/bbb/0264">Facsimile</a>
            <div class="collection-shelfmark">Burgerbibliothek, Cod. 264</div>
            <div class="document-ms-title">Titus Livius</div>
            <p class="document-summary-search">Manoscritto del secolo XI</p>
            <div image-server-base-url="https://www.e-codices.unifr.ch/loris/" image-file-path="bbb/bbb-0264/bbb-0264_001.jp2"></div>
          </div>"#;

        let results = parse_ecodices_results(html);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "bbb-0264");
        assert_eq!(results[0].title, "Titus Livius");
        assert_eq!(
            results[0].manifest_url,
            "https://www.e-codices.unifr.ch/metadata/iiif/bbb-0264/manifest.json"
        );
        assert_eq!(
            results[0].thumbnail_url.as_deref(),
            Some("https://www.e-codices.unifr.ch/loris/bbb/bbb-0264/bbb-0264_001.jp2/full/180,/0/default.jpg")
        );
        assert_eq!(
            results[0].page_url.as_deref(),
            Some("https://www.e-codices.unifr.ch/en/bbb/0264")
        );
    }

    #[test]
    fn ecodices_generic_search_result_ignores_the_preview_link_before_facsimile() {
        // Un risultato di ricerca generica (non per segnatura) mette prima un
        // link all'anteprima e solo dopo quello «Facsimile»: prendere il primo
        // link del blocco, invece di cercare quello con questa etichetta,
        // porta a un indirizzo che non risolve a nessuna opera.
        let html = r#"
          <div class="search-result">
            <a href="https://www.e-codices.unifr.ch/en/searchresult/list/one/hba/chart0161" class="search-result-preview-image"></a>
            <a href="https://www.e-codices.unifr.ch/en/hba/chart0161">Facsimile</a>
            <div class="document-ms-title">Graduale</div>
          </div>"#;

        let results = parse_ecodices_results(html);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "hba-chart0161");
    }
}
