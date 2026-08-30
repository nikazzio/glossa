//! Da quello che l'utente scrive al manifesto della biblioteca.
//!
//! Ogni biblioteca ha il suo modo di nominare un'opera: una segnatura
//! (`Urb.lat.1779`), un identificativo (`bpt6k9604118j`), l'indirizzo della
//! pagina di lettura. Qui quelle forme diventano l'indirizzo del manifesto
//! IIIF, senza chiedere niente alla rete: è il passo che permette di cercare
//! scrivendo una segnatura invece di incollare un indirizzo completo.
//!
//! Riferimento: Scriptoria, `resolvers/{vatican,gallica,ecodices}.py`. Le
//! espressioni regolari sono state riscritte a mano — la stessa forma, senza
//! aggiungere una libreria di regex al progetto.

use super::ResolverKind;

/// Quanto è sicuro il riconoscimento.
///
/// Serve per le biblioteche che cercano prima e risolvono poi: su Gallica
/// «heures» è un identificativo plausibile quanto una parola di ricerca, e
/// trattarlo come identificativo porterebbe a un manifesto che non esiste.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Strength {
    /// Indirizzo o forma inequivocabile: si può usare senza esitazione.
    Strong,
    /// Forma plausibile ma indistinguibile da un testo di ricerca.
    Weak,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Resolution {
    pub manifest_url: String,
    pub doc_id: String,
    pub strength: Strength,
}

impl Resolution {
    fn strong(manifest_url: String, doc_id: String) -> Self {
        Self {
            manifest_url,
            doc_id,
            strength: Strength::Strong,
        }
    }

    fn weak(manifest_url: String, doc_id: String) -> Self {
        Self {
            manifest_url,
            doc_id,
            strength: Strength::Weak,
        }
    }
}

/// Riconosce l'ingresso per la biblioteca scelta, o niente se non lo riconosce.
pub fn resolve(kind: ResolverKind, input: &str) -> Option<Resolution> {
    let value = input.trim();
    if value.is_empty() {
        return None;
    }
    match kind {
        ResolverKind::Vatican => vatican(value),
        ResolverKind::Gallica => gallica(value),
        ResolverKind::Ecodices => ecodices(value),
        ResolverKind::ArchiveOrg => archive_org(value),
        // Le altre biblioteche non hanno ancora un riconoscimento proprio:
        // vale l'indirizzo completo, come prima.
        _ => direct_url(value),
    }
}

/// Un indirizzo incollato vale per qualunque biblioteca: è già il manifesto.
fn direct_url(value: &str) -> Option<Resolution> {
    let url = url::Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    Some(Resolution::strong(value.to_string(), value.to_string()))
}

// ── Biblioteca Vaticana ──────────────────────────────────────────────────

const VATICAN_COLLECTIONS: &[&str] = &[
    "vat", "urb", "pal", "reg", "barb", "ott", "borg", "arch", "cap",
];
const VATICAN_SERIES: &[&str] = &["lat", "gr"];

fn vatican(value: &str) -> Option<Resolution> {
    if value.contains("digi.vatlib.it") {
        let id = manifest_id_from_url(value, "iiif").or_else(|| last_segment(value))?;
        return Some(Resolution::strong(vatican_manifest(&id), id));
    }
    let normalized = vatican_shelfmark(value)?;
    Some(Resolution::strong(
        vatican_manifest(&normalized),
        normalized,
    ))
}

fn vatican_manifest(id: &str) -> String {
    format!("https://digi.vatlib.it/iiif/{id}/manifest.json")
}

/// `Urb. lat. 123`, `urb-lat-123`, `Vatlat123` → `MSS_Urb.lat.123`.
pub fn vatican_shelfmark(raw: &str) -> Option<String> {
    let mut text = raw.trim().to_lowercase();
    for prefix in ["mss_", "mss-", "mss "] {
        if let Some(rest) = text.strip_prefix(prefix) {
            text = rest.trim().to_string();
        }
    }
    let cleaned: String = text
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    // «Vatlat123» arriva attaccato: le parti si riconoscono comunque, perché
    // collezione e serie sono parole note e il resto sono cifre.
    let compact: String = cleaned.chars().filter(|c| !c.is_whitespace()).collect();

    let collection = VATICAN_COLLECTIONS
        .iter()
        .find(|name| compact.starts_with(**name))?;
    let rest = &compact[collection.len()..];
    let (series, rest) = match VATICAN_SERIES.iter().find(|name| rest.starts_with(**name)) {
        Some(series) => (Some(*series), &rest[series.len()..]),
        None => (None, rest),
    };
    if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    let collection = capitalize(collection);
    Some(match series {
        Some(series) => format!("MSS_{collection}.{series}.{rest}"),
        None => format!("MSS_{collection}.{rest}"),
    })
}

// ── Gallica (BnF) ────────────────────────────────────────────────────────

