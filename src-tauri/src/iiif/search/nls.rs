//! National Library of Scotland: ricerca sui titoli delle raccolte pubblicate.
//!
//! Il portale di consultazione sta dietro un controllo anti-robot e non si
//! interroga — e non lo si aggira. Quello che la biblioteca offre a chi legge
//! da programma è un albero di raccolte IIIF pubblico: una radice con le
//! raccolte digitalizzate, e dentro ognuna i manifesti delle opere.
//!
//! Da qui la forma di questa ricerca: l'albero si legge una volta, si tiene in
//! memoria per qualche ora e le parole si confrontano con i titoli. **Non è il
//! catalogo della biblioteca**: è ciò che la biblioteca ha digitalizzato ed
//! esposto, e la schermata lo dice.

use reqwest::Client;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use super::super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::{SearchEndpoints, PAGE_SIZE};

/// Quanto resta valido l'albero già letto. Le raccolte digitali cambiano di
/// mese in mese, non di minuto in minuto: rileggerlo a ogni ricerca sarebbe
/// una cinquantina di richieste per una domanda sola.
const INDEX_TTL: Duration = Duration::from_secs(6 * 60 * 60);

/// Quante raccolte si aprono al massimo in una lettura dell'albero: un tetto
/// che protegge dal caso in cui la radice cresca di molto.
const MAX_COLLECTIONS: usize = 80;

#[derive(Clone, Debug)]
struct Entry {
    id: String,
    title: String,
    manifest_url: String,
    collection: Option<String>,
}

struct CachedIndex {
    read_at: Instant,
    entries: Vec<Entry>,
}

/// L'albero letto, per radice. La chiave è l'indirizzo della radice e non un
/// valore solo: le prove puntano a un server finto diverso ognuna, e un albero
/// unico le farebbe leggere i dati della prova precedente.
static INDEX: OnceLock<Mutex<HashMap<String, CachedIndex>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, CachedIndex>> {
    INDEX.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) async fn nls(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let entries = index(client, endpoints, gate).await?;
    let needles: Vec<String> = query
        .split_whitespace()
        .map(|word| word.to_lowercase())
        .filter(|word| !word.is_empty())
        .collect();

    let matched: Vec<&Entry> = entries
        .iter()
        .filter(|entry| matches_all(entry, &needles))
        .collect();

    let start = (page.saturating_sub(1) as usize) * PAGE_SIZE as usize;
    let end = start.saturating_add(PAGE_SIZE as usize);
    let window: Vec<DiscoveryResult> = matched
        .iter()
        .skip(start)
        .take(PAGE_SIZE as usize)
        .map(|entry| result_of(entry))
        .collect();

    log::info!(
        "discovery nls search found={} of={} page={page}",
        window.len(),
        matched.len()
    );
    Ok(SearchPage {
        has_more: matched.len() > end,
        results: window,
    })
}

/// Tutte le parole devono comparire, nel titolo o nel nome della raccolta: chi
/// scrive due parole sta restringendo, non allargando.
fn matches_all(entry: &Entry, needles: &[String]) -> bool {
    if needles.is_empty() {
        return true;
    }
    let haystack = format!(
        "{} {}",
        entry.title.to_lowercase(),
        entry
            .collection
            .as_deref()
            .unwrap_or_default()
            .to_lowercase()
    );
    needles.iter().all(|needle| haystack.contains(needle))
}

fn result_of(entry: &Entry) -> DiscoveryResult {
    DiscoveryResult {
        title: entry.title.clone(),
        creator: None,
        date: None,
        description: None,
        thumbnail_url: None,
        media_type: None,
        collection: entry.collection.clone(),
        language: None,
        volume: None,
        subjects: Vec::new(),
        item_count: None,
        manifest_url: entry.manifest_url.clone(),
        contributors: Vec::new(),
        publisher: None,
        rights: Vec::new(),
        physical_description: None,
        holding_institution: Some("National Library of Scotland".to_string()),
        catalog_url: None,
        page_url: None,
        // L'albero delle raccolte dà titolo e indirizzo del manifesto: il
        // resto dei dati sta nel manifesto, che si legge quando si apre.
        raw: BTreeMap::new(),
        openable: None,
        id: entry.id.clone(),
    }
}

/// L'albero già letto, oppure una lettura nuova quando è scaduto.
async fn index(
    client: &Client,
    endpoints: &SearchEndpoints,
    gate: Option<&Gate<'_>>,
) -> Result<Vec<Entry>, String> {
    let root = endpoints.nls_collections.clone();
    if let Some(cached) = cache().lock().ok().and_then(|guard| {
        guard
            .get(&root)
            .filter(|index| index.read_at.elapsed() < INDEX_TTL)
            .map(|index| index.entries.clone())
    }) {
        return Ok(cached);
    }

    let entries = read_tree(client, endpoints, gate).await?;
    if let Ok(mut guard) = cache().lock() {
        guard.insert(
            root,
            CachedIndex {
                read_at: Instant::now(),
                entries: entries.clone(),
            },
        );
    }
    Ok(entries)
}

