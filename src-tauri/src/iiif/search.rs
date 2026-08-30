//! Cercare per titolo dentro una biblioteca.
//!
//! Ogni istituzione risponde a modo suo: Gallica ha un servizio di ricerca
//! vero (SRU, XML), la Vaticana ed e-codices hanno solo le loro pagine di
//! ricerca, da cui si leggono i risultati. Il comportamento è quello già
//! collaudato in Scriptoria (`resolvers/search/{gallica,vatican,ecodices}.py`),
//! riscritto qui senza librerie di regex né di parsing HTML: le forme cercate
//! sono poche e fisse, e una dipendenza in più costerebbe più di quanto risolve.

use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;

use super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::resolvers;
use super::{ResolverKind, SearchHandlerKind};

/// Gli indirizzi dei servizi di ricerca. Sono un valore e non costanti sparse
/// perché le prove devono poterli puntare a un server finto.
#[derive(Clone, Debug)]
pub struct SearchEndpoints {
    pub archive_search: String,
    pub gallica_sru: String,
    pub vatican_search: String,
    pub ecodices_search: String,
}

impl Default for SearchEndpoints {
    fn default() -> Self {
        Self {
            archive_search: "https://archive.org/advancedsearch.php".to_string(),
            gallica_sru: "https://gallica.bnf.fr/SRU".to_string(),
            vatican_search: "https://digi.vatlib.it/mss/search".to_string(),
            ecodices_search: "https://www.e-codices.unifr.ch/en/search/all".to_string(),
        }
    }
}

/// Quante schede si chiedono per pagina di risultati.
const PAGE_SIZE: u32 = 20;

/// Esegue la ricerca della biblioteca, se ne ha una.
///
/// Una biblioteca senza ricerca non è un errore: vuol dire che da lì si arriva
/// solo con una segnatura o un indirizzo, e chi chiama lo racconta come
/// «nessun risultato».
pub async fn run(
    client: &Client,
    handler: SearchHandlerKind,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    match handler {
        SearchHandlerKind::Gallica => gallica(client, endpoints, query, page, gate).await,
        SearchHandlerKind::Vatican => vatican(client, endpoints, query, gate).await,
        SearchHandlerKind::Ecodices => ecodices(client, endpoints, query, gate).await,
        _ => Ok(SearchPage {
            results: Vec::new(),
            has_more: false,
        }),
    }
}

// ── Gallica: servizio SRU ────────────────────────────────────────────────

async fn gallica(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let start_record = (page.max(1) - 1) * PAGE_SIZE + 1;
    // Le virgolette chiuderebbero la stringa della richiesta: si sostituiscono,
    // come fa il riferimento, invece di rifiutare la ricerca.
    let cleaned = query.replace('"', "'");
    let cql = format!("dc.title all \"{cleaned}\"");

    let _turn = super::discovery::wait_if_gated(gate, &endpoints.gallica_sru).await;
    let response = client
        .get(&endpoints.gallica_sru)
        .query(&[
            ("operation", "searchRetrieve"),
            ("version", "1.2"),
            ("query", cql.as_str()),
            ("maximumRecords", &PAGE_SIZE.to_string()),
            ("startRecord", &start_record.to_string()),
            ("collapsing", "true"),
        ])
        .send()
        .await
        .map_err(|_| "Gallica could not be reached.".to_string())?
        .error_for_status()
        .map_err(|_| "Gallica search failed.".to_string())?;
    let body = response
        .text()
        .await
        .map_err(|_| "Gallica returned invalid data.".to_string())?;

    let (results, total) = parse_gallica_sru(&body);
    log::info!(
        "discovery gallica search page={page} found={} total={total}",
        results.len()
    );
    Ok(SearchPage {
        has_more: u64::from(page * PAGE_SIZE) < total,
        results,
    })
}

#[derive(Default)]
struct GallicaRecord {
    identifier: Option<String>,
    title: Option<String>,
    creator: Option<String>,
    date: Option<String>,
    description: Option<String>,
    language: Option<String>,
    types: Vec<String>,
}

