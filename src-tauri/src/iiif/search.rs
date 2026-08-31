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
            vatican_manifest_base: "https://digi.vatlib.it".to_string(),
            vatican_home: "https://digi.vatlib.it/mss/".to_string(),
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
    // `gallica all` è l'indice di ricerca generale del sito (metadati, testo,
    // tabelle): cercare solo `dc.title` perdeva le opere dove il termine sta
    // nell'autore o altrove, come un coautore che sul sito compare e qui no.
    let cql = format!("gallica all \"{cleaned}\"");

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
        .map_err(|error| {
            log::warn!("discovery gallica request failed error={error}");
            "Gallica could not be reached.".to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery gallica response failed error={error}");
            "Gallica search failed.".to_string()
        })?;
    let body = response
        .text()
        .await
        .map_err(|error| {
            log::warn!("discovery gallica body failed error={error}");
            "Gallica returned invalid data.".to_string()
        })?;

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
    /// Ogni `dc:creator` che la biblioteca dichiara: quasi sempre più di uno.
    /// Tenerne solo il primo perdeva tutti gli altri responsabili dell'opera.
    creators: Vec<String>,
    /// `dc:contributor`: di solito traduttori o curatori, distinti dagli
    /// autori nella stessa scheda.
    contributors: Vec<String>,
    date: Option<String>,
    description: Option<String>,
    language: Option<String>,
    types: Vec<String>,
    publisher: Option<String>,
    /// `dc:rights`, spesso ripetuto (la stessa dichiarazione in più lingue, o
    /// diritto d'autore insieme a condizione di consultazione).
    rights: Vec<String>,
    /// `dc:format`, ripetuto: supporto fisico e misure in una scheda, numero
    /// di viste in un'altra. Si tengono entrambi.
    format: Vec<String>,
    /// `dc:source`: fondo e segnatura presso l'istituto che conserva
    /// l'originale, non l'editore dell'opera.
    holding_institution: Option<String>,
    /// `dc:relation`: spesso il collegamento alla scheda del catalogo
    /// cartaceo/archivistico, come testo libero («Notice du catalogue : url»).
    relation: Option<String>,
}

