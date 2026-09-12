use std::collections::BTreeMap;
use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};

use std::sync::atomic::AtomicBool;

use super::network::NetworkProfile;
use super::resolvers::{self, Strength};
use super::search::{self, SearchEndpoints};
use super::{find_provider, IIIFProvider, SearchMode};
use crate::download::courtesy::{Courtesy, Lane, Signals, Turn};
use tauri::Manager;

mod archive;
mod manifest;

pub(super) use archive::search_archive;
use manifest::enrich_results;
pub(super) use manifest::{resolve_manifest, thumbnail_of};

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
    /// **Tutto il resto che la biblioteca ha detto** e che non ha un campo suo.
    ///
    /// Le biblioteche restituiscono molto più di quello che l'interfaccia
    /// mostra, e rifare la ricerca domani per recuperare un dato che avevamo già
    /// in mano è lavoro sprecato — oltre che una risposta che potrebbe non
    /// essere più la stessa. Qui si conserva com'è arrivato: chiave così come la
    /// nomina la biblioteca, valori in elenco perché molti campi si ripetono.
    /// Non è una struttura su cui costruire logica: è un deposito. Quando un
    /// dato serve davvero, gli si dà un campo proprio.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub raw: BTreeMap<String, Vec<String>>,
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
        // Una ricerca è quello che l'utente sta aspettando a schermo, non
        // un'acquisizione in blocco: passa dalla corsia della pagina.
        self.courtesy
            .wait_turn(&host, self.profile, Lane::Page, &signals)
            .await
    }
}

