//! e-codices: la sua pagina di ricerca, letta come farebbe un browser.

use reqwest::Client;
use std::collections::BTreeMap;

use super::super::discovery::{DiscoveryResult, Gate, MatchHint, SearchPage};
use super::super::resolvers;
use super::super::ResolverKind;
use super::{between, strip_tags, unescape, words, SearchEndpoints, PAGE_SIZE};

const RESULT_MARKER: &str = "<div class=\"search-result\">";
const HINT_MARKER: &str = "<div class=\"found-in-container\">";
const SNIPPET_MARKER: &str = "<span class=\"search-result-snippet\">";
const SECTION_MARKER: &str = "<span class=\"found-in\">";

pub(super) async fn ecodices(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
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
            ("iCurrentPage", &page.max(1).to_string()),
        ])
        .send()
        .await
        .map_err(|error| {
            log::warn!("discovery ecodices request failed error={error}");
            super::SEARCH_UNREACHABLE.to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery ecodices response failed error={error}");
            super::reason_for(&error)
        })?
        .text()
        .await
        .map_err(|error| {
            log::warn!("discovery ecodices body failed error={error}");
            super::SEARCH_INVALID_DATA.to_string()
        })?;

    let found = parse_ecodices_results(&body);
    let results = keep_results_with_every_word(found, query);
    log::info!("discovery ecodices search found={}", results.len());
    Ok(SearchPage {
        // Il filtro sopra può svuotare la pagina, ma la successiva va chiesta
        // comunque: lo dice il paginatore del sito, non quanto è rimasto.
        has_more: body.contains("rel=\"next\""),
        results,
    })
}

/// e-codices unisce le parole con un OR e le riduce alla radice: «achille
/// marozzo» trova i registri contabili che citano un «Achilles» in
/// bibliografia, mentre AND e «+» non danno nulla e le virgolette cercano la
/// frase esatta, perdendo chi ha le parole in punti diversi della scheda. Si
/// mandano quindi le parole così come sono e si tengono solo i risultati in cui
/// ognuna compare, nel titolo, nel riassunto o nei brani che il sito indica,
/// come inizio di una parola (maiuscole e accenti non contano).
fn keep_results_with_every_word(
    results: Vec<DiscoveryResult>,
    query: &str,
) -> Vec<DiscoveryResult> {
    let wanted = words(query);
    // Con una parola sola l'«o» del sito non allarga niente: quello che ha
    // trovato è quello che si è chiesto, anche in un'altra forma.
    if wanted.len() < 2 {
        return results;
    }
    results
        .into_iter()
        .filter(|result| {
            let found = result_words(result);
            wanted
                .iter()
                .all(|word| found.iter().any(|candidate| same_root(candidate, word)))
        })
        .collect()
}

/// Il sito riduce le parole alla radice: «Heilige» risponde a «heiligen»,
/// «manuscript» a «manuscripts». Una parola vale se una delle due inizia con
/// l'altra, con una parte comune abbastanza lunga da non unire parole
/// diverse (sotto le quattro lettere serve l'inizio esatto).
fn same_root(candidate: &str, word: &str) -> bool {
    const MIN_SHARED_ROOT: usize = 4;
    candidate.starts_with(word)
        || (candidate.chars().count() >= MIN_SHARED_ROOT && word.starts_with(candidate))
}

fn result_words(result: &DiscoveryResult) -> Vec<String> {
    let texts = [Some(&result.title), result.description.as_ref()]
        .into_iter()
        .flatten()
        .chain(result.match_hints.iter().map(|hint| &hint.text));
    texts.flat_map(|text| words(text)).collect()
}

/// I punti della scheda in cui il sito ha trovato le parole: il brano (con le
/// parole racchiuse in `<em>`) e, dopo «Found in:», il nome della sezione.
/// Lo stesso brano torna identico per ogni lingua del titolo: basta una volta.
fn ecodices_match_hints(chunk: &str) -> Vec<MatchHint> {
    let hints: Vec<MatchHint> = chunk
        .split(HINT_MARKER)
        .skip(1)
        .filter_map(match_hint)
        .collect();
    hints
        .iter()
        .enumerate()
        .filter(|(index, hint)| !hints[..*index].iter().any(|seen| seen.text == hint.text))
        .map(|(_, hint)| hint.clone())
        .collect()
}

fn match_hint(block: &str) -> Option<MatchHint> {
    let snippet_start = block.find(SNIPPET_MARKER)? + SNIPPET_MARKER.len();
    let section_start = block[snippet_start..]
        .find(SECTION_MARKER)
        .map(|offset| snippet_start + offset);
    // Senza «Found in» il testo si ferma alla fine del suo riquadro: arrivare
    // in fondo al blocco portava dentro il piè di pagina dell'ultimo risultato.
    let end = section_start
        .or_else(|| {
            block[snippet_start..]
                .find("</div>")
                .map(|offset| snippet_start + offset)
        })
        .unwrap_or(block.len());
    let text = clean_text(&block[snippet_start..end]);
    let section = section_start
        .and_then(|start| section_name(&block[start..]))
        .filter(|value| !value.is_empty());
    (!text.is_empty()).then_some(MatchHint { section, text })
}

