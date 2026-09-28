//! Digital Bodleian: la ricerca risponde in JSON-LD e dichiara il manifesto
//! di ogni risultato — l'unica che non lo fa costruire dall'identificativo.

use reqwest::Client;

use super::super::discovery::{Gate, MatchHint, SearchPage};
use super::super::resolvers;
use super::{
    fetch_json, first_string, result_from, strings, strip_tags, SearchEndpoints, PAGE_SIZE,
};

/// Bodleian: la ricerca sa rispondere in JSON-LD, e lì il manifesto di ogni
/// risultato è dichiarato. È l'unica delle sei che non lo fa indovinare.
pub(super) async fn bodleian(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let page_number = page.max(1).to_string();
    let value = fetch_json(
        client,
        &endpoints.bodleian_search,
        &[("q", query), ("page", page_number.as_str())],
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
        result.match_hints = snippet_hints(fields.and_then(|fields| fields.get("snippet")));
        // La segnatura è quello che distingue due copie della stessa opera:
        // di «Divine comedy» la Bodleian ne ha una manciata.
        result.holding_institution = shelfmark;
        result.language = field("languages");
        result.item_count = member.get("surfaceCount").and_then(count_of);
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
    // La pagina seguente la dichiara il catalogo stesso (`view.next`).
    let has_more = value
        .pointer("/view/next")
        .is_some_and(|next| !next.is_null());
    Ok(SearchPage { has_more, results })
}

/// Il numero di carte arriva ora come numero, ora come stringa («466»).
fn count_of(value: &serde_json::Value) -> Option<usize> {
    match value {
        serde_json::Value::Number(number) => number.as_u64(),
        serde_json::Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
    .and_then(|count| usize::try_from(count).ok())
}

/// Tutti i brani in cui il catalogo ha trovato le parole, senza marcatori.
fn snippet_hints(value: Option<&serde_json::Value>) -> Vec<MatchHint> {
    strings(value)
        .iter()
        .map(|snippet| strip_tags(snippet))
        .filter(|text| !text.is_empty())
        .fold(Vec::new(), |hints: Vec<MatchHint>, text| {
            if hints.iter().any(|hint| hint.text == text) {
                hints
            } else {
                [
                    hints,
                    vec![MatchHint {
                        section: None,
                        text,
                    }],
                ]
                .concat()
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn reads_the_page_count_as_number_or_string() {
        assert_eq!(count_of(&serde_json::json!(156)), Some(156));
        assert_eq!(count_of(&serde_json::json!("466")), Some(466));
        assert_eq!(count_of(&serde_json::json!("molte")), None);
        assert_eq!(count_of(&serde_json::json!(null)), None);
    }

    #[test]
    fn keeps_every_distinct_snippet_without_markup() {
        let hints = snippet_hints(Some(&serde_json::json!([
            "... <em>Book of Hours</em> (fragment). ...",
            "... <em>Book of Hours</em> ...",
            "... <em>Book of Hours</em> ...",
        ])));

        assert_eq!(
            hints
                .iter()
                .map(|hint| hint.text.as_str())
                .collect::<Vec<_>>(),
            vec!["... Book of Hours (fragment). ...", "... Book of Hours ..."]
        );
        assert!(hints.iter().all(|hint| hint.section.is_none()));
    }

    #[tokio::test]
    async fn asks_for_the_page_and_follows_the_declared_next() {
        // Campione accorciato della risposta vera a «book of hours», pagina 2.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/"))
            .and(query_param("page", "2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "totalItems": 254,
                "view": {
                    "type": "PartialCollectionView",
                    "next": "https://digital.bodleian.ox.ac.uk/search/?page=3&q=book+of+hours",
                    "totalPages": 13
                },
                "member": [{
                    "id": "https://digital.bodleian.ox.ac.uk/objects/0393f1f2-eecc-4d77-9c55-9d2ee989bb64/",
                    "shelfmark": "Bodleian Library MS. Buchanan e. 9",
                    "surfaceCount": "3",
                    "manifest": {"id": "https://iiif.bodleian.ox.ac.uk/iiif/manifest/0393f1f2-eecc-4d77-9c55-9d2ee989bb64.json"},
                    "displayFields": {
                        "title": ["<em>Book of Hours</em>. Use unidentified."],
                        "snippet": ["... <em>Book of Hours</em>. Use unidentified. ..."]
                    }
                }]
            })))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            bodleian_search: format!("{}/search/", server.uri()),
            ..SearchEndpoints::default()
        };

        let page = bodleian(&Client::new(), &endpoints, "book of hours", 2, None)
            .await
            .expect("search resolves");

        assert!(page.has_more);
        assert_eq!(page.results[0].title, "Book of Hours. Use unidentified.");
        assert_eq!(page.results[0].item_count, Some(3));
        assert_eq!(
            page.results[0].match_hints,
            vec![MatchHint {
                section: None,
                text: "... Book of Hours. Use unidentified. ...".to_string()
            }]
        );
    }

    #[tokio::test]
    async fn the_last_page_has_no_next() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "view": {"type": "PartialCollectionView", "totalPages": 13},
                "member": []
            })))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            bodleian_search: format!("{}/search/", server.uri()),
            ..SearchEndpoints::default()
        };

        let page = bodleian(&Client::new(), &endpoints, "book of hours", 13, None)
            .await
            .expect("search resolves");

        assert!(!page.has_more);
    }
}
