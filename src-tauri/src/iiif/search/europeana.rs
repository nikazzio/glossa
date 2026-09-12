//! Europeana: l'indice di centinaia di istituzioni europee.

use reqwest::Client;

use super::super::discovery::{Gate, SearchPage};
use super::{fetch_json, first_string, result_from, strings, SearchEndpoints, PAGE_SIZE};

/// Europeana non è una biblioteca: è l'indice di centinaia di istituzioni
/// europee. Serve a trovare un'opera senza sapere in anticipo chi la conserva.
///
/// Due avvertenze che si riflettono nel codice. La prima: non tutto quello che
/// indicizza è leggibile: si tengono **solo i risultati che dichiarano un
/// manifesto IIIF**, gli altri sarebbero schede che non si aprono. La seconda:
/// chi ha trovato il libro, chi lo conserva e chi serve le immagini possono
/// essere tre soggetti diversi, e vanno detti distinti — l'istituzione che
/// conserva finisce nel campo del fondo, non spacciata per la provenienza
/// delle immagini.
pub(super) async fn europeana(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let Some(key) = endpoints
        .europeana_key
        .as_deref()
        .filter(|key| !key.is_empty())
    else {
        return Err(super::SEARCH_KEY_MISSING.to_string());
    };
    // Le sue pagine si contano per riga di partenza, non per numero di pagina.
    let start = ((page.max(1) - 1) * PAGE_SIZE + 1).to_string();
    let value = fetch_json(
        client,
        &endpoints.europeana_search,
        &[
            ("wskey", key),
            ("query", query),
            ("rows", &PAGE_SIZE.to_string()),
            ("start", &start),
            // `rich` porta anteprime e collegamenti; senza, mancano le
            // copertine e l'indirizzo della scheda.
            ("profile", "rich"),
            // Solo materiale con una riproduzione: una scheda senza immagini
            // non si apre in Glossa.
            ("media", "true"),
            ("qf", "TYPE:TEXT"),
        ],
        None,
        "Europeana",
        gate,
    )
    .await?;

    let mut results = Vec::new();
    for item in value
        .get("items")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let Some(record_id) = item.get("id").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let Some(manifest_url) = europeana_manifest(item, record_id) else {
            continue;
        };
        let title = first_string(item.get("title"))
            .unwrap_or_else(|| record_id.trim_matches('/').to_string());
        let mut result = result_from(
            record_id.trim_matches('/').replace('/', ":"),
            title,
            manifest_url,
        );
        result.creator = first_string(item.get("dcCreatorLangAware"))
            .or_else(|| first_string(item.get("dcCreator")));
        result.date = first_string(item.get("year"));
        result.description = first_string(item.get("dcDescription"));
        result.thumbnail_url = first_string(item.get("edmPreview"));
        result.language = first_string(item.get("language"));
        // Chi conserva l'originale non è chi ha risposto alla ricerca.
        result.holding_institution = first_string(item.get("dataProvider"));
        result.rights = strings(item.get("rights"));
        result.page_url = first_string(item.get("guid"));
        results.push(result);
    }

    let total = value
        .get("totalResults")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    log::info!("discovery europeana search found={}", results.len());
    Ok(SearchPage {
        has_more: u64::from(page.max(1) * PAGE_SIZE) < total,
        results,
    })
}

/// Il manifesto di un risultato: quello dichiarato dall'istituzione, se c'è,
/// altrimenti quello che Europeana pubblica per ogni record.
fn europeana_manifest(item: &serde_json::Value, record_id: &str) -> Option<String> {
    let declared = strings(item.get("dctermsIsReferencedBy"))
        .into_iter()
        .find(|url| url.contains("manifest"));
    if declared.is_some() {
        return declared;
    }
    // Europeana serve un manifesto per ogni record che ha immagini; `media`
    // nella richiesta garantisce che ne abbia.
    let path = record_id.trim_matches('/');
    (!path.is_empty()).then(|| format!("https://iiif.europeana.eu/presentation/{path}/manifest"))
}

// ── Library of Congress: catalogo in JSON ────────────────────────────────
