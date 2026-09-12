//! Gallica: il servizio SRU della Biblioteca nazionale di Francia.

use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;
use std::collections::BTreeMap;

use super::super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::super::resolvers;
use super::super::ResolverKind;
use super::{local_name, SearchEndpoints, PAGE_SIZE};

pub(super) async fn gallica(
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

    let _turn = super::super::discovery::wait_if_gated(gate, &endpoints.gallica_sru).await;
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
            super::SEARCH_UNREACHABLE.to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery gallica response failed error={error}");
            super::SEARCH_FAILED.to_string()
        })?;
    let body = response.text().await.map_err(|error| {
        log::warn!("discovery gallica body failed error={error}");
        super::SEARCH_INVALID_DATA.to_string()
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
    /// `dc:subject`: arriva in quasi tutte le schede e prima veniva buttato.
    subjects: Vec<String>,
    /// Tutto il resto della scheda, com'è arrivato — comprese le occorrenze
    /// successive alla prima dei campi che qui tengono un valore solo, e il
    /// blocco `srw:extraRecordData`, che Gallica riempie di dati suoi
    /// (`typedoc`, `nqamoyen`, `link`, `thumbnail`, le risoluzioni pronte).
    extra: BTreeMap<String, Vec<String>>,
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
        "subject" if !record.subjects.contains(&value) => record.subjects.push(value),
        "format" if !record.format.contains(&value) => record.format.push(value),
        "source" if record.holding_institution.is_none() => {
            record.holding_institution = Some(value);
        }
        "relation" if record.relation.is_none() => record.relation = Some(value),
        // Nient'altro si butta: quello che non ha un posto suo — o che arriva
        // di nuovo per un campo che ne tiene uno solo — si conserva com'è, sotto
        // il nome che gli dà Gallica. Fuori restano le sole voci di struttura
        // della busta SRU, che non dicono niente dell'opera.
        _ if !SRU_ENVELOPE_FIELDS.contains(&field) => {
            record
                .extra
                .entry(field.to_string())
                .or_default()
                .push(value);
        }
        _ => {}
    }
}

/// Le voci che descrivono la busta della risposta, non l'opera: conservarle
/// sporcherebbe il deposito senza aggiungere niente.
const SRU_ENVELOPE_FIELDS: [&str; 6] = [
    "version",
    "recordPacking",
    "recordSchema",
    "recordPosition",
    "recordIdentifier",
    "nextRecordPosition",
];

/// Quante immagini ha l'opera, quando Gallica lo dichiara.
///
/// Lo dice dentro `dc:format`, in chiaro: «Nombre total de vues : 588»,
/// verificato coincidere con il servizio di paginazione ufficiale. Le altre
/// occorrenze dello stesso campo portano la descrizione fisica («Papier. -
/// 206 f. - 320 × 265 mm»), dove il numero di fogli **non** è un numero di
/// vedute: per questo si riconosce solo la forma esatta. Misurato su 135
/// schede reali: 105 lo dichiarano, e i manoscritti non lo dichiarano mai.
fn gallica_view_count(formats: &[String]) -> Option<usize> {
    formats.iter().find_map(|entry| {
        let after_label = entry.split_once("Nombre total de vues")?.1;
        let digits: String = after_label
            .trim_start()
            .trim_start_matches(':')
            .trim_start()
            .chars()
            .take_while(|character: &char| character.is_ascii_digit())
            .collect();
        digits.parse().ok()
    })
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
    // Miniatura e pagina di lettura: prima quelle che Gallica **dichiara** nel
    // suo blocco, poi quelle costruite dall'ARK. Indovinarle funziona per una
    // monografia ma sbaglia sui periodici, dove il collegamento vero finisce in
    // `/date`.
    let declared = |field: &str| {
        record
            .extra
            .get(field)
            .and_then(|values| values.first())
            .filter(|value| value.starts_with("http"))
            .cloned()
    };
    let thumbnail = declared("thumbnail").unwrap_or_else(|| {
        format!(
            "https://gallica.bnf.fr/ark:/{naan}/{}.thumbnail",
            resolved.doc_id
        )
    });
    let page_url = declared("link")
        .unwrap_or_else(|| format!("https://gallica.bnf.fr/ark:/{naan}/{}", resolved.doc_id));
    let item_count = gallica_view_count(&record.format);
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
        subjects: record.subjects,
        item_count,
        manifest_url: resolved.manifest_url,
        contributors,
        publisher: record.publisher,
        rights: record.rights,
        physical_description: (!record.format.is_empty()).then(|| record.format.join("; ")),
        holding_institution: record.holding_institution,
        catalog_url: record.relation.as_deref().and_then(extract_url),
        page_url: Some(page_url),
        raw: record.extra,
        id: resolved.doc_id,
    })
}

