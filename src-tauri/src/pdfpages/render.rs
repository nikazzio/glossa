//! Una pagina di PDF disegnata come immagine JPEG.
//!
//! La pagina si **disegna**, non si copia l'immagine incorporata: nei PDF di
//! Internet Archive ogni pagina è uno sfondo a bassa risoluzione più l'inchiostro
//! ad alta risoluzione ritagliato da una maschera, e solo il disegno li unisce.
//! La scala porta la pagina alla larghezza dell'immagine incorporata più grande,
//! cioè alla risoluzione della scansione originale.

use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::object::{Name, Stream};
use hayro::hayro_syntax::page::Page;
use hayro::hayro_syntax::Pdf;
use hayro::vello_cpu::color::palette::css::WHITE;
use hayro::{render, PixmapSettings, RenderCache, RenderSettings};

use crate::images;

/// Qualità JPEG delle pagine estratte: alta, perché sono l'originale di lavoro
/// (visore e OCR) e l'ottimizzazione resta disponibile per ridurle.
pub const JPEG_QUALITY: u8 = 90;

/// Risoluzione di ripiego quando la pagina non contiene immagini (PDF nato
/// digitale, o immagini dentro moduli annidati).
const FALLBACK_DPI: f32 = 300.0;
const POINTS_PER_INCH: f32 = 72.0;

/// Lato lungo massimo in pixel. Il disegno lavora con dimensioni a 16 bit, e
/// oltre questa misura una pagina occupa centinaia di MB senza dettaglio utile.
const MAX_LONG_EDGE: f32 = 10_000.0;

#[derive(Debug, thiserror::Error)]
pub enum RenderError {
    #[error("pdf_unreadable: {0}")]
    Open(String),
    #[error("page_out_of_range: {0}")]
    Range(usize),
    #[error("page_empty")]
    Empty,
    #[error("page_not_encoded: {0}")]
    Encode(String),
}

#[derive(Debug)]
pub struct RenderedPage {
    pub jpeg: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Apre un PDF dai suoi byte. Il documento resta in memoria per tutto il lavoro.
pub fn open(bytes: Vec<u8>) -> Result<Pdf, RenderError> {
    Pdf::new(bytes).map_err(|error| RenderError::Open(format!("{error:?}")))
}

/// Disegna la pagina in posizione `index` (da zero) su fondo bianco.
pub fn render_page(pdf: &Pdf, index: usize, quality: u8) -> Result<RenderedPage, RenderError> {
    let pages = pdf.pages();
    let page = pages.get(index).ok_or(RenderError::Range(index))?;
    let scale = scale_for(page);
    let cache = RenderCache::new();
    let pixmap = render(
        page,
        &cache,
        &InterpreterSettings::default(),
        &RenderSettings::default(),
        &PixmapSettings {
            x_scale: scale,
            y_scale: scale,
            bg_color: WHITE,
        },
    );
    let (width, height) = (u32::from(pixmap.width()), u32::from(pixmap.height()));
    if width == 0 || height == 0 {
        return Err(RenderError::Empty);
    }
    // Fondo bianco opaco: i valori premoltiplicati coincidono con quelli diretti,
    // e il canale alpha si può lasciare cadere.
    let rgb: Vec<u8> = pixmap
        .data_as_u8_slice()
        .chunks_exact(4)
        .flat_map(|pixel| [pixel[0], pixel[1], pixel[2]])
        .collect();
    let jpeg = images::encode_rgb_jpeg(width, height, &rgb, quality)
        .map_err(|error| RenderError::Encode(error.to_string()))?;
    Ok(RenderedPage {
        jpeg,
        width,
        height,
    })
}

/// Fattore di scala dai punti PDF ai pixel.
fn scale_for(page: &Page<'_>) -> f32 {
    // Le dimensioni di base non tengono conto della rotazione, come la
    // larghezza dichiarata dall'immagine incorporata.
    let (base_width, base_height) = page.base_dimensions();
    if base_width <= 0.0 || base_height <= 0.0 {
        return 1.0;
    }
    let target_width = widest_image(page).unwrap_or(base_width * FALLBACK_DPI / POINTS_PER_INCH);
    let scale = target_width / base_width;
    let long_edge = base_width.max(base_height) * scale;
    if long_edge > MAX_LONG_EDGE {
        MAX_LONG_EDGE / base_width.max(base_height)
    } else {
        scale
    }
}

/// Larghezza in pixel dell'immagine più larga disegnata direttamente nella pagina.
fn widest_image(page: &Page<'_>) -> Option<f32> {
    let x_objects = &page.resources().x_objects;
    x_objects
        .keys()
        .filter_map(|name| x_objects.get::<Stream<'_>>(name))
        .filter(|stream| {
            stream
                .dict()
                .get::<Name<'_>>(b"Subtype")
                .is_some_and(|subtype| subtype.as_ref() == b"Image")
        })
        .filter_map(|stream| stream.dict().get::<f32>(b"Width"))
        .filter(|width| *width > 0.0)
        .reduce(f32::max)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Un PDF di una pagina 200 × 300 punti con un rettangolo nero disegnato.
    pub(crate) fn tiny_pdf(pages: usize) -> Vec<u8> {
        let mut objects: Vec<String> = Vec::new();
        objects.push("<< /Type /Catalog /Pages 2 0 R >>".to_string());
        let kids: Vec<String> = (0..pages).map(|i| format!("{} 0 R", 3 + i * 2)).collect();
        objects.push(format!(
            "<< /Type /Pages /Kids [{}] /Count {pages} >>",
            kids.join(" ")
        ));
        let content = "0 0 0 rg 20 20 100 100 re f";
        for i in 0..pages {
            objects.push(format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Contents {} 0 R >>",
                4 + i * 2
            ));
            objects.push(format!(
                "<< /Length {} >>\nstream\n{content}\nendstream",
                content.len()
            ));
        }
        let mut out = String::from("%PDF-1.4\n");
        let mut offsets = Vec::new();
        for (i, object) in objects.iter().enumerate() {
            offsets.push(out.len());
            out.push_str(&format!("{} 0 obj\n{object}\nendobj\n", i + 1));
        }
        let xref_at = out.len();
        out.push_str(&format!(
            "xref\n0 {}\n0000000000 65535 f \n",
            objects.len() + 1
        ));
        for offset in offsets {
            out.push_str(&format!("{offset:010} 00000 n \n"));
        }
        out.push_str(&format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n",
            objects.len() + 1
        ));
        out.into_bytes()
    }

    #[test]
    fn a_page_without_images_is_drawn_at_300_dpi_as_a_valid_jpeg() {
        let pdf = open(tiny_pdf(1)).expect("pdf");
        let page = render_page(&pdf, 0, JPEG_QUALITY).expect("pagina");

        // 200 × 300 punti a 300 dpi.
        assert_eq!((page.width, page.height), (833, 1250));
        assert_eq!(
            images::dimensions_of(&page.jpeg).expect("jpeg"),
            (833, 1250)
        );
    }

    #[test]
    fn a_page_beyond_the_document_is_an_error() {
        let pdf = open(tiny_pdf(1)).expect("pdf");
        assert!(matches!(
            render_page(&pdf, 3, JPEG_QUALITY),
            Err(RenderError::Range(3))
        ));
    }

    #[test]
    fn bytes_that_are_not_a_pdf_do_not_open() {
        assert!(open(b"non sono un pdf".to_vec()).is_err());
    }
}
