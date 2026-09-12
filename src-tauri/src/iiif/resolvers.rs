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
        ResolverKind::Loc => loc(value),
        ResolverKind::Harvard => harvard(value),
        ResolverKind::Cambridge => cambridge(value),
        ResolverKind::Bodleian => bodleian(value),
        ResolverKind::Heidelberg => heidelberg(value),
        ResolverKind::Estense => estense(value),
        ResolverKind::Institut => institut(value),
        ResolverKind::ERara => e_rara(value),
        ResolverKind::EManuscripta => e_manuscripta(value),
        ResolverKind::Mdz => mdz(value),
        // Le altre biblioteche non hanno ancora un riconoscimento proprio:
        // vale l'indirizzo completo, come prima.
        _ => direct_url(value),
    }
}

/// Library of Congress: dall'indirizzo di un elemento al suo manifesto.
///
/// Il catalogo usa due forme, `/item/<id>/` e `/resource/<id>/`, e sulle
/// riproduzioni aggiunge il numero della pagina in coda all'identificativo
/// (`:sp12`), che non fa parte dell'elemento. Un identificativo nudo non basta:
/// senza il resto dell'indirizzo non si distingue da una parola da cercare.
/// Stesso riconoscimento di Scriptoria (`resolvers/loc.py`).
fn loc(value: &str) -> Option<Resolution> {
    let id = loc_item_id(value)?;
    Some(Resolution::strong(loc_manifest_url(&id), id))
}

