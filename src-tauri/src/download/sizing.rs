//! Calcolo della misura IIIF per libro.
//!
//! Usa i dimezzamenti dichiarati dal servizio quando disponibili; altrimenti
//! calcola la larghezza dal lato lungo richiesto. `max` resta il ripiego.

use serde_json::Value;

use crate::iiif::settings::SizePolicy;

use crate::download::manifest::Page;

/// Come calcolare la misura per **questo** libro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SizingRule {
    /// Dimezzamento con il lato lungo più vicino al tetto.
    Halvings,
    /// Larghezza calcolata dal lato lungo.
    ExactWidth,
    /// Dimensione piena.
    Full,
}

/// Il tetto della misura: un numero di pixel sul lato lungo, oppure «massima».
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SizeCap {
    LongEdge(u32),
    Max,
}

impl SizeCap {
    /// Legge un numero di pixel o `max`; usa il predefinito se non valido.
    pub fn parse(value: &str) -> Self {
        let value = value.trim();
        if value.eq_ignore_ascii_case("max") {
            return SizeCap::Max;
        }
        match value.parse::<u32>() {
            Ok(pixels) if pixels > 0 => SizeCap::LongEdge(pixels),
            _ => SizeCap::LongEdge(crate::iiif::settings::DEFAULT_SIZE_CAP),
        }
    }

    /// Nome stabile della cartella nel deposito.
    pub fn folder(&self) -> String {
        match self {
            SizeCap::LongEdge(pixels) => pixels.to_string(),
            SizeCap::Max => "max".to_string(),
        }
    }
}

/// Nome della dimensione piena per la versione IIIF.
pub fn full_size(presentation2: bool) -> String {
    if presentation2 { "full" } else { "max" }.to_string()
}

/// Indirizzo del descrittore dell'immagine.
pub fn info_url(image_service: &str) -> String {
    format!("{}/info.json", image_service.trim_end_matches('/'))
}

/// Sceglie la regola dal primo descrittore disponibile.
pub fn rule_from_info(info: Option<&Value>, cap: SizeCap, policy: SizePolicy) -> SizingRule {
    if matches!(cap, SizeCap::Max) {
        return SizingRule::Full;
    }
    if matches!(policy, SizePolicy::Exact) {
        return SizingRule::ExactWidth;
    }
    match (info.is_some_and(declares_halvings), policy) {
        (true, _) => SizingRule::Halvings,
        (false, SizePolicy::ReadyOnly) => SizingRule::Full,
        (false, _) => SizingRule::ExactWidth,
    }
}

/// Calcola il token di misura per una pagina.
pub fn token_for(rule: &SizingRule, page: &Page, cap: SizeCap, presentation2: bool) -> String {
    let full = || full_size(presentation2);
    let SizeCap::LongEdge(cap) = cap else {
        return full();
    };
    let Some((width, height)) = page.size else {
        return full();
    };
    if width == 0 || height == 0 {
        return full();
    }
    let long_edge = width.max(height);
    if long_edge <= cap {
        return full();
    }
    match rule {
        SizingRule::Full => full(),
        SizingRule::ExactWidth => format!("{},", width_for_cap(width, height, cap)),
        SizingRule::Halvings => format!("{},", halving_for_cap(width, long_edge, cap)),
    }
}

/// Larghezza che porta il lato lungo al tetto.
fn width_for_cap(width: u32, height: u32, cap: u32) -> u32 {
    let long_edge = width.max(height);
    if long_edge <= cap {
        return width;
    }
    let scaled = (width as u64 * cap as u64 + long_edge as u64 / 2) / long_edge as u64;
    (scaled.max(1)) as u32
}

/// Dimezzamento con lato lungo più vicino al tetto.
fn halving_for_cap(width: u32, long_edge: u32, cap: u32) -> u32 {
    let mut divisor = 1u32;
    while long_edge / (divisor * 2) >= cap && divisor < 1 << 16 {
        divisor *= 2;
    }
    let above = long_edge / divisor;
    let below = long_edge / (divisor * 2);
    let closest = if below > 0 && cap.abs_diff(below) < above.abs_diff(cap) {
        divisor * 2
    } else {
        divisor
    };
    (width / closest).max(1)
}

/// Riconosce una piramide di dimezzamenti.
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

