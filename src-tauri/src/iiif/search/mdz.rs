//! Bayerische Staatsbibliothek: la ricerca ufficiale del suo catalogo (SRU).
//!
//! Risponde in MARC21, che è una scheda di catalogo e non un elenco di
//! riproduzioni: un record descrive il manoscritto e porta con sé più
//! collegamenti, di cui **uno solo** è la copia digitale. Gli altri rimandano a
//! cataloghi a stampa che quel manoscritto lo descrivono, e hanno identificativi
//! di Monaco loro: prendere il primo che passa aprirebbe il libro sbagliato.

use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;

use super::super::discovery::{DiscoveryResult, Gate, SearchPage};
use super::super::resolvers;
use super::{fetch_text, result_from, SearchEndpoints, PAGE_SIZE};

pub(super) async fn mdz(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    // Il catalogo conta i record da uno, non da zero.
    let start = ((page.max(1) - 1) * PAGE_SIZE + 1).to_string();
    let body = fetch_text(
        client,
        &endpoints.mdz_search,
        &[
            ("operation", "searchRetrieve"),
            ("version", "1.2"),
            ("query", &format!("all_for_ui={query}")),
            ("maximumRecords", &PAGE_SIZE.to_string()),
            ("startRecord", &start),
            ("recordSchema", "marcxml"),
        ],
        None,
        "Bayerische Staatsbibliothek",
        gate,
    )
    .await?;

    let (results, total) = parse_marc_records(&body);
    log::info!("discovery mdz search found={}", results.len());
    Ok(SearchPage {
        has_more: u64::from(page.max(1) * PAGE_SIZE) < total,
        results,
    })
}

/// Una scheda MARC in lavorazione: solo i campi che servono a una riga di
/// risultato.
#[derive(Default)]
struct MarcRecord {
    title: Option<String>,
    creator: Option<String>,
    date: Option<String>,
    /// L'identificativo della riproduzione, quando la scheda ne dichiara una.
    digitised: Option<String>,
}

/// Legge le schede e tiene **solo quelle con una riproduzione**: una scheda
/// senza copia digitale è un libro che si può leggere a Monaco, non in Glossa.
fn parse_marc_records(body: &str) -> (Vec<DiscoveryResult>, u64) {
    let mut reader = Reader::from_str(body);
    let mut results = Vec::new();
    let mut total = 0_u64;

    let mut record: Option<MarcRecord> = None;
    let mut field_tag = String::new();
    let mut subfield_code = String::new();
    let mut collected = String::new();
    // I sottocampi del collegamento in corso: `u` è l'indirizzo, `3` dice a che
    // cosa porta, e solo insieme dicono se è la riproduzione.
    let mut link_url = String::new();
    let mut link_kind = String::new();
    let mut element = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(start)) => {
                element = super::local_name(start.name().as_ref());
                collected.clear();
                match element.as_str() {
                    "record" if record.is_none() => record = Some(MarcRecord::default()),
                    "datafield" => {
                        field_tag = attribute(&start, "tag");
                        link_url.clear();
                        link_kind.clear();
                    }
                    "subfield" => subfield_code = attribute(&start, "code"),
                    _ => {}
                }
            }
            Ok(Event::End(end)) => {
                let name = super::local_name(end.name().as_ref());
                let value = collected.trim().to_string();
                match name.as_str() {
                    "numberOfRecords" => total = value.parse().unwrap_or(0),
                    "subfield" => {
                        if let Some(current) = record.as_mut() {
                            store_subfield(
                                current,
                                &field_tag,
                                &subfield_code,
                                &value,
                                &mut link_url,
                                &mut link_kind,
                            );
                        }
                        subfield_code.clear();
                    }
                    "datafield" => {
                        if field_tag == "856" {
                            if let Some(current) = record.as_mut() {
                                // «Volltext» è come Monaco chiama il testo
                                // completo digitalizzato: le altre voci sono
                                // descrizioni, e hanno un identificativo loro.
                                if link_kind.starts_with("Volltext") {
                                    current.digitised = bsb_id(&link_url);
                                }
                            }
                        }
                        field_tag.clear();
                    }
                    "record" => {
                        if let Some(finished) = record.take() {
                            if let Some(result) = marc_result(finished) {
                                results.push(result);
                            }
                        }
                    }
                    _ => {}
                }
                collected.clear();
                element.clear();
            }
            Ok(Event::Text(text)) => {
                if element.is_empty() {
                    continue;
                }
                let Ok(decoded) = text.decode() else { continue };
                if let Ok(value) = quick_xml::escape::unescape(&decoded) {
                    collected.push_str(&value);
                }
            }
            Ok(Event::Eof) => break,
            // Una risposta malformata è una ricerca senza risultati, non un
            // programma che si ferma: la biblioteca ha risposto, male.
            Err(error) => {
                log::warn!("discovery mdz parse failed error={error}");
                break;
            }
            _ => {}
        }
    }

    (results, total)
}