/// Legge la risposta SRU: quello che serve, ignorando il resto.
fn parse_gallica_sru(body: &str) -> (Vec<DiscoveryResult>, u64) {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);

    let mut results = Vec::new();
    let mut total = 0_u64;
    let mut record: Option<GallicaRecord> = None;
    let mut field = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(start)) => {
                field = local_name(start.name().as_ref());
                if field == "record" {
                    record = Some(GallicaRecord::default());
                }
            }
            Ok(Event::End(end)) => {
                if local_name(end.name().as_ref()) == "record" {
                    if let Some(finished) = record.take() {
                        if let Some(result) = gallica_result(finished) {
                            results.push(result);
                        }
                    }
                }
                field.clear();
            }
            Ok(Event::Text(text)) => {
                let value = text.decode().map(|value| value.trim().to_string());
                let Ok(value) = value else { continue };
                if value.is_empty() {
                    continue;
                }
                if field == "numberOfRecords" {
                    total = value.parse().unwrap_or(0);
                    continue;
                }
                let Some(current) = record.as_mut() else {
                    continue;
                };
                match field.as_str() {
                    // Gallica ripete l'identificativo: vale il primo, che è
                    // l'ARK dell'opera; i successivi sono altre forme.
                    "identifier" if current.identifier.is_none() && value.contains("ark:/") => {
                        current.identifier = Some(value);
                    }
                    "title" if current.title.is_none() => current.title = Some(value),
                    "creator" if current.creator.is_none() => current.creator = Some(value),
                    "date" if current.date.is_none() => current.date = Some(value),
                    "description" if current.description.is_none() => {
                        current.description = Some(value);
                    }
                    "language" if current.language.is_none() => current.language = Some(value),
                    "type" => current.types.push(value),
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            // Una risposta malformata è una ricerca senza risultati, non un
            // guasto dell'applicazione: la biblioteca ha risposto qualcosa.
            Err(error) => {
                log::warn!("discovery gallica sru parse error={error}");
                break;
            }
            _ => {}
        }
    }

    (results, total)
}

fn gallica_result(record: GallicaRecord) -> Option<DiscoveryResult> {
    let identifier = record.identifier?;
    let resolved = resolvers::resolve(ResolverKind::Gallica, &identifier)?;
    let thumbnail = format!(
        "https://gallica.bnf.fr/ark:/12148/{}.thumbnail",
        resolved.doc_id
    );
    Some(DiscoveryResult {
        title: record.title.unwrap_or_else(|| resolved.doc_id.clone()),
        creator: record.creator,
        date: record.date,
        description: record.description,
        thumbnail_url: Some(thumbnail),
        media_type: record.types.first().cloned(),
        collection: None,
        language: record.language,
        volume: None,
        subjects: Vec::new(),
        // Il servizio di ricerca non dice quante pagine ha l'opera: lo dirà il
        // manifesto, quando la si apre.
        item_count: None,
        manifest_url: resolved.manifest_url,
        id: resolved.doc_id,
    })
}

// ── Vaticana: pagina di ricerca dei manoscritti ──────────────────────────

async fn vatican(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let _turn = super::discovery::wait_if_gated(gate, &endpoints.vatican_search).await;
    let body = client
        .get(&endpoints.vatican_search)
        .query(&[("k_f", "0"), ("k_v", query)])
        .send()
        .await
        .map_err(|_| "The Vatican Library could not be reached.".to_string())?
        .error_for_status()
        .map_err(|_| "The Vatican Library search failed.".to_string())?
        .text()
        .await
        .map_err(|_| "The Vatican Library returned invalid data.".to_string())?;

    let results = parse_vatican_results(&body);
    log::info!("discovery vatican search found={}", results.len());
    Ok(SearchPage {
        // La pagina di ricerca della Vaticana non dichiara un totale: si
        // mostra quello che ha dato, senza promettere una pagina successiva.
        has_more: false,
        results,
    })
}

fn parse_vatican_results(body: &str) -> Vec<DiscoveryResult> {
    let mut results = Vec::new();
    for chunk in body.split("row-search-result-record").skip(1) {
        let Some(doc_id) = between(chunk, "/mss/edition/", '"') else {
            continue;
        };
        if !doc_id.starts_with("MSS_") {
            continue;
        }
        let title = between(chunk, "class=\"link-search-result-record-view\">", '<')
            .map(|value| strip_tags(&value))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| doc_id.clone());
        let description =
            between(chunk, "<div class=\"title\">", '<').map(|value| strip_tags(&value));
        let thumbnail = between(chunk, "<img src=\"/pub/digit/", '"')
            .map(|rest| format!("https://digi.vatlib.it/pub/digit/{rest}"));

        results.push(DiscoveryResult {
            title,
            creator: None,
            date: None,
            description,
            thumbnail_url: thumbnail,
            media_type: Some("manuscript".to_string()),
            collection: None,
            language: None,
            volume: None,
            subjects: Vec::new(),
            item_count: None,
            manifest_url: format!("https://digi.vatlib.it/iiif/{doc_id}/manifest.json"),
            id: doc_id,
        });
    }
    results
}

// ── e-codices: pagina di ricerca ─────────────────────────────────────────

