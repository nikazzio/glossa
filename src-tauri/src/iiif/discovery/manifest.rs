//! Leggere un manifesto IIIF e ricavarne una scheda.
//!
//! Le biblioteche scrivono gli stessi dati in punti diversi — nel corpo del
//! manifesto, nel suo `metadata`, in una lingua sola o in tre — e qui si
//! riconducono a una forma sola. Serve anche a completare i risultati di una
//! ricerca che non dichiara autore, copertina o titolo.

use reqwest::Client;
use serde_json::Value;

use super::{wait_if_gated, DiscoveryResult, Gate, ManifestPreview};

pub(super) fn text(value: Option<&Value>) -> Option<String> {
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
pub(super) fn count(value: Option<&Value>) -> Option<usize> {
    match value? {
        Value::Number(number) => number.as_u64().map(|value| value as usize),
        Value::String(text) => text.trim().parse::<usize>().ok(),
        Value::Array(values) => values.iter().find_map(|item| count(Some(item))),
        _ => None,
    }
}

pub(super) fn texts(value: Option<&Value>) -> Vec<String> {
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

pub(super) fn thumbnail_url(value: &Value) -> Option<String> {
    thumbnail_of(value.get("thumbnail")?)
}

/// L'indirizzo di una miniatura, comunque la biblioteca l'abbia scritta: una
/// stringa, un oggetto con `id` o `@id`, oppure un elenco di oggetti — che è la
/// forma di IIIF 3 e quella che usa Digital Bodleian.
pub(crate) fn thumbnail_of(thumbnail: &Value) -> Option<String> {
    if let Value::Array(items) = thumbnail {
        return items.iter().find_map(thumbnail_of);
    }
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
        .filter(|url| url.starts_with("http"))
}

pub(super) fn manifest_preview(manifest_url: String, value: Value) -> ManifestPreview {
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

pub(crate) async fn resolve_manifest(
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
            crate::iiif::search::MANIFEST_UNREACHABLE.to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery manifest response failed url={manifest_url} error={error}");
            crate::iiif::search::MANIFEST_UNREADABLE.to_string()
        })?;
    let value = response.json::<Value>().await.map_err(|error| {
        log::warn!("discovery manifest parse failed url={manifest_url} error={error}");
        crate::iiif::search::MANIFEST_INVALID.to_string()
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
    // Si va a leggere il manifesto solo se manca qualcosa che lui può dare.
    // Una copertina assente è il caso più visibile: senza, la riga del
    // catalogo resta con il segnaposto anche dopo aver aggiunto l'opera. Un
    // titolo uguale all'identificativo è l'altro: vuol dire che la pagina dei
    // risultati non lo dichiarava, e mostrare un numero al posto del nome
    // dell'opera rende l'elenco illeggibile.
    let titled = result.title != result.id;
    if result.creator.is_some() && result.thumbnail_url.is_some() && titled {
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
        title: if titled { result.title } else { preview.title },
        creator: result.creator.or(preview.creator),
        thumbnail_url: result.thumbnail_url.or(preview.thumbnail_url),
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

pub(super) async fn enrich_results(
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

#[cfg(test)]
mod tests {
    use super::super::super::find_provider;
    use super::super::{discover_with, DiscoveryStatus, SearchEndpoints};
    use super::*;
    use reqwest::Client;

    use wiremock::{
        matchers::{method, path, query_param},
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
    async fn europeana_keeps_only_results_that_declare_a_manifest() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search.json"))
            .and(query_param("wskey", "chiave-di-prova"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "totalResults": 2,
                "items": [
                    {
                        "id": "/9200518/ark__12148_bpt6k1512245f",
                        "title": ["Divina commedia"],
                        "dataProvider": ["Bibliothèque nationale de France"],
                        "edmPreview": ["https://api.europeana.eu/thumbnail/x.jpg"],
                        "dctermsIsReferencedBy": ["https://iiif.europeana.eu/presentation/9200518/ark__12148_bpt6k1512245f/manifest"],
                    },
                    {"title": ["Senza identificativo"]},
                ]
            })))
            .mount(&server)
            .await;

        let outcome = discover_with(
            &Client::new(),
            find_provider("europeana").expect("provider exists"),
            "dante",
            &SearchEndpoints {
                europeana_search: format!("{}/search.json", server.uri()),
                europeana_key: Some("chiave-di-prova".to_string()),
                ..SearchEndpoints::default()
            },
            1,
            None,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.results.len(), 1);
        // Chi conserva l'originale non è chi ha risposto alla ricerca.
        assert_eq!(
            outcome.results[0].holding_institution.as_deref(),
            Some("Bibliothèque nationale de France")
        );
    }
}