async fn read_tree(
    client: &Client,
    endpoints: &SearchEndpoints,
    gate: Option<&Gate<'_>>,
) -> Result<Vec<Entry>, String> {
    let root = fetch_json(client, &endpoints.nls_collections, gate).await?;
    let mut entries = Vec::new();
    let mut opened = 0usize;

    collect_manifests(&root, None, &mut entries);
    for child in members(&root, "collections") {
        if opened >= MAX_COLLECTIONS {
            break;
        }
        let Some(url) = child.get("@id").and_then(|value| value.as_str()) else {
            continue;
        };
        if type_of(child) != "sc:Collection" {
            continue;
        }
        opened += 1;
        // Una raccolta che non risponde non ferma le altre: la ricerca dice
        // quello che ha trovato, e il motivo resta nel log.
        match fetch_json(client, url, gate).await {
            Ok(collection) => {
                let label = label_of(&collection).or_else(|| label_of(child));
                collect_manifests(&collection, label.as_deref(), &mut entries);
            }
            Err(reason) => log::warn!(
                "discovery nls collection skipped url={} reason={reason}",
                without_query(url)
            ),
        }
    }

    log::info!("discovery nls index built entries={}", entries.len());
    Ok(entries)
}

fn collect_manifests(
    value: &serde_json::Value,
    collection: Option<&str>,
    entries: &mut Vec<Entry>,
) {
    for key in ["manifests", "collections"] {
        for member in members(value, key) {
            if type_of(member) != "sc:Manifest" {
                continue;
            }
            let Some(url) = member.get("@id").and_then(|value| value.as_str()) else {
                continue;
            };
            let Some(title) = label_of(member) else {
                continue;
            };
            let id = super::super::resolvers::nls_id(url).unwrap_or_else(|| url.to_string());
            entries.push(Entry {
                id,
                title,
                manifest_url: url.to_string(),
                collection: collection.map(|label| label.to_string()),
            });
        }
    }
}

fn members<'a>(value: &'a serde_json::Value, key: &str) -> Vec<&'a serde_json::Value> {
    value
        .get(key)
        .and_then(|value| value.as_array())
        .map(|array| array.iter().collect())
        .unwrap_or_default()
}

fn type_of(value: &serde_json::Value) -> &str {
    value.get("@type").and_then(|v| v.as_str()).unwrap_or("")
}

/// L'etichetta di IIIF 2 è una stringa o una lista: si prende la prima.
fn label_of(value: &serde_json::Value) -> Option<String> {
    match value.get("label")? {
        serde_json::Value::String(text) => Some(text.trim().to_string()),
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|item| item.as_str())
            .map(|text| text.trim().to_string()),
        serde_json::Value::Object(map) => map
            .values()
            .find_map(|value| value.as_str())
            .map(|text| text.trim().to_string()),
        _ => None,
    }
    .filter(|text| !text.is_empty())
}

/// L'indirizzo senza la sua coda: quale raccolta ha fallito si deve sapere,
/// ma ciò che sta dopo `?` può contenere firme, e nel log non ci va.
fn without_query(url: &str) -> &str {
    url.split('?').next().unwrap_or(url)
}