fn store_subfield(
    record: &mut MarcRecord,
    tag: &str,
    code: &str,
    value: &str,
    link_url: &mut String,
    link_kind: &mut String,
) {
    if value.is_empty() {
        return;
    }
    match (tag, code) {
        // Titolo proprio.
        ("245", "a") => record.title = Some(value.to_string()),
        // Autore personale o ente, il primo che compare.
        ("100" | "110", "a") if record.creator.is_none() => {
            record.creator = Some(value.to_string())
        }
        // Data di pubblicazione: `264` nelle schede nuove, `260` in quelle vecchie.
        ("264" | "260", "c") if record.date.is_none() => record.date = Some(value.to_string()),
        ("856", "u") => *link_url = value.to_string(),
        ("856", "3") => *link_kind = value.to_string(),
        _ => {}
    }
}

/// L'identificativo di Monaco dentro un indirizzo, per esempio
/// `urn:nbn:de:bvb:12-bsb00046575-3`.
fn bsb_id(url: &str) -> Option<String> {
    let lower = url.to_ascii_lowercase();
    let start = lower.find("bsb")?;
    let digits: String = lower[start + 3..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    (digits.len() >= 5).then(|| format!("bsb{digits}"))
}

fn marc_result(record: MarcRecord) -> Option<DiscoveryResult> {
    let id = record.digitised?;
    let mut result = result_from(
        id.clone(),
        record.title.unwrap_or_else(|| id.clone()),
        resolvers::mdz_manifest_url(&id),
    );
    result.creator = record.creator;
    result.date = record.date;
    result.page_url = Some(format!("https://www.digitale-sammlungen.de/en/view/{id}"));
    Some(result)
}

/// Il valore di un attributo, o stringa vuota: un attributo mancante non è un
/// guasto, è un campo che quella scheda non ha.
fn attribute(start: &quick_xml::events::BytesStart<'_>, name: &str) -> String {
    start
        .attributes()
        .flatten()
        .find(|attribute| attribute.key.as_ref() == name.as_bytes())
        .and_then(|attribute| String::from_utf8(attribute.value.to_vec()).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MARC_RESPONSE: &str = r#"<?xml version="1.0"?>
<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/">
  <numberOfRecords>42</numberOfRecords>
  <records>
    <record>
      <recordData>
        <record xmlns="http://www.loc.gov/MARC21/slim">
          <datafield tag="245"><subfield code="a">Confessionum libri XIII</subfield></datafield>
          <datafield tag="100"><subfield code="a">Augustinus, Aurelius</subfield></datafield>
          <datafield tag="264"><subfield code="c">2. Hälfte 10. Jh</subfield></datafield>
          <datafield tag="856">
            <subfield code="u">http://mdz-nbn-resolving.de/urn:nbn:de:bvb:12-bsb00046575-3</subfield>
            <subfield code="3">Volltext // Exemplar mit der Signatur: Clm 14350</subfield>
          </datafield>
          <datafield tag="856">
            <subfield code="u">https://nbn-resolving.org/urn:nbn:de:bvb:12-bsb00008253-7</subfield>
            <subfield code="3">Ausführliche Beschreibung</subfield>
          </datafield>
        </record>
      </recordData>
    </record>
    <record>
      <recordData>
        <record xmlns="http://www.loc.gov/MARC21/slim">
          <datafield tag="245"><subfield code="a">Libro mai digitalizzato</subfield></datafield>
          <datafield tag="856">
            <subfield code="u">https://nbn-resolving.org/urn:nbn:de:bvb:12-bsb00099999-1</subfield>
            <subfield code="3">Ausführliche Beschreibung</subfield>
          </datafield>
        </record>
      </recordData>
    </record>
  </records>
</searchRetrieveResponse>"#;

    #[test]
    fn only_the_digitised_link_becomes_a_manifest() {
        let (results, total) = parse_marc_records(MARC_RESPONSE);

        assert_eq!(total, 42);
        // La seconda scheda ha solo descrizioni: non si apre, non si mostra.
        assert_eq!(results.len(), 1);
        let first = &results[0];
        assert_eq!(first.title, "Confessionum libri XIII");
        assert_eq!(first.creator.as_deref(), Some("Augustinus, Aurelius"));
        assert_eq!(first.date.as_deref(), Some("2. Hälfte 10. Jh"));
        // L'identificativo è quello della riproduzione, non quello del catalogo
        // a stampa che la descrive.
        assert_eq!(first.id, "bsb00046575");
        assert_eq!(
            first.manifest_url,
            "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb00046575/manifest"
        );
    }

    #[test]
    fn a_broken_answer_is_an_empty_search_not_a_crash() {
        let (results, total) = parse_marc_records("<searchRetrieveResponse><records>");

        assert!(results.is_empty());
        assert_eq!(total, 0);
    }
}
