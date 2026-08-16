//! Lettura del manifesto IIIF.
//!
//! Si rispetta lo standard, non lo si reinterpreta (D2-bis): l'ordine delle
//! carte è quello dichiarato dal manifesto, l'etichetta è quella dichiarata, e
//! le immagini si chiedono al servizio con i parametri della Image API invece
//! di indovinare indirizzi.

use serde_json::Value;

use crate::jobs::{ErrorKind, JobError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page {
    /// Posizione nella sequenza dichiarata: è questa a ordinare, non
    /// l'etichetta, che può essere `12r`, `[iv]` o mancare (D2).
    pub index: u32,
    /// Etichetta della biblioteca, da mostrare così com'è.
    pub label: Option<String>,
    /// Radice del servizio immagini, senza parametri.
    pub image_service: String,
    /// Dimensioni dell'originale dichiarate dal canvas. Le carte di uno stesso
    /// libro **non** hanno tutte la stessa dimensione, e da queste si ricava a
    /// quale gruppo appartiene la carta quando si negozia la misura da chiedere.
    pub size: Option<(u32, u32)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Manifest {
    pub pages: Vec<Page>,
    /// Collegamento umano all'originale, quando il manifesto lo dichiara (D8-bis).
    pub homepage: Option<String>,
    /// Licenza e attribuzione: materiale d'archivio senza attribuzione è un
    /// problema, non un dettaglio (D2-bis).
    pub rights: Option<String>,
    pub attribution: Option<String>,
    /// Manifesto nella vecchia Presentation 2.1. Cambia il nome della
    /// dimensione piena: `max` esiste solo dalla Image API 3.0, prima si
    /// chiamava `full` e chiederlo alla vecchia maniera fa rispondere 400.
    pub presentation2: bool,
}

pub fn parse(bytes: &[u8]) -> Result<Manifest, JobError> {
    let root: Value = serde_json::from_slice(bytes).map_err(|error| {
        JobError::new(ErrorKind::Format, format!("manifesto illeggibile: {error}"))
    })?;

    let presentation2 = root.get("items").is_none();
    let pages = if presentation2 {
        parse_presentation_2(&root)
    } else {
        parse_presentation_3(&root)
    };

    if pages.is_empty() {
        return Err(JobError::new(
            ErrorKind::Format,
            "il manifesto non dichiara nessuna carta".to_string(),
        ));
    }

    Ok(Manifest {
        pages,
        homepage: first_id(root.get("homepage")),
        rights: root
            .get("rights")
            .and_then(Value::as_str)
            .map(str::to_string),
        attribution: attribution_of(&root),
        presentation2,
    })
}

/// Presentation 3.0: `items` di Canvas, ognuno con la sua pittura.
fn parse_presentation_3(root: &Value) -> Vec<Page> {
    root.get("items")
        .and_then(Value::as_array)
        .map(|canvases| {
            canvases
                .iter()
                .enumerate()
                .filter_map(|(position, canvas)| {
                    let body = canvas
                        .get("items")?
                        .as_array()?
                        .first()?
                        .get("items")?
                        .as_array()?
                        .first()?
                        .get("body")?;
                    Some(Page {
                        index: position as u32 + 1,
                        label: label_of(canvas.get("label")),
                        image_service: service_of(body)?,
                        size: canvas_size(canvas),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Presentation 2.1: molte biblioteche non hanno ancora migrato, e ignorarle
/// vorrebbe dire non scaricare da loro.
fn parse_presentation_2(root: &Value) -> Vec<Page> {
    root.get("sequences")
        .and_then(Value::as_array)
        .and_then(|sequences| sequences.first())
        .and_then(|sequence| sequence.get("canvases"))
        .and_then(Value::as_array)
        .map(|canvases| {
            canvases
                .iter()
                .enumerate()
                .filter_map(|(position, canvas)| {
                    let resource = canvas.get("images")?.as_array()?.first()?.get("resource")?;
                    Some(Page {
                        index: position as u32 + 1,
                        label: label_of(canvas.get("label")),
                        image_service: service_of(resource)?,
                        // In 2.1 le dimensioni stanno sulla risorsa quando il
                        // canvas non le dichiara.
                        size: canvas_size(canvas).or_else(|| canvas_size(resource)),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// La radice del servizio immagini.
///
/// Solo il servizio, mai l'indirizzo diretto dell'immagine: quello è già un URL
/// completo di parametri, e attaccargli in coda `/full/2000,/0/default.jpg`
/// produrrebbe un indirizzo inventato che nessuno serve (D2-bis: niente
/// indirizzi indovinati). Un canvas senza servizio non è scaricabile a una
/// risoluzione scelta, e si salta.
fn service_of(body: &Value) -> Option<String> {
    let from_service = match body.get("service") {
        Some(Value::Array(entries)) => entries.first().and_then(id_of),
        Some(single) => id_of(single),
        None => None,
    };
    from_service.map(|id| id.trim_end_matches('/').to_string())
}

/// Dimensioni dell'originale dichiarate dal canvas.
fn canvas_size(canvas: &Value) -> Option<(u32, u32)> {
    let width = canvas.get("width")?.as_u64()? as u32;
    let height = canvas.get("height")?.as_u64()? as u32;
    (width > 0 && height > 0).then_some((width, height))
}

fn id_of(value: &Value) -> Option<String> {
    value
        .get("id")
        .or_else(|| value.get("@id"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn first_id(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::Array(entries) => entries.first().and_then(id_of),
        single => id_of(single),
    }
}

/// L'etichetta in Presentation 3 è una mappa per lingua; in 2.x una stringa.
fn label_of(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.clone()),
        Value::Object(map) => map
            .values()
            .find_map(|entry| entry.as_array()?.first()?.as_str().map(str::to_string)),
        Value::Array(entries) => entries.first()?.as_str().map(str::to_string),
        _ => None,
    }
}

fn attribution_of(root: &Value) -> Option<String> {
    if let Some(statement) = root.get("requiredStatement") {
        return label_of(statement.get("value"));
    }
    root.get("attribution")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Indirizzo di una carta secondo la Image API: `/full/<size>/0/default.jpg`.
///
/// `size_token` è la stessa etichetta che nomina la cartella nel deposito, resa
/// nella forma che il servizio capisce (`Manifest::size_token`): così quello che
/// si è chiesto e quello che si è salvato non possono divergere.
pub fn image_url(image_service: &str, size_token: &str) -> String {
    format!("{image_service}/full/{size_token}/0/default.jpg")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRESENTATION_3: &str = r#"{
      "id": "https://example.org/manifest",
      "rights": "http://rightsstatements.org/vocab/InC/1.0/",
      "requiredStatement": { "value": { "it": ["Biblioteca di prova"] } },
      "homepage": [{ "id": "https://example.org/opera" }],
      "items": [
        { "label": { "it": ["12r"] }, "width": 2816, "height": 4240,
          "items": [{ "items": [{ "body": { "id": "https://img/1/full/max/0/default.jpg",
                                            "service": [{ "id": "https://img/1",
                                                          "profile": "level2" }] } }] }] },
        { "label": { "none": ["[iv]"] },
          "items": [{ "items": [{ "body": { "service": { "id": "https://img/2/" } } }] }] }
      ]
    }"#;

    const PRESENTATION_2: &str = r#"{
      "@id": "https://example.org/manifest",
      "attribution": "Biblioteca di prova",
      "sequences": [{ "canvases": [
        { "label": "1r", "width": 1275, "height": 1650,
          "images": [{ "resource": { "@id": "https://img/a/full/full/0/default.jpg",
                                     "service": { "@id": "https://img/a",
                                                  "profile": "http://iiif.io/api/image/2/level1.json" } } }] }
      ]}]
    }"#;

    #[test]
    fn reads_a_presentation_3_manifest_in_declared_order() {
        let manifest = parse(PRESENTATION_3.as_bytes()).unwrap();

        assert_eq!(manifest.pages.len(), 2);
        assert_eq!(manifest.pages[0].index, 1);
        assert_eq!(manifest.pages[0].label.as_deref(), Some("12r"));
        assert_eq!(manifest.pages[0].image_service, "https://img/1");
    }

    #[test]
    fn a_trailing_slash_in_the_service_does_not_become_a_double_slash() {
        let manifest = parse(PRESENTATION_3.as_bytes()).unwrap();

        assert_eq!(manifest.pages[1].image_service, "https://img/2");
    }

    #[test]
    fn keeps_licence_attribution_and_link_to_the_original() {
        let manifest = parse(PRESENTATION_3.as_bytes()).unwrap();

        assert!(manifest.rights.is_some());
        assert_eq!(manifest.attribution.as_deref(), Some("Biblioteca di prova"));
        assert_eq!(
            manifest.homepage.as_deref(),
            Some("https://example.org/opera")
        );
    }

    #[test]
    fn reads_the_older_manifests_too() {
        // Molte biblioteche non hanno migrato: ignorarle vorrebbe dire non
        // scaricare da loro.
        let manifest = parse(PRESENTATION_2.as_bytes()).unwrap();

        assert_eq!(manifest.pages.len(), 1);
        assert_eq!(manifest.pages[0].label.as_deref(), Some("1r"));
        assert_eq!(manifest.pages[0].image_service, "https://img/a");
        assert_eq!(manifest.attribution.as_deref(), Some("Biblioteca di prova"));
    }

    #[test]
    fn a_manifest_without_pages_is_a_format_error_not_an_empty_download() {
        let error = parse(br#"{"items":[]}"#).unwrap_err();

        assert_eq!(error.kind, ErrorKind::Format);
        assert!(!error.kind.is_retryable());
    }

    #[test]
    fn unreadable_bytes_are_a_format_error() {
        assert_eq!(parse(b"<html>").unwrap_err().kind, ErrorKind::Format);
    }

    #[test]
    fn the_image_url_follows_the_image_api() {
        assert_eq!(
            image_url("https://img/1", "2000,"),
            "https://img/1/full/2000,/0/default.jpg"
        );
        assert_eq!(
            image_url("https://img/1", "max"),
            "https://img/1/full/max/0/default.jpg"
        );
    }

    #[test]
    fn a_thumbnail_declared_by_the_library_is_ignored() {
        // Le miniature non si chiedono più alla biblioteca: si ricavano dalla
        // carta scaricata (D6, corretta il 2026-08-16). Un canvas che dichiara
        // la propria miniatura si legge lo stesso senza inciampi, e quel dato
        // semplicemente non serve più a nessuno.
        let manifest = parse(
            br#"{"items":[{"width":100,"height":200,
              "thumbnail":[{"id":"https://img/1/full/160,/0/default.jpg"}],
              "items":[{"items":[{"body":{"service":[{"id":"https://img/1"}]}}]}]}]}"#,
        )
        .unwrap();

        assert_eq!(manifest.pages.len(), 1);
        assert_eq!(manifest.pages[0].image_service, "https://img/1");
    }

    #[test]
    fn the_declared_page_size_is_read() {
        // Serve a scegliere la misura da chiedere: le carte di uno stesso libro
        // non hanno tutte la stessa dimensione, quindi nemmeno le misure che il
        // servizio tiene pronte sono le stesse.
        let manifest = parse(PRESENTATION_3.as_bytes()).unwrap();

        assert_eq!(manifest.pages[0].size, Some((2816, 4240)));
    }

    #[test]
    fn the_older_manifests_are_recognised_as_such() {
        let old = parse(PRESENTATION_2.as_bytes()).unwrap();

        assert!(old.presentation2);
    }

    #[test]
    fn a_canvas_without_an_image_service_is_skipped_not_guessed() {
        // L'indirizzo diretto del body è già un URL completo: attaccargli i
        // parametri della Image API produrrebbe un indirizzo che non esiste.
        let manifest = parse(
            br#"{"items":[
              {"items":[{"items":[{"body":{"id":"https://img/9/full/max/0/default.jpg"}}]}]},
              {"items":[{"items":[{"body":{"service":[{"id":"https://img/2"}]}}]}]}
            ]}"#,
        )
        .unwrap();

        assert_eq!(manifest.pages.len(), 1);
        assert_eq!(manifest.pages[0].image_service, "https://img/2");
        // La numerazione resta quella del manifesto: la carta è la seconda.
        assert_eq!(manifest.pages[0].index, 2);
    }
}
