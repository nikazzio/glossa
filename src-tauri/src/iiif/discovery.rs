use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use std::sync::atomic::AtomicBool;

use super::network::NetworkProfile;
use super::{find_provider, IIIFProvider, SearchMode};
use crate::download::courtesy::{Courtesy, Signals, Turn};
use tauri::Manager;

const ARCHIVE_SEARCH_URL: &str = "https://archive.org/advancedsearch.php";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryStatus {
    Manifest,
    Results,
    NotFound,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestPreview {
    pub manifest_url: String,
    pub title: String,
    pub creator: Option<String>,
    pub date: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub language: Option<String>,
    pub volume: Option<String>,
    pub subjects: Vec<String>,
    pub item_count: Option<usize>,
    pub material_type: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResult {
    pub id: String,
    pub title: String,
    pub creator: Option<String>,
    pub date: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub media_type: Option<String>,
    pub collection: Option<String>,
    pub language: Option<String>,
    pub volume: Option<String>,
    pub subjects: Vec<String>,
    /// Quante pagine dichiara la biblioteca, quando lo dichiara: è il dato con
    /// cui si decide se scaricare un'opera, e va visto prima di aprirla.
    pub item_count: Option<usize>,
    pub manifest_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryOutcome {
    pub status: DiscoveryStatus,
    /// Quando questo risultato è arrivato dalla biblioteca, se non è arrivato
    /// adesso. Chi guarda deve sapere **di quando** è quello che ha davanti,
    /// altrimenti non può decidere se vale la pena rifare la ricerca.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cached_at: Option<i64>,
    pub provider_key: String,
    pub manifest: Option<ManifestPreview>,
    pub results: Vec<DiscoveryResult>,
    pub has_more: bool,
}

struct SearchPage {
    results: Vec<DiscoveryResult>,
    has_more: bool,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())
}

fn text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(value) => Some(value.clone()),
        Value::Array(values) => values.iter().find_map(|item| text(Some(item))),
        Value::Object(values) => values.values().find_map(|value| text(Some(value))),
        _ => None,
    }
}

/// Un conteggio dichiarato dalla biblioteca. Archive.org lo manda a volte come
/// numero e a volte come stringa, e in qualche record non c'è affatto: in quel
/// caso resta vuoto invece di diventare zero, che vorrebbe dire «nessuna
/// pagina».
fn count(value: Option<&Value>) -> Option<usize> {
    match value? {
        Value::Number(number) => number.as_u64().map(|value| value as usize),
        Value::String(text) => text.trim().parse::<usize>().ok(),
        Value::Array(values) => values.iter().find_map(|item| count(Some(item))),
        _ => None,
    }
}

fn texts(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::String(value)) => vec![value.clone()],
        Some(Value::Array(values)) => values.iter().filter_map(|item| text(Some(item))).collect(),
        _ => Vec::new(),
    }
}

fn metadata_value(value: &Value, key: &str) -> Option<String> {
    value
        .get("metadata")
        .and_then(Value::as_array)
        .and_then(|entries| {
            entries.iter().find_map(|entry| {
                let label = text(entry.get("label"))?;
                (label.eq_ignore_ascii_case(key))
                    .then(|| text(entry.get("value")))
                    .flatten()
            })
        })
}

