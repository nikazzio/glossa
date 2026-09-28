//! Internet Archive: l'unico catalogo che non è una biblioteca.
//!
//! Il suo indice contiene libri ma anche audio, video, software e copie di
//! siti: si chiede `mediatype:texts`, perché per il resto l'indirizzo del
//! manifesto costruito per convenzione non esiste.

use reqwest::Client;
use serde_json::Value;
use std::collections::BTreeMap;

use super::manifest::{count, text, texts};
use super::{wait_if_gated, DiscoveryResult, Gate, SearchPage};

/// Le chiavi della risposta di Internet Archive che hanno già un campo loro in
/// `DiscoveryResult`. Servono solo a non ripetere in `raw` quello che è già
/// stato letto: quando un dato di `raw` merita un campo proprio, il suo nome va
/// aggiunto qui.
const ARCHIVE_MAPPED_FIELDS: [&str; 15] = [
    "identifier",
    "title",
    "creator",
    "year",
    "description",
    "mediatype",
    "collection",
    "language",
    "volume",
    "subject",
    "imagecount",
    "publisher",
    "contributor",
    "licenseurl",
    "rights",
];

/// La dichiarazione di diritti come la fa questa biblioteca: a volte l'indirizzo
/// di una licenza (`licenseurl`), a volte una frase (`rights`), spesso una sola
/// delle due e ogni tanto entrambe. Si tengono tutte, senza ripetizioni.
pub(crate) async fn search_archive(
    client: &Client,
    base_url: &str,
    query: &str,
    exact_phrase: bool,
    page: u32,
    gate: Option<&Gate<'_>>,
) -> Result<SearchPage, String> {
    let _turn = wait_if_gated(gate, base_url).await;
    // Parole sciolte: basta che ci siano, in qualunque ordine, e in cima
    // arrivano titoli che ne contengono una sola («book of hours» → «Twenty-
    // Four Hours a day»). La frase esatta le vuole in fila; è una scelta di chi
    // cerca, perché per altre ricerche («dante commedia») perde quasi tutto.
    let words = escape_lucene(query);
    let terms = if exact_phrase {
        format!("\"{words}\"")
    } else {
        words
    };
    let response = client
        .get(base_url)
        .query(&[
            // Solo testi: l'indice di archive.org contiene anche audio, video,
            // software e copie di siti, e per quelli l'indirizzo del manifesto
            // costruito per convenzione non esiste — il risultato si vedrebbe e
            // non si aprirebbe. Stesso filtro di Scriptoria
            // (`resolvers/search/archive_org.py`).
            ("q", &format!("({terms}) AND mediatype:texts") as &str),
            // Si chiede **tutto** quello che la biblioteca ha indicizzato, non
            // un elenco di campi scelti. Misurato sul servizio vero, a regime,
            // su venti risultati: chiedere i venti campi di prima costava
            // 0,68 s e 12,6 KB, chiederli tutti costa 0,86 s e 43 KB. Sono
            // +0,24 s una volta sola per ricerca, contro una richiesta in più
            // *per ogni opera* il giorno in cui serve un dato che non avevamo
            // chiesto — e che nel frattempo può essere cambiato. Quello che non
            // ha un campo suo resta in `raw`, così com'è arrivato.
            ("fl[]", "*"),
            ("rows", "20"),
            ("page", &page.to_string()),
            ("output", "json"),
        ])
        .send()
        .await
        .map_err(|error| {
            log::warn!("discovery archive request failed error={error}");
            crate::iiif::search::SEARCH_UNREACHABLE.to_string()
        })?
        .error_for_status()
        .map_err(|error| {
            log::warn!("discovery archive response failed error={error}");
            crate::iiif::search::reason_for(&error)
        })?;
    let value = response.json::<Value>().await.map_err(|error| {
        log::warn!("discovery archive body failed error={error}");
        crate::iiif::search::SEARCH_INVALID_DATA.to_string()
    })?;

    // Il servizio risponde 200 anche quando è il suo motore di ricerca a non
    // rispondere: senza questo, un guasto della biblioteca si legge come
    // «nessun risultato», che manda a cercare l'errore dalla parte sbagliata.
    if let Some(error) = value.get("error").and_then(Value::as_str) {
        log::warn!("discovery archive search failed error={error}");
        return Err(archive_error_reason(error).to_string());
    }

    let results = value
        .pointer("/response/docs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|document| {
            let id = document.get("identifier")?.as_str()?.to_string();
            Some(DiscoveryResult {
                title: text(document.get("title")).unwrap_or_else(|| id.clone()),
                creator: text(document.get("creator")),
                date: text(document.get("year")),
                description: text(document.get("description")),
                thumbnail_url: Some(format!("https://archive.org/services/img/{id}")),
                media_type: text(document.get("mediatype")),
                collection: text(document.get("collection")),
                language: text(document.get("language")),
                volume: text(document.get("volume")),
                subjects: texts(document.get("subject")),
                item_count: count(document.get("imagecount")),
                manifest_url: format!("https://iiif.archive.org/iiif/{id}/manifest.json"),
                contributors: texts(document.get("contributor")),
                publisher: text(document.get("publisher")),
                rights: archive_rights(document),
                physical_description: None,
                holding_institution: None,
                catalog_url: None,
                page_url: Some(format!("https://archive.org/details/{id}")),
                raw: archive_extra_fields(document),
                match_hints: Vec::new(),
                openable: None,
                id,
            })
        })
        .collect::<Vec<_>>();
    let total = value
        .pointer("/response/numFound")
        .and_then(Value::as_u64)
        .unwrap_or(0);

    log::info!(
        "discovery archive search page={page} found={} total={total}",
        results.len()
    );
    Ok(SearchPage {
        has_more: u64::from(page) * 20 < total,
        results,
    })
}