/// L'identificativo dell'elemento dentro un indirizzo della Library of
/// Congress, senza il numero di pagina.
pub fn loc_item_id(value: &str) -> Option<String> {
    let url = url::Url::parse(value.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    if host != "loc.gov" && !host.ends_with(".loc.gov") {
        return None;
    }
    let mut segments = url.path_segments()?;
    let id = loop {
        let segment = segments.next()?;
        if segment.eq_ignore_ascii_case("item") || segment.eq_ignore_ascii_case("resource") {
            break segments.next()?;
        }
    };
    let id = id.split_once(":sp").map_or(id, |(head, _)| head);
    (!id.is_empty()).then(|| id.to_string())
}

/// Il manifesto si costruisce dall'identificativo: il catalogo non lo dichiara.
pub fn loc_manifest_url(id: &str) -> String {
    format!("https://www.loc.gov/item/{id}/manifest.json")
}

/// Harvard: il manifesto si costruisce dal gettone `drs:` o `ids:`.
///
/// Il gettone compare tanto in un indirizzo quanto scritto da solo, ed è
/// l'unica forma che identifica l'oggetto: il numero di catalogo Alma è
/// un'altra cosa e non porta a un manifesto. Come `resolvers/harvard.py`.
fn harvard(value: &str) -> Option<Resolution> {
    let token = harvard_token(value)?;
    Some(Resolution::strong(harvard_manifest_url(&token), token))
}

/// `drs:123456` o `ids:123456`, ovunque si trovi, con il numero fra sei e
/// dodici cifre: più corto è un'altra cosa.
pub fn harvard_token(value: &str) -> Option<String> {
    let lower = value.trim().to_ascii_lowercase();
    for prefix in ["drs:", "ids:"] {
        let mut from = 0;
        while let Some(found) = lower[from..].find(prefix) {
            let start = from + found + prefix.len();
            let digits: String = lower[start..]
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            if (6..=12).contains(&digits.len()) {
                return Some(format!("{}{digits}", prefix));
            }
            from = start.max(from + 1);
        }
    }
    None
}

pub fn harvard_manifest_url(token: &str) -> String {
    format!("https://iiif.lib.harvard.edu/manifests/{token}")
}

/// Cambridge: dall'indirizzo del visore, o da una segnatura scritta nella sua
/// forma con i trattini (`MS-ADD-03996`). Come `resolvers/cambridge.py`.
fn cambridge(value: &str) -> Option<Resolution> {
    let id = cambridge_id(value)?;
    Some(Resolution::strong(cambridge_manifest_url(&id), id))
}

pub fn cambridge_id(value: &str) -> Option<String> {
    let text = value.trim();
    if let Some(id) = segment_after(text, "/view/") {
        return Some(id.to_ascii_uppercase());
    }
    // Una segnatura nuda vale solo se ha la forma con i trattini: almeno tre
    // gruppi e una lettera. Senza questo, una parola qualunque diventerebbe un
    // identificativo e manderebbe il visore su un manifesto che non esiste.
    let candidate = text.to_ascii_uppercase();
    let groups: Vec<&str> = candidate.split('-').collect();
    let well_formed = groups.len() >= 3
        && groups
            .iter()
            .all(|group| !group.is_empty() && group.chars().all(|c| c.is_ascii_alphanumeric()))
        && candidate.chars().any(|c| c.is_ascii_alphabetic());
    well_formed.then_some(candidate)
}

pub fn cambridge_manifest_url(id: &str) -> String {
    format!("https://cudl.lib.cam.ac.uk/iiif/{id}")
}

/// Bodleian: gli oggetti sono identificati da un UUID, che sta
/// nell'indirizzo del visore. Come `resolvers/oxford.py`.
fn bodleian(value: &str) -> Option<Resolution> {
    let id = bodleian_uuid(value)?;
    Some(Resolution::strong(bodleian_manifest_url(&id), id))
}

pub fn bodleian_uuid(value: &str) -> Option<String> {
    let text = value.trim();
    let candidate = segment_after(text, "/objects/")
        .or_else(|| segment_after(text, "/manifest/"))
        .map(|segment| segment.trim_end_matches(".json").to_string())
        .unwrap_or_else(|| text.to_string());
    is_uuid(&candidate).then(|| candidate.to_ascii_lowercase())
}

pub fn bodleian_manifest_url(uuid: &str) -> String {
    format!("https://iiif.bodleian.ox.ac.uk/iiif/manifest/{uuid}.json")
}

/// Otto-quattro-quattro-quattro-dodici cifre esadecimali.
fn is_uuid(value: &str) -> bool {
    let groups: Vec<&str> = value.split('-').collect();
    let sizes = [8, 4, 4, 4, 12];
    groups.len() == 5
        && groups
            .iter()
            .zip(sizes)
            .all(|(group, size)| group.len() == size && group.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Heidelberg: identificativi `cpg123` e simili, o l'indirizzo del visore
/// `diglit`. Come `resolvers/heidelberg.py`.
fn heidelberg(value: &str) -> Option<Resolution> {
    let id = heidelberg_id(value)?;
    Some(Resolution::strong(heidelberg_manifest_url(&id), id))
}

pub fn heidelberg_id(value: &str) -> Option<String> {
    let text = value.trim();
    if let Some(id) = segment_after(text, "/diglit/iiif/").or_else(|| segment_after(text, "/diglit/"))
    {
        let id = id.to_ascii_lowercase();
        return (!id.is_empty()).then_some(id);
    }
    let lower = text.to_ascii_lowercase();
    for prefix in ["cpgr", "cpg", "cpl", "cpb"] {
        if let Some(rest) = lower.strip_prefix(prefix) {
            if rest.len() >= 2 && rest.chars().all(|c| c.is_ascii_digit()) {
                return Some(lower.clone());
            }
        }
    }
    None
}

pub fn heidelberg_manifest_url(id: &str) -> String {
    format!("https://digi.ub.uni-heidelberg.de/diglit/iiif/{id}/manifest.json")
}

/// Biblioteca Estense: gli oggetti stanno su Jarvis e sono identificati da un
/// UUID, che compare nell'indirizzo del manifesto o del visore Mirador.
/// Come `resolvers/estense.py`.
fn estense(value: &str) -> Option<Resolution> {
    let id = estense_uuid(value)?;
    Some(Resolution::strong(estense_manifest_url(&id), id))
}

pub fn estense_uuid(value: &str) -> Option<String> {
    let text = value.trim();
    for candidate in text
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        .chain(std::iter::once(text))
    {
        if is_uuid(candidate) {
            return Some(candidate.to_ascii_lowercase());
        }
    }
    None
}

pub fn estense_manifest_url(uuid: &str) -> String {
    format!("https://jarvis.edl.beniculturali.it/meta/iiif/{uuid}/manifest")
}

/// Institut de France: identificativo numerico, indirizzo del visore o della
/// scheda. Come `resolvers/institut.py`.
fn institut(value: &str) -> Option<Resolution> {
    let id = institut_id(value)?;
    Some(Resolution::strong(institut_manifest_url(&id), id))
}

pub fn institut_id(value: &str) -> Option<String> {
    let text = value.trim();
    for marker in ["/viewer/", "/iiif/", "/records/item/"] {
        if let Some(segment) = segment_after(text, marker) {
            let digits: String = segment.chars().take_while(char::is_ascii_digit).collect();
            if !digits.is_empty() {
                return Some(digits);
            }
        }
    }
    let is_number = text.len() >= 3 && text.chars().all(|c| c.is_ascii_digit());
    is_number.then(|| text.to_string())
}

pub fn institut_manifest_url(id: &str) -> String {
    format!("https://bibnum.institutdefrance.fr/iiif/{id}/manifest")
}

/// e-rara: gli stampati antichi svizzeri. L'identificativo è numerico e sta
/// nell'indirizzo della scheda o del visore; il manifesto si costruisce da lì.
///
/// Non ha una ricerca interrogabile da un programma — la sua pagina risponde
/// con un controllo anti-robot — quindi questa è l'unica strada, ed è
/// dichiarata nel registro.
fn e_rara(value: &str) -> Option<Resolution> {
    let id = swiss_platform_id(value, "e-rara.ch")?;
    Some(Resolution::strong(
        format!("https://www.e-rara.ch/i3f/v20/{id}/manifest"),
        id,
    ))
}

/// e-manuscripta: i manoscritti svizzeri, stessa piattaforma di e-rara e
/// stessa forma degli indirizzi.
fn e_manuscripta(value: &str) -> Option<Resolution> {
    let id = swiss_platform_id(value, "e-manuscripta.ch")?;
    Some(Resolution::strong(
        format!("https://www.e-manuscripta.ch/i3f/v20/{id}/manifest"),
        id,
    ))
}

/// L'identificativo numerico di un'opera sulle due piattaforme svizzere.
///
/// Lo si prende dall'indirizzo — `/content/titleinfo/123`, `/content/zoom/123`,
/// `/i3f/v20/123/manifest` — oppure da un numero scritto da solo, che lì è la
/// forma con cui la scheda si cita.
fn swiss_platform_id(value: &str, host: &str) -> Option<String> {
    let text = value.trim();
    if text.chars().all(|c| c.is_ascii_digit()) && text.len() >= 3 {
        return Some(text.to_string());
    }
    if !text.contains(host) {
        return None;
    }
    for marker in ["/titleinfo/", "/zoom/", "/structure/", "/pageview/", "/i3f/v20/"] {
        if let Some(segment) = segment_after(text, marker) {
            let digits: String = segment.chars().take_while(char::is_ascii_digit).collect();
            if digits.len() >= 3 {
                return Some(digits);
            }
        }
    }
    None
}

/// Monaco (MDZ): gli identificativi cominciano per `bsb` e il manifesto sta
/// sul loro servizio IIIF. Anche qui niente ricerca automatizzabile: c'è la
/// raccolta dei metadati, che è un'altra cosa.
fn mdz(value: &str) -> Option<Resolution> {
    let id = mdz_id(value)?;
    Some(Resolution::strong(
        format!("https://api.digitale-sammlungen.de/iiif/presentation/v2/{id}/manifest"),
        id,
    ))
}

fn mdz_id(value: &str) -> Option<String> {
    let text = value.trim();
    let candidate = ["/view/", "/details/", "/presentation/v2/", "/presentation/v3/"]
        .into_iter()
        .find_map(|marker| segment_after(text, marker))
        .unwrap_or(text);
    let lower = candidate.to_ascii_lowercase();
    let id: String = lower
        .strip_prefix("bsb")?
        .chars()
        .take_while(char::is_ascii_alphanumeric)
        .collect();
    (id.len() >= 5).then(|| format!("bsb{id}"))
}

/// Il pezzo di indirizzo che segue un marcatore, fino alla barra successiva.
fn segment_after<'a>(value: &'a str, marker: &str) -> Option<&'a str> {
    let start = value.find(marker)? + marker.len();
    let rest = &value[start..];
    let end = rest
        .find(['/', '?', '#'])
        .unwrap_or(rest.len());
    let segment = &rest[..end];
    (!segment.is_empty()).then_some(segment)
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
    let host = url.host_str()?;
    if host == "iiif.archive.org" {
        // Il manifesto stesso (già salvato come sourceUrl di una fonte che
        // c'è già in Biblioteca, es. per risincronizzarla): è già la forma
        // canonica, non serve ricostruire niente.
        return direct_url(value);
    }
    if !host.ends_with("archive.org") {
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
    fn an_already_resolved_archive_org_manifest_address_resolves_again() {
        // Risincronizzare un'opera passa proprio l'indirizzo del manifesto
        // già salvato (non la pagina di dettaglio): senza questo, la
        // risincronizzazione delle fonti Internet Archive non trovava mai
        // niente.
        let resolved = resolve(
            ResolverKind::ArchiveOrg,
            "https://iiif.archive.org/iiif/dellarchitettura/manifest.json",
        )
        .expect("manifesto già risolto");
        assert_eq!(
            resolved.manifest_url,
            "https://iiif.archive.org/iiif/dellarchitettura/manifest.json"
        );
    }

    #[test]
    fn the_library_of_congress_address_becomes_its_manifest() {
        for written in [
            "https://www.loc.gov/item/2021667925/",
            "https://www.loc.gov/resource/2021667925/?sp=3",
            "https://loc.gov/item/2021667925",
        ] {
            let resolved = resolve(ResolverKind::Loc, written).expect("indirizzo riconosciuto");
            assert_eq!(resolved.doc_id, "2021667925", "scritto come {written}");
            assert_eq!(
                resolved.manifest_url,
                "https://www.loc.gov/item/2021667925/manifest.json"
            );
        }
    }

    #[test]
    fn the_page_number_is_not_part_of_the_library_of_congress_item() {
        // Sulle riproduzioni il catalogo attacca `:sp12` all'identificativo:
        // è la pagina che stai guardando, non l'opera.
        let resolved = resolve(ResolverKind::Loc, "https://www.loc.gov/resource/gdc.123:sp12/")
            .expect("indirizzo riconosciuto");
        assert_eq!(resolved.doc_id, "gdc.123");
    }

    #[test]
    fn a_bare_word_is_not_a_library_of_congress_address() {
        // Senza l'indirizzo intero, «2021667925» non si distingue da una
        // parola da cercare: restituire un manifesto inventato manderebbe il
        // visore su una pagina che non esiste.
        assert!(resolve(ResolverKind::Loc, "2021667925").is_none());
        assert!(resolve(ResolverKind::Loc, "https://example.org/item/123").is_none());
    }

    #[test]
    fn harvard_reads_the_token_wherever_it_is_written() {
        for written in [
            "drs:123456",
            "https://iiif.lib.harvard.edu/manifests/drs:123456",
            "https://iiif.lib.harvard.edu/manifests/view/drs:123456",
        ] {
            let resolved = resolve(ResolverKind::Harvard, written).expect("gettone riconosciuto");
            assert_eq!(resolved.doc_id, "drs:123456", "scritto come {written}");
            assert_eq!(
                resolved.manifest_url,
                "https://iiif.lib.harvard.edu/manifests/drs:123456"
            );
        }
        // Il numero di catalogo non porta a un manifesto: è un'altra cosa.
        assert!(resolve(ResolverKind::Harvard, "990123456780203941").is_none());
        assert!(resolve(ResolverKind::Harvard, "drs:12").is_none());
    }

    #[test]
    fn cambridge_accepts_the_viewer_address_and_a_shelfmark_with_dashes() {
        let from_url = resolve(ResolverKind::Cambridge, "https://cudl.lib.cam.ac.uk/view/MS-ADD-03996/1")
            .expect("indirizzo del visore");
        assert_eq!(from_url.doc_id, "MS-ADD-03996");
        assert_eq!(
            from_url.manifest_url,
            "https://cudl.lib.cam.ac.uk/iiif/MS-ADD-03996"
        );

        let from_shelfmark =
            resolve(ResolverKind::Cambridge, "ms-add-03996").expect("segnatura con i trattini");
        assert_eq!(from_shelfmark.doc_id, "MS-ADD-03996");

        // Due parole separate da un trattino non sono una segnatura.
        assert!(resolve(ResolverKind::Cambridge, "book-hours").is_none());
        assert!(resolve(ResolverKind::Cambridge, "libro d'ore").is_none());
    }

    #[test]
    fn bodleian_works_are_identified_by_uuid() {
        let resolved = resolve(
            ResolverKind::Bodleian,
            "https://digital.bodleian.ox.ac.uk/objects/080f88f5-7586-4b8a-8064-63ab3495393c/",
        )
        .expect("indirizzo del visore");
        assert_eq!(resolved.doc_id, "080f88f5-7586-4b8a-8064-63ab3495393c");
        assert_eq!(
            resolved.manifest_url,
            "https://iiif.bodleian.ox.ac.uk/iiif/manifest/080f88f5-7586-4b8a-8064-63ab3495393c.json"
        );
        assert!(resolve(ResolverKind::Bodleian, "080f88f5-7586").is_none());
    }

    #[test]
    fn heidelberg_reads_its_own_shelfmarks_and_viewer_addresses() {
        for (written, expected) in [
            ("cpg123", "cpg123"),
            ("CPG123", "cpg123"),
            ("https://digi.ub.uni-heidelberg.de/diglit/cpg848", "cpg848"),
            (
                "https://digi.ub.uni-heidelberg.de/diglit/iiif/cpg848/manifest.json",
                "cpg848",
            ),
        ] {
            let resolved = resolve(ResolverKind::Heidelberg, written).expect("riconosciuto");
            assert_eq!(resolved.doc_id, expected, "scritto come {written}");
        }
        assert!(resolve(ResolverKind::Heidelberg, "codice palatino").is_none());
    }

    #[test]
    fn estense_finds_the_uuid_inside_the_address() {
        let resolved = resolve(
            ResolverKind::Estense,
            "https://jarvis.edl.beniculturali.it/images/viewers/mirador/?manifest=https://jarvis.edl.beniculturali.it/meta/iiif/0a1b2c3d-4e5f-6789-abcd-ef0123456789/manifest",
        )
        .expect("uuid dentro l'indirizzo");
        assert_eq!(resolved.doc_id, "0a1b2c3d-4e5f-6789-abcd-ef0123456789");
        assert_eq!(
            resolved.manifest_url,
            "https://jarvis.edl.beniculturali.it/meta/iiif/0a1b2c3d-4e5f-6789-abcd-ef0123456789/manifest"
        );
    }

    #[test]
    fn institut_accepts_the_number_and_the_addresses_that_contain_it() {
        for written in [
            "17837",
            "https://bibnum.institutdefrance.fr/viewer/17837",
            "https://bibnum.institutdefrance.fr/records/item/17837-un-manoscritto",
        ] {
            let resolved = resolve(ResolverKind::Institut, written).expect("riconosciuto");
            assert_eq!(resolved.doc_id, "17837", "scritto come {written}");
            assert_eq!(
                resolved.manifest_url,
                "https://bibnum.institutdefrance.fr/iiif/17837/manifest"
            );
        }
        assert!(resolve(ResolverKind::Institut, "12").is_none());
    }

    #[test]
    fn the_swiss_platforms_take_the_number_of_the_record() {
        for (kind, written, host) in [
            (ResolverKind::ERara, "198", "e-rara"),
            (
                ResolverKind::ERara,
                "https://www.e-rara.ch/zut/content/titleinfo/198",
                "e-rara",
            ),
            (
                ResolverKind::ERara,
                "https://www.e-rara.ch/i3f/v20/198/manifest",
                "e-rara",
            ),
            (ResolverKind::EManuscripta, "992548", "e-manuscripta"),
            (
                ResolverKind::EManuscripta,
                "https://www.e-manuscripta.ch/zuz/content/zoom/992548",
                "e-manuscripta",
            ),
        ] {
            let resolved = resolve(kind, written).expect("riconosciuto");
            assert!(
                resolved.manifest_url.contains(host) && resolved.manifest_url.ends_with("/manifest"),
                "scritto come {written}"
            );
        }
        // Un indirizzo di un'altra piattaforma non diventa un'opera svizzera.
        assert!(resolve(ResolverKind::ERara, "https://example.org/titleinfo/198").is_none());
    }

    #[test]
    fn munich_records_start_with_bsb() {
        for written in [
            "bsb00026283",
            "BSB00026283",
            "https://www.digitale-sammlungen.de/en/view/bsb00026283",
            "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb00026283/manifest",
        ] {
            let resolved = resolve(ResolverKind::Mdz, written).expect("riconosciuto");
            assert_eq!(resolved.doc_id, "bsb00026283", "scritto come {written}");
            assert_eq!(
                resolved.manifest_url,
                "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb00026283/manifest"
            );
        }
        assert!(resolve(ResolverKind::Mdz, "26283").is_none());
    }

    #[test]
    fn a_pasted_manifest_address_works_for_libraries_without_their_own_recognition() {
        let resolved = resolve(
            ResolverKind::Generic,
            "https://iiif.lib.harvard.edu/manifests/drs:1234",
        )
        .expect("indirizzo diretto");
        assert_eq!(resolved.strength, Strength::Strong);
    }
}
