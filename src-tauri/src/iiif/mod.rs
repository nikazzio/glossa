use serde::Serialize;

pub mod commands;
pub mod discovery;
pub mod network;
pub mod resolvers;
pub mod search;
pub mod settings;
pub mod viewer;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchMode {
    Direct,
    Fallback,
    SearchFirst,
}

/// Stable dispatch names. #215 binds implementations to these identifiers;
/// provider metadata never needs to know about a caller or UI surface.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
/// Il riconoscimento proprio di una biblioteca. Chi non ce l'ha usa `Generic`,
/// cioè accetta l'indirizzo completo del manifesto: non è una mancanza
/// nascosta, il registro lo dichiara con `supports_direct_resolution` e con
/// l'esempio mostrato nel campo di ricerca.
pub enum ResolverKind {
    Vatican,
    Europeana,
    Gallica,
    Ecodices,
    Loc,
    Harvard,
    Cambridge,
    Bodleian,
    Heidelberg,
    Estense,
    Institut,
    ERara,
    EManuscripta,
    Mdz,
    Nls,
    Glasgow,
    ArchiveOrg,
    Generic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchHandlerKind {
    Vatican,
    Cambridge,
    Mdz,
    Europeana,
    Wellcome,
    Gallica,
    Ecodices,
    Loc,
    Bodleian,
    Estense,
    Institut,
    Nls,
    ArchiveOrg,
}

/// Che cosa è una fonte, non che cosa sa fare.
///
/// Una raccolta indicizza il materiale di altre istituzioni: cercandoci dentro
/// si trovano opere conservate altrove, e chi le conserva va detto risultato per
/// risultato. Una biblioteca risponde del proprio fondo. L'indirizzo diretto non
/// è né l'una né l'altra: è la via d'uscita per qualunque istituzione, anche non
/// in elenco.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderKind {
    Aggregator,
    Library,
    DirectUrl,
}

/// Come ci si arriva, oggi.
///
/// Distingue due cose che sembrano uguali e non lo sono: una fonte che **non
/// ha** una ricerca interrogabile da un programma, e una che ce l'ha ma la
/// rifiuta a chi non è un browser. La prima non cambierà scrivendo codice; la
/// seconda può tornare, e dirlo evita di riprovare all'infinito o di
/// dimenticarsene.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchAvailability {
    /// Cerca per parole.
    Searchable,
    /// Si apre solo con un identificativo o un indirizzo: non esiste una
    /// ricerca da interrogare.
    DirectOnly,
    /// La ricerca esiste ma il servizio respinge le richieste automatiche.
    Paused,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFilterOption {
    pub value: &'static str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFilter {
    pub key: &'static str,
    pub options: &'static [ProviderFilterOption],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IIIFProvider {
    pub key: &'static str,
    /// Come si sta al tavolo di questa biblioteca. Sta qui e non in una
    /// tabella a parte: due elenchi indicizzati per la stessa chiave prima o poi
    /// divergono, e aggiungere una biblioteca deve significare compilare **un**
    /// record.
    pub network: network::NetworkProfile,
    pub label: &'static str,
    pub aliases: &'static [&'static str],
    pub placeholder: &'static str,
    pub is_enabled: bool,
    pub resolver: ResolverKind,
    pub search_handler: Option<SearchHandlerKind>,
    pub search_mode: SearchMode,
    pub supports_direct_resolution: bool,
    pub supports_search: bool,
    /// Raccolta, biblioteca o indirizzo diretto: serve alla schermata per
    /// raggruppare le fonti, e a chi legge i risultati per sapere che
    /// cercando in una raccolta l'istituzione che conserva è un'altra.
    pub kind: ProviderKind,
    /// Perché una fonte non cerca, quando non cerca.
    pub availability: SearchAvailability,
    /// La pagina di ricerca della biblioteca sul suo sito, con `{query}` dove
    /// vanno le parole già scritte. Serve a uscire da Glossa quando la ricerca
    /// interna non basta o non convince: si cerca a casa loro, si copia
    /// l'indirizzo dell'opera e la si apre qui. Vuota dove non esiste una
    /// pagina di ricerca pubblica; senza `{query}` si apre e basta.
    pub site_search: &'static str,
    pub filters: &'static [ProviderFilter],
}