/// Misure esplicite o derivate dai fattori di scala.
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
            canvas_id: None,
            thumbnail: None,
            ready_sizes: Vec::new(),
        }
    }

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

    fn gallica_info() -> Value {
        json!({ "width": 5078, "height": 6711 })
    }

    #[test]
    fn a_library_that_keeps_the_halvings_ready_is_recognised() {
        assert_eq!(
            rule_from_info(Some(&archive_info()), SizeCap::LongEdge(2000), SizePolicy::Auto),
            SizingRule::Halvings
        );
    }

    #[test]
    fn a_library_that_declares_nothing_gets_the_general_rule() {
        assert_eq!(
            rule_from_info(Some(&gallica_info()), SizeCap::LongEdge(2000), SizePolicy::Auto),
            SizingRule::ExactWidth
        );
    }

    #[test]
    fn a_descriptor_that_does_not_answer_is_not_a_problem() {
        assert_eq!(
            rule_from_info(None, SizeCap::LongEdge(2000), SizePolicy::Auto),
            SizingRule::ExactWidth
        );
    }

    #[test]
    fn the_max_cap_has_nothing_to_calculate() {
        assert_eq!(
            rule_from_info(Some(&archive_info()), SizeCap::Max, SizePolicy::Auto),
            SizingRule::Full
        );
        assert_eq!(
            token_for(&SizingRule::Full, &page(2646, 4112), SizeCap::Max, false),
            "max"
        );
    }

    #[test]
    fn the_full_size_has_two_names() {
        assert_eq!(
            token_for(&SizingRule::Full, &page(2646, 4112), SizeCap::Max, true),
            "full"
        );
    }

    #[test]
    fn the_exact_width_brings_the_long_side_to_the_cap() {
        assert_eq!(
            token_for(
                &SizingRule::ExactWidth,
                &page(5078, 6711),
                SizeCap::LongEdge(2000),
                false
            ),
            "1513,"
        );
    }

    #[test]
    fn the_halving_closest_to_the_cap_wins_above_or_below() {
        assert_eq!(
            token_for(
                &SizingRule::Halvings,
                &page(2646, 4112),
                SizeCap::LongEdge(2000),
                false
            ),
            "1323,"
        );
        assert_eq!(
            token_for(
                &SizingRule::Halvings,
                &page(5850, 7667),
                SizeCap::LongEdge(2000),
                false
            ),
            "1462,"
        );
    }

    #[test]
    fn a_page_already_smaller_than_the_cap_is_asked_whole() {
        assert_eq!(
            token_for(
                &SizingRule::ExactWidth,
                &page(1200, 1600),
                SizeCap::LongEdge(2000),
                false
            ),
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
            canvas_id: None,
            thumbnail: None,
            ready_sizes: Vec::new(),
        };
        assert_eq!(
            token_for(
                &SizingRule::ExactWidth,
                &unknown,
                SizeCap::LongEdge(2000),
                false
            ),
            "max"
        );
    }

    #[test]
    fn the_folder_takes_its_name_from_the_cap_and_not_from_the_pixels() {
        assert_eq!(SizeCap::parse("2000").folder(), "2000");
        assert_eq!(SizeCap::parse("max").folder(), "max");
        assert_eq!(SizeCap::parse("").folder(), "2000");
        assert_eq!(SizeCap::parse("duemila").folder(), "2000");
    }

    #[test]
    fn the_measured_groups_still_get_the_measured_answer() {
        let cases: &[(u32, u32, u32, SizingRule, &str)] = &[
            (2646, 4112, 2000, SizingRule::Halvings, "1323,"),
            (2583, 4126, 2000, SizingRule::Halvings, "1291,"),
            (2583, 4112, 2000, SizingRule::Halvings, "1291,"),
            (8000, 12000, 2000, SizingRule::Halvings, "1000,"),
            (5850, 7667, 2000, SizingRule::Halvings, "1462,"),
            (2646, 4112, 256, SizingRule::Halvings, "165,"),
            (5078, 6711, 2000, SizingRule::ExactWidth, "1513,"),
            (4000, 5000, 2000, SizingRule::ExactWidth, "1600,"),
            (1200, 1600, 2000, SizingRule::ExactWidth, "max"),
            (900, 1200, 2000, SizingRule::Halvings, "max"),
        ];
        for (width, height, cap, rule, expected) in cases {
            let got = token_for(rule, &page(*width, *height), SizeCap::LongEdge(*cap), false);
            assert_eq!(got, *expected, "pagina {width}×{height} con tetto {cap}");
        }
    }
}
