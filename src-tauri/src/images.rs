//! Manipolazione delle immagini: byte dentro, byte fuori.
//!
//! Non conosce il deposito, non conosce i lavori e non tocca la rete: gli si
//! passano i byte di un'immagine e restituisce quelli di un'altra. È quello che
//! permette di provarlo senza montare niente.
//!
//! Il lavoro pesa sul processore: chi lo chiama da un contesto asincrono lo
//! esegue fuori dal filo principale, altrimenti tiene fermo il runtime mentre
//! decodifica.

use image::{
    codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ExtendedColorType, ImageEncoder,
};

/// Lato lungo predefinito delle miniature, in pixel *(scelto dall'utente il
/// 2026-08-16)*: 160 era la misura che le biblioteche davano per ripiego, 300 è
/// quella giusta per sfogliare.
pub const DEFAULT_THUMBNAIL_EDGE: u32 = 300;

/// Qualità della ricodifica delle miniature. Resta interna: è una scelta di
/// resa, non una preferenza da esporre.
const THUMBNAIL_QUALITY: u8 = 80;

/// Filtro del ridimensionamento. Lanczos costa più di un'interpolazione
/// lineare e su una miniatura si vede: le lettere restano leggibili.
const THUMBNAIL_FILTER: FilterType = FilterType::Lanczos3;

#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    #[error("lato lungo non valido: {0}")]
    Size(u32),
    #[error("immagine illeggibile: {0}")]
    Decode(String),
    #[error("ricodifica fallita: {0}")]
    Encode(String),
}

/// Ricava una miniatura JPEG dai byte di un'immagine, con il lato lungo alla
/// misura chiesta e le proporzioni intatte.
///
/// Un'immagine già più piccola del lato chiesto **non viene ingrandita**:
/// ingrandire aggiunge byte e non aggiunge dettaglio.
pub fn thumbnail(bytes: &[u8], long_edge: u32) -> Result<Vec<u8>, ImageError> {
    resize_jpeg(bytes, long_edge, THUMBNAIL_QUALITY)
}

/// La stessa macchina della miniatura, con la qualità in ingresso.
///
/// Serve a due cose che una miniatura non è: rimpicciolire sul momento una
/// pagina che nel deposito sta a una misura maggiore di quella chiesta, e
/// l'ottimizzazione locale, dove la qualità la sceglie chi la lancia.
pub fn resize_jpeg(bytes: &[u8], long_edge: u32, quality: u8) -> Result<Vec<u8>, ImageError> {
    if long_edge == 0 {
        return Err(ImageError::Size(long_edge));
    }
    let decoded =
        image::load_from_memory(bytes).map_err(|error| ImageError::Decode(error.to_string()))?;
    encode_jpeg_at(&fit_inside(decoded, long_edge), quality)
}

/// Riporta l'immagine dentro un quadrato di lato `edge` conservando le
/// proporzioni: il lato lungo diventa `edge`, l'altro scende di conseguenza.
fn fit_inside(image: DynamicImage, edge: u32) -> DynamicImage {
    if image.width() <= edge && image.height() <= edge {
        return image;
    }
    image.resize(edge, edge, THUMBNAIL_FILTER)
}

fn encode_jpeg_at(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, ImageError> {
    // Il JPEG non ha canale alpha: una PNG con trasparenza va portata a tre
    // canali prima, altrimenti la codifica rifiuta i byte che le passiamo.
    let rgb = image.to_rgb8();
    let mut encoded = Vec::new();
    JpegEncoder::new_with_quality(&mut encoded, quality)
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            ExtendedColorType::Rgb8,
        )
        .map_err(|error| ImageError::Encode(error.to_string()))?;
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Una JPEG vera delle dimensioni chieste, da dare in pasto alle prove.
    fn jpeg(width: u32, height: u32) -> Vec<u8> {
        let mut pixels = image::RgbImage::new(width, height);
        for (x, y, pixel) in pixels.enumerate_pixels_mut() {
            *pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 128]);
        }
        encode_jpeg_at(&DynamicImage::ImageRgb8(pixels), THUMBNAIL_QUALITY).unwrap()
    }

    fn dimensions(bytes: &[u8]) -> (u32, u32) {
        let decoded = image::load_from_memory(bytes).unwrap();
        (decoded.width(), decoded.height())
    }

    #[test]
    fn the_long_side_becomes_the_size_asked_for() {
        let page = jpeg(1282, 1920);

        let (width, height) = dimensions(&thumbnail(&page, 300).unwrap());

        assert_eq!(height, 300, "il lato lungo è l'altezza");
        // 1282/1920 di 300, arrotondato: le proporzioni restano.
        assert_eq!(width, 200);
    }

    #[test]
    fn a_landscape_page_is_measured_on_its_width() {
        let page = jpeg(1920, 1282);

        let (width, height) = dimensions(&thumbnail(&page, 300).unwrap());

        assert_eq!(width, 300);
        assert_eq!(height, 200);
    }

    #[test]
    fn an_image_smaller_than_the_size_asked_for_is_not_enlarged() {
        let small = jpeg(120, 90);

        let (width, height) = dimensions(&thumbnail(&small, 300).unwrap());

        assert_eq!((width, height), (120, 90));
    }

    #[test]
    fn a_thumbnail_weighs_far_less_than_the_page_it_comes_from() {
        let page = jpeg(1282, 1920);

        let thumbnail = thumbnail(&page, 300).unwrap();

        assert!(
            thumbnail.len() * 4 < page.len(),
            "miniatura {} byte, pagina {} byte",
            thumbnail.len(),
            page.len()
        );
    }

    #[test]
    fn bytes_that_are_not_an_image_are_refused_without_panicking() {
        let error = thumbnail(b"non sono un'immagine", 300).unwrap_err();

        assert!(matches!(error, ImageError::Decode(_)));
    }

    #[test]
    fn a_zero_long_side_is_refused_before_decoding() {
        let error = thumbnail(&jpeg(100, 100), 0).unwrap_err();

        assert!(matches!(error, ImageError::Size(0)));
    }
}
