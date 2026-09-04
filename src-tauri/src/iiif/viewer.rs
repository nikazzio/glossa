//! Pagine normalizzate per il visore.
//!
//! Il manifesto si prende dal ponte generico — stessa cortesia e stessa cache di
//! ogni altra richiesta verso una biblioteca — e si legge **qui dentro**, senza
//! farlo passare dalla finestra. Il manifesto di un libro di ottocento pagine
//! pesa megabyte: portarlo alla finestra per rimandarlo indietro da leggere
//! significava trasformarlo due volte in un elenco di numeri, e su Internet
//! Archive era buona parte dell'attesa all'apertura.
//!
//! La lettura è quella dello scaricamento (`download::manifest::parse`), così il
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
    /// La miniatura già pronta dichiarata dalla biblioteca, quando c'è.
    pub thumbnail: Option<String>,
    pub ready_sizes: Vec<(u32, u32)>,
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
            thumbnail: page.thumbnail,
            ready_sizes: page.ready_sizes,
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

/// Le pagine del manifesto a quell'indirizzo, prendendolo dove è: cache o
/// biblioteca, con la cortesia di sempre.
#[tauri::command]
pub async fn iiif_viewer_manifest(
    app: tauri::AppHandle,
    url: String,
    provider_key: Option<String>,
) -> Result<ViewerManifest, String> {
    let request = crate::httpcache::request::CacheRequest::Remote { url, provider_key };
    let bytes = crate::httpcache::commands::bytes_of(&app, &request).await?;
    pages_of(&bytes)
}

fn pages_of(bytes: &[u8]) -> Result<ViewerManifest, String> {
    manifest::parse(bytes)
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
                                            "service": [{ "id": "https://img/1",
                                              "sizes": [{"width":500,"height":700},{"width":1000,"height":1400}] }] } }] }] }
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
        let result = pages_of(PRESENTATION_3.as_bytes()).expect("parses");
        assert_eq!(result.pages.len(), 1);
        assert_eq!(result.pages[0].image_service, "https://img/1");
        assert_eq!(result.pages[0].width, Some(1000));
        assert_eq!(result.pages[0].ready_sizes, vec![(500, 700), (1000, 1400)]);
        assert!(!result.presentation2);
    }

    #[test]
    fn exposes_presentation_2_pages_to_the_same_viewer_contract() {
        let result = pages_of(PRESENTATION_2.as_bytes()).expect("parses");
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
        let result = pages_of(b"not json");
        assert!(result.is_err());
    }
}
