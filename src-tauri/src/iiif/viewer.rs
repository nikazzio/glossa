//! Pagine normalizzate per il visore, dal manifesto già in mano.
//!
//! I byte del manifesto arrivano dal ponte generico (`cached_image`, con
//! `kind: "remote"`): stessa cortesia e stessa cache di ogni altra richiesta
//! verso una biblioteca, niente di dedicato qui. Questo comando non tocca la
//! rete: prende byte già scaricati e li fa passare dallo stesso lettore
//! IIIF 2/3 (`download::manifest::parse`) che usa lo scaricamento, così il
//! visore vede esattamente le pagine che scaricherebbe.

use serde::Serialize;

use crate::download::manifest;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerPage {
    pub index: u32,
    pub label: Option<String>,
    pub image_service: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub canvas_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerManifest {
    pub pages: Vec<ViewerPage>,
    pub homepage: Option<String>,
    pub rights: Option<String>,
    pub attribution: Option<String>,
    /// Vero per Presentation 2.1: la dimensione piena si chiede con `full`,
    /// non `max` (introdotto nella Image API 3.0).
    pub presentation2: bool,
}

impl From<manifest::Page> for ViewerPage {
    fn from(page: manifest::Page) -> Self {
        Self {
            index: page.index,
            label: page.label,
            image_service: page.image_service,
            width: page.size.map(|(width, _)| width),
            height: page.size.map(|(_, height)| height),
            canvas_id: page.canvas_id,
        }
    }
}

impl From<manifest::Manifest> for ViewerManifest {
    fn from(parsed: manifest::Manifest) -> Self {
        Self {
            pages: parsed.pages.into_iter().map(ViewerPage::from).collect(),
            homepage: parsed.homepage,
            rights: parsed.rights,
            attribution: parsed.attribution,
            presentation2: parsed.presentation2,
        }
    }
}

/// Legge le pagine di un manifesto già scaricato dal ponte controllato.
#[tauri::command]
pub fn iiif_viewer_pages(bytes: Vec<u8>) -> Result<ViewerManifest, String> {
    manifest::parse(&bytes)
        .map(ViewerManifest::from)
        .map_err(|error| error.message)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRESENTATION_3: &str = r#"{
      "id": "https://example.org/manifest",
      "items": [
        { "label": { "it": ["1r"] }, "width": 1000, "height": 1400,
          "items": [{ "items": [{ "body": { "id": "https://img/1/full/max/0/default.jpg",
                                            "service": [{ "id": "https://img/1" }] } }] }] }
      ]
    }"#;

    const PRESENTATION_2: &str = r#"{
      "@id": "https://example.org/manifest",
      "sequences": [{ "canvases": [
        { "@id": "https://example.org/canvas/1", "label": "1r", "width": 1200, "height": 1800,
          "images": [{ "resource": { "service": { "@id": "https://img/legacy" } } }] }
      ] }]
    }"#;

    #[test]
    fn parses_pages_from_bytes_without_touching_the_network() {
        let result = iiif_viewer_pages(PRESENTATION_3.as_bytes().to_vec()).expect("parses");
        assert_eq!(result.pages.len(), 1);
        assert_eq!(result.pages[0].image_service, "https://img/1");
        assert_eq!(result.pages[0].width, Some(1000));
        assert!(!result.presentation2);
    }

    #[test]
    fn exposes_presentation_2_pages_to_the_same_viewer_contract() {
        let result = iiif_viewer_pages(PRESENTATION_2.as_bytes().to_vec()).expect("parses");
        assert!(result.presentation2);
        assert_eq!(result.pages[0].label.as_deref(), Some("1r"));
        assert_eq!(
            result.pages[0].canvas_id.as_deref(),
            Some("https://example.org/canvas/1")
        );
        assert_eq!(result.pages[0].image_service, "https://img/legacy");
    }

    #[test]
    fn rejects_bytes_that_are_not_a_manifest() {
        let result = iiif_viewer_pages(b"not json".to_vec());
        assert!(result.is_err());
    }
}