const GALLICA_FILTER_OPTIONS: &[ProviderFilterOption] = &[
    ProviderFilterOption { value: "all" },
    ProviderFilterOption {
        value: "manuscript",
    },
    ProviderFilterOption { value: "printed" },
];
const GALLICA_FILTERS: &[ProviderFilter] = &[ProviderFilter {
    key: "material_type",
    options: GALLICA_FILTER_OPTIONS,
}];
pub const PROVIDERS: &[IIIFProvider] = &[
    IIIFProvider {
        key: "europeana",
        network: network::CAUTIOUS,
        label: "Europeana",
        aliases: &["europeana"],
        placeholder: "e.g. dante divina commedia",
        is_enabled: true,
        // Non è una biblioteca: è l'indice di centinaia di istituzioni. Il suo
        // mestiere è la ricerca, ma il collegamento di una sua scheda apre
        // l'opera senza chiedere la chiave.
        resolver: ResolverKind::Europeana,
        search_handler: Some(SearchHandlerKind::Europeana),
        search_mode: SearchMode::SearchFirst,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Aggregator,
        availability: SearchAvailability::Searchable,
        site_search: "https://www.europeana.eu/en/search?query={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "wellcome",
        network: network::CAUTIOUS,
        label: "Wellcome Collection",
        aliases: &["wellcome"],
        placeholder: "e.g. anatomy",
        is_enabled: true,
        resolver: ResolverKind::Generic,
        search_handler: Some(SearchHandlerKind::Wellcome),
        search_mode: SearchMode::SearchFirst,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://wellcomecollection.org/search/works?query={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "vatican",
        network: network::VATICAN,
        label: "Vatican Library",
        aliases: &["vaticana", "bav", "vatican"],
        placeholder: "e.g. Urb.lat.1779",
        is_enabled: true,
        resolver: ResolverKind::Vatican,
        search_handler: Some(SearchHandlerKind::Vatican),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://digi.vatlib.it/mss/search?k_f=0&k_v={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "gallica",
        network: network::GALLICA,
        label: "Gallica",
        aliases: &["bnf", "gallica"],
        placeholder: "e.g. btv1b84260335",
        is_enabled: true,
        resolver: ResolverKind::Gallica,
        search_handler: Some(SearchHandlerKind::Gallica),
        search_mode: SearchMode::SearchFirst,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=gallica%20all%20%22{query}%22",
        filters: GALLICA_FILTERS,
    },
    IIIFProvider {
        key: "institut",
        network: network::CAUTIOUS,
        label: "Institut de France",
        aliases: &["bibnum", "institut"],
        placeholder: "e.g. 17837",
        is_enabled: true,
        resolver: ResolverKind::Institut,
        search_handler: Some(SearchHandlerKind::Institut),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://bibnum.institutdefrance.fr/records?search={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "bodleian",
        network: network::CAUTIOUS,
        label: "Bodleian Libraries",
        aliases: &["oxford", "bodleian"],
        placeholder: "e.g. 080f88f5-7586-4b8a-8064-63ab3495393c",
        is_enabled: true,
        resolver: ResolverKind::Bodleian,
        search_handler: Some(SearchHandlerKind::Bodleian),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://digital.bodleian.ox.ac.uk/search/?q={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "heidelberg",
        network: network::CAUTIOUS,
        label: "Heidelberg University Library",
        aliases: &["heidelberg"],
        placeholder: "e.g. cpg123",
        is_enabled: true,
        resolver: ResolverKind::Heidelberg,
        search_handler: None,
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: false,
        kind: ProviderKind::Library,
        availability: SearchAvailability::DirectOnly,
        site_search: "https://digi.ub.uni-heidelberg.de/diglit/",
        filters: &[],
    },
    IIIFProvider {
        key: "cambridge",
        network: network::CAUTIOUS,
        label: "Cambridge University Digital Library",
        aliases: &["cudl", "cambridge"],
        placeholder: "e.g. MS-ADD-03996",
        is_enabled: true,
        resolver: ResolverKind::Cambridge,
        search_handler: Some(SearchHandlerKind::Cambridge),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://cudl.lib.cam.ac.uk/search?keyword={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "ecodices",
        network: network::CAUTIOUS,
        label: "e-codices",
        aliases: &["e-codices", "ecodices"],
        placeholder: "e.g. csg-0001",
        is_enabled: true,
        resolver: ResolverKind::Ecodices,
        search_handler: Some(SearchHandlerKind::Ecodices),
        // La segnatura composta si riconosce da sola; tutto il resto è testo da
        // cercare. Dichiarandosi `Direct`, questa biblioteca teneva spenta la
        // propria ricerca: il campo prometteva di cercare e non cercava.
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://www.e-codices.unifr.ch/en/search/all?sQueryString={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "estense",
        network: network::CAUTIOUS,
        label: "Biblioteca Estense",
        aliases: &["estense", "edl", "modena"],
        placeholder: "e.g. 0a1b2c3d-4e5f-6789-abcd-ef0123456789",
        is_enabled: true,
        resolver: ResolverKind::Estense,
        search_handler: Some(SearchHandlerKind::Estense),
        search_mode: SearchMode::SearchFirst,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://edl.cultura.gov.it/search?q={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "harvard",
        network: network::CAUTIOUS,
        label: "Harvard Library",
        aliases: &["harvard"],
        placeholder: "e.g. drs:123456",
        is_enabled: true,
        resolver: ResolverKind::Harvard,
        search_handler: None,
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: false,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Paused,
        site_search: "https://id.lib.harvard.edu/search?q={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "loc",
        network: network::CAUTIOUS,
        label: "Library of Congress",
        aliases: &["loc", "library of congress"],
        placeholder: "e.g. https://www.loc.gov/item/...",
        is_enabled: true,
        resolver: ResolverKind::Loc,
        search_handler: Some(SearchHandlerKind::Loc),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://www.loc.gov/search/?q={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "archive_org",
        network: network::CAUTIOUS,
        label: "Internet Archive",
        aliases: &["archive", "archive.org", "internet archive"],
        placeholder: "e.g. https://archive.org/details/...",
        is_enabled: true,
        resolver: ResolverKind::ArchiveOrg,
        search_handler: Some(SearchHandlerKind::ArchiveOrg),
        search_mode: SearchMode::SearchFirst,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Aggregator,
        availability: SearchAvailability::Searchable,
        site_search: "https://archive.org/search?query={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "e_rara",
        network: network::CAUTIOUS,
        label: "e-rara",
        aliases: &["e-rara", "erara"],
        placeholder: "e.g. 198",
        is_enabled: true,
        resolver: ResolverKind::ERara,
        search_handler: None,
        search_mode: SearchMode::Direct,
        supports_direct_resolution: true,
        // La sua pagina di ricerca risponde con un controllo anti-robot: si
        // dichiara, invece di offrire una ricerca che restituirebbe sempre
        // niente.
        supports_search: false,
        kind: ProviderKind::Library,
        availability: SearchAvailability::DirectOnly,
        site_search: "https://www.e-rara.ch/search?operation=searchRetrieve&query={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "e_manuscripta",
        network: network::CAUTIOUS,
        label: "e-manuscripta",
        aliases: &["e-manuscripta", "emanuscripta"],
        placeholder: "e.g. 992548",
        is_enabled: true,
        resolver: ResolverKind::EManuscripta,
        search_handler: None,
        search_mode: SearchMode::Direct,
        supports_direct_resolution: true,
        supports_search: false,
        kind: ProviderKind::Library,
        availability: SearchAvailability::DirectOnly,
        site_search: "https://www.e-manuscripta.ch/search?operation=searchRetrieve&query={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "mdz",
        network: network::CAUTIOUS,
        label: "Bayerische Staatsbibliothek (MDZ)",
        aliases: &["mdz", "bsb", "digitale-sammlungen"],
        placeholder: "e.g. bsb00026283",
        is_enabled: true,
        resolver: ResolverKind::Mdz,
        search_handler: Some(SearchHandlerKind::Mdz),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://www.digitale-sammlungen.de/en/search?query={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "nls",
        network: network::CAUTIOUS,
        label: "National Library of Scotland",
        aliases: &["nls", "scotland", "scozia"],
        placeholder: "e.g. 133475158",
        is_enabled: true,
        resolver: ResolverKind::Nls,
        // Cerca nei titoli delle raccolte digitali pubblicate, non nel
        // catalogo della biblioteca: il catalogo ha un suo servizio, ma i suoi
        // record non dicono se e dove l'opera è stata digitalizzata.
        search_handler: Some(SearchHandlerKind::Nls),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
        kind: ProviderKind::Library,
        availability: SearchAvailability::Searchable,
        site_search: "https://digital.nls.uk/gallery/",
        filters: &[],
    },
    IIIFProvider {
        key: "glasgow",
        network: network::CAUTIOUS,
        label: "University of Glasgow",
        aliases: &["glasgow", "uofg"],
        placeholder: "e.g. 240023ec-d936-40c3-8f28-85416f86db21",
        is_enabled: true,
        resolver: ResolverKind::Glasgow,
        // La piattaforma pubblica i manifesti ma non un modo di interrogarli:
        // nessuna raccolta IIIF, nessuna risposta strutturata alla ricerca.
        search_handler: None,
        search_mode: SearchMode::Direct,
        supports_direct_resolution: true,
        supports_search: false,
        kind: ProviderKind::Library,
        availability: SearchAvailability::DirectOnly,
        site_search: "https://digitalresearchcollections.glasgow.ac.uk/documents/search?search={query}",
        filters: &[],
    },
    IIIFProvider {
        key: "generic",
        network: network::CAUTIOUS,
        label: "Direct IIIF URL",
        aliases: &["generic", "unknown"],
        placeholder: "e.g. https://example.org/manifest.json",
        is_enabled: true,
        resolver: ResolverKind::Generic,
        search_handler: None,
        search_mode: SearchMode::Direct,
        supports_direct_resolution: true,
        supports_search: false,
        kind: ProviderKind::DirectUrl,
        availability: SearchAvailability::DirectOnly,
        site_search: "",
        filters: &[],
    },
];

