//! Institut de France: i numeri di scheda si leggono dalla sua pagina.

use reqwest::Client;

use super::super::discovery::{DiscoveryResult, Gate, MatchHint, SearchPage};
use super::super::resolvers;
use super::{fetch_text, link_text, result_from, strip_tags, unescape, SearchEndpoints, PAGE_SIZE};

/// Institut de France: la pagina delle schede porta agli identificativi
/// numerici, da cui il manifesto si costruisce.
pub(super) async fn institut(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let per_page = PAGE_SIZE.to_string();
    let page_number = page.max(1).to_string();
    let body = fetch_text(
        client,
        &endpoints.institut_search,
        &[
            ("search", query),
            ("perpage", per_page.as_str()),
            ("page", page_number.as_str()),
        ],
        None,
        "Institut de France",
        gate,
    )
    .await?;

    let results = parse_results(&body);
    // Senza il riepilogo «1 - 20 / 70» resta solo la pagina piena come indizio.
    let has_more = page_counter(&body)
        .map(|(last_shown, total)| last_shown < total)
        .unwrap_or(results.len() >= PAGE_SIZE as usize);
    log::info!("discovery institut search found={}", results.len());
    Ok(SearchPage { has_more, results })
}

fn parse_results(body: &str) -> Vec<DiscoveryResult> {
    let mut seen = std::collections::BTreeSet::new();
    let mut results = Vec::new();
    // Ogni scheda compare due volte (titolo e miniatura): conta la prima.
    for chunk in body.split("/records/item/").skip(1) {
        let id: String = chunk.chars().take_while(char::is_ascii_digit).collect();
        if id.is_empty() || !seen.insert(id.clone()) {
            continue;
        }
        let title = heading_text(chunk)
            .or_else(|| link_text(chunk))
            .unwrap_or_else(|| id.clone());
        let mut result = result_from(id.clone(), title, resolvers::institut_manifest_url(&id));
        let description = description_html(chunk);
        result.description = description.map(clean_text).filter(|text| !text.is_empty());
        // La riga sotto il titolo marca con `<em>` le parole trovate: è lì
        // che la biblioteca dice perché la scheda risponde.
        result.match_hints = description
            .filter(|html| html.contains("<em"))
            .and(result.description.clone())
            .map(|text| {
                vec![MatchHint {
                    section: None,
                    text,
                }]
            })
            .unwrap_or_default();
        results.push(result);
        if results.len() >= PAGE_SIZE as usize {
            break;
        }
    }
    results
}

/// Il titolo intero dentro `<h4>`: le parole cercate vi arrivano avvolte in
/// `<em>`, e fermarsi al primo pezzo di testo lo tronca («Heures»).
fn heading_text(chunk: &str) -> Option<String> {
    let link = &chunk[..chunk.find("</a>").unwrap_or(chunk.len())];
    let open = link.find("<h4")?;
    let inner_start = open + link[open..].find('>')? + 1;
    let inner_end = inner_start + link[inner_start..].find("</h4>")?;
    Some(clean_text(&link[inner_start..inner_end])).filter(|text| !text.is_empty())
}

/// La descrizione è il primo paragrafo dopo il titolo; la pagina lo annida
/// dentro un altro `<p>`, quindi si parte dall'apertura più vicina alla prima
/// chiusura.
fn description_html(chunk: &str) -> Option<&str> {
    let start = chunk.find("</h4>")? + "</h4>".len();
    let rest = &chunk[start..];
    let end = rest.find("</p>")?;
    let open = rest[..end].rfind("<p")?;
    let inner = open + rest[open..end].find('>')? + 1;
    Some(&rest[inner..end])
}

fn clean_text(html: &str) -> String {
    unescape(&strip_tags(html))
}

/// Il riepilogo della paginazione, «1 - 20 / 70 résultat(s)»: l'ultima scheda
/// mostrata e il totale.
fn page_counter(body: &str) -> Option<(u64, u64)> {
    let start = body.find("class=\"pager left\">")? + "class=\"pager left\">".len();
    let rest = &body[start..];
    let text = &rest[..rest.find('<')?];
    let numbers: Vec<u64> = text
        .split(|character: char| !character.is_ascii_digit())
        .filter_map(|part| part.parse().ok())
        .collect();
    match numbers.as_slice() {
        [_, last_shown, total, ..] => Some((*last_shown, *total)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Una scheda com'è nella pagina vera (ricerca «heures»), accorciata.
    const PAGE: &str = r#"
        <div class="navlist_content"><div class="title_box">
          <a href="/records/item/25594-heures-de-jeanne-de-savoie?offset=1"><h4><em>Heures</em> de Jeanne de Savoie</h4></a>
        </div><p>
          <p><em>Heures</em> à l'usage de Paris. Manuscrit sur vélin.</p><dl class="item-list"><dt>Localisation</dt><dd>MJAP-Ms 1312</dd></dl></p>
        </div><div class="navlist_img">
          <a href="/records/item/25594-heures-de-jeanne-de-savoie?offset=1"><img title="Heures de Jeanne de Savoie"></a>
        </div>
        <div class="title_box">
          <a href="/records/item/26822-prieres-a-la-vierge?offset=2"><h4>Prières à la Vierge</h4></a>
        </div><p><p>Recueil de prières.</p></p>
        <div class="pagination"><div class="pager left">1 - 20 / 70 résultat(s)</div></div>
    "#;

    #[test]
    fn reads_the_whole_title_when_the_search_words_are_highlighted() {
        let results = parse_results(PAGE);

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Heures de Jeanne de Savoie");
        assert_eq!(results[1].title, "Prières à la Vierge");
    }

    #[test]
    fn keeps_the_highlighted_description_as_a_match_hint() {
        let results = parse_results(PAGE);

        let expected = "Heures à l'usage de Paris. Manuscrit sur vélin.";
        assert_eq!(results[0].description.as_deref(), Some(expected));
        assert_eq!(
            results[0].match_hints,
            vec![MatchHint {
                section: None,
                text: expected.to_string()
            }]
        );
        assert_eq!(
            results[1].description.as_deref(),
            Some("Recueil de prières.")
        );
        assert!(results[1].match_hints.is_empty());
    }

    #[test]
    fn reads_the_pagination_summary() {
        assert_eq!(page_counter(PAGE), Some((20, 70)));
        assert_eq!(
            page_counter(r#"<div class="pager left">61 - 70 / 70 résultat(s)</div>"#),
            Some((70, 70))
        );
        assert_eq!(page_counter("<p>nessun riepilogo</p>"), None);
    }

    #[tokio::test]
    async fn asks_for_the_requested_page_of_twenty() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/records"))
            .and(query_param("search", "heures"))
            .and(query_param("perpage", "20"))
            .and(query_param("page", "2"))
            .respond_with(ResponseTemplate::new(200).set_body_string(PAGE))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            institut_search: format!("{}/records", server.uri()),
            ..SearchEndpoints::default()
        };

        let page = institut(&Client::new(), &endpoints, "heures", 2, None)
            .await
            .expect("search resolves");

        assert_eq!(page.results.len(), 2);
        assert!(page.has_more);
    }
}
