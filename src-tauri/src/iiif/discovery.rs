use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use std::sync::atomic::AtomicBool;

use super::network::NetworkProfile;
use super::resolvers::{self, Strength};
use super::search::{self, SearchEndpoints};
use super::{find_provider, IIIFProvider, SearchMode};
use crate::download::courtesy::{Courtesy, Signals, Turn};
use tauri::Manager;

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
    /// Autori, curatori o traduttori oltre al primo (`creator`), quando il
    /// manifesto stesso li dichiara nel proprio `metadata`.
    pub contributors: Vec<String>,
    pub publisher: Option<String>,
    /// Licenza o stato del diritto d'autore, quando il manifesto lo dichiara.
    pub rights: Vec<String>,
    pub physical_description: Option<String>,
    /// Fondo/istituto conservatore, quando il manifesto stesso lo dichiara nel
    /// proprio `metadata` — a differenza della ricerca, qui non c'è una
    /// risposta strutturata della biblioteca da cui leggerlo con certezza.
    pub holding_institution: Option<String>,
    /// La pagina web pensata per un lettore umano: nello standard IIIF è
    /// `homepage`, non il manifesto stesso (`manifest_url`).
    pub page_url: Option<String>,
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
    /// Autori, curatori o traduttori oltre al primo (`creator`). Le
    /// biblioteche che dichiarano più di un responsabile li perdevano tutti
    /// tranne il primo.
    pub contributors: Vec<String>,
    pub publisher: Option<String>,
    /// Licenza o stato del diritto d'autore, quando la biblioteca lo dichiara
    /// (spesso più di una forma della stessa dichiarazione, es. in due lingue).
    pub rights: Vec<String>,
    /// Descrizione fisica del documento (supporto, misure, numero di carte):
    /// non è il tipo di materiale (`media_type`), è la scheda catalografica.
    pub physical_description: Option<String>,
    /// Fondo e segnatura presso l'istituto che conserva l'originale.
    pub holding_institution: Option<String>,
    /// Collegamento alla scheda del catalogo cartaceo/archivistico, quando
    /// distinta dalla pagina di lettura online.
    pub catalog_url: Option<String>,
    /// La pagina web dell'opera sul sito della biblioteca, pensata per un
    /// lettore umano — non il manifesto IIIF (`manifest_url`, un documento
    /// tecnico) né la scheda del catalogo cartaceo (`catalog_url`).
    pub page_url: Option<String>,
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

pub struct SearchPage {
    pub results: Vec<DiscoveryResult>,
    pub has_more: bool,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        // Alcune biblioteche (la Vaticana fra queste) rifiutano le richieste
        // che non sembrano un browser vero, e la ricerca vive di una sessione
        // aperta dalla pagina prima: senza né l'uno né l'altra, la ricerca
        // libera falliva sempre, la lettura diretta di un manifesto no.
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .cookie_store(true)
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

/// Come `metadata_value`, ma per le etichette che il manifesto dichiara con
/// più valori insieme (es. più responsabili, più licenze): il primo valore
/// non basta, e `metadata_value` lo scarterebbe.
fn metadata_values(value: &Value, key: &str) -> Vec<String> {
    value
        .get("metadata")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|entry| {
            text(entry.get("label")).is_some_and(|label| label.eq_ignore_ascii_case(key))
        })
        .flat_map(|entry| texts(entry.get("value")))
        .collect()
}