/// Identificativi che appartengono a Heidelberg: senza questa esclusione
/// `cpg123` verrebbe letto come un identificativo Gallica e porterebbe a un
/// manifesto inesistente.
const HEIDELBERG_PREFIXES: &[&str] = &["cpg", "cpl", "cpgr", "cpb"];

fn gallica(value: &str) -> Option<Resolution> {
    if let Some((naan, doc_id)) = gallica_ark(value) {
        return Some(Resolution::strong(
            format!("https://gallica.bnf.fr/iiif/ark:/{naan}/{doc_id}/manifest.json"),
            doc_id,
        ));
    }
    if value.contains('/') || !is_gallica_short_id(value) {
        return None;
    }
    Some(Resolution::weak(
        format!("https://gallica.bnf.fr/iiif/ark:/12148/{value}/manifest.json"),
        value.to_string(),
    ))
}

/// `ark:/12148/bpt6k9604118j`, ovunque si trovi dentro l'indirizzo.
///
/// Si lavora sempre sulla stessa stringa già minuscola: cercare in una e
/// tagliare nell'altra va bene finché sono lunghe uguali, e smette di andare
/// bene alla prima lettera accentata — con un taglio a metà carattere.
pub(super) fn gallica_ark(value: &str) -> Option<(String, String)> {
    let lowered = value.to_lowercase();
    let start = lowered.find("ark:/")?;
    let rest = &lowered[start + "ark:/".len()..];
    let mut parts = rest.split('/');
    let naan = parts.next()?;
    if naan.is_empty() || !naan.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let doc_id = parts
        .next()?
        .split('.')
        .next()
        .filter(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric()))?;
    Some((naan.to_string(), doc_id.to_string()))
}

fn is_gallica_short_id(value: &str) -> bool {
    if value.len() < 6 || !value.chars().all(|c| c.is_ascii_alphanumeric()) {
        return false;
    }
    let lowered = value.to_lowercase();
    !HEIDELBERG_PREFIXES.iter().any(|prefix| {
        lowered
            .strip_prefix(prefix)
            .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
    })
}

// ── e-codices ────────────────────────────────────────────────────────────

fn ecodices(value: &str) -> Option<Resolution> {
    let compound = ecodices_compound_id(value)?;
    Some(Resolution::strong(
        format!("https://www.e-codices.unifr.ch/metadata/iiif/{compound}/manifest.json"),
        compound,
    ))
}

/// `bbb-0264`, l'indirizzo del manifesto, o quello della pagina di lettura
/// (`/en/bbb/0264`) diventano tutti lo stesso identificativo composto.
pub fn ecodices_compound_id(value: &str) -> Option<String> {
    let lowered = value.trim().to_lowercase();
    if !lowered.contains('/') {
        return is_ecodices_compound(&lowered).then(|| lowered.clone());
    }
    if !lowered.contains("e-codices") {
        return None;
    }
    if let Some(id) = manifest_id_from_url(&lowered, "iiif") {
        return Some(id);
    }
    // `/en/bbb/0264` → `bbb-0264`; la lingua, quando c'è, si scarta.
    let path_parts: Vec<&str> = lowered
        .split('/')
        .filter(|part| !part.is_empty())
        .skip_while(|part| !part.contains("e-codices"))
        .skip(1)
        .collect();
    let parts: Vec<&str> = path_parts
        .into_iter()
        .filter(|part| !matches!(*part, "en" | "de" | "fr" | "it"))
        .collect();
    let [library, shelfmark, ..] = parts.as_slice() else {
        return None;
    };
    if !shelfmark.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(format!("{library}-{shelfmark}"))
}

fn is_ecodices_compound(value: &str) -> bool {
    let Some((_, tail)) = value.rsplit_once('-') else {
        return false;
    };
    tail.len() >= 3 && tail.chars().all(|c| c.is_ascii_digit())
}

// ── Internet Archive ─────────────────────────────────────────────────────

fn archive_org(value: &str) -> Option<Resolution> {
    let url = url::Url::parse(value).ok()?;
    if !url.host_str()?.ends_with("archive.org") {
        return None;
    }
    let mut segments = url.path_segments()?;
    if segments.next()? != "details" {
        return None;
    }
    let id = segments.next()?.to_string();
    Some(Resolution::strong(
        format!("https://iiif.archive.org/iiif/{id}/manifest.json"),
        id,
    ))
}

// ── Aiuti ────────────────────────────────────────────────────────────────

/// L'identificativo dentro `…/<marker>/<id>/manifest.json`.
fn manifest_id_from_url(value: &str, marker: &str) -> Option<String> {
    let parts: Vec<&str> = value.split('/').filter(|part| !part.is_empty()).collect();
    let position = parts.iter().position(|part| *part == marker)?;
    let id = parts.get(position + 1)?;
    parts
        .get(position + 2)
        .filter(|last| last.starts_with("manifest"))
        .map(|_| (*id).to_string())
}