pub fn find_provider(value: &str) -> Option<&'static IIIFProvider> {
    let normalized = value.trim().to_lowercase();
    PROVIDERS.iter().find(|provider| {
        provider.key == normalized
            || provider.label.to_lowercase() == normalized
            || provider.aliases.iter().any(|alias| *alias == normalized)
    })
}

pub fn enabled_providers() -> Vec<&'static IIIFProvider> {
    PROVIDERS
        .iter()
        .filter(|provider| provider.is_enabled)
        .collect()
}

#[tauri::command]
pub fn list_iiif_providers() -> Vec<&'static IIIFProvider> {
    enabled_providers()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_library_says_where_to_search_on_its_own_site() {
        // Il collegamento al sito serve proprio quando la ricerca interna non
        // basta: una biblioteca senza indirizzo lascia l'utente senza uscita.
        for provider in PROVIDERS
            .iter()
            .filter(|p| p.kind != ProviderKind::DirectUrl)
        {
            assert!(
                provider.site_search.starts_with("https://"),
                "{} non dichiara la sua pagina di ricerca",
                provider.key
            );
        }
        // L'indirizzo diretto non è una biblioteca: non ha un sito dove cercare.
        let generic = find_provider("generic").expect("generic provider must exist");
        assert!(generic.site_search.is_empty());
    }

    #[test]
    fn registry_is_stable_and_has_a_generic_direct_url_provider() {
        // L'ordine è quello che si vede nella tendina: prima l'aggregatore, che
        // cerca in molte istituzioni insieme, poi le singole biblioteche.
        assert_eq!(
            PROVIDERS.first().map(|provider| provider.key),
            Some("europeana")
        );
        let generic = find_provider("generic").expect("generic provider must exist");
        assert!(generic.supports_direct_resolution);
        assert!(!generic.supports_search);
        assert_eq!(generic.resolver, ResolverKind::Generic);
    }

    #[test]
    fn what_a_source_declares_and_why_it_cannot_search_agree() {
        for provider in PROVIDERS {
            let searchable = provider.availability == SearchAvailability::Searchable;
            assert_eq!(
                provider.supports_search, searchable,
                "{}: dichiara ricerca {} ma disponibilità {:?}",
                provider.key, provider.supports_search, provider.availability
            );
            // Una fonte che cerca deve avere chi la cerca: il contrario è la
            // risposta vuota silenziosa che si era già pagata una volta.
            assert_eq!(
                provider.search_handler.is_some(),
                searchable,
                "{}: gestore e disponibilità non concordano",
                provider.key
            );
        }
    }

    #[test]
    fn only_the_direct_address_is_neither_a_library_nor_a_collection() {
        let neither: Vec<&str> = PROVIDERS
            .iter()
            .filter(|provider| provider.kind == ProviderKind::DirectUrl)
            .map(|provider| provider.key)
            .collect();
        assert_eq!(neither, vec!["generic"]);
    }

    #[test]
    fn aliases_resolve_to_the_canonical_provider() {
        assert_eq!(
            find_provider(" BNF ").map(|provider| provider.key),
            Some("gallica")
        );
        assert_eq!(
            find_provider("CUDL").map(|provider| provider.key),
            Some("cambridge")
        );
    }

    #[test]
    fn provider_capabilities_declare_search_modes_and_filters() {
        let gallica = find_provider("gallica").expect("Gallica provider must exist");
        assert_eq!(gallica.search_mode, SearchMode::SearchFirst);
        assert_eq!(gallica.filters[0].key, "material_type");
        assert_eq!(gallica.filters[0].options.len(), 3);
        assert_eq!(gallica.search_handler, Some(SearchHandlerKind::Gallica));
    }

    #[test]
    fn only_enabled_providers_are_exposed_to_the_interface() {
        assert!(enabled_providers()
            .iter()
            .all(|provider| provider.is_enabled));
        assert_eq!(enabled_providers().len(), PROVIDERS.len());
    }

    #[test]
    fn command_contract_uses_camel_case_fields() {
        let provider = serde_json::to_value(find_provider("gallica").expect("provider exists"))
            .expect("provider serializes");

        assert!(provider.get("isEnabled").is_some());
        assert!(provider.get("searchMode").is_some());
        assert!(provider.get("searchHandler").is_some());
        assert!(provider.get("supportsSearch").is_some());
    }
}
