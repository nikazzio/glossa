//! Cercare per titolo dentro una biblioteca.
//!
//! Ogni istituzione risponde a modo suo: Gallica ha un servizio di ricerca
//! vero (SRU, XML), la Vaticana ed e-codices hanno solo le loro pagine di
//! ricerca, da cui si leggono i risultati. Il comportamento è quello già
//! collaudato in Scriptoria (`resolvers/search/{gallica,vatican,ecodices}.py`),
//! riscritto qui senza librerie di regex né di parsing HTML: le forme cercate
//! sono poche e fisse, e una dipendenza in più costerebbe più di quanto risolve.

use reqwest::Client;
use std::collections::BTreeMap;

use super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::SearchHandlerKind;

mod bodleian;
mod cambridge;
mod ecodices;
mod estense;
mod europeana;
mod gallica;
mod institut;
mod loc;
mod mdz;
mod vatican;
mod wellcome;

/// Gli indirizzi dei servizi di ricerca. Sono un valore e non costanti sparse
/// perché le prove devono poterli puntare a un server finto.
#[derive(Clone, Debug)]
pub struct SearchEndpoints {
    pub archive_search: String,
    pub gallica_sru: String,
    pub vatican_search: String,
    pub ecodices_search: String,
    pub loc_search: String,
    pub cambridge_search: String,
    pub europeana_search: String,
    pub mdz_search: String,
    pub wellcome_search: String,
    /// La chiave di Europeana, quando è stata salvata: senza, la sua ricerca
    /// non parte e lo dice invece di fallire come un guasto di rete.
    pub europeana_key: Option<String>,
    pub bodleian_search: String,
    pub estense_search: String,
    pub institut_search: String,
    /// Radice degli indirizzi dei manifesti della Vaticana: la pagina di
    /// ricerca non dà autore, data o lingua, e i risultati vengono
    /// arricchiti leggendo il manifesto di ognuno.
    pub vatican_manifest_base: String,
    /// La pagina normale del catalogo, visitata prima della ricerca: senza
    /// prima passarci, il sito rifiuta la ricerca come se non venisse da un
    /// browser vero.
    pub vatican_home: String,
}

impl Default for SearchEndpoints {
    fn default() -> Self {
        Self {
            archive_search: "https://archive.org/advancedsearch.php".to_string(),
            gallica_sru: "https://gallica.bnf.fr/SRU".to_string(),
            vatican_search: "https://digi.vatlib.it/mss/search".to_string(),
            ecodices_search: "https://www.e-codices.unifr.ch/en/search/all".to_string(),
            loc_search: "https://www.loc.gov/search/".to_string(),
            cambridge_search: "https://search.cudl.lib.cam.ac.uk/items".to_string(),
            europeana_search: "https://api.europeana.eu/record/v2/search.json".to_string(),
            mdz_search: "https://bsb.alma.exlibrisgroup.com/view/sru/49BVB_BSB".to_string(),
            wellcome_search: "https://api.wellcomecollection.org/catalogue/v2/works".to_string(),
            europeana_key: None,
            bodleian_search: "https://digital.bodleian.ox.ac.uk/search/".to_string(),
            estense_search:
                "https://jarvis.edl.beniculturali.it/meta/culturalItems/search/findBySgttOrAutnOrPressmark"
                    .to_string(),
            institut_search: "https://bibnum.institutdefrance.fr/records/default".to_string(),
            vatican_manifest_base: "https://digi.vatlib.it".to_string(),
            vatican_home: "https://digi.vatlib.it/mss/".to_string(),
        }
    }
}