/// Legge la risposta SRU: quello che serve, ignorando il resto.
///
/// Il testo di un campo arriva a pezzi — un titolo con una `&` viene spezzato
/// in tre eventi — quindi si accumula e si consegna alla chiusura del campo:
/// fermarsi al primo pezzo troncherebbe il titolo alla prima e commerciale.
fn parse_gallica_sru(body: &str) -> (Vec<DiscoveryResult>, u64) {
    // Lo spazio non si taglia pezzo per pezzo ma sul valore finito: tagliarlo
    // prima incollerebbe «Heures» e «usages» senza lo spazio che li separava.
    let mut reader = Reader::from_str(body);

    let mut results = Vec::new();
    let mut total = 0_u64;
    let mut record: Option<GallicaRecord> = None;
    let mut field = String::new();
    let mut collected = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(start)) => {
                field = local_name(start.name().as_ref());
                collected.clear();
                if field == "record" {
                    record = Some(GallicaRecord::default());
                }
            }
            Ok(Event::End(end)) => {
                let name = local_name(end.name().as_ref());
                if name == "record" {
                    if let Some(finished) = record.take() {
                        if let Some(result) = gallica_result(finished) {
                            results.push(result);
                        }
                    }
                } else if name == field {
                    let value = collected.trim().to_string();
                    if !value.is_empty() {
                        if name == "numberOfRecords" {
                            total = value.parse().unwrap_or(0);
                        } else if let Some(current) = record.as_mut() {
                            store_gallica_field(current, &name, value);
                        }
                    }
                }
                collected.clear();
                field.clear();
            }
            Ok(Event::Text(text)) => {
                let Ok(decoded) = text.decode() else { continue };
                // `&amp;` e compagnia si sciolgono qui, come per il testo dei
                // documenti Word (`documents/docx_extract.rs`): lasciarli passare
                // li farebbe leggere tali e quali nel titolo.
                if let Ok(value) = quick_xml::escape::unescape(&decoded) {
                    collected.push_str(&value);
                }
            }
            // Un'entità che il lettore consegna a parte (`&amp;`, `&#233;`):
            // senza questo ramo sparirebbe dal testo insieme a tutto ciò che
            // la segue nello stesso campo.
            Ok(Event::GeneralRef(entity)) => {
                if let Ok(Some(character)) = entity.resolve_char_ref() {
                    collected.push(character);
                } else if let Ok(name) = entity.decode() {
                    if let Some(value) = quick_xml::escape::resolve_predefined_entity(&name) {
                        collected.push_str(value);
                    }
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

/// Dove finisce ogni campo della scheda. Il primo valore vince: Gallica
/// ripete l'identificativo e il titolo in forme diverse, e la prima è quella
/// dell'opera.
fn store_gallica_field(record: &mut GallicaRecord, field: &str, value: String) {
    match field {
        "identifier" if record.identifier.is_none() && value.contains("ark:/") => {
            record.identifier = Some(value);
        }
        "title" if record.title.is_none() => record.title = Some(value),
        "creator" if !record.creators.contains(&value) => record.creators.push(value),
        "contributor" if !record.contributors.contains(&value) => {
            record.contributors.push(value);
        }
        "date" if record.date.is_none() => record.date = Some(value),
        "description" if record.description.is_none() => record.description = Some(value),
        "language" if record.language.is_none() => record.language = Some(value),
        "type" => record.types.push(value),
        "publisher" if record.publisher.is_none() => record.publisher = Some(value),
        "rights" if !record.rights.contains(&value) => record.rights.push(value),
        "format" if !record.format.contains(&value) => record.format.push(value),
        "source" if record.holding_institution.is_none() => {
            record.holding_institution = Some(value);
        }
        "relation" if record.relation.is_none() => record.relation = Some(value),
        _ => {}
    }
}

/// Estrae il primo indirizzo `http(s)` da un testo libero (`dc:relation` è
/// spesso «Notice du catalogue : <url>», non un indirizzo puro). Cerca lo
/// schema per intero (`http://`/`https://`), non solo le lettere `http`: una
/// parola qualunque che le contenga non deve passare per un indirizzo.
fn extract_url(text: &str) -> Option<String> {
    let start = ["https://", "http://"]
        .iter()
        .filter_map(|scheme| text.find(scheme))
        .min()?;
    let candidate = &text[start..];
    let end = candidate
        .find(|c: char| c.is_whitespace())
        .unwrap_or(candidate.len());
    Some(candidate[..end].to_string())
}

fn gallica_result(record: GallicaRecord) -> Option<DiscoveryResult> {
    let identifier = record.identifier?;
    let resolved = resolvers::resolve(ResolverKind::Gallica, &identifier)?;
    // La parte numerica dell'ARK si legge dall'identificativo: darla per
    // scontata farebbe aprire l'opera giusta con la copertina di nessuno.
    let (naan, _) = resolvers::gallica_ark(&identifier)?;
    let thumbnail = format!(
        "https://gallica.bnf.fr/ark:/{naan}/{}.thumbnail",
        resolved.doc_id
    );
    let page_url = format!("https://gallica.bnf.fr/ark:/{naan}/{}", resolved.doc_id);
    let mut creators = record.creators.into_iter();
    let creator = creators.next();
    let contributors = creators.chain(record.contributors).collect();
    Some(DiscoveryResult {
        title: record.title.unwrap_or_else(|| resolved.doc_id.clone()),
        creator,
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
        contributors,
        publisher: record.publisher,
        rights: record.rights,
        physical_description: (!record.format.is_empty()).then(|| record.format.join("; ")),
        holding_institution: record.holding_institution,
        catalog_url: record.relation.as_deref().and_then(extract_url),
        page_url: Some(page_url),
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
    // La ricerca vive di una sessione aperta da questa pagina: senza averla
    // visitata prima, il sito la rifiuta come se non venisse da un browser
    // vero. Un guasto qui non è motivo per rinunciare subito: la richiesta
    // sotto proverà comunque, e dirà lei se la biblioteca non risponde.
    let _home_turn = super::discovery::wait_if_gated(gate, &endpoints.vatican_home).await;
    if let Err(error) = client.get(&endpoints.vatican_home).send().await {
        log::warn!("discovery vatican home visit failed error={error}");
    }

    let _search_turn = super::discovery::wait_if_gated(gate, &endpoints.vatican_search).await;
    let body = client
        .get(&endpoints.vatican_search)
        .query(&[("k_f", "0"), ("k_v", query)])
        .header("Referer", &endpoints.vatican_home)
        .send()
        .await
        .map_err(|error| {
            log::warn!("discovery vatican request failed error={error}");
            "The Vatican Library could not be reached.".to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery vatican response failed error={error}");
            "The Vatican Library search failed.".to_string()
        })?
        .text()
        .await
        .map_err(|error| {
            log::warn!("discovery vatican body failed error={error}");
            "The Vatican Library returned invalid data.".to_string()
        })?;

    let results = parse_vatican_results(&body, &endpoints.vatican_manifest_base);
    log::info!("discovery vatican search found={}", results.len());
    Ok(SearchPage {
        // La pagina di ricerca della Vaticana non dichiara un totale: si
        // mostra quello che ha dato, senza promettere una pagina successiva.
        has_more: false,
        results,
    })
}

fn parse_vatican_results(body: &str, manifest_base: &str) -> Vec<DiscoveryResult> {
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
            manifest_url: format!("{manifest_base}/iiif/{doc_id}/manifest.json"),
            contributors: Vec::new(),
            publisher: None,
            rights: Vec::new(),
            physical_description: None,
            holding_institution: None,
            catalog_url: None,
            page_url: Some(format!("https://digi.vatlib.it/view/{doc_id}")),
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
        .map_err(|error| {
            log::warn!("discovery ecodices request failed error={error}");
            "e-codices could not be reached.".to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery ecodices response failed error={error}");
            "The e-codices search failed.".to_string()
        })?
        .text()
        .await
        .map_err(|error| {
            log::warn!("discovery ecodices body failed error={error}");
            "e-codices returned invalid data.".to_string()
        })?;

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
            ecodices_facsimile_href(chunk).filter(|href| href.contains("e-codices"))
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
            contributors: Vec::new(),
            publisher: None,
            rights: Vec::new(),
            physical_description: None,
            holding_institution: None,
            catalog_url: None,
            page_url: Some(viewer_url),
            id: resolved.doc_id,
        });
    }
    results
}

/// Il primo link del risultato porta all'anteprima, non alla scheda: il vero
/// indirizzo dell'opera è quello etichettato «Facsimile».
fn ecodices_facsimile_href(chunk: &str) -> Option<String> {
    let marker_start = chunk.find(">Facsimile</a>")?;
    let before = &chunk[..marker_start];
    let href_start = before.rfind("<a href=\"")? + "<a href=\"".len();
    let href = before[href_start..].trim_end_matches('"');
    (!href.is_empty()).then(|| href.to_string())
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
    fn gallica_entities_are_resolved_and_the_ark_number_is_not_assumed() {
        let body = r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:numberOfRecords>1</srw:numberOfRecords>
  <srw:record><srw:recordData><oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Heures &amp; usages</dc:title>
    <dc:identifier>https://gallica.bnf.fr/ark:/54321/btv1b84260335</dc:identifier>
  </oai_dc:dc></srw:recordData></srw:record>
</srw:searchRetrieveResponse>"#;

        let (results, _) = parse_gallica_sru(body);

        assert_eq!(results[0].title, "Heures & usages");
        assert_eq!(
            results[0].thumbnail_url.as_deref(),
            Some("https://gallica.bnf.fr/ark:/54321/btv1b84260335.thumbnail")
        );
        assert_eq!(
            results[0].page_url.as_deref(),
            Some("https://gallica.bnf.fr/ark:/54321/btv1b84260335")
        );
    }

    #[test]
    fn a_rich_gallica_record_keeps_every_author_and_the_catalog_details() {
        // Stessa forma di una scheda vera (più autori, un contributore
        // traduttore, editore, diritti ripetuti, formato fisico e numero di
        // viste, fondo di conservazione, collegamento al catalogo cartaceo):
        // prima di questa modifica solo titolo/autore/data/lingua arrivavano.
        let body = r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:numberOfRecords>1</srw:numberOfRecords>
  <srw:record><srw:recordData><oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Le guidon des capitaines</dc:title>
    <dc:creator>Strozzi, Filippo. Auteur du texte</dc:creator>
    <dc:creator>Cavalcabo, Girolamo. Auteur du texte</dc:creator>
    <dc:contributor>Villamont, Jacques de. Traducteur</dc:contributor>
    <dc:publisher>Claude Le Villain (Rouen)</dc:publisher>
    <dc:date>1610</dc:date>
    <dc:language>fre</dc:language>
    <dc:format>23-[1 bl.]-95-[1 bl.] p. ; in-12</dc:format>
    <dc:format>Nombre total de vues : 128</dc:format>
    <dc:rights>domaine public</dc:rights>
    <dc:rights>public domain</dc:rights>
    <dc:source>Bibliothèque nationale de France, département Littérature et art, V-22944</dc:source>
    <dc:relation>Notice du catalogue : http://catalogue.bnf.fr/ark:/12148/cb33412414z</dc:relation>
    <dc:identifier>https://gallica.bnf.fr/ark:/12148/bpt6k3282120</dc:identifier>
  </oai_dc:dc></srw:recordData></srw:record>
</srw:searchRetrieveResponse>"#;

        let (results, _) = parse_gallica_sru(body);

        assert_eq!(results.len(), 1);
        let result = &results[0];
        assert_eq!(
            result.creator.as_deref(),
            Some("Strozzi, Filippo. Auteur du texte")
        );
        assert_eq!(
            result.contributors,
            vec![
                "Cavalcabo, Girolamo. Auteur du texte".to_string(),
                "Villamont, Jacques de. Traducteur".to_string(),
            ]
        );
        assert_eq!(
            result.publisher.as_deref(),
            Some("Claude Le Villain (Rouen)")
        );
        assert_eq!(
            result.rights,
            vec!["domaine public".to_string(), "public domain".to_string()]
        );
        assert_eq!(
            result.physical_description.as_deref(),
            Some("23-[1 bl.]-95-[1 bl.] p. ; in-12; Nombre total de vues : 128")
        );
        assert_eq!(
            result.holding_institution.as_deref(),
            Some("Bibliothèque nationale de France, département Littérature et art, V-22944")
        );
        assert_eq!(
            result.catalog_url.as_deref(),
            Some("http://catalogue.bnf.fr/ark:/12148/cb33412414z")
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

        let results = parse_vatican_results(html, "https://digi.vatlib.it");

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
        assert_eq!(
            results[0].page_url.as_deref(),
            Some("https://digi.vatlib.it/view/MSS_Vat.lat.3225")
        );
    }

    #[test]
    fn a_vatican_page_without_manuscripts_gives_nothing() {
        assert!(parse_vatican_results(
            "<html><body>nessun risultato</body></html>",
            "https://digi.vatlib.it"
        )
        .is_empty());
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
        assert_eq!(
            results[0].page_url.as_deref(),
            Some("https://www.e-codices.unifr.ch/en/bbb/0264")
        );
    }

    #[test]
    fn ecodices_generic_search_result_ignores_the_preview_link_before_facsimile() {
        // Un risultato di ricerca generica (non per segnatura) mette prima un
        // link all'anteprima e solo dopo quello «Facsimile»: prendere il primo
        // link del blocco, invece di cercare quello con questa etichetta,
        // porta a un indirizzo che non risolve a nessuna opera.
        let html = r#"
          <div class="search-result">
            <a href="https://www.e-codices.unifr.ch/en/searchresult/list/one/hba/chart0161" class="search-result-preview-image"></a>
            <a href="https://www.e-codices.unifr.ch/en/hba/chart0161">Facsimile</a>
            <div class="document-ms-title">Graduale</div>
          </div>"#;

        let results = parse_ecodices_results(html);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "hba-chart0161");
    }
}
