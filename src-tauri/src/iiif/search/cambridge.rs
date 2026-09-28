//! Cambridge University Digital Library: il servizio di ricerca del suo visore.
//!
//! La pagina pubblica di ricerca è dietro un filtro anti-robot che blocca dopo
//! poche richieste — per questo la ricerca era stata spenta. Il visore
//! ufficiale però interroga un servizio proprio, che risponde in JSON e non
//! chiede chiavi: è quello che si usa qui.

use reqwest::Client;

use super::super::discovery::{Gate, MatchHint, SearchPage};
use super::super::resolvers;
use super::{
    fetch_json, first_string, result_from, strings, strip_tags, unescape, SearchEndpoints,
};

/// Il servizio risponde per pagine di otto o venti schede: un numero diverso
/// viene riportato a venti, quindi si chiede direttamente quello.
const CUDL_PAGE_SIZE: u32 = 20;

/// I campi evidenziati che si mostrano, col nome da dare alla sezione; gli
/// altri (il testo trascritto di ogni pagina, la scrittura) restano fuori.
const HIGHLIGHT_SECTIONS: [(&str, &str); 5] = [
    ("title", "Title"),
    ("alternativeTitles", "Alternative titles"),
    ("authors", "Authors"),
    ("abstract", "Abstract"),
    ("bibliographies", "Bibliography"),
];

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
        result.date = date_of(doc);
        result.match_hints = match_hints(value.get("highlighting"), id);
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

/// Gli anni come li legge il criterio di ricerca («1430-1475», «1848»): la data
/// descrittiva («Mid- to third quarter of the 15th century») non ne ha, e con
/// quella la scheda non si potrebbe filtrare. Si ripiega su di essa solo quando
/// gli anni mancano.
fn date_of(doc: &serde_json::Value) -> Option<String> {
    let years: Vec<u64> = doc
        .get("years")
        .and_then(serde_json::Value::as_array)
        .map(|items| items.iter().filter_map(serde_json::Value::as_u64).collect())
        .unwrap_or_default();
    match (years.iter().min(), years.iter().max()) {
        (Some(from), Some(to)) if from == to => Some(from.to_string()),
        (Some(from), Some(to)) => Some(format!("{from}-{to}")),
        _ => first_string(doc.get("creations-dateDisplay")),
    }
}

/// I brani evidenziati della scheda: il servizio li mette in un blocco a parte,
/// con chiave `<fileID>-<n>` e le parole avvolte in `<em class="match">`.
fn match_hints(highlighting: Option<&serde_json::Value>, id: &str) -> Vec<MatchHint> {
    let prefix = format!("{id}-");
    let blocks: Vec<&serde_json::Value> = highlighting
        .and_then(serde_json::Value::as_object)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|(key, _)| {
                    key.strip_prefix(&prefix)
                        .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
                })
                .map(|(_, block)| block)
                .collect()
        })
        .unwrap_or_default();
    HIGHLIGHT_SECTIONS
        .iter()
        .flat_map(|(field, label)| {
            blocks
                .iter()
                .flat_map(|block| strings(block.get(*field)))
                .map(|fragment| unescape(&strip_tags(&fragment)))
                .filter(|text| !text.is_empty())
                .map(|text| MatchHint {
                    section: Some((*label).to_string()),
                    text,
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn dates_come_from_the_years_the_criterion_can_read() {
        assert_eq!(
            date_of(&serde_json::json!({
                "creations-dateDisplay": ["Mid- to third quarter of the 15th century."],
                "years": [1430, 1475]
            })),
            Some("1430-1475".to_string())
        );
        assert_eq!(
            date_of(&serde_json::json!({"years": [1848, 1848]})),
            Some("1848".to_string())
        );
        assert_eq!(
            date_of(&serde_json::json!({"creations-dateDisplay": ["c. 1500"]})),
            Some("c. 1500".to_string())
        );
        assert_eq!(date_of(&serde_json::json!({})), None);
    }

    #[tokio::test]
    async fn reads_the_highlights_of_each_record() {
        // Campione accorciato della risposta vera a «dante».
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/items"))
            .and(query_param("start", "0"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "response": {"numFound": 1, "docs": [{
                    "fileID": "MS-MM-00002-00003-00002",
                    "documentTitle": ["Dante Alighieri, Divina commedia and Credo"],
                    "creations-dateDisplay": ["Second quarter to mid-14th century."],
                    "years": [1330, 1375]
                }]},
                "highlighting": {
                    "MS-MM-00002-00003-00002-1": {
                        "bibliographies": ["</div><div style='display: list-item;' id=\"P1966\">Petrocchi, <i>Le opere di <em class=\"match\">Dante</em> Alighieri</i> &amp; altro"],
                        "title": ["<em class=\"match\">Dante</em> Alighieri, Divina commedia and Credo"],
                        "textual_content": ["<em class=\"match\">Dante</em> in una carta"]
                    },
                    "MS-MM-00002-00003-00002-00001-1": {
                        "title": ["un'altra scheda con lo stesso inizio"]
                    }
                }
            })))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            cambridge_search: format!("{}/items", server.uri()),
            ..SearchEndpoints::default()
        };

        let page = cambridge(&Client::new(), &endpoints, "dante", 1, None)
            .await
            .expect("search resolves");

        let result = &page.results[0];
        assert_eq!(result.date.as_deref(), Some("1330-1375"));
        assert_eq!(
            result.match_hints,
            vec![
                MatchHint {
                    section: Some("Title".to_string()),
                    text: "Dante Alighieri, Divina commedia and Credo".to_string(),
                },
                MatchHint {
                    section: Some("Bibliography".to_string()),
                    text: "Petrocchi, Le opere di Dante Alighieri & altro".to_string(),
                },
            ]
        );
        assert!(!page.has_more);
    }
}