fn thumbnail_url(value: &Value) -> Option<String> {
    let thumbnail = value.get("thumbnail")?;
    text(Some(thumbnail))
        .or_else(|| {
            thumbnail
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            thumbnail
                .get("@id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn manifest_preview(manifest_url: String, value: Value) -> ManifestPreview {
    let title = text(value.get("label"))
        .or_else(|| text(value.get("title")))
        .unwrap_or_default();
    let item_count = value
        .get("items")
        .and_then(Value::as_array)
        .map(Vec::len)
        .or_else(|| {
            value
                .get("sequences")
                .and_then(Value::as_array)
                .and_then(|sequences| sequences.first())
                .and_then(|sequence| sequence.get("canvases"))
                .and_then(Value::as_array)
                .map(Vec::len)
        });

    ManifestPreview {
        manifest_url,
        title,
        creator: metadata_value(&value, "creator").or_else(|| metadata_value(&value, "author")),
        date: metadata_value(&value, "date"),
        description: text(value.get("summary")).or_else(|| text(value.get("description"))),
        thumbnail_url: thumbnail_url(&value),
        language: metadata_value(&value, "language"),
        volume: metadata_value(&value, "volume").or_else(|| metadata_value(&value, "part")),
        subjects: texts(value.get("subject")),
        item_count,
        material_type: metadata_value(&value, "type")
            .or_else(|| metadata_value(&value, "format"))
            .or_else(|| metadata_value(&value, "genre"))
            .or_else(|| metadata_value(&value, "object type"))
            .or_else(|| metadata_value(&value, "material type")),
    }
}

/// La fila verso un host, per le richieste che nascono dalla finestra.
///
/// Anche una ricerca e la lettura di un manifesto passano di qui: prima
/// scavalcavano la cortesia, ed è il modo più diretto di farsi bandire da una
/// biblioteca mentre si guarda una lista.
pub struct Gate<'a> {
    pub courtesy: &'a Courtesy,
    pub profile: &'a NetworkProfile,
}

impl Gate<'_> {
    /// Il turno va **tenuto** per tutta la durata della richiesta: è ciò che
    /// limita quante ne partono insieme verso lo stesso host.
    async fn wait(&self, url: &str) -> Option<Turn> {
        let host = crate::download::fetch::host_of(url).ok()?;
        let never_stops = || false;
        let waiting = AtomicBool::new(false);
        let signals = Signals {
            stop: &never_stops,
            courtesy_wait: &waiting,
        };
        self.courtesy.wait_turn(&host, self.profile, &signals).await
    }
}

async fn wait_if_gated(gate: Option<&Gate<'_>>, url: &str) -> Option<Turn> {
    match gate {
        Some(gate) => gate.wait(url).await,
        None => None,
    }
}

async fn resolve_manifest(
    client: &Client,
    manifest_url: String,
    gate: Option<&Gate<'_>>,
) -> Result<ManifestPreview, String> {
    let _turn = wait_if_gated(gate, &manifest_url).await;
    let response = client
        .get(&manifest_url)
        .send()
        .await
        .map_err(|_| "The manifest could not be reached.".to_string())?
        .error_for_status()
        .map_err(|_| "The manifest could not be read.".to_string())?;
    let value = response
        .json::<Value>()
        .await
        .map_err(|_| "The manifest is not valid JSON.".to_string())?;

    Ok(manifest_preview(manifest_url, value))
}

fn archive_identifier(input: &str) -> Option<String> {
    let url = Url::parse(input).ok()?;
    if !url.host_str()?.ends_with("archive.org") {
        return None;
    }
    let mut segments = url.path_segments()?;
    if segments.next()? != "details" {
        return None;
    }
    segments.next().map(str::to_string)
}

async fn search_archive(
    client: &Client,
    query: &str,
    base_url: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let _turn = wait_if_gated(gate, base_url).await;
    let response = client
        .get(base_url)
        .query(&[
            ("q", query),
            // Tutti i campi utili in una richiesta sola: chiederne uno in più
            // non costa niente, e andarlo a recuperare dopo costerebbe una
            // richiesta per risultato. `imagecount` è il numero di pagine, che
            // è il dato con cui si decide se scaricare un'opera.
            (
                "fl[]",
                "identifier,title,creator,year,date,publisher,description,mediatype,collection,\
                 language,subject,volume,imagecount,downloads,item_size,licenseurl,rights,\
                 contributor,source,call_number",
            ),
            ("rows", "20"),
            ("page", &page.to_string()),
            ("output", "json"),
        ])
        .send()
        .await
        .map_err(|_| "Internet Archive could not be reached.".to_string())?
        .error_for_status()
        .map_err(|_| "Internet Archive search failed.".to_string())?;
    let value = response
        .json::<Value>()
        .await
        .map_err(|_| "Internet Archive returned invalid data.".to_string())?;

    // Il servizio risponde 200 anche quando è il suo motore di ricerca a non
    // rispondere: senza questo, un guasto della biblioteca si legge come
    // «nessun risultato», che manda a cercare l'errore dalla parte sbagliata.
    if let Some(error) = value.get("error").and_then(Value::as_str) {
        log::warn!("discovery archive search failed error={error}");
        return Err("Internet Archive search is not responding.".to_string());
    }

    let results = value
        .pointer("/response/docs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|document| {
            let id = document.get("identifier")?.as_str()?.to_string();
            Some(DiscoveryResult {
                title: text(document.get("title")).unwrap_or_else(|| id.clone()),
                creator: text(document.get("creator")),
                date: text(document.get("year")),
                description: text(document.get("description")),
                thumbnail_url: Some(format!("https://archive.org/services/img/{id}")),
                media_type: text(document.get("mediatype")),
                collection: text(document.get("collection")),
                language: text(document.get("language")),
                volume: text(document.get("volume")),
                subjects: texts(document.get("subject")),
                item_count: count(document.get("imagecount")),
                manifest_url: format!("https://iiif.archive.org/iiif/{id}/manifest.json"),
                id,
            })
        })
        .collect::<Vec<_>>();
    let total = value
        .pointer("/response/numFound")
        .and_then(Value::as_u64)
        .unwrap_or(0);

    log::info!(
        "discovery archive search page={page} found={} total={total}",
        results.len()
    );
    Ok(SearchPage {
        has_more: u64::from(page) * 20 < total,
        results,
    })
}