async fn fetch_json(
    client: &Client,
    url: &str,
    gate: Option<&Gate<'_>>,
) -> Result<serde_json::Value, String> {
    let _turn = super::super::discovery::wait_if_gated(gate, url).await;
    client
        .get(url)
        .send()
        .await
        .map_err(|error| {
            log::warn!(
                "discovery nls request failed url={} error={error}",
                without_query(url)
            );
            super::SEARCH_UNREACHABLE.to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!(
                "discovery nls response failed url={} error={error}",
                without_query(url)
            );
            super::reason_for(&error)
        })?
        .json::<serde_json::Value>()
        .await
        .map_err(|error| {
            log::warn!(
                "discovery nls body failed url={} error={error}",
                without_query(url)
            );
            super::SEARCH_INVALID_DATA.to_string()
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };

    fn entry(title: &str, collection: Option<&str>) -> Entry {
        Entry {
            id: "133475158".to_string(),
            title: title.to_string(),
            manifest_url: "https://view.nls.uk/manifest/1334/7515/133475158/manifest.json"
                .to_string(),
            collection: collection.map(|value| value.to_string()),
        }
    }

    #[test]
    fn every_word_has_to_appear() {
        let mandeville = entry("Mandeville's travels and other texts", None);
        assert!(matches_all(&mandeville, &["travels".into()]));
        assert!(matches_all(
            &mandeville,
            &["mandeville".into(), "texts".into()]
        ));
        assert!(!matches_all(
            &mandeville,
            &["mandeville".into(), "aristotele".into()]
        ));
    }

    #[test]
    fn the_collection_name_is_searched_too() {
        let romance = entry(
            "Romance and religion",
            Some("Manuscripts containing Middle English texts"),
        );
        assert!(matches_all(&romance, &["middle".into(), "english".into()]));
    }

    #[test]
    fn manifests_are_collected_from_both_shapes_of_member_list() {
        let tree = serde_json::json!({
            "@type": "sc:Collection",
            "collections": [
                { "@id": "https://view.nls.uk/manifest/7445/74457611/manifest.json",
                  "@type": "sc:Manifest", "label": "Photographs of Edinburgh" },
                { "@id": "https://view.nls.uk/collections/1334/7486/133474867.json",
                  "@type": "sc:Collection", "label": "Middle English" }
            ],
            "manifests": [
                { "@id": "https://view.nls.uk/manifest/1334/7515/133475158/manifest.json",
                  "@type": "sc:Manifest", "label": ["Mandeville's travels"] }
            ]
        });
        let mut entries = Vec::new();
        collect_manifests(&tree, Some("Raccolta"), &mut entries);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, "133475158");
        assert_eq!(entries[1].id, "74457611");
        assert!(entries
            .iter()
            .all(|entry| entry.collection.as_deref() == Some("Raccolta")));
    }

    #[tokio::test]
    async fn the_tree_is_read_down_to_the_works_and_paginated() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/top.json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "@type": "sc:Collection",
                "collections": [
                    { "@id": format!("{}/one.json", server.uri()),
                      "@type": "sc:Collection", "label": "Manoscritti" }
                ]
            })))
            .mount(&server)
            .await;
        let works: Vec<serde_json::Value> = (0..25)
            .map(|index| {
                serde_json::json!({
                    "@id": format!("https://view.nls.uk/manifest/1334/7515/13347{index:04}/manifest.json"),
                    "@type": "sc:Manifest",
                    "label": format!("Mandeville {index}")
                })
            })
            .collect();
        Mock::given(method("GET"))
            .and(path("/one.json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "@type": "sc:Collection", "label": "Manoscritti", "manifests": works
            })))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            nls_collections: format!("{}/top.json", server.uri()),
            ..SearchEndpoints::default()
        };

        let first = nls(&Client::new(), &endpoints, "mandeville", 1, None)
            .await
            .expect("la ricerca risponde");
        assert_eq!(first.results.len(), PAGE_SIZE as usize);
        assert!(first.has_more);
        assert_eq!(first.results[0].collection.as_deref(), Some("Manoscritti"));
        assert_eq!(first.results[0].id, "133470000");

        let second = nls(&Client::new(), &endpoints, "mandeville", 2, None)
            .await
            .expect("la seconda pagina risponde");
        assert_eq!(second.results.len(), 5);
        assert!(!second.has_more);
    }

    #[tokio::test]
    async fn a_collection_that_fails_does_not_stop_the_others() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/top.json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "@type": "sc:Collection",
                "collections": [
                    { "@id": format!("{}/rotta.json", server.uri()),
                      "@type": "sc:Collection", "label": "Rotta" },
                    { "@id": format!("{}/buona.json", server.uri()),
                      "@type": "sc:Collection", "label": "Buona" }
                ]
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/rotta.json"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/buona.json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "@type": "sc:Collection", "label": "Buona",
                "manifests": [{
                    "@id": "https://view.nls.uk/manifest/7446/74464117/manifest.json",
                    "@type": "sc:Manifest", "label": "Forth Bridge illustrations"
                }]
            })))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            nls_collections: format!("{}/top.json", server.uri()),
            ..SearchEndpoints::default()
        };

        let page = nls(&Client::new(), &endpoints, "forth", 1, None)
            .await
            .expect("la ricerca risponde con quello che ha");
        assert_eq!(page.results.len(), 1);
        assert_eq!(page.results[0].id, "74464117");
    }

    #[tokio::test]
    async fn a_root_that_does_not_answer_is_a_failure_not_an_empty_result() {
        // Zero risultati e servizio irraggiungibile sono due cose diverse: la
        // seconda non deve leggersi come «la biblioteca non ha niente».
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/top.json"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            nls_collections: format!("{}/top.json", server.uri()),
            ..SearchEndpoints::default()
        };

        assert!(nls(&Client::new(), &endpoints, "qualsiasi", 1, None)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn the_tree_is_read_once_and_then_reused() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/top.json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "@type": "sc:Collection",
                "manifests": [{
                    "@id": "https://view.nls.uk/manifest/7446/74464117/manifest.json",
                    "@type": "sc:Manifest", "label": "Forth Bridge illustrations"
                }]
            })))
            .expect(1)
            .mount(&server)
            .await;
        let endpoints = SearchEndpoints {
            nls_collections: format!("{}/top.json", server.uri()),
            ..SearchEndpoints::default()
        };

        for _ in 0..3 {
            nls(&Client::new(), &endpoints, "forth", 1, None)
                .await
                .expect("la ricerca risponde");
        }
        // `expect(1)` sul finto: tre ricerche, una lettura sola.
    }
}