// ── Vaticana: pagina di ricerca dei manoscritti ──────────────────────────

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
    fn gallica_declares_the_page_count_inside_its_format_field() {
        let body = r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:record><srw:recordData><oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Le guidon des capitaines</dc:title>
    <dc:subject>Escrime</dc:subject>
    <dc:subject>Duels</dc:subject>
    <dc:format>23-[1 bl.]-95-[1 bl.] p. ; in-12</dc:format>
    <dc:format>Nombre total de vues : 128</dc:format>
    <dc:identifier>https://gallica.bnf.fr/ark:/12148/bpt6k3282120</dc:identifier>
  </oai_dc:dc></srw:recordData></srw:record>
</srw:searchRetrieveResponse>"#;

        let (results, _) = parse_gallica_sru(body);

        assert_eq!(results[0].item_count, Some(128));
        assert_eq!(
            results[0].subjects,
            vec!["Escrime".to_string(), "Duels".to_string()]
        );
    }

    #[test]
    fn a_manuscript_without_a_view_count_keeps_its_leaf_count_out_of_it() {
        // I manoscritti non dichiarano mai il numero di vedute: `dc:format`
        // porta la descrizione fisica, dove «206 f.» sono fogli, non pagine
        // digitalizzate. Leggerlo come conteggio direbbe una misura falsa.
        let body = r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:record><srw:recordData><oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Heures a l'usage de Rome</dc:title>
    <dc:format>Papier. - 206 f. - 320 × 265 mm</dc:format>
    <dc:identifier>https://gallica.bnf.fr/ark:/12148/btv1b52508664n</dc:identifier>
  </oai_dc:dc></srw:recordData></srw:record>
</srw:searchRetrieveResponse>"#;

        let (results, _) = parse_gallica_sru(body);

        assert_eq!(results[0].item_count, None);
    }

    #[test]
    fn gallica_keeps_what_it_declares_and_prefers_it_to_a_guessed_address() {
        // `srw:extraRecordData` è il blocco che Gallica riempie di dati suoi.
        // Prima veniva ignorato in blocco: la miniatura e il collegamento
        // venivano indovinati dall'ARK, e per i periodici il collegamento vero
        // finisce in `/date`, che indovinandolo si perde.
        let body = r#"<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:record>
    <srw:recordData><oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Le Montaigne</dc:title>
      <dc:identifier>https://gallica.bnf.fr/ark:/12148/cb328197904</dc:identifier>
    </oai_dc:dc></srw:recordData>
    <srw:extraRecordData>
      <link>https://gallica.bnf.fr/ark:/12148/cb328197904/date</link>
      <thumbnail>https://gallica.bnf.fr/ark:/12148/bpt6k5790615p.thumbnail</thumbnail>
      <typedoc>periodiques</typedoc>
      <nqamoyen>99.98</nqamoyen>
    </srw:extraRecordData>
  </srw:record>
</srw:searchRetrieveResponse>"#;

        let (results, _) = parse_gallica_sru(body);

        let result = &results[0];
        assert_eq!(
            result.page_url.as_deref(),
            Some("https://gallica.bnf.fr/ark:/12148/cb328197904/date")
        );
        assert_eq!(
            result.thumbnail_url.as_deref(),
            Some("https://gallica.bnf.fr/ark:/12148/bpt6k5790615p.thumbnail")
        );
        assert_eq!(
            result.raw.get("typedoc").map(Vec::as_slice),
            Some(["periodiques".to_string()].as_slice())
        );
        assert_eq!(
            result.raw.get("nqamoyen").map(Vec::as_slice),
            Some(["99.98".to_string()].as_slice())
        );
    }

    #[test]
    fn a_broken_gallica_answer_is_an_empty_search_not_a_crash() {
        let (results, total) = parse_gallica_sru("<srw:records><srw:record>");
        assert!(results.is_empty());
        assert_eq!(total, 0);
    }
}