/// Quante schede si chiedono per pagina di risultati.
/// I motivi per cui una ricerca non riesce, come codici e non come frasi.
///
/// La schermata li traduce: un messaggio scritto qui arriverebbe in inglese a
/// chi usa Glossa in italiano. Sono distinti perché portano a decisioni
/// diverse — un rifiuto automatico non si risolve riprovando, un limite di
/// velocità sì, un servizio spento si riprova più tardi.
pub const SEARCH_REFUSED: &str = "search_refused";
pub const SEARCH_RATE_LIMITED: &str = "search_rate_limited";
pub const SEARCH_UNAVAILABLE: &str = "search_unavailable";
pub const SEARCH_UNREACHABLE: &str = "search_unreachable";
pub const SEARCH_INVALID_DATA: &str = "search_invalid_data";
pub const SEARCH_FAILED: &str = "search_failed";
/// Europeana è l'unica che chiede una chiave: senza, non si parte nemmeno.
pub const SEARCH_KEY_MISSING: &str = "search_key_missing";
/// Aprire un'opera è un'altra cosa dal cercarla: un manifesto che non arriva
/// non è un catalogo che non risponde, e chi legge deve poterli distinguere.
pub const MANIFEST_UNREACHABLE: &str = "manifest_unreachable";
pub const MANIFEST_UNREADABLE: &str = "manifest_unreadable";
pub const MANIFEST_INVALID: &str = "manifest_invalid";

pub(super) const PAGE_SIZE: u32 = 20;

/// Esegue la ricerca della biblioteca, se ne ha una.
///
/// Una biblioteca senza ricerca non arriva qui: nel registro ha
/// `search_handler: None` e `supports_search: false`, e chi chiama si ferma
/// prima. Ogni gestore elencato qui è implementato davvero — il ramo che
/// rispondeva «nessun risultato» per le biblioteche mai scritte faceva passare
/// per catalogo vuoto una funzione che non esisteva.
pub async fn run(
    client: &Client,
    handler: SearchHandlerKind,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    match handler {
        SearchHandlerKind::Gallica => gallica::gallica(client, endpoints, query, page, gate).await,
        SearchHandlerKind::Vatican => vatican::vatican(client, endpoints, query, gate).await,
        SearchHandlerKind::Ecodices => ecodices::ecodices(client, endpoints, query, gate).await,
        SearchHandlerKind::Loc => loc::loc(client, endpoints, query, page, gate).await,
        SearchHandlerKind::Mdz => mdz::mdz(client, endpoints, query, page, gate).await,
        SearchHandlerKind::Cambridge => {
            cambridge::cambridge(client, endpoints, query, page, gate).await
        }
        SearchHandlerKind::Europeana => {
            europeana::europeana(client, endpoints, query, page, gate).await
        }
        SearchHandlerKind::Wellcome => {
            wellcome::wellcome(client, endpoints, query, page, gate).await
        }
        SearchHandlerKind::Bodleian => bodleian::bodleian(client, endpoints, query, gate).await,
        SearchHandlerKind::Estense => estense::estense(client, endpoints, query, page, gate).await,
        SearchHandlerKind::Institut => institut::institut(client, endpoints, query, gate).await,
        // Internet Archive aveva un percorso suo, da prima che questo modulo
        // esistesse: la funzione resta dov'è, ma la si chiama da qui come le
        // altre, così esiste un punto solo in cui si cerca.
        SearchHandlerKind::ArchiveOrg => {
            super::discovery::search_archive(client, &endpoints.archive_search, query, page, gate)
                .await
        }
    }
}

/// Il motivo di un rifiuto, letto dallo stato della risposta.
///
/// Sta qui e non dentro ogni gestore perché la conseguenza è la stessa per
/// tutte le biblioteche: un controllo anti-robot non si risolve riprovando, un
/// limite di velocità sì, un servizio spento si riprova più tardi. Una
/// biblioteca che classificasse a modo suo darebbe il consiglio sbagliato.
pub(crate) fn reason_for(error: &reqwest::Error) -> String {
    match error.status().map(|status| status.as_u16()) {
        Some(401 | 403) => SEARCH_REFUSED,
        Some(429) => SEARCH_RATE_LIMITED,
        Some(status) if status >= 500 => SEARCH_UNAVAILABLE,
        _ => SEARCH_FAILED,
    }
    .to_string()
}

