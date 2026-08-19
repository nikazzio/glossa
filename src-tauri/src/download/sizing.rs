//! Quale misura chiedere alla biblioteca, e come deciderlo **una volta per
//! libro** (D4 sostituita, piano §5.1 e §5.9).
//!
//! Il tetto è una **politica, non un pixel**: dice quanto grande vogliamo la
//! pagina, non cosa il servizio sa produrre. Da lì in poi la misura si
//! **calcola**, e le prove dicono che basta: su 47 gruppi di dimensioni
//! misurati sul campo, il calcolo dalle sole dimensioni del manifesto ha
//! predetto 47 volte su 47 la misura che la negoziazione otteneva leggendo il
//! descrittore di ogni gruppo.
//!
//! Il descrittore si legge **una volta sola, all'avvio del libro**, e non per
//! scegliere la misura: per scegliere **come calcolarla**. Costa 4,3 secondi
//! misurati su un lavoro di ore — lo 0,1% — e in cambio non c'è nessuna casella
//! da compilare a mano, funziona anche per le biblioteche mai misurate, e si
//! scopre subito il manifesto che dichiara dimensioni diverse da quelle vere.
//!
//! Le due strade che ne escono sono state misurate:
//!
//! - dove la biblioteca tiene pronti i **dimezzamenti** (archive.org, Bodleian)
//!   chiederne uno costa **2,6 s e 0,53 MB** contro 5,9 s e 1,20 MB per una
//!   larghezza arbitraria: una misura non pronta il servizio la genera sul
//!   momento, e non la tiene da parte;
//! - dove non li tiene (Gallica non dichiara niente) la larghezza esatta costa
//!   **1,5 s** ed è anche più fedele: agganciarsi a un dimezzamento darebbe una
//!   pagina con il 16% di dettaglio in meno di quello chiesto.
//!
//! `max` resta il ripiego e non la regola: costa da due a cinque volte il tempo
//! e da tre a otto volte i byte.

use serde_json::Value;

use crate::download::manifest::Page;

/// Cosa chiedere al servizio, già nella forma del parametro `size`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SizeToken(pub String);

impl SizeToken {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Come calcolare la misura per **questo** libro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SizingRule {
    /// La biblioteca tiene pronti i dimezzamenti dell'originale: si chiede il
    /// dimezzamento con il lato lungo più vicino al tetto. Vale il doppio della
    /// velocità dove è vero.
    Halvings,
    /// Caso generale: si calcola la larghezza che porta il lato lungo al tetto
    /// e si chiede quella. È livello 1 della specifica, cioè obbligatoria per
    /// chiunque non sia livello 0.
    ExactWidth,
    /// Niente da calcolare: si chiede la dimensione piena. È il tetto «massima»,
    /// ed è anche il ripiego dopo un rifiuto della misura.
    Full,
}

/// Il tetto della misura: un numero di pixel sul lato lungo, oppure «massima».
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SizeCap {
    LongEdge(u32),
    Max,
}

impl SizeCap {
    /// Legge il tetto come lo scrive l'impostazione: `2000`, oppure `max`.
    pub fn parse(value: &str) -> Self {
        match value.trim().parse::<u32>() {
            Ok(pixels) if pixels > 0 => SizeCap::LongEdge(pixels),
            _ => SizeCap::Max,
        }
    }

    /// Il nome della cartella nel deposito. **Il tetto, non i pixel ottenuti**:
    /// le pagine di uno stesso libro hanno dimensioni diverse fra loro, quindi
    /// la larghezza chiesta varia di pagina in pagina — 1323, 1278, 1264 sullo
    /// stesso libro — e una cartella per misura ottenuta sparpaglierebbe la
    /// stessa fonte in cartelle diverse, dove una ripresa non ritroverebbe più
    /// niente.
    pub fn folder(&self) -> String {
        match self {
            SizeCap::LongEdge(pixels) => pixels.to_string(),
            SizeCap::Max => "max".to_string(),
        }
    }
}

/// Il nome della dimensione piena: `max` dalla Image API 3.0, `full` prima.
///
/// Chiedere `max` a un servizio dichiarato nella vecchia Presentation 2.1 fa
/// rispondere 400: è un fatto pagato sul campo.
pub fn full_size(presentation2: bool) -> String {
    if presentation2 { "full" } else { "max" }.to_string()
}

/// Indirizzo del descrittore dell'immagine.
pub fn info_url(image_service: &str) -> String {
    format!("{}/info.json", image_service.trim_end_matches('/'))
}

/// Come calcolare la misura per questo libro: la regola, e la correzione da
/// applicare alle dimensioni del manifesto quando il descrittore le smentisce.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sizing {
    pub rule: SizingRule,
    /// `(dimensione vera, dimensione dichiarata)` sul lato lungo della pagina
    /// campionata: le dimensioni del manifesto si moltiplicano per questo
    /// rapporto prima di calcolare.
    ///
    /// Un rapporto e non due numeri assoluti perché le pagine di un libro hanno
    /// dimensioni diverse fra loro: quello che si scopre leggendo **una** pagina
    /// non è quanto è grande ogni pagina, è di quanto il manifesto sbaglia.
    pub correction: Option<(u32, u32)>,
}