async fn discover_with(
    client: &Client,
    provider: &IIIFProvider,
    input: &str,
    archive_search_url: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<DiscoveryOutcome, String> {
    let value = input.trim();
    if value.is_empty() {
        return Ok(DiscoveryOutcome {
            cached_at: None,
            status: DiscoveryStatus::NotFound,
            provider_key: provider.key.to_string(),
            manifest: None,
            results: Vec::new(),
            has_more: false,
        });
    }

    if provider.key == "archive_org" && !matches!(provider.search_mode, SearchMode::Direct) {
        if let Some(identifier) = archive_identifier(value) {
            let manifest_url = format!("https://iiif.archive.org/iiif/{identifier}/manifest.json");
            return Ok(DiscoveryOutcome {
                cached_at: None,
                status: DiscoveryStatus::Manifest,
                provider_key: provider.key.to_string(),
                manifest: Some(resolve_manifest(client, manifest_url, gate).await?),
                results: Vec::new(),
                has_more: false,
            });
        }
        let search = search_archive(client, value, archive_search_url, page, gate).await?;
        return Ok(DiscoveryOutcome {
            cached_at: None,
            status: if search.results.is_empty() {
                DiscoveryStatus::NotFound
            } else {
                DiscoveryStatus::Results
            },
            provider_key: provider.key.to_string(),
            manifest: None,
            results: search.results,
            has_more: search.has_more,
        });
    }

    if Url::parse(value).is_ok() {
        return Ok(DiscoveryOutcome {
            cached_at: None,
            status: DiscoveryStatus::Manifest,
            provider_key: provider.key.to_string(),
            manifest: Some(resolve_manifest(client, value.to_string(), gate).await?),
            results: Vec::new(),
            has_more: false,
        });
    }

    Ok(DiscoveryOutcome {
        cached_at: None,
        status: DiscoveryStatus::NotFound,
        provider_key: provider.key.to_string(),
        manifest: None,
        results: Vec::new(),
        has_more: false,
    })
}

#[tauri::command]
pub async fn discover_iiif(
    app: tauri::AppHandle,
    provider_key: String,
    input: String,
    page: Option<u32>,
    // `fresh`: «rifalla davvero». Salta il risultato conservato e ripassa dalla
    // biblioteca — l'unico modo di sapere se il catalogo è cresciuto prima che
    // il risultato conservato scada.
    fresh: Option<bool>,
) -> Result<DiscoveryOutcome, String> {
    let provider = find_provider(&provider_key).ok_or_else(|| "Unknown collection.".to_string())?;
    let page = page.unwrap_or(1).max(1);
    log::info!(
        "discovery requested provider={provider_key} page={page} input_len={}",
        input.len()
    );

    // La stessa ricerca fatta due volte non deve ripassare dalla biblioteca.
    // È l'unica cosa in cache che scade: i cataloghi crescono, e una ricerca
    // di ieri va rifatta.
    let request = crate::httpcache::request::CacheRequest::Search {
        provider_key: provider_key.clone(),
        query: input.clone(),
        page,
        filters: Default::default(),
    };
    if !fresh.unwrap_or(false) {
        if let Some((cached, stored_at)) =
            crate::httpcache::commands::lookup_with_age(&app, &request)
        {
            if let Ok(outcome) = serde_json::from_slice::<DiscoveryOutcome>(&cached) {
                log::info!("discovery answered from cache provider={provider_key} page={page}");
                return Ok(DiscoveryOutcome {
                    cached_at: stored_at,
                    ..outcome
                });
            }
        }
    }

    let profile = crate::db::open_connection(&crate::storage_config::db_path(&app)?)
        .map(|conn| crate::iiif::settings::effective_profile(&conn, &provider_key, None))
        .unwrap_or(super::network::CAUTIOUS);
    let courtesy = app.state::<std::sync::Arc<Courtesy>>().inner().clone();
    let gate = Gate {
        courtesy: &courtesy,
        profile: &profile,
    };
    let outcome = discover_with(
        &client()?,
        provider,
        &input,
        ARCHIVE_SEARCH_URL,
        page,
        Some(&gate),
    )
    .await;

    if let Ok(found) = &outcome {
        // Un risultato vuoto non si conserva: il più delle volte è un guasto
        // passeggero della biblioteca, e ricordarlo per un giorno intero
        // significherebbe far sembrare vuoto un catalogo che non lo è.
        if !found.results.is_empty() || found.manifest.is_some() {
            if let Ok(encoded) = serde_json::to_vec(found) {
                crate::httpcache::commands::store(
                    &app,
                    &request,
                    &encoded,
                    Some("application/json".to_string()),
                );
            }
        }
    }
    match &outcome {
        Ok(found) => log::info!(
            "discovery answered provider={provider_key} status={:?} results={} manifest={}",
            found.status,
            found.results.len(),
            found.manifest.is_some()
        ),
        // È il caso che l'utente vede come «non funziona»: senza una riga qui,
        // di un guasto della biblioteca non resta traccia da nessuna parte.
        Err(error) => log::warn!("discovery failed provider={provider_key} error={error}"),
    }
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{method, path},
        Mock, MockServer, ResponseTemplate,
    };

    #[tokio::test]
    async fn direct_manifest_returns_normalized_preview() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/manifest.json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({"label": {"en": ["Book of Hours"]}, "items": [{}, {}]}),
            ))
            .mount(&server)
            .await;
        let provider = find_provider("generic").expect("provider exists");

        let outcome = discover_with(
            &Client::new(),
            provider,
            &format!("{}/manifest.json", server.uri()),
            ARCHIVE_SEARCH_URL,
            1,
            None,
        )
        .await
        .expect("manifest resolves");

        assert_eq!(outcome.status, DiscoveryStatus::Manifest);
        assert_eq!(outcome.manifest.expect("preview").title, "Book of Hours");
    }

    #[test]
    fn manifest_without_title_leaves_localized_fallback_to_frontend() {
        let preview = manifest_preview(
            "https://example.test/manifest.json".to_string(),
            serde_json::json!({"items": []}),
        );

        assert!(preview.title.is_empty());
    }

    #[tokio::test]
    async fn archive_search_returns_normalized_results() {
        let server = MockServer::start().await;
        Mock::given(method("GET")).and(path("/search")).respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"response": {"docs": [{"identifier": "ms-1", "title": "Manuscript", "creator": "Anonimo"}]}}))).mount(&server).await;
        let provider = find_provider("archive_org").expect("provider exists");

        let outcome = discover_with(
            &Client::new(),
            provider,
            "manuscript",
            &format!("{}/search", server.uri()),
            1,
            None,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.status, DiscoveryStatus::Results);
        assert_eq!(
            outcome.results[0].manifest_url,
            "https://iiif.archive.org/iiif/ms-1/manifest.json"
        );
    }

    #[tokio::test]
    async fn a_broken_search_backend_is_not_an_empty_result() {
        // Archive.org risponde 200 anche quando è il suo motore di ricerca a
        // non rispondere: letto come «nessun risultato» manderebbe a cercare
        // il guasto dalla parte sbagliata.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/advancedsearch.php"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "error": "[BACKEND_ERROR] Invalid or no response from Elasticsearch"
            })))
            .mount(&server)
            .await;

        let outcome = search_archive(
            &Client::new(),
            "dante",
            &format!("{}/advancedsearch.php", server.uri()),
            1,
            None,
        )
        .await;

        assert!(outcome.is_err(), "un guasto della biblioteca si dice");
    }
}