fn last_segment(value: &str) -> Option<String> {
    value
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|part| !part.is_empty())
        .map(str::to_string)
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vatican_shelfmarks_reach_the_same_manuscript_however_they_are_written() {
        for written in [
            "Urb. lat. 1779",
            "urb lat 1779",
            "urb-lat-1779",
            "MSS_Urb.lat.1779",
            "Urblat1779",
        ] {
            let resolved = resolve(ResolverKind::Vatican, written)
                .unwrap_or_else(|| panic!("«{written}» dovrebbe risolversi"));
            assert_eq!(
                resolved.manifest_url,
                "https://digi.vatlib.it/iiif/MSS_Urb.lat.1779/manifest.json"
            );
            assert_eq!(resolved.strength, Strength::Strong);
        }
    }

    #[test]
    fn a_vatican_shelfmark_without_series_keeps_its_shape() {
        let resolved = resolve(ResolverKind::Vatican, "Borg. 42").expect("segnatura senza serie");
        assert_eq!(resolved.doc_id, "MSS_Borg.42");
    }

    #[test]
    fn free_text_is_not_mistaken_for_a_vatican_shelfmark() {
        assert!(resolve(ResolverKind::Vatican, "libro d'ore miniato").is_none());
        assert!(resolve(ResolverKind::Vatican, "urb lat").is_none());
    }

    #[test]
    fn a_vatican_reading_page_resolves_to_its_manifest() {
        let resolved = resolve(
            ResolverKind::Vatican,
            "https://digi.vatlib.it/view/MSS_Vat.lat.3225",
        )
        .expect("pagina di lettura");
        assert_eq!(
            resolved.manifest_url,
            "https://digi.vatlib.it/iiif/MSS_Vat.lat.3225/manifest.json"
        );
    }

    #[test]
    fn gallica_finds_the_ark_wherever_it_sits_in_the_address() {
        for written in [
            "https://gallica.bnf.fr/ark:/12148/bpt6k9604118j",
            "https://gallica.bnf.fr/ark:/12148/bpt6k9604118j/f1.image",
            "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k9604118j/manifest.json",
        ] {
            let resolved = resolve(ResolverKind::Gallica, written)
                .unwrap_or_else(|| panic!("«{written}» dovrebbe risolversi"));
            assert_eq!(
                resolved.manifest_url,
                "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k9604118j/manifest.json"
            );
            assert_eq!(resolved.strength, Strength::Strong);
        }
    }

    #[test]
    fn an_address_with_accents_does_not_break_the_gallica_recognition() {
        // Cercare in una stringa e tagliare in un'altra reggeva finché erano
        // lunghe uguali: con una lettera accentata prima dell'ARK non lo è più.
        let resolved = resolve(
            ResolverKind::Gallica,
            "https://gallica.bnf.fr/collection/Curiosités/ark:/12148/btv1b84260335",
        )
        .expect("indirizzo con accenti");
        assert_eq!(
            resolved.manifest_url,
            "https://gallica.bnf.fr/iiif/ark:/12148/btv1b84260335/manifest.json"
        );
    }

    #[test]
    fn a_bare_gallica_identifier_is_only_a_guess() {
        let resolved =
            resolve(ResolverKind::Gallica, "bpt6k9604118j").expect("identificativo nudo");
        assert_eq!(resolved.strength, Strength::Weak);
    }

    #[test]
    fn heidelberg_shelfmarks_are_not_read_as_gallica_identifiers() {
        assert!(resolve(ResolverKind::Gallica, "cpg848").is_none());
    }

    #[test]
    fn ecodices_accepts_compound_ids_and_both_addresses() {
        for written in [
            "bbb-0264",
            "https://www.e-codices.unifr.ch/en/bbb/0264",
            "https://www.e-codices.unifr.ch/metadata/iiif/bbb-0264/manifest.json",
        ] {
            let resolved = resolve(ResolverKind::Ecodices, written)
                .unwrap_or_else(|| panic!("«{written}» dovrebbe risolversi"));
            assert_eq!(
                resolved.manifest_url,
                "https://www.e-codices.unifr.ch/metadata/iiif/bbb-0264/manifest.json"
            );
        }
    }

    #[test]
    fn ecodices_ignores_words_that_are_not_shelfmarks() {
        assert!(resolve(ResolverKind::Ecodices, "graduale").is_none());
    }

    #[test]
    fn an_internet_archive_detail_page_still_resolves() {
        let resolved = resolve(
            ResolverKind::ArchiveOrg,
            "https://archive.org/details/dellarchitettura",
        )
        .expect("pagina di dettaglio");
        assert_eq!(
            resolved.manifest_url,
            "https://iiif.archive.org/iiif/dellarchitettura/manifest.json"
        );
    }

    #[test]
    fn a_pasted_manifest_address_works_for_libraries_without_their_own_recognition() {
        let resolved = resolve(
            ResolverKind::Harvard,
            "https://iiif.lib.harvard.edu/manifests/drs:1234",
        )
        .expect("indirizzo diretto");
        assert_eq!(resolved.strength, Strength::Strong);
    }
}