impl Sizing {
    pub fn new(rule: SizingRule) -> Self {
        Self {
            rule,
            correction: None,
        }
    }
}

/// Quanto le due misure possono divergere prima di chiamarla una bugia: sotto
/// questa soglia è arrotondamento, e correggerlo non cambierebbe niente.
const CORRECTION_TOLERANCE_PCT: u64 = 1;

/// Come calcolare la misura per questo libro, deciso guardando **un**
/// descrittore.
///
/// Due domande:
///
/// 1. le misure dichiarate sono i dimezzamenti delle dimensioni dell'originale?
///    Se sì, la biblioteca tiene pronta la piramide e ci si aggancia;
/// 2. le dimensioni che il descrittore dichiara sono quelle che dice il
///    manifesto? Se divergono, il manifesto sta mentendo — e allora il calcolo
///    va fatto sulle dimensioni del descrittore, non sulle sue.
///
/// Il descrittore che non risponde **non è un problema**: si torna alla regola
/// generale, che è quella che funziona ovunque. Il silenzio di `info.json` è
/// passeggero (la stessa pagina che non rispondeva ha risposto alla sessione
/// dopo), ma inseguirlo per un guadagno di velocità non vale la pena.
pub fn from_info(info: Option<&Value>, page: Option<&Page>, cap: SizeCap) -> Sizing {
    if matches!(cap, SizeCap::Max) {
        return Sizing::new(SizingRule::Full);
    }
    let Some(info) = info else {
        return Sizing::new(SizingRule::ExactWidth);
    };
    let rule = if declares_halvings(info) {
        SizingRule::Halvings
    } else {
        SizingRule::ExactWidth
    };
    Sizing {
        rule,
        correction: page.and_then(|page| correction_for(info, page)),
    }
}

/// Di quanto il manifesto sbaglia sulle dimensioni, misurato sulla pagina di cui
/// abbiamo letto il descrittore.
///
/// Due condizioni, entrambe necessarie:
///
/// - **le proporzioni devono coincidere.** Se non coincidono, il descrittore non
///   sta descrivendo la stessa immagine, e un rapporto ricavato da lì
///   sballerebbe tutte le pagine invece di raddrizzarne una;
/// - **lo scarto deve superare la tolleranza.** Un pixel di differenza è
///   arrotondamento, e correggerlo non cambia niente (sbagliare il dimezzamento
///   di un pixel è misurato: 2,5 s contro 2,6 s).
///
/// Senza questa correzione una pagina che il manifesto dichiara più piccola del
/// tetto verrebbe chiesta a dimensione piena, che è il caso peggiore: massimo
/// peso e massimo tempo su una pagina che si voleva ridotta.
fn correction_for(info: &Value, page: &Page) -> Option<(u32, u32)> {
    let (real_width, real_height) = pair(info)?;
    let (declared_width, declared_height) = page.size?;
    if declared_width == 0 || declared_height == 0 {
        return None;
    }
    // Proporzioni: si confrontano incrociando i prodotti, così non serve
    // dividere e non si perde niente per strada.
    let crossed = (real_width as u64 * declared_height as u64)
        .abs_diff(real_height as u64 * declared_width as u64);
    let scale = real_width as u64 * declared_height as u64;
    if crossed * 100 > scale.max(1) * CORRECTION_TOLERANCE_PCT {
        return None;
    }
    let real_long = real_width.max(real_height) as u64;
    let declared_long = declared_width.max(declared_height) as u64;
    if real_long.abs_diff(declared_long) * 100 <= declared_long * CORRECTION_TOLERANCE_PCT {
        return None;
    }
    Some((real_long as u32, declared_long as u32))
}