fn section_name(found_in: &str) -> Option<String> {
    let start = found_in.find("<strong>")?;
    let end = found_in[start..].find("</strong>")? + start;
    Some(clean_text(&found_in[start..end]))
}

fn clean_text(html: &str) -> String {
    unescape(&strip_tags(html).replace("&hellip;", " "))
}

fn parse_ecodices_results(body: &str) -> Vec<DiscoveryResult> {
    let mut results = Vec::new();
    for chunk in body.split(RESULT_MARKER).skip(1) {
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
            match_hints: ecodices_match_hints(chunk),
            openable: None,
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

    const ACHILLE_ONLY: &str = r#"
      <div class="search-result">
        <a href="https://www.e-codices.unifr.ch/en/bcuf/L1200">Facsimile</a>
        <div class="document-ms-title">Alain Chartier; Achille Caulier; Hans Rosenplüt</div>
        <div class="found-in-container">
          <span class="search-result-snippet"><span><i class="fa fa-arrow-right"></i></span> &hellip;Baudet Herenc; <em>Achille</em> Caulier&hellip;</span>
          <span class="found-in">Found in:
          </span>
          <strong><a href="https://www.e-codices.unifr.ch/en/list/one/bcuf/L1200">Title (English)</a></strong>
        </div>
        <div class="found-in-container">
          <span class="search-result-snippet"><span><i class="fa fa-arrow-right"></i></span> &hellip;Baudet Herenc; <em>Achille</em> Caulier&hellip;</span>
          <span class="found-in">Found in:
          </span>
          <strong><a href="https://www.e-codices.unifr.ch/de/list/one/bcuf/L1200">Title (German)</a></strong>
        </div>
      </div>"#;

    const BOTH_WORDS: &str = r#"
      <div class="search-result">
        <a href="https://www.e-codices.unifr.ch/en/bge/lat0052">Facsimile</a>
        <div class="document-ms-title">Trattato di scherma</div>
        <div class="found-in-container">
          <span class="search-result-snippet"><span><i class="fa fa-arrow-right"></i></span> &hellip;opera di <em>Achilles</em> <em>Marozzò</em>&hellip;</span>
          <span class="found-in">Found in:
          </span>
          <strong><a href="https://www.e-codices.unifr.ch/en/list/one/bge/lat0052">Additional Bibliography</a></strong>
        </div>
      </div>"#;

    #[test]
    fn ecodices_match_hints_read_snippet_and_section_once_per_text() {
        let results = parse_ecodices_results(ACHILLE_ONLY);

        assert_eq!(
            results[0].match_hints,
            vec![MatchHint {
                section: Some("Title (English)".to_string()),
                text: "Baudet Herenc; Achille Caulier".to_string(),
            }]
        );
    }

    #[test]
    fn ecodices_keeps_only_results_containing_every_word() {
        let html = format!("{ACHILLE_ONLY}{BOTH_WORDS}");

        let results =
            keep_results_with_every_word(parse_ecodices_results(&html), "achille marozzo");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "bge-lat0052");
        assert_eq!(
            results[0].match_hints[0].section.as_deref(),
            Some("Additional Bibliography")
        );
    }

    #[test]
    fn ecodices_word_filter_ignores_case_and_accents_but_not_missing_words() {
        let results = parse_ecodices_results(ACHILLE_ONLY);

        assert_eq!(
            keep_results_with_every_word(results.clone(), "ROSENPLUT \"caulier\"").len(),
            1
        );
        assert!(keep_results_with_every_word(results, "caulier marozzo").is_empty());
    }

    #[test]
    fn one_word_is_never_filtered_and_roots_count_as_the_same_word() {
        let result = super::super::result_from(
            "x".to_string(),
            "Legenda der Heilige".to_string(),
            String::new(),
        );

        assert_eq!(
            keep_results_with_every_word(vec![result.clone()], "graduale").len(),
            1
        );
        assert_eq!(
            keep_results_with_every_word(vec![result.clone()], "heiligen legenda").len(),
            1
        );
        assert!(keep_results_with_every_word(vec![result], "heiligtum legenda").is_empty());
    }

    #[tokio::test]
    async fn ecodices_asks_for_the_requested_page_and_reads_the_pager() {
        use wiremock::matchers::{method, query_param};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        let body = format!(
            "{BOTH_WORDS}<div class=\"browse-pagination\"><a href=\"?iCurrentPage=3\" rel=\"next\">→</a></div>"
        );
        Mock::given(method("GET"))
            .and(query_param("iCurrentPage", "2"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            ecodices_search: server.uri(),
            ..SearchEndpoints::default()
        };

        let page = ecodices(&Client::new(), &endpoints, "achille marozzo", 2, None)
            .await
            .expect("pagina finta");

        assert!(page.has_more);
        assert_eq!(page.results.len(), 1);
    }
}