/// I caratteri che la sintassi di ricerca di Internet Archive (Lucene) legge
/// come operatori. `&&` e `||` si neutralizzano già togliendo senso a `&` e `|`.
const LUCENE_SPECIAL: &[char] = &[
    '+', '-', '&', '|', '!', '(', ')', '{', '}', '[', ']', '^', '"', '~', '*', '?', ':', '\\', '/',
];

/// Le parole dell'utente come testo, non come sintassi: una parentesi non
/// chiusa, altrimenti, fa rispondere al servizio con un errore di struttura.
fn escape_lucene(query: &str) -> String {
    query
        .chars()
        .flat_map(|character| {
            let escape = LUCENE_SPECIAL.contains(&character).then_some('\\');
            escape.into_iter().chain(std::iter::once(character))
        })
        .collect()
}

/// Solo `[BACKEND_ERROR]` è il motore della biblioteca che non risponde; il
/// resto (sintassi, ordinamento) è una domanda che il servizio rifiuta, e
/// riprovare più tardi non cambierebbe niente.
fn archive_error_reason(error: &str) -> &'static str {
    if error.starts_with("[BACKEND_ERROR]") {
        crate::iiif::search::SEARCH_UNAVAILABLE
    } else {
        crate::iiif::search::SEARCH_FAILED
    }
}

fn archive_rights(document: &Value) -> Vec<String> {
    let mut rights = texts(document.get("licenseurl"));
    for claim in texts(document.get("rights")) {
        if !rights.contains(&claim) {
            rights.push(claim);
        }
    }
    rights
}

/// Un valore della risposta ridotto a elenco di stringhe. Questa biblioteca
/// manda lo stesso campo ora come stringa, ora come elenco, ora come numero o
/// booleano: qui si uniforma la **forma**, mai il nome, che resta quello scelto
/// dalla biblioteca.
fn raw_strings(value: &Value) -> Vec<String> {
    match value {
        Value::Null => Vec::new(),
        Value::String(text) => vec![text.clone()],
        Value::Bool(flag) => vec![flag.to_string()],
        Value::Number(number) => vec![number.to_string()],
        Value::Array(values) => values.iter().flat_map(raw_strings).collect(),
        Value::Object(_) => vec![value.to_string()],
    }
}

