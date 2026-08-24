use serde::Serialize;

pub mod commands;
pub mod discovery;
pub mod network;
pub mod settings;

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
pub enum ResolverKind {
    Vatican,
    Gallica,
    Institut,
    Bodleian,
    Heidelberg,
    Cambridge,
    Ecodices,
    Estense,
    Harvard,
    Loc,
    ArchiveOrg,
    Generic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchHandlerKind {
    Vatican,
    Gallica,
    Institut,
    Bodleian,
    Heidelberg,
    Cambridge,
    Ecodices,
    Estense,
    Harvard,
    Loc,
    ArchiveOrg,
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
        search_mode: SearchMode::Direct,
        supports_direct_resolution: true,
        supports_search: true,
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
        search_handler: Some(SearchHandlerKind::Heidelberg),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
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
        search_mode: SearchMode::Direct,
        supports_direct_resolution: true,
        supports_search: true,
        filters: &[],
    },
    IIIFProvider {
        key: "estense",
        network: network::CAUTIOUS,
        label: "Biblioteca Estense",
        aliases: &["estense", "edl", "modena"],
        placeholder: "e.g. A.M.02.12.A",
        is_enabled: true,
        resolver: ResolverKind::Estense,
        search_handler: Some(SearchHandlerKind::Estense),
        search_mode: SearchMode::SearchFirst,
        supports_direct_resolution: true,
        supports_search: true,
        filters: &[],
    },
    IIIFProvider {
        key: "harvard",
        network: network::CAUTIOUS,
        label: "Harvard Library",
        aliases: &["harvard"],
        placeholder: "e.g. DRS ID or IIIF URL",
        is_enabled: true,
        resolver: ResolverKind::Harvard,
        search_handler: Some(SearchHandlerKind::Harvard),
        search_mode: SearchMode::Fallback,
        supports_direct_resolution: true,
        supports_search: true,
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
    fn registry_is_stable_and_has_a_generic_direct_url_provider() {
        assert_eq!(
            PROVIDERS.first().map(|provider| provider.key),
            Some("vatican")
        );
        let generic = find_provider("generic").expect("generic provider must exist");
        assert!(generic.supports_direct_resolution);
        assert!(!generic.supports_search);
        assert_eq!(generic.resolver, ResolverKind::Generic);
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