/// Il token da chiedere per questa pagina. Nessuna richiesta, nessuna memoria
/// fra una pagina e l'altra.
///
/// Una pagina di cui il manifesto non dichiara le dimensioni non ha niente da
/// calcolare: si chiede la dimensione piena, che è garantita a ogni livello di
/// conformità.
pub fn token_for(sizing: &Sizing, page: &Page, cap: SizeCap, presentation2: bool) -> SizeToken {
    let full = || SizeToken(full_size(presentation2));
    let SizeCap::LongEdge(cap) = cap else {
        return full();
    };
    let Some((width, height)) = page.size else {
        return full();
    };
    if width == 0 || height == 0 {
        return full();
    }
    // Il manifesto smentito dal descrittore si raddrizza qui, prima di ogni
    // decisione: sia il tetto sia il dimezzamento vanno calcolati sulle
    // dimensioni vere, non su quelle dichiarate.
    let (width, height) = corrected(width, height, sizing.correction);
    let long_edge = width.max(height);
    // Già dentro il tetto: chiedere di ridurla non ha senso, e chiedere una
    // larghezza uguale alla sua fa lavorare il servizio per niente.
    if long_edge <= cap {
        return full();
    }
    match sizing.rule {
        SizingRule::Full => full(),
        SizingRule::ExactWidth => SizeToken(format!("{},", width_for_cap(width, height, cap))),
        SizingRule::Halvings => SizeToken(format!("{},", halving_for_cap(width, long_edge, cap))),
    }
}

/// Le dimensioni vere: quelle del manifesto, portate in scala dal rapporto che
/// il descrittore ha rivelato.
fn corrected(width: u32, height: u32, correction: Option<(u32, u32)>) -> (u32, u32) {
    let Some((real, declared)) = correction else {
        return (width, height);
    };
    if declared == 0 {
        return (width, height);
    }
    let scale = |value: u32| {
        ((value as u64 * real as u64 + declared as u64 / 2) / declared as u64).max(1) as u32
    };
    (scale(width), scale(height))
}

/// La larghezza che porta il **lato lungo** al tetto.
///
/// Il tetto vale sul lato lungo e non sulla larghezza: una pagina 2598×3850
/// chiesta a larghezza 2000 verrebbe alta 2964, cioè molto oltre il tetto.
fn width_for_cap(width: u32, height: u32, cap: u32) -> u32 {
    let long_edge = width.max(height);
    if long_edge <= cap {
        return width;
    }
    // Arrotondamento al più vicino: sbagliare di un pixel non costa niente —
    // misurato, 2,5 s contro 2,6 s — quindi non serve inseguire la regola di
    // arrotondamento di ogni servizio.
    let scaled = (width as u64 * cap as u64 + long_edge as u64 / 2) / long_edge as u64;
    (scaled.max(1)) as u32
}

/// Il dimezzamento con il lato lungo più vicino al tetto **senza scendere sotto
/// il necessario**: si dimezza finché il lato lungo resta sopra il tetto.
///
/// Fermarsi al primo che scende sotto darebbe una pagina più piccola di quella
/// chiesta; fermarsi prima ne darebbe una più grande del necessario. Si prende
/// quella immediatamente sopra il tetto, che è ciò che il tetto significa: non
/// meno dettaglio di così.
fn halving_for_cap(width: u32, long_edge: u32, cap: u32) -> u32 {
    let mut divisor = 1u32;
    while long_edge / (divisor * 2) >= cap && divisor < 1 << 16 {
        divisor *= 2;
    }
    (width / divisor).max(1)
}

/// Vero quando le misure dichiarate sono i dimezzamenti dell'originale.
///
/// Basta che **almeno una** misura dichiarata sia un dimezzamento esatto oltre
/// il primo: archive.org dichiara 2646 · 1323 · 662 · 331 · 165 · 83, Bodleian
/// 500 · 250 · 125 su 1000, Gallica non dichiara niente.
fn declares_halvings(info: &Value) -> bool {
    let Some((full_width, full_height)) = pair(info) else {
        return false;
    };
    let sizes = declared_sizes(info);
    let full_long = full_width.max(full_height);
    sizes.iter().any(|(width, height)| {
        let long = (*width).max(*height);
        long > 0 && long < full_long && is_halving(full_long, long)
    })
}

/// Vero se `part` è `whole` diviso una potenza di due, a meno di un pixel di
/// arrotondamento.
fn is_halving(whole: u32, part: u32) -> bool {
    let mut divisor = 2u32;
    while whole / divisor >= 1 && divisor <= 1 << 16 {
        if (whole / divisor).abs_diff(part) <= 1 {
            return true;
        }
        divisor *= 2;
    }
    false
}