/// Tutto quello che la biblioteca ha detto e che non è finito in un campo suo.
/// Si scorre la risposta così com'è arrivata invece di elencare i nomi attesi:
/// il giorno in cui la biblioteca aggiunge un campo, quel campo arriva da solo.
fn archive_extra_fields(document: &Value) -> BTreeMap<String, Vec<String>> {
    document
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(key, _)| !ARCHIVE_MAPPED_FIELDS.contains(&key.as_str()))
        .filter_map(|(key, value)| {
            let values = raw_strings(value);
            (!values.is_empty()).then(|| (key.clone(), values))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::super::find_provider;
    use super::super::tests::search;
    use super::super::SearchEndpoints;
    use super::*;
    use reqwest::Client;

    use wiremock::{
        matchers::{method, path, query_param},
        Mock, MockServer, ResponseTemplate,
    };

    #[tokio::test]
    async fn archive_search_returns_normalized_results() {
        let server = MockServer::start().await;
        Mock::given(method("GET")).and(path("/search")).respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"response": {"docs": [{"identifier": "ms-1", "title": "Manuscript", "creator": "Anonimo"}]}}))).mount(&server).await;
        let provider = find_provider("archive_org").expect("provider exists");

        let outcome = search(
            provider,
            "manuscript",
            &SearchEndpoints {
                archive_search: format!("{}/search", server.uri()),
                ..SearchEndpoints::default()
            },
            1,
        )
        .await
        .expect("search resolves");

        assert_eq!(
            outcome.results[0].manifest_url,
            "https://iiif.archive.org/iiif/ms-1/manifest.json"
        );
        assert_eq!(
            outcome.results[0].page_url.as_deref(),
            Some("https://archive.org/details/ms-1")
        );
    }

    #[tokio::test]
    async fn the_archive_search_asks_only_for_texts() {
        // L'indice contiene anche audio, video e software: per quelli
        // l'indirizzo del manifesto costruito per convenzione non esiste, e il
        // risultato si vedrebbe senza potersi aprire.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search"))
            .and(query_param("q", "(manuscript) AND mediatype:texts"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({"response": {"docs": [{"identifier": "ms-1", "title": "Manuscript"}]}}),
            ))
            .mount(&server)
            .await;
        let provider = find_provider("archive_org").expect("provider exists");

        let outcome = search(
            provider,
            "manuscript",
            &SearchEndpoints {
                archive_search: format!("{}/search", server.uri()),
                ..SearchEndpoints::default()
            },
            1,
        )
        .await
        .expect("search resolves");

        assert_eq!(outcome.results.len(), 1);
    }

    #[tokio::test]
    async fn a_broken_search_backend_is_not_an_empty_result() {
        // Archive.org risponde 200 anche quando è il suo motore di ricerca a
        // non rispondere: letto come «nessun risultato» manderebbe a cercare
        // il guasto dalla parte sbagliata.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/advancedsearch.php"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "error": "[BACKEND_ERROR] Invalid or no response from Elasticsearch"
            })))
            .mount(&server)
            .await;

        let outcome = search_archive(
            &Client::new(),
            &format!("{}/advancedsearch.php", server.uri()),
            "dante",
            false,
            1,
            None,
        )
        .await;

        assert_eq!(
            outcome.err().as_deref(),
            Some(crate::iiif::search::SEARCH_UNAVAILABLE),
            "un guasto della biblioteca si dice"
        );
    }

    #[test]
    fn lucene_operators_in_the_query_are_escaped() {
        assert_eq!(escape_lucene("marozzo (1536"), "marozzo \\(1536");
        assert_eq!(
            escape_lucene("a+b -c && d || !e {f} [g] ^h \"i\" ~j *k ?l :m \\n /o"),
            "a\\+b \\-c \\&\\& d \\|\\| \\!e \\{f\\} \\[g\\] \\^h \\\"i\\\" \\~j \\*k \\?l \\:m \\\\n \\/o"
        );
        assert_eq!(escape_lucene("book of hours"), "book of hours");
    }

    #[tokio::test]
    async fn an_unbalanced_parenthesis_reaches_the_service_escaped() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/advancedsearch.php"))
            .and(query_param("q", "(marozzo \\(1536) AND mediatype:texts"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"response": {"numFound": 0, "docs": []}})),
            )
            .mount(&server)
            .await;

        let outcome = search_archive(
            &Client::new(),
            &format!("{}/advancedsearch.php", server.uri()),
            "marozzo (1536",
            false,
            1,
            None,
        )
        .await
        .expect("la domanda arriva come testo");

        assert!(outcome.results.is_empty());
    }

    #[tokio::test]
    async fn a_rejected_query_is_not_an_unavailable_library() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/advancedsearch.php"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "error": "a structure was opened but not closed (group open at position 1)"
            })))
            .mount(&server)
            .await;

        let outcome = search_archive(
            &Client::new(),
            &format!("{}/advancedsearch.php", server.uri()),
            "dante",
            false,
            1,
            None,
        )
        .await;

        assert_eq!(
            outcome.err().as_deref(),
            Some(crate::iiif::search::SEARCH_FAILED)
        );
    }

    #[tokio::test]
    async fn the_exact_phrase_keeps_the_words_together() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/advancedsearch.php"))
            .and(query_param("q", "(\"book of hours\") AND mediatype:texts"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"response": {"numFound": 0, "docs": []}})),
            )
            .expect(1)
            .mount(&server)
            .await;

        let outcome = search_archive(
            &Client::new(),
            &format!("{}/advancedsearch.php", server.uri()),
            "book of hours",
            true,
            1,
            None,
        )
        .await
        .expect("ricerca");

        assert!(outcome.results.is_empty());
    }
}