/// La pagina web pensata per un lettore umano (`homepage` nello standard
/// IIIF Presentation API), non il manifesto tecnico.
fn homepage_url(value: &Value) -> Option<String> {
    let homepage = value.get("homepage")?;
    let first = match homepage {
        Value::Array(values) => values.first()?,
        other => other,
    };
    // `id`/`@id` prima: un `homepage` IIIF è un oggetto con più campi
    // (`type`, `format`, `label`...) e `text()` prenderebbe il primo trovato
    // in ordine alfabetico delle chiavi, non necessariamente l'indirizzo.
    first
        .get("id")
        .or_else(|| first.get("@id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| text(Some(first)))
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
    // Gallica mette la segnatura in `label` (il campo che lo standard IIIF
    // userebbe per il titolo) e il titolo vero solo dentro `metadata` — non è
    // un caso isolato, va cercato lì per primo e ripiegare su `label`/`title`
    // solo se la biblioteca non dichiara affatto un titolo nei metadati.
    let title = metadata_value(&value, "title")
        .or_else(|| text(value.get("label")))
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
        contributors: {
            let mut found = metadata_values(&value, "contributor");
            found.extend(metadata_values(&value, "contributors"));
            found
        },
        publisher: metadata_value(&value, "publisher"),
        rights: {
            let mut found = metadata_values(&value, "rights");
            found.extend(metadata_values(&value, "license"));
            found
        },
        physical_description: metadata_value(&value, "extent")
            .or_else(|| metadata_value(&value, "physical description")),
        holding_institution: metadata_value(&value, "repository")
            .or_else(|| metadata_value(&value, "holding institution"))
            .or_else(|| metadata_value(&value, "institution")),
        page_url: homepage_url(&value),
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

pub(super) async fn wait_if_gated(gate: Option<&Gate<'_>>, url: &str) -> Option<Turn> {
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
        // Verificato su Gallica: senza dichiarare di volere JSON, il server
        // risponde 500 con una pagina di errore invece del manifesto.
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| {
            log::warn!("discovery manifest request failed url={manifest_url} error={error}");
            "The manifest could not be reached.".to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery manifest response failed url={manifest_url} error={error}");
            "The manifest could not be read.".to_string()
        })?;
    let value = response.json::<Value>().await.map_err(|error| {
        log::warn!("discovery manifest parse failed url={manifest_url} error={error}");
        "The manifest is not valid JSON.".to_string()
    })?;

    Ok(manifest_preview(manifest_url, value))
}

/// Completa un risultato di ricerca leggendo il suo manifesto, per le
/// biblioteche la cui pagina di ricerca non porta già autore, data e lingua
/// (una pagina scarsa come quella della Vaticana, non un servizio come l'SRU
/// di Gallica che li dà da sé). Uguale per qualunque biblioteca: chi ha già
/// tutto non fa nessuna richiesta in più, chi ha solo titolo e copertina
/// prende il resto dal manifesto che comunque cerca per aprire l'opera.
///
/// Un manifesto che non si legge lascia il risultato come stava: un libro
/// scomparso non deve rompere la ricerca degli altri diciannove.
async fn enrich_from_manifest(
    client: &Client,
    gate: Option<&Gate<'_>>,
    result: DiscoveryResult,
) -> DiscoveryResult {
    if result.creator.is_some() {
        return result;
    }
    let preview = match resolve_manifest(client, result.manifest_url.clone(), gate).await {
        Ok(preview) => preview,
        Err(error) => {
            log::warn!(
                "discovery enrichment skipped id={} manifest={} error={error}",
                result.id,
                result.manifest_url
            );
            return result;
        }
    };
    DiscoveryResult {
        creator: preview.creator,
        date: result.date.or(preview.date),
        language: result.language.or(preview.language),
        volume: result.volume.or(preview.volume),
        item_count: result.item_count.or(preview.item_count),
        subjects: if result.subjects.is_empty() {
            preview.subjects
        } else {
            result.subjects
        },
        ..result
    }
}

async fn enrich_results(
    client: &Client,
    gate: Option<&Gate<'_>>,
    results: Vec<DiscoveryResult>,
) -> Vec<DiscoveryResult> {
    let mut enriched = Vec::with_capacity(results.len());
    for result in results {
        enriched.push(enrich_from_manifest(client, gate, result).await);
    }
    enriched
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
        .map_err(|error| {
            log::warn!("discovery archive request failed error={error}");
            "Internet Archive could not be reached.".to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery archive response failed error={error}");
            "Internet Archive search failed.".to_string()
        })?;
    let value = response.json::<Value>().await.map_err(|error| {
        log::warn!("discovery archive body failed error={error}");
        "Internet Archive returned invalid data.".to_string()
    })?;

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
                contributors: Vec::new(),
                publisher: text(document.get("publisher")),
                rights: text(document.get("licenseurl")).into_iter().collect(),
                physical_description: None,
                holding_institution: None,
                catalog_url: None,
                page_url: Some(format!("https://archive.org/details/{id}")),
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

/// Come si arriva da quello che l'utente ha scritto a un risultato.
///
/// Due strade, nell'ordine che la biblioteca dichiara: **riconoscere** ciò che
/// è stato scritto (indirizzo, segnatura, identificativo) e aprire il
/// manifesto, oppure **cercare** dentro il suo catalogo. Le biblioteche che
/// cercano prima usano il riconoscimento solo quando è inequivocabile: su
/// Gallica una parola qualsiasi somiglia a un identificativo, e trattarla come
/// tale porterebbe a un manifesto che non esiste invece che ai risultati.
async fn discover_with(
    client: &Client,
    provider: &IIIFProvider,
    input: &str,
    endpoints: &SearchEndpoints,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<DiscoveryOutcome, String> {
    let value = input.trim();
    let nothing = || DiscoveryOutcome {
        cached_at: None,
        status: DiscoveryStatus::NotFound,
        provider_key: provider.key.to_string(),
        manifest: None,
        results: Vec::new(),
        has_more: false,
    };
    if value.is_empty() {
        return Ok(nothing());
    }

    let recognised = resolvers::resolve(provider.resolver, value);
    let recognised_first = match provider.search_mode {
        SearchMode::Direct | SearchMode::Fallback => recognised.clone(),
        SearchMode::SearchFirst => recognised
            .clone()
            .filter(|resolution| resolution.strength == Strength::Strong),
    };

    if let Some(resolution) = recognised_first {
        return Ok(DiscoveryOutcome {
            cached_at: None,
            status: DiscoveryStatus::Manifest,
            provider_key: provider.key.to_string(),
            manifest: Some(resolve_manifest(client, resolution.manifest_url, gate).await?),
            results: Vec::new(),
            has_more: false,
        });
    }

    if matches!(provider.search_mode, SearchMode::Direct) {
        return Ok(nothing());
    }

    let search = match provider.key {
        // Internet Archive ha il suo servizio da prima di questo modulo.
        "archive_org" => {
            search_archive(client, value, &endpoints.archive_search, page, gate).await?
        }
        _ => match provider.search_handler {
            Some(handler) => search::run(client, handler, endpoints, value, page, gate).await?,
            None => return Ok(nothing()),
        },
    };

    if !search.results.is_empty() {
        // Solo la Vaticana, per ora: la sua pagina di ricerca non porta
        // autore, data o lingua, e il suo indirizzo dei manifesti è
        // configurabile per le prove. Le altre biblioteche che cercano già
        // danno tutto da sole (Gallica) o aspettano lo stesso trattamento in
        // un secondo momento (e-codices).
        let results = if provider.key == "vatican" {
            enrich_results(client, gate, search.results).await
        } else {
            search.results
        };
        return Ok(DiscoveryOutcome {
            cached_at: None,
            status: DiscoveryStatus::Results,
            provider_key: provider.key.to_string(),
            manifest: None,
            results,
            has_more: search.has_more,
        });
    }

    // La ricerca non ha trovato niente: se quello che è stato scritto somigliava
    // comunque a un identificativo, vale la pena provarlo prima di dire di no.
    if let Some(resolution) = recognised {
        return Ok(DiscoveryOutcome {
            cached_at: None,
            status: DiscoveryStatus::Manifest,
            provider_key: provider.key.to_string(),
            manifest: Some(resolve_manifest(client, resolution.manifest_url, gate).await?),
            results: Vec::new(),
            has_more: false,
        });
    }

    Ok(nothing())
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
        &SearchEndpoints::default(),
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
        matchers::{header, method, path, query_param},
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
            &SearchEndpoints::default(),
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

    #[test]
    fn manifest_preview_prefers_the_metadata_title_over_a_label_that_is_really_a_shelfmark() {
        // Verificato su un manifesto vero di Gallica: `label` è la segnatura
        // ("BnF, département Littérature et art, V-22944"), il titolo vero
        // sta solo dentro `metadata` con etichetta "Title".
        let preview = manifest_preview(
            "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k3282120/manifest.json".to_string(),
            serde_json::json!({
                "label": "BnF, département Littérature et art, V-22944",
                "metadata": [
                    {"label": "Shelfmark", "value": "Bibliothèque nationale de France, département Littérature et art, V-22944"},
                    {"label": "Title", "value": "Le guidon des capitaines"},
                ],
            }),
        );

        assert_eq!(preview.title, "Le guidon des capitaines");
    }

    #[test]
    fn manifest_preview_reads_source_metadata_when_the_manifest_declares_it() {
        let preview = manifest_preview(
            "https://example.test/manifest.json".to_string(),
            serde_json::json!({
                "label": "Book of Hours",
                "metadata": [
                    {"label": "Contributor", "value": ["Jane Editor", "John Translator"]},
                    {"label": "Publisher", "value": "Example Press"},
                    {"label": "Rights", "value": "CC BY 4.0"},
                    {"label": "Extent", "value": "120 folios"},
                    {"label": "Repository", "value": "Example Library, MS 42"},
                ],
                "homepage": [{"id": "https://example.test/read/42", "type": "Text"}],
            }),
        );

        assert_eq!(preview.contributors, vec!["Jane Editor", "John Translator"]);
        assert_eq!(preview.publisher.as_deref(), Some("Example Press"));
        assert_eq!(preview.rights, vec!["CC BY 4.0"]);
        assert_eq!(preview.physical_description.as_deref(), Some("120 folios"));
        assert_eq!(
            preview.holding_institution.as_deref(),
            Some("Example Library, MS 42")
        );
        assert_eq!(
            preview.page_url.as_deref(),
            Some("https://example.test/read/42")
        );
    }

    #[test]
    fn manifest_preview_without_declared_metadata_leaves_the_new_fields_empty() {
        let preview = manifest_preview(
            "https://example.test/manifest.json".to_string(),
            serde_json::json!({"label": "Bare Manifest"}),
        );

        assert!(preview.contributors.is_empty());
        assert!(preview.publisher.is_none());
        assert!(preview.rights.is_empty());
        assert!(preview.physical_description.is_none());
        assert!(preview.holding_institution.is_none());
        assert!(preview.page_url.is_none());
    }

    #[test]
    fn homepage_url_reads_the_id_not_another_field_that_sorts_first() {
        // `format` viene prima di `id` in ordine alfabetico: se si leggesse il
        // primo valore testuale trovato invece di cercare `id` di proposito,
        // qui si prenderebbe "text/html" invece dell'indirizzo vero.
        let preview = manifest_preview(
            "https://example.test/manifest.json".to_string(),
            serde_json::json!({
                "label": "Book of Hours",
                "homepage": [{"format": "text/html", "id": "https://example.test/read/42"}],
            }),
        );

        assert_eq!(
            preview.page_url.as_deref(),
            Some("https://example.test/read/42")
        );
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
            &SearchEndpoints {
                archive_search: format!("{}/search", server.uri()),
                ..SearchEndpoints::default()
            },
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
        assert_eq!(
            outcome.results[0].page_url.as_deref(),
            Some("https://archive.org/details/ms-1")
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

    #[tokio::test]
    async fn a_vatican_shelfmark_opens_its_manuscript_without_searching() {
        let server = MockServer::start().await;
        // La segnatura si riconosce da sola: nessuna richiesta di ricerca deve
        // partire, e infatti il server finto non ne offre nessuna.
        Mock::given(method("GET"))
            .and(path("/iiif/MSS_Urb.lat.1779/manifest.json"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"label": "Urbinate latino 1779"})),
            )
            .mount(&server)
            .await;
        let provider = find_provider("vatican").expect("provider exists");
        let endpoints = SearchEndpoints {
            vatican_search: format!("{}/mss/search", server.uri()),
            // Il manifesto dei risultati di ricerca punta qui, non al vero
            // digi.vatlib.it: senza questo la prova telefonerebbe davvero a
            // Internet per arricchire il risultato.
            vatican_manifest_base: server.uri(),
            vatican_home: format!("{}/mss/", server.uri()),
            ..SearchEndpoints::default()
        };

        let resolved = resolvers::resolve(provider.resolver, "Urb. lat. 1779").expect("segnatura");
        assert_eq!(
            resolved.manifest_url,
            "https://digi.vatlib.it/iiif/MSS_Urb.lat.1779/manifest.json"
        );

        // La ricerca vive di una sessione aperta da questa pagina.
        Mock::given(method("GET"))
            .and(path("/mss/"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;
        // Il testo libero, invece, passa dalla ricerca della biblioteca.
        Mock::given(method("GET"))
            .and(path("/mss/search"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<div class="row-search-result-record">
                     <a href="/mss/edition/MSS_Vat.lat.3225" class="link-search-result-record-view">Vergilius</a>
                   </div>"#,
            ))
            .mount(&server)
            .await;
        // La pagina di ricerca non dice chi ha scritto l'opera: il risultato
        // si arricchisce leggendo il suo manifesto, come questo finto.
        Mock::given(method("GET"))
            .and(path("/iiif/MSS_Vat.lat.3225/manifest.json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "label": "Vergilius Vaticanus",
                "metadata": [
                    {"label": "Author", "value": "Publius Vergilius Maro"},
                    {"label": "Date", "value": "sec. IV"},
                ],
            })))
            .mount(&server)
            .await;

        let outcome = discover_with(&Client::new(), provider, "vergilius", &endpoints, 1, None)
            .await
            .expect("ricerca");

        assert_eq!(outcome.status, DiscoveryStatus::Results);
        assert_eq!(outcome.results[0].id, "MSS_Vat.lat.3225");
        assert_eq!(
            outcome.results[0].creator.as_deref(),
            Some("Publius Vergilius Maro")
        );
        assert_eq!(outcome.results[0].date.as_deref(), Some("sec. IV"));
    }

    #[tokio::test]
    async fn a_vatican_word_search_opens_a_session_before_searching() {
        // Il sito rifiuta la ricerca come se non venisse da un browser vero
        // quando non ha prima visto una richiesta alla pagina normale del
        // catalogo: senza questa visita e senza dire da dove si viene, la
        // ricerca libera falliva sempre (la lettura diretta di un manifesto,
        // che non passa da qui, no).
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/mss/"))
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/mss/search"))
            .and(header("Referer", format!("{}/mss/", server.uri()).as_str()))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"></srw:searchRetrieveResponse>"#,
            ))
            .expect(1)
            .mount(&server)
            .await;
        let provider = find_provider("vatican").expect("provider exists");
        let endpoints = SearchEndpoints {
            vatican_search: format!("{}/mss/search", server.uri()),
            vatican_home: format!("{}/mss/", server.uri()),
            ..SearchEndpoints::default()
        };

        discover_with(&Client::new(), provider, "vergilius", &endpoints, 1, None)
            .await
            .expect("ricerca");
    }

    #[tokio::test]
    async fn a_vatican_result_keeps_its_thin_data_when_its_manifest_cannot_be_read() {
        // Un libro che è sparito dal server, o che risponde con un errore, non
        // deve rompere la ricerca degli altri: resta con quello che la pagina
        // di ricerca aveva già dato.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/mss/"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/mss/search"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<div class="row-search-result-record">
                     <a href="/mss/edition/MSS_Vat.lat.9999" class="link-search-result-record-view">Sparito</a>
                   </div>"#,
            ))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/iiif/MSS_Vat.lat.9999/manifest.json"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;
        let provider = find_provider("vatican").expect("provider exists");
        let endpoints = SearchEndpoints {
            vatican_search: format!("{}/mss/search", server.uri()),
            vatican_manifest_base: server.uri(),
            vatican_home: format!("{}/mss/", server.uri()),
            ..SearchEndpoints::default()
        };

        let outcome = discover_with(&Client::new(), provider, "sparito", &endpoints, 1, None)
            .await
            .expect("ricerca");

        assert_eq!(outcome.results[0].title, "Sparito");
        assert_eq!(outcome.results[0].creator, None);
    }

    #[tokio::test]
    async fn an_ecodices_word_reaches_its_search_instead_of_stopping_at_recognition() {
        // La biblioteca si dichiarava «solo riconoscimento»: la sua ricerca
        // esisteva e non veniva mai chiamata, quindi cercare una parola non
        // dava mai niente.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/all"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<div class="search-result">
                     <a href="https://www.e-codices.unifr.ch/en/bbb/0264">Facsimile</a>
                     <div class="document-ms-title">Titus Livius</div>
                   </div>"#,
            ))
            .mount(&server)
            .await;
        let provider = find_provider("ecodices").expect("provider exists");
        let endpoints = SearchEndpoints {
            ecodices_search: format!("{}/search/all", server.uri()),
            ..SearchEndpoints::default()
        };

        let outcome = discover_with(&Client::new(), provider, "graduale", &endpoints, 1, None)
            .await
            .expect("ricerca");

        assert_eq!(outcome.status, DiscoveryStatus::Results);
        assert_eq!(outcome.results[0].id, "bbb-0264");
    }

    #[tokio::test]
    async fn a_gallica_title_is_searched_not_mistaken_for_an_identifier() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/SRU"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
                     <srw:numberOfRecords>1</srw:numberOfRecords>
                     <srw:record><srw:recordData><oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
                       <dc:title>Heures</dc:title>
                       <dc:identifier>https://gallica.bnf.fr/ark:/12148/btv1b84260335</dc:identifier>
                     </oai_dc:dc></srw:recordData></srw:record>
                   </srw:searchRetrieveResponse>"#,
            ))
            .mount(&server)
            .await;
        let provider = find_provider("gallica").expect("provider exists");
        let endpoints = SearchEndpoints {
            gallica_sru: format!("{}/SRU", server.uri()),
            ..SearchEndpoints::default()
        };

        // «heures» somiglia a un identificativo Gallica: senza la ricerca
        // prima, finirebbe su un manifesto inesistente.
        let outcome = discover_with(&Client::new(), provider, "heures", &endpoints, 1, None)
            .await
            .expect("ricerca");

        assert_eq!(outcome.status, DiscoveryStatus::Results);
        assert_eq!(
            outcome.results[0].manifest_url,
            "https://gallica.bnf.fr/iiif/ark:/12148/btv1b84260335/manifest.json"
        );
    }

    #[tokio::test]
    async fn gallica_search_uses_the_site_wide_index_not_title_only() {
        // Il sito cerca su tutti i metadati con l'indice `gallica`: cercare
        // solo `dc.title` perdeva le opere dove il termine compare come
        // autore o altrove, non nel titolo.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/SRU"))
            .and(query_param("query", "gallica all \"cavalcabo di cremona\""))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
                     <srw:numberOfRecords>0</srw:numberOfRecords>
                   </srw:searchRetrieveResponse>"#,
            ))
            .mount(&server)
            .await;
        let provider = find_provider("gallica").expect("provider exists");
        let endpoints = SearchEndpoints {
            gallica_sru: format!("{}/SRU", server.uri()),
            ..SearchEndpoints::default()
        };

        let outcome = discover_with(
            &Client::new(),
            provider,
            "cavalcabo di cremona",
            &endpoints,
            1,
            None,
        )
        .await
        .expect("ricerca");

        assert_eq!(outcome.status, DiscoveryStatus::NotFound);
    }
}