/// Una risposta di testo, con i guasti raccontati con il nome della biblioteca.
pub(super) async fn fetch_text(
    client: &Client,
    url: &str,
    params: &[(&str, &str)],
    accept: Option<&str>,
    library: &str,
    gate: Option<&Gate<'_>>,
) -> Result<String, String> {
    let _turn = super::discovery::wait_if_gated(gate, url).await;
    let mut request = client.get(url).query(params);
    if let Some(accept) = accept {
        request = request.header("Accept", accept);
    }
    request
        .send()
        .await
        .map_err(|error| {
            log::warn!("discovery {library} request failed error={error}");
            SEARCH_UNREACHABLE.to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery {library} response failed error={error}");
            reason_for(&error)
        })?
        .text()
        .await
        .map_err(|error| {
            log::warn!("discovery {library} body failed error={error}");
            SEARCH_INVALID_DATA.to_string()
        })
}

pub(super) async fn fetch_json(
    client: &Client,
    url: &str,
    params: &[(&str, &str)],
    accept: Option<&str>,
    library: &str,
    gate: Option<&Gate<'_>>,
) -> Result<serde_json::Value, String> {
    let body = fetch_text(client, url, params, accept, library, gate).await?;
    serde_json::from_str(&body).map_err(|error| {
        log::warn!("discovery {library} json failed error={error}");
        SEARCH_INVALID_DATA.to_string()
    })
}

/// Una scheda con i soli campi che la biblioteca ha davvero dato.
pub(super) fn result_from(id: String, title: String, manifest_url: String) -> DiscoveryResult {
    DiscoveryResult {
        id,
        title,
        creator: None,
        date: None,
        description: None,
        thumbnail_url: None,
        media_type: None,
        collection: None,
        language: None,
        volume: None,
        subjects: Vec::new(),
        item_count: None,
        manifest_url,
        contributors: Vec::new(),
        publisher: None,
        rights: Vec::new(),
        physical_description: None,
        holding_institution: None,
        catalog_url: None,
        page_url: None,
        raw: BTreeMap::new(),
        openable: None,
    }
}

/// Il catalogo dà lo stesso campo ora come stringa, ora come elenco.
pub(super) fn first_string(value: Option<&serde_json::Value>) -> Option<String> {
    match value? {
        serde_json::Value::String(text) => Some(text.trim().to_string()),
        serde_json::Value::Array(items) => items.iter().find_map(|item| {
            item.as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        }),
        _ => None,
    }
    .filter(|text| !text.is_empty())
}

pub(super) fn strings(value: Option<&serde_json::Value>) -> Vec<String> {
    match value {
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
            .collect(),
        Some(serde_json::Value::String(text)) if !text.trim().is_empty() => {
            vec![text.trim().to_string()]
        }
        _ => Vec::new(),
    }
}

/// Il nome dell'elemento senza il suo prefisso (`dc:title` → `title`).
pub(super) fn local_name(raw: &[u8]) -> String {
    let name = String::from_utf8_lossy(raw);
    match name.rsplit_once(':') {
        Some((_, local)) => local.to_string(),
        None => name.to_string(),
    }
}

/// Il testo fra un segno di apertura e il primo carattere di chiusura.
/// Il testo scritto dentro un collegamento, saltando quello che sta dentro
/// altri tag (un'icona, una miniatura) e fermandosi alla prima frase vera.
///
/// Serve alle biblioteche la cui pagina di risultati elenca i libri come
/// collegamenti: il titolo è lì, e senza leggerlo la riga mostrerebbe il numero
/// della scheda al posto del nome dell'opera.
pub(super) fn link_text(chunk: &str) -> Option<String> {
    let mut rest = chunk;
    for _ in 0..6 {
        let start = rest.find('>')? + 1;
        rest = &rest[start..];
        let end = rest.find('<').unwrap_or(rest.len());
        let text = unescape(rest[..end].trim());
        if !text.is_empty() {
            return Some(text);
        }
        rest = &rest[end..];
    }
    None
}

/// Le entità più comuni nei titoli: senza, un'apostrofo diventa `&#39;`.
pub(super) fn unescape(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn between(haystack: &str, after: &str, until: char) -> Option<String> {
    let start = haystack.find(after)? + after.len();
    let rest = &haystack[start..];
    let end = rest.find(until)?;
    let value = rest[..end].trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// Toglie eventuali marcatori rimasti dentro un valore letto da una pagina.
pub(super) fn strip_tags(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut inside = false;
    for character in value.chars() {
        match character {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(character),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