/// Le misure che il servizio dichiara di saper servire: quelle elencate e,
/// quando mancano, quelle implicite nei fattori di scala dei riquadri — la
/// specifica impone di servire entrambe.
fn declared_sizes(info: &Value) -> Vec<(u32, u32)> {
    let listed: Vec<(u32, u32)> = info
        .get("sizes")
        .and_then(Value::as_array)
        .map(|entries| entries.iter().filter_map(pair).collect())
        .unwrap_or_default();
    if !listed.is_empty() {
        return listed;
    }
    let Some((full_width, full_height)) = pair(info) else {
        return Vec::new();
    };
    info.get("tiles")
        .and_then(Value::as_array)
        .and_then(|entries| entries.first())
        .and_then(|tile| tile.get("scaleFactors"))
        .and_then(Value::as_array)
        .map(|factors| {
            factors
                .iter()
                .filter_map(Value::as_u64)
                .filter(|factor| *factor > 0)
                .map(|factor| {
                    (
                        (full_width as u64 / factor).max(1) as u32,
                        (full_height as u64 / factor).max(1) as u32,
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

fn pair(value: &Value) -> Option<(u32, u32)> {
    let width = value.get("width")?.as_u64()? as u32;
    let height = value.get("height")?.as_u64()? as u32;
    (width > 0 && height > 0).then_some((width, height))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn page(width: u32, height: u32) -> Page {
        Page {
            index: 1,
            label: None,
            image_service: "https://example.org/iiif/1".to_string(),
            size: Some((width, height)),
        }
    }

    /// archive.org: dichiara la piramide dei dimezzamenti.
    fn archive_info() -> Value {
        json!({
            "width": 2646, "height": 4112,
            "sizes": [
                {"width": 2646, "height": 4112},
                {"width": 1323, "height": 2056},
                {"width": 662, "height": 1028},
                {"width": 331, "height": 514},
            ],
        })
    }

    /// Gallica: non dichiara niente.
    fn gallica_info() -> Value {
        json!({ "width": 5078, "height": 6711 })
    }

    #[test]
    fn a_library_that_keeps_the_halvings_ready_is_recognised() {
        assert_eq!(
            from_info(Some(&archive_info()), None, SizeCap::LongEdge(2000)).rule,
            SizingRule::Halvings
        );
    }

    #[test]
    fn a_library_that_declares_nothing_gets_the_general_rule() {
        assert_eq!(
            from_info(Some(&gallica_info()), None, SizeCap::LongEdge(2000)).rule,
            SizingRule::ExactWidth
        );
    }

    #[test]
    fn a_descriptor_that_does_not_answer_is_not_a_problem() {
        // Si torna alla regola generale, che funziona ovunque.
        assert_eq!(
            from_info(None, None, SizeCap::LongEdge(2000)).rule,
            SizingRule::ExactWidth
        );
    }

    #[test]
    fn the_max_cap_has_nothing_to_calculate() {
        assert_eq!(
            from_info(Some(&archive_info()), None, SizeCap::Max).rule,
            SizingRule::Full
        );
        assert_eq!(
            token_for(
                &Sizing::new(SizingRule::Full),
                &page(2646, 4112),
                SizeCap::Max,
                false
            )
            .as_str(),
            "max"
        );
    }

    #[test]
    fn the_full_size_has_two_names() {
        // Chiedere `max` a un servizio della vecchia Presentation 2.1 fa
        // rispondere 400: è un fatto pagato sul campo.
        assert_eq!(
            token_for(
                &Sizing::new(SizingRule::Full),
                &page(2646, 4112),
                SizeCap::Max,
                true
            )
            .as_str(),
            "full"
        );
    }

    #[test]
    fn the_exact_width_brings_the_long_side_to_the_cap() {
        // Gallica, pagina 5078×6711, tetto 2000: la larghezza misurata sul
        // campo è 1513.
        assert_eq!(
            token_for(
                &Sizing::new(SizingRule::ExactWidth),
                &page(5078, 6711),
                SizeCap::LongEdge(2000),
                false
            )
            .as_str(),
            "1513,"
        );
    }

    #[test]
    fn the_halving_stays_above_the_cap_instead_of_falling_under_it() {
        // archive.org, pagina 2646×4112, tetto 2000: il dimezzamento è 1323
        // (lato lungo 2056, sopra il tetto). Il quarto sarebbe 1028, sotto.
        assert_eq!(
            token_for(
                &Sizing::new(SizingRule::Halvings),
                &page(2646, 4112),
                SizeCap::LongEdge(2000),
                false
            )
            .as_str(),
            "1323,"
        );
    }

    #[test]
    fn a_page_already_smaller_than_the_cap_is_asked_whole() {
        // Chiedere di ridurre una pagina già piccola fa lavorare il servizio
        // per niente, e la dimensione piena è la misura più garantita di tutte.
        assert_eq!(
            token_for(
                &Sizing::new(SizingRule::ExactWidth),
                &page(1200, 1600),
                SizeCap::LongEdge(2000),
                false
            )
            .as_str(),
            "max"
        );
    }

    #[test]
    fn a_page_without_declared_dimensions_is_asked_whole() {
        let unknown = Page {
            index: 1,
            label: None,
            image_service: "https://example.org/iiif/1".to_string(),
            size: None,
        };
        assert_eq!(
            token_for(
                &Sizing::new(SizingRule::ExactWidth),
                &unknown,
                SizeCap::LongEdge(2000),
                false
            )
            .as_str(),
            "max"
        );
    }

    #[test]
    fn a_manifest_that_agrees_with_the_descriptor_needs_no_correction() {
        let sizing = from_info(
            Some(&archive_info()),
            Some(&page(2646, 4112)),
            SizeCap::LongEdge(2000),
        );
        assert_eq!(sizing.correction, None);
    }

    #[test]
    fn a_manifest_that_lies_about_the_dimensions_is_corrected() {
        // Il manifesto dichiara la pagina a metà delle sue dimensioni vere: il
        // descrittore, che descrive l'immagine servita, dice 2646×4112.
        let sizing = from_info(
            Some(&archive_info()),
            Some(&page(1323, 2056)),
            SizeCap::LongEdge(2000),
        );

        assert_eq!(sizing.correction, Some((4112, 2056)));
        // Senza correzione questa pagina sembrerebbe già dentro il tetto e
        // verrebbe chiesta a dimensione piena — il caso più costoso di tutti.
        assert_eq!(
            token_for(&sizing, &page(1323, 2056), SizeCap::LongEdge(2000), false).as_str(),
            "1323,"
        );
    }

    #[test]
    fn a_descriptor_with_different_proportions_is_not_trusted() {
        // Proporzioni diverse significano che non è la stessa immagine: un
        // rapporto ricavato da lì sballerebbe tutte le pagine del libro.
        let sizing = from_info(
            Some(&archive_info()),
            Some(&page(2000, 2000)),
            SizeCap::LongEdge(2000),
        );
        assert_eq!(sizing.correction, None);
    }

    #[test]
    fn a_pixel_of_difference_is_rounding_and_not_a_lie() {
        let sizing = from_info(
            Some(&archive_info()),
            Some(&page(2645, 4111)),
            SizeCap::LongEdge(2000),
        );
        assert_eq!(sizing.correction, None);
    }

    #[test]
    fn the_folder_takes_its_name_from_the_cap_and_not_from_the_pixels() {
        assert_eq!(SizeCap::parse("2000").folder(), "2000");
        assert_eq!(SizeCap::parse("max").folder(), "max");
        // Un valore illeggibile non fa fallire niente: vale «massima».
        assert_eq!(SizeCap::parse("").folder(), "max");
    }

    /// I 47 gruppi misurati sul campo il 2026-08-18, ridotti ai casi distinti.
    /// Se la regola cambia, questa tabella se ne accorge.
    #[test]
    fn the_measured_groups_still_get_the_measured_answer() {
        let cases: &[(u32, u32, u32, SizingRule, &str)] = &[
            // archive.org, i gruppi più frequenti: dimezzamento.
            (2646, 4112, 2000, SizingRule::Halvings, "1323,"),
            (2583, 4126, 2000, SizingRule::Halvings, "1291,"),
            (2583, 4112, 2000, SizingRule::Halvings, "1291,"),
            // Una pagina dove il dimezzamento non basta e serve il quarto.
            (8000, 12000, 2000, SizingRule::Halvings, "2000,"),
            // Un tetto piccolo di una richiesta vecchia: serve il sedicesimo.
            (2646, 4112, 256, SizingRule::Halvings, "165,"),
            // Gallica, larghezza esatta.
            (5078, 6711, 2000, SizingRule::ExactWidth, "1513,"),
            (4000, 5000, 2000, SizingRule::ExactWidth, "1600,"),
            // Già più piccole del tetto: la risposta giusta è la dimensione piena.
            (1200, 1600, 2000, SizingRule::ExactWidth, "max"),
            (900, 1200, 2000, SizingRule::Halvings, "max"),
        ];
        for (width, height, cap, rule, expected) in cases {
            let got = token_for(
                &Sizing::new(rule.clone()),
                &page(*width, *height),
                SizeCap::LongEdge(*cap),
                false,
            );
            assert_eq!(
                got.as_str(),
                *expected,
                "pagina {width}×{height} con tetto {cap}"
            );
        }
    }
}
