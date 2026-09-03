//! La domanda che si fa alla cache, e la sua forma stabile.
//!
//! La chiave è **la richiesta**, non l'indirizzo: per un'immagine remota le due
//! cose coincidono, per una ricerca no — biblioteca, termini e filtri non sono
//! un indirizzo, e non tutti i fornitori li esprimono così.
//!
//! La forma stabile è testo canonico prima dell'impronta. `BTreeMap` e non
//! `HashMap` per i filtri: l'ordine deve essere lo stesso a ogni giro, altrimenti
//! la stessa ricerca prende due chiavi diverse.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// L'impronta di una richiesta, cioè il nome del file che la conserva.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CacheKey(String);

impl CacheKey {
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Le prime due lettere fanno da sottocartella: una cartella sola con
    /// centomila voci è lenta a elencare su ogni sistema.
    pub fn shard(&self) -> &str {
        &self.0[..2]
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CacheRequest {
    /// Un'immagine che sta a un indirizzo: copertine e miniature remote.
    /// La biblioteca, quando si sa, decide il profilo di cortesia.
    #[serde(rename_all = "camelCase")]
    Remote {
        url: String,
        provider_key: Option<String>,
    },
    /// Una pagina di una digitalizzazione, a una misura.
    ///
    /// **È la forma con cui il visore chiede tutto**: la pagina grande, la
    /// miniatura del rail, la copertina dell'elenco. Prima si guarda sul
    /// computer, e solo se lì non c'è si va a `remote_url` — che è l'indirizzo
    /// dichiarato dall'indice del libro, non uno costruito a mano.
    ///
    /// `size` è il lato lungo in pixel, oppure `thumb` per la miniatura.
    #[serde(rename_all = "camelCase")]
    Page {
        version_id: String,
        index: u32,
        size: String,
        /// Dove chiederla se sul computer non c'è. Assente = solo locale.
        #[serde(default)]
        remote_url: Option<String>,
        #[serde(default)]
        provider_key: Option<String>,
    },
    /// La risposta di una ricerca. È l'unica che scade.
    #[serde(rename_all = "camelCase")]
    Search {
        provider_key: String,
        query: String,
        page: u32,
        #[serde(default)]
        filters: BTreeMap<String, String>,
    },
}

impl CacheRequest {
    pub fn key(&self) -> CacheKey {
        CacheKey(crate::provenance::fnv1a_hex(&self.canonical()))
    }

    /// Vero per ciò che invecchia: i cataloghi crescono, i pixel di un
    /// manoscritto del Cinquecento no.
    pub fn expires(&self) -> bool {
        matches!(self, CacheRequest::Search { .. })
    }

    /// L'host verso cui si parla, quando la richiesta ne nomina uno: serve alla
    /// cortesia, che conta per host e non per biblioteca.
    pub fn host(&self) -> Option<String> {
        match self {
            CacheRequest::Remote { url, .. } => crate::download::fetch::host_of(url).ok(),
            CacheRequest::Page { remote_url, .. } => remote_url
                .as_deref()
                .and_then(|url| crate::download::fetch::host_of(url).ok()),
            CacheRequest::Search { .. } => None,
        }
    }

    pub fn provider_key(&self) -> Option<&str> {
        match self {
            CacheRequest::Remote { provider_key, .. } => provider_key.as_deref(),
            CacheRequest::Search { provider_key, .. } => Some(provider_key),
            CacheRequest::Page { provider_key, .. } => provider_key.as_deref(),
        }
    }

    fn canonical(&self) -> String {
        match self {
            CacheRequest::Remote { url, .. } => format!("remote|{url}"),
            // L'indirizzo remoto **non** entra nella chiave: è dove andarla a
            // prendere, non quale immagine è.
            CacheRequest::Page {
                version_id,
                index,
                size,
                ..
            } => format!("page|{version_id}|{index}|{size}"),
            CacheRequest::Search {
                provider_key,
                query,
                page,
                filters,
            } => {
                let filters = filters
                    .iter()
                    .map(|(name, value)| format!("{name}={value}"))
                    .collect::<Vec<_>>()
                    .join(",");
                format!(
                    "search|{provider_key}|{}|{page}|{filters}",
                    query.trim().to_lowercase()
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn search(page: u32, filters: &[(&str, &str)]) -> CacheRequest {
        CacheRequest::Search {
            provider_key: "gallica".into(),
            query: "  Heures  ".into(),
            page,
            filters: filters
                .iter()
                .map(|(name, value)| ((*name).to_string(), (*value).to_string()))
                .collect(),
        }
    }

    #[test]
    fn the_same_request_always_gets_the_same_key() {
        let one = CacheRequest::Remote {
            url: "https://example.org/a.jpg".into(),
            provider_key: Some("gallica".into()),
        };
        let two = CacheRequest::Remote {
            url: "https://example.org/a.jpg".into(),
            provider_key: None,
        };
        // La biblioteca decide la cortesia, non l'identità dei byte: la stessa
        // immagine chiesta con o senza biblioteca è la stessa immagine.
        assert_eq!(one.key(), two.key());
    }

    #[test]
    fn the_order_of_the_filters_does_not_change_the_key() {
        let one = search(1, &[("lang", "fr"), ("year", "1500")]);
        let two = search(1, &[("year", "1500"), ("lang", "fr")]);
        assert_eq!(one.key(), two.key());
    }

    #[test]
    fn spacing_and_case_of_the_query_do_not_change_the_key() {
        let typed = search(1, &[]);
        let retyped = CacheRequest::Search {
            provider_key: "gallica".into(),
            query: "heures".into(),
            page: 1,
            filters: BTreeMap::new(),
        };
        assert_eq!(typed.key(), retyped.key());
    }

    #[test]
    fn another_page_of_the_same_search_is_another_request() {
        assert_ne!(search(1, &[]).key(), search(2, &[]).key());
    }

    #[test]
    fn only_searches_expire() {
        assert!(search(1, &[]).expires());
        assert!(!CacheRequest::Remote {
            url: "https://example.org/a.jpg".into(),
            provider_key: None,
        }
        .expires());
        assert!(!CacheRequest::Page {
            version_id: "sver-1".into(),
            index: 34,
            size: "2000".into(),
            remote_url: None,
            provider_key: None,
        }
        .expires());
    }

    #[test]
    fn where_a_page_is_fetched_from_does_not_change_which_page_it_is() {
        // La stessa pagina chiesta da due schermate diverse, una che conosce
        // l'indirizzo remoto e una no, deve leggere lo stesso file di cache.
        let local = CacheRequest::Page {
            version_id: "sver-1".into(),
            index: 34,
            size: "thumb".into(),
            remote_url: None,
            provider_key: None,
        };
        let with_fallback = CacheRequest::Page {
            version_id: "sver-1".into(),
            index: 34,
            size: "thumb".into(),
            remote_url: Some("https://images.example/34/full/300,/0/default.jpg".into()),
            provider_key: Some("archive_org".into()),
        };

        assert_eq!(local.key(), with_fallback.key());
    }

    #[test]
    fn the_shard_is_the_first_two_letters_of_the_fingerprint() {
        let key = search(1, &[]).key();
        assert_eq!(key.shard(), &key.as_str()[..2]);
    }
}
