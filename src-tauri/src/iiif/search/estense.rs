//! Biblioteca Estense: catalogo in JSON, con le pagine che contano da zero.

use reqwest::Client;

use super::super::discovery::{DiscoveryResult, Gate, MatchHint, SearchPage};
use super::super::resolvers;
use super::{fetch_json, first_string, result_from, SearchEndpoints, PAGE_SIZE};

/// Quante schede si leggono in una volta quando la domanda ha più parole.
///
/// Il catalogo cerca la stringa intera come una frase sola («bibbia borso» non
/// trova la «Bibbia di Borso»): si chiede allora la parola più distintiva e si
/// tengono le schede che contengono tutte le altre. Il filtro è locale, quindi
/// si legge una finestra ampia e la si divide in pagine qui. Limite noto: oltre
/// le prime schede di questa finestra la parola scelta non viene esplorata.
const WORD_SCAN_SIZE: u32 = 200;

/// I campi della scheda in cui si cercano le parole, con il nome da mostrare.
const MATCH_FIELDS: [(&str, &str); 3] = [
    ("sgtt", "Title"),
    ("autn", "Author"),
    ("pressmark", "Shelfmark"),
];

/// Biblioteca Estense: catalogo in JSON, con le schede dentro `_embedded`.
pub(super) async fn estense(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let words = query_words(query);
    let page = page.max(1);
    let searched = match distinctive_word(&words) {
        Some(word) if words.len() > 1 => word,
        _ => return single_phrase(client, endpoints, query, &words, page, gate).await,
    };

    let value = fetch_json(
        client,
        &endpoints.estense_search,
        &[
            ("text", searched),
            ("size", &WORD_SCAN_SIZE.to_string()),
            ("page", "0"),
        ],
        None,
        "Biblioteca Estense",
        gate,
    )
    .await?;
    let matching: Vec<DiscoveryResult> = parse_items(&value, &words)
        .into_iter()
        .filter(|result| !result.match_hints.is_empty())
        .collect();
    let skip = ((page - 1) * PAGE_SIZE) as usize;
    let has_more = matching.len() > skip + PAGE_SIZE as usize;
    let results: Vec<DiscoveryResult> = matching
        .into_iter()
        .skip(skip)
        .take(PAGE_SIZE as usize)
        .collect();
    log::info!("discovery estense search found={}", results.len());
    Ok(SearchPage { has_more, results })
}

/// Una parola sola (o nessuna): il catalogo la cerca da sé, con le sue pagine.
async fn single_phrase(
    client: &Client,
    endpoints: &SearchEndpoints,
    query: &str,
    words: &[String],
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    // Le pagine del suo catalogo contano da zero.
    let index = (page - 1).to_string();
    let value = fetch_json(
        client,
        &endpoints.estense_search,
        &[
            ("text", query),
            ("size", &PAGE_SIZE.to_string()),
            ("page", &index),
        ],
        None,
        "Biblioteca Estense",
        gate,
    )
    .await?;

    let results = parse_items(&value, words);
    let total = value
        .pointer("/page/totalPages")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(1);
    log::info!("discovery estense search found={}", results.len());
    Ok(SearchPage {
        has_more: u64::from(page) < total,
        results,
    })
}

/// Le parole della domanda, senza punteggiatura né accenti: «bibbia, borso»
/// o «"Niccolò» devono valere come le parole nude.
fn query_words(query: &str) -> Vec<String> {
    super::words(query)
}

/// La parola più lunga: è quella che restringe di più la ricerca del catalogo.
fn distinctive_word(words: &[String]) -> Option<&str> {
    words
        .iter()
        .max_by_key(|word| word.chars().count())
        .map(String::as_str)
}

/// Le schede della risposta. Il catalogo non usa i nomi consueti: il titolo è
/// `sgtt`, l'autore `autn` e la segnatura `pressmark`. La data non c'è in
/// questa risposta: arriva dalla lettura del manifesto, come per la Vaticana.
fn parse_items(value: &serde_json::Value, words: &[String]) -> Vec<DiscoveryResult> {
    value
        .pointer("/_embedded/culturalItems")
        .and_then(serde_json::Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|item| {
            let id = estense_uuid_of(item)?;
            let title = first_string(item.get("sgtt"))
                .or_else(|| first_string(item.get("pressmark")))
                .unwrap_or_else(|| id.clone());
            let mut result = result_from(id.clone(), title, resolvers::estense_manifest_url(&id));
            result.holding_institution = first_string(item.get("pressmark"));
            // Più autori arrivano in un solo testo, separati da `|`.
            result.creator =
                first_string(item.get("autn")).map(|authors| authors.replace('|', "; "));
            result.match_hints = match_hints(item, words);
            Some(result)
        })
        .collect()
}

