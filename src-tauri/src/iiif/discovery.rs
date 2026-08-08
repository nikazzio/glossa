use std::time::Duration;

use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use url::Url;

use super::{find_provider, IIIFProvider, SearchMode};

const ARCHIVE_SEARCH_URL: &str = "https://archive.org/advancedsearch.php";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryStatus {
    Manifest,
    Results,
    NotFound,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
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
    pub manifest_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryOutcome {
    pub status: DiscoveryStatus,
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
                (label.eq_ignore_ascii_case(key)).then(|| text(entry.get("value"))).flatten()
            })
        })
}

fn thumbnail_url(value: &Value) -> Option<String> {
    let thumbnail = value.get("thumbnail")?;
    text(Some(thumbnail))
        .or_else(|| thumbnail.get("id").and_then(Value::as_str).map(str::to_string))
        .or_else(|| thumbnail.get("@id").and_then(Value::as_str).map(str::to_string))
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
        description: text(value.get("summary"))
            .or_else(|| text(value.get("description"))),
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

async fn resolve_manifest(
    client: &Client,
    manifest_url: String,
) -> Result<ManifestPreview, String> {
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
) -> Result<SearchPage, String> {
    let response = client
        .get(base_url)
        .query(&[
            ("q", query),
            ("fl[]", "identifier,title,creator,year,description,mediatype,collection,language,subject,volume"),
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
                manifest_url: format!("https://iiif.archive.org/iiif/{id}/manifest.json"),
                id,
            })
        })
        .collect::<Vec<_>>();
    let total = value.pointer("/response/numFound").and_then(Value::as_u64).unwrap_or(0);

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
) -> Result<DiscoveryOutcome, String> {
    let value = input.trim();
    if value.is_empty() {
        return Ok(DiscoveryOutcome {
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
                status: DiscoveryStatus::Manifest,
                provider_key: provider.key.to_string(),
                manifest: Some(resolve_manifest(client, manifest_url).await?),
                results: Vec::new(),
                has_more: false,
            });
        }
        let search = search_archive(client, value, archive_search_url, page).await?;
        return Ok(DiscoveryOutcome {
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
            status: DiscoveryStatus::Manifest,
            provider_key: provider.key.to_string(),
            manifest: Some(resolve_manifest(client, value.to_string()).await?),
            results: Vec::new(),
            has_more: false,
        });
    }

    Ok(DiscoveryOutcome {
        status: DiscoveryStatus::NotFound,
        provider_key: provider.key.to_string(),
        manifest: None,
        results: Vec::new(),
        has_more: false,
    })
}

#[tauri::command]
pub async fn discover_iiif(
    provider_key: String,
    input: String,
    page: Option<u32>,
) -> Result<DiscoveryOutcome, String> {
    let provider = find_provider(&provider_key).ok_or_else(|| "Unknown collection.".to_string())?;
    discover_with(&client()?, provider, &input, ARCHIVE_SEARCH_URL, page.unwrap_or(1).max(1)).await
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
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.status, DiscoveryStatus::Results);
        assert_eq!(
            outcome.results[0].manifest_url,
            "https://iiif.archive.org/iiif/ms-1/manifest.json"
        );
    }
}
