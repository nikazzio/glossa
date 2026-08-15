//! Quale misura chiedere al servizio immagini (D4).
//!
//! Il tetto — 2000 pixel sul lato lungo, predefinito — è una **politica**, non
//! un pixel: dice quanto grande vogliamo la carta, non cosa il servizio sa
//! produrre. La misura effettiva è quella dichiarata dal descrittore
//! dell'immagine con la distanza minima dal tetto, sopra o sotto.
//!
//! **Non si tenta il tetto alla cieca.** Lo dice D4 — «si legge una volta per
//! digitalizzazione […] senza tentare richieste a indovinare» — e lo conferma la
//! specifica: le misure elencate in `sizes` sono garantite a qualunque livello
//! di conformità, la larghezza arbitraria solo dal livello 1 in su, e il livello
//! dichiarato non è affidabile. Archive.org dichiara `level2`, risponde 500 a
//! `/full/2000,/` su una pagina e ci mette 26 secondi su un'altra a generare una
//! misura che non tiene pronta, contro 2 secondi per una dichiarata.

use serde_json::Value;

/// Cosa chiedere al servizio, già nella forma del parametro `size`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SizeToken(pub String);

impl SizeToken {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Il nome della dimensione piena: `max` dalla Image API 3.0, `full` prima.
pub fn full_size(presentation2: bool) -> String {
    if presentation2 { "full" } else { "max" }.to_string()
}

/// La misura dichiarata dal descrittore più vicina al tetto, sul lato lungo.
///
/// A parità di distanza vince la più grande: fra 1800 e 2200 con tetto 2000 si
/// prende 2200, perché il dettaglio in più non si recupera scaricando di nuovo.
///
/// Si guardano `sizes` e, quando manca, le misure implicite in `tiles`: la
/// specifica impone di servire entrambe. Se il descrittore non dichiara né l'una
/// né l'altra si ripiega sul riquadro `!tetto,tetto`, che non ingrandisce mai.
/// `!w,h` esiste identico nella Image API 2.x e 3.0, quindi il ripiego non
/// dipende dalla versione del manifesto.
pub fn from_info(info: &Value, cap: u32) -> SizeToken {
    let candidates = declared_sizes(info);
    match closest_to_cap(&candidates, cap) {
        Some((width, _)) => SizeToken(format!("{width},")),
        None => SizeToken(format!("!{cap},{cap}")),
    }
}

/// Indirizzo del descrittore dell'immagine.
pub fn info_url(image_service: &str) -> String {
    format!("{}/info.json", image_service.trim_end_matches('/'))
}

/// Le misure che il servizio dichiara di saper servire.
fn declared_sizes(info: &Value) -> Vec<(u32, u32)> {
    let listed: Vec<(u32, u32)> = info
        .get("sizes")
        .and_then(Value::as_array)
        .map(|entries| entries.iter().filter_map(pair).collect())
        .unwrap_or_default();
    if !listed.is_empty() {
        return listed;
    }

    // Nessun `sizes`: le misure implicite nei fattori di scala dei riquadri
    // hanno la stessa garanzia — «a service whose Image Information response
    // includes the tiles property must support requests for the sizes implicit
    // in the width, height and scaleFactors values».
    let (full_width, full_height) = match pair(info) {
        Some(size) => size,
        None => return Vec::new(),
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

/// La coppia con la distanza minima dal tetto **sul lato lungo**.
///
/// Il tetto vale sul lato lungo, non sulla larghezza: una carta 2598×3850
/// chiesta a larghezza 2000 verrebbe alta 2964, cioè molto oltre il tetto.
fn closest_to_cap(sizes: &[(u32, u32)], cap: u32) -> Option<(u32, u32)> {
    sizes.iter().copied().min_by_key(|(width, height)| {
        let long_side = (*width).max(*height);
        (long_side.abs_diff(cap), u32::MAX - long_side)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn info_with_sizes(sizes: &[(u32, u32)]) -> Value {
        json!({
            "width": 2598, "height": 3850,
            "sizes": sizes.iter().map(|(w, h)| json!({"width": w, "height": h})).collect::<Vec<_>>(),
        })
    }

    #[test]
    fn the_closest_size_to_the_cap_wins_even_when_it_is_above() {
        // Regola scelta dall'utente il 2026-08-15: si prende la più vicina al
        // tetto, sopra o sotto, non la più grande che ci sta sotto.
        let info = info_with_sizes(&[(1200, 1200), (2100, 2100)]);
        assert_eq!(from_info(&info, 2000).as_str(), "2100,");
    }

    #[test]
    fn when_the_smaller_one_is_closer_it_wins() {
        let info = info_with_sizes(&[(1800, 1800), (2500, 2500)]);
        assert_eq!(from_info(&info, 2000).as_str(), "1800,");
    }

    #[test]
    fn the_cap_applies_to_the_long_side_not_to_the_width() {
        // Carta in verticale: 1299x1925 ha il lato lungo a 1925, vicinissimo al
        // tetto; 2598x3850 lo ha a 3850. Confrontando le larghezze si
        // sceglierebbe 2598, cioè il doppio dei pixel voluti.
        let info = info_with_sizes(&[(650, 963), (1299, 1925), (2598, 3850)]);
        assert_eq!(from_info(&info, 2000).as_str(), "1299,");
    }

    #[test]
    fn a_tie_goes_to_the_larger_size() {
        let info = info_with_sizes(&[(1800, 1800), (2200, 2200)]);
        assert_eq!(from_info(&info, 2000).as_str(), "2200,");
    }

    #[test]
    fn without_sizes_the_scale_factors_of_the_tiles_are_used() {
        // Stessa garanzia della specifica: le misure implicite nei riquadri
        // devono essere servite.
        let info = json!({
            "width": 4000, "height": 6000,
            "tiles": [{"width": 512, "scaleFactors": [1, 2, 4, 8]}],
        });
        // Lati lunghi: 6000, 3000, 1500, 750. Il più vicino a 2000 è 1500.
        assert_eq!(from_info(&info, 2000).as_str(), "1000,");
    }

    #[test]
    fn a_descriptor_that_declares_nothing_falls_back_to_a_bounding_box() {
        // `!w,h` non ingrandisce mai e non chiede una misura precisa: è il
        // ripiego che ha più probabilità di essere servito.
        assert_eq!(from_info(&json!({}), 2000).as_str(), "!2000,2000");
    }

    #[test]
    fn the_full_size_keeps_the_name_of_its_api_version() {
        // `max` esiste dalla Image API 3.0: a un servizio 2.1 va chiesto `full`.
        assert_eq!(full_size(false), "max");
        assert_eq!(full_size(true), "full");
    }
}