/// I campi in cui stanno le parole cercate, se insieme le contengono tutte;
/// altrimenti nessuno, e la scheda non corrisponde alla domanda.
fn match_hints(item: &serde_json::Value, words: &[String]) -> Vec<MatchHint> {
    let fields: Vec<(&str, String)> = MATCH_FIELDS
        .iter()
        .filter_map(|(key, label)| first_string(item.get(*key)).map(|text| (*label, text)))
        .collect();
    let lowered: Vec<String> = fields.iter().map(|(_, text)| super::fold(text)).collect();
    let all_found = words
        .iter()
        .all(|word| lowered.iter().any(|text| text.contains(word.as_str())));
    if words.is_empty() || !all_found {
        return Vec::new();
    }
    fields
        .into_iter()
        .zip(lowered)
        .filter(|(_, text)| words.iter().any(|word| text.contains(word.as_str())))
        .map(|((label, text), _)| MatchHint {
            section: Some(label.to_string()),
            text,
        })
        .collect()
}

/// L'identificativo di una scheda dell'Estense, dove che sia scritto: il
/// catalogo lo mette ora in `uuid`, ora dentro l'indirizzo del manifesto.
fn estense_uuid_of(item: &serde_json::Value) -> Option<String> {
    for field in ["uuid", "id", "manifest", "manifestUrl"] {
        if let Some(value) = first_string(item.get(field)) {
            if let Some(uuid) = resolvers::estense_uuid(&value) {
                return Some(uuid);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> serde_json::Value {
        serde_json::json!({
            "_embedded": {"culturalItems": [
                {"uuid": "0a1b2c3d-4e5f-6789-abcd-ef0123456789", "sgtt": "Bibbia di Borso d'Este", "pressmark": "Lat. 422"},
                {"uuid": "1a1b2c3d-4e5f-6789-abcd-ef0123456789", "sgtt": "Bibbia volgare", "autn": "Anonimo", "pressmark": "It. 1"},
                {"uuid": "2a1b2c3d-4e5f-6789-abcd-ef0123456789", "sgtt": "Codice d'Arco", "autn": "Dante Alighieri|Iacopo Alighieri", "pressmark": "alfa.U.5.19"},
            ]}
        })
    }

    #[test]
    fn the_longest_word_is_the_one_asked_to_the_catalogue() {
        let words = query_words("Bibbia  di Borso");
        assert_eq!(distinctive_word(&words), Some("bibbia"));
    }

    #[test]
    fn only_items_containing_every_word_match_and_say_where() {
        let results = parse_items(&sample(), &query_words("borso BIBBIA"));
        let matching: Vec<&DiscoveryResult> = results
            .iter()
            .filter(|result| !result.match_hints.is_empty())
            .collect();

        assert_eq!(matching.len(), 1);
        assert_eq!(matching[0].title, "Bibbia di Borso d'Este");
        assert_eq!(
            matching[0].match_hints,
            vec![MatchHint {
                section: Some("Title".to_string()),
                text: "Bibbia di Borso d'Este".to_string(),
            }]
        );
    }

    #[test]
    fn punctuation_and_accents_in_the_query_do_not_hide_results() {
        assert_eq!(query_words("\"Bibbia, BORSÒ"), vec!["bibbia", "borso"]);
        let results = parse_items(&sample(), &query_words("\"bibbia, borsò"));

        let matching = results
            .iter()
            .filter(|result| !result.match_hints.is_empty())
            .count();
        assert_eq!(matching, 1);
    }

    #[test]
    fn words_may_be_spread_across_title_and_author() {
        let results = parse_items(&sample(), &query_words("arco dante"));
        let hinted = &results[2].match_hints;

        let sections: Vec<Option<&str>> =
            hinted.iter().map(|hint| hint.section.as_deref()).collect();
        assert_eq!(sections, vec![Some("Title"), Some("Author")]);
    }

    #[test]
    fn the_author_fills_the_creator() {
        let results = parse_items(&sample(), &[]);

        assert_eq!(results[0].creator, None);
        assert_eq!(
            results[2].creator.as_deref(),
            Some("Dante Alighieri; Iacopo Alighieri")
        );
    }
}