pub(super) async fn wait_if_gated(gate: Option<&Gate<'_>>, url: &str) -> Option<Turn> {
    match gate {
        Some(gate) => gate.wait(url).await,
        None => None,
    }
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

    let search = match provider.search_handler {
        Some(handler) => search::run(client, handler, endpoints, value, page, gate).await?,
        None => return Ok(nothing()),
    };

    if !search.results.is_empty() {
        // Chi ha già detto tutto non viene riletto: `enrich_from_manifest` si
        // ferma da sé se la scheda ha autore e copertina. Chi non li dà —
        // Vaticana, e le biblioteche le cui pagine di ricerca elencano solo i
        // collegamenti — paga una lettura del manifesto per risultato, che è il
        // prezzo di una riga leggibile invece di un segnaposto.
        let results = enrich_results(client, gate, search.results).await;
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

/// Il nome con cui la chiave di Europeana sta nel portachiavi, lo stesso che
/// usa la schermata delle impostazioni.
pub const EUROPEANA_KEY_ID: &str = "europeana";

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
    // La chiave di Europeana vive nel portachiavi del sistema, come quelle dei
    // modelli: si legge al momento della ricerca e non viene mai scritta nel
    // database né nei registri.
    let endpoints = SearchEndpoints {
        europeana_key: crate::keystore::get_api_key(&app, EUROPEANA_KEY_ID).ok(),
        ..SearchEndpoints::default()
    };
    let outcome = discover_with(&client()?, provider, &input, &endpoints, page, Some(&gate)).await;

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
    async fn the_library_of_congress_keeps_only_what_has_a_manifest() {
        // Il catalogo elenca anche materiale senza un indirizzo di elemento —
        // registrazioni sonore, schede di collezione — e per quello non esiste
        // nessun manifesto da costruire: va scartato qui, non mostrato e poi
        // fallito all'apertura.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/"))
            .and(query_param("fo", "json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "results": [
                    {
                        "id": "https://www.loc.gov/item/2021667925/",
                        "title": "Book of Hours",
                        "contributor": ["Anonymous"],
                        "date": "1490",
                        "image_url": ["https://tile.loc.gov/thumb.jpg"],
                    },
                    {"id": "https://www.loc.gov/collections/early-books/", "title": "Una collezione"},
                    {"title": "Senza indirizzo"},
                ]
            })))
            .mount(&server)
            .await;
        let provider = find_provider("loc").expect("provider exists");

        let outcome = discover_with(
            &Client::new(),
            provider,
            "book of hours",
            &SearchEndpoints {
                loc_search: format!("{}/search/", server.uri()),
                ..SearchEndpoints::default()
            },
            1,
            None,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.results.len(), 1);
        assert_eq!(outcome.results[0].id, "2021667925");
        assert_eq!(
            outcome.results[0].manifest_url,
            "https://www.loc.gov/item/2021667925/manifest.json"
        );
        assert_eq!(outcome.results[0].creator.as_deref(), Some("Anonymous"));
        assert_eq!(
            outcome.results[0].thumbnail_url.as_deref(),
            Some("https://tile.loc.gov/thumb.jpg")
        );
    }

    #[tokio::test]
    async fn bodleian_takes_the_manifest_the_catalogue_declares() {
        // È l'unica delle sei che lo dichiara: le altre lo costruiscono
        // dall'identificativo, qui si legge e basta.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search/"))
            .and(header("accept", "application/ld+json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "member": [
                    {
                        "id": "https://digital.bodleian.ox.ac.uk/objects/080f88f5-7586-4b8a-8064-63ab3495393c/",
                        "manifest": {"id": "https://iiif.bodleian.ox.ac.uk/iiif/manifest/080f88f5-7586-4b8a-8064-63ab3495393c.json"},
                        "displayFields": {"title": ["Book of Hours"], "people": ["Anonymous"]},
                        "surfaceCount": 328,
                    },
                    {"id": "https://digital.bodleian.ox.ac.uk/objects/senza-manifesto/"},
                ]
            })))
            .mount(&server)
            .await;

        let outcome = discover_with(
            &Client::new(),
            find_provider("bodleian").expect("provider exists"),
            "book of hours",
            &SearchEndpoints {
                bodleian_search: format!("{}/search/", server.uri()),
                ..SearchEndpoints::default()
            },
            1,
            None,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.results.len(), 1);
        assert_eq!(outcome.results[0].title, "Book of Hours");
        assert_eq!(outcome.results[0].item_count, Some(328));
    }

    #[tokio::test]
    async fn estense_pages_start_from_zero() {
        // Il suo catalogo conta le pagine da zero: chiedere la prima come «1»
        // salterebbe i primi venti risultati senza dirlo.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search"))
            .and(query_param("page", "0"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "_embedded": {"culturalItems": [
                    {"uuid": "0a1b2c3d-4e5f-6789-abcd-ef0123456789", "sgtt": "Bibbia di Borso", "pressmark": "V.G.12"},
                ]},
                "page": {"totalPages": 3}
            })))
            .mount(&server)
            .await;

        let outcome = discover_with(
            &Client::new(),
            find_provider("estense").expect("provider exists"),
            "bibbia",
            &SearchEndpoints {
                estense_search: format!("{}/search", server.uri()),
                ..SearchEndpoints::default()
            },
            1,
            None,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.results.len(), 1);
        assert_eq!(outcome.results[0].title, "Bibbia di Borso");
        assert!(outcome.has_more);
    }

    #[tokio::test]
    async fn institut_reads_the_record_numbers_out_of_its_page() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/records"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<a href="/records/item/17837-un-manoscritto">Un manoscritto</a>
                   <a href="/records/item/17837-un-manoscritto">Un manoscritto</a>"#,
            ))
            .mount(&server)
            .await;

        let outcome = discover_with(
            &Client::new(),
            find_provider("institut").expect("provider exists"),
            "manoscritto",
            &SearchEndpoints {
                institut_search: format!("{}/records", server.uri()),
                ..SearchEndpoints::default()
            },
            1,
            None,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.results.len(), 1);
        assert_eq!(
            outcome.results[0].manifest_url,
            "https://bibnum.institutdefrance.fr/iiif/17837/manifest"
        );
    }

    #[tokio::test]
    async fn wellcome_keeps_only_what_has_been_digitised() {
        // Il catalogo descrive anche i libri che stanno in magazzino: senza il
        // filtro, quattro risultati su cinque sarebbero schede che non si
        // aprono.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/works"))
            .and(query_param("items.locations.locationType", "iiif-presentation"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "totalResults": 1,
                "results": [{
                    "id": "r32p4n5s",
                    "title": "Anatomy",
                    "thumbnail": {"url": "https://iiif.wellcomecollection.org/thumb.jpg"},
                    "items": [{"locations": [
                        {"locationType": {"id": "closed-stores"}, "url": ""},
                        {"locationType": {"id": "iiif-presentation"},
                         "url": "https://iiif.wellcomecollection.org/presentation/v2/b22396147"},
                    ]}],
                    "production": [{"agents": [{"label": "Vesalius"}], "dates": [{"label": "1543"}]}],
                }]
            })))
            .mount(&server)
            .await;

        let outcome = discover_with(
            &Client::new(),
            find_provider("wellcome").expect("provider exists"),
            "anatomy",
            &SearchEndpoints {
                wellcome_search: format!("{}/works", server.uri()),
                ..SearchEndpoints::default()
            },
            1,
            None,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.results.len(), 1);
        assert_eq!(
            outcome.results[0].manifest_url,
            "https://iiif.wellcomecollection.org/presentation/v2/b22396147"
        );
        assert_eq!(outcome.results[0].creator.as_deref(), Some("Vesalius"));
        assert_eq!(outcome.results[0].date.as_deref(), Some("1543"));
    }

    #[tokio::test]
    async fn europeana_without_a_key_says_so_instead_of_failing_like_a_network_fault() {
        let outcome = discover_with(
            &Client::new(),
            find_provider("europeana").expect("provider exists"),
            "dante",
            &SearchEndpoints::default(),
            1,
            None,
        )
        .await;

        let error = outcome.expect_err("senza chiave non si cerca");
        assert!(error.contains("key"), "messaggio: {error}");
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