async fn ecodices(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let _turn = super::discovery::wait_if_gated(gate, &endpoints.ecodices_search).await;
    let body = client
        .get(&endpoints.ecodices_search)
        .query(&[
            ("sQueryString", query),
            ("sSearchField", "fullText"),
            ("iResultsPerPage", &PAGE_SIZE.to_string()),
            ("sSortField", "score"),
        ])
        .send()
        .await
        .map_err(|_| "e-codices could not be reached.".to_string())?
        .error_for_status()
        .map_err(|_| "The e-codices search failed.".to_string())?
        .text()
        .await
        .map_err(|_| "e-codices returned invalid data.".to_string())?;

    let results = parse_ecodices_results(&body);
    log::info!("discovery ecodices search found={}", results.len());
    Ok(SearchPage {
        has_more: false,
        results,
    })
}

fn parse_ecodices_results(body: &str) -> Vec<DiscoveryResult> {
    let mut results = Vec::new();
    for chunk in body.split("<div class=\"search-result\">").skip(1) {
        let Some(viewer_url) =
            between(chunk, "<a href=\"", '"').filter(|href| href.contains("e-codices"))
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
            id: resolved.doc_id,
        });
    }
    results
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

// ── Aiuti ────────────────────────────────────────────────────────────────

/// Il nome dell'elemento senza il suo prefisso (`dc:title` → `title`).
fn local_name(raw: &[u8]) -> String {
    let name = String::from_utf8_lossy(raw);
    match name.rsplit_once(':') {
        Some((_, local)) => local.to_string(),
        None => name.to_string(),
    }
}

/// Il testo fra un segno di apertura e il primo carattere di chiusura.
fn between(haystack: &str, after: &str, until: char) -> Option<String> {
    let start = haystack.find(after)? + after.len();
    let rest = &haystack[start..];
    let end = rest.find(until)?;
    let value = rest[..end].trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// Toglie eventuali marcatori rimasti dentro un valore letto da una pagina.
fn strip_tags(value: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    const SRU_RESPONSE: &str = r#"<?xml version="1.0"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:numberOfRecords>42</srw:numberOfRecords>
  <srw:records>
    <srw:record>
      <srw:recordData>
        <oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>Heures a l'usage de Rome</dc:title>
          <dc:creator>Anonyme</dc:creator>
          <dc:date>1490</dc:date>
          <dc:type>manuscrit</dc:type>
          <dc:language>fre</dc:language>
          <dc:identifier>https://gallica.bnf.fr/ark:/12148/btv1b84260335</dc:identifier>
          <dc:identifier>https://catalogue.bnf.fr/ark:/12148/cb30000000</dc:identifier>
        </oai_dc:dc>
      </srw:recordData>
    </srw:record>
  </srw:records>
</srw:searchRetrieveResponse>"#;

    #[test]
    fn a_gallica_record_becomes_a_result_with_its_manifest() {
        let (results, total) = parse_gallica_sru(SRU_RESPONSE);

        assert_eq!(total, 42);
        assert_eq!(results.len(), 1);
        let first = &results[0];
        assert_eq!(first.title, "Heures a l'usage de Rome");
        assert_eq!(first.creator.as_deref(), Some("Anonyme"));
        assert_eq!(
            first.manifest_url,
            "https://gallica.bnf.fr/iiif/ark:/12148/btv1b84260335/manifest.json"
        );
    }

    #[test]
    fn a_broken_gallica_answer_is_an_empty_search_not_a_crash() {
        let (results, total) = parse_gallica_sru("<srw:records><srw:record>");
        assert!(results.is_empty());
        assert_eq!(total, 0);
    }

    #[test]
    fn vatican_results_carry_shelfmark_title_and_cover() {
        let html = r#"
          <div class="row-search-result-record">
            <a href="/mss/edition/MSS_Vat.lat.3225" class="link-search-result-record-view">Vergilius Vaticanus</a>
            <div class="title">Membranaceo, sec. IV</div>
            <img src="/pub/digit/MSS_Vat.lat.3225/cover/cover.jpg" />
          </div>"#;

        let results = parse_vatican_results(html);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "MSS_Vat.lat.3225");
        assert_eq!(results[0].title, "Vergilius Vaticanus");
        assert_eq!(
            results[0].manifest_url,
            "https://digi.vatlib.it/iiif/MSS_Vat.lat.3225/manifest.json"
        );
        assert_eq!(
            results[0].thumbnail_url.as_deref(),
            Some("https://digi.vatlib.it/pub/digit/MSS_Vat.lat.3225/cover/cover.jpg")
        );
    }

    #[test]
    fn a_vatican_page_without_manuscripts_gives_nothing() {
        assert!(parse_vatican_results("<html><body>nessun risultato</body></html>").is_empty());
    }

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
    }
}
