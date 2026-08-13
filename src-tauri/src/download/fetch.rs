//! La singola richiesta verso una biblioteca: attesa del turno, invio,
//! classificazione della risposta.
//!
//! La classificazione è il punto (D16): un 403 su questi servizi significa
//! "stai correndo troppo" e si ritenta dopo un raffreddamento lungo, un 404
//! significa che la carta non c'è e insistere è inutile. Senza questa
//! distinzione la tabella delle decisioni non è applicabile.

use reqwest::{Client, StatusCode};
use std::time::Duration;

use crate::iiif::network::NetworkProfile;
use crate::jobs::{ErrorKind, JobError};

use super::courtesy::Courtesy;

/// Come si presenta Glossa alle biblioteche. Identificarsi è buona pratica
/// IIIF, ed è la parte non tecnica dell'aderenza allo standard (D18).
pub fn user_agent() -> String {
    format!(
        "Glossa/{} (+https://github.com/nikazzio/glossa)",
        env!("CARGO_PKG_VERSION")
    )
}

pub fn build_client(profile: &NetworkProfile) -> Result<Client, JobError> {
    Client::builder()
        .user_agent(user_agent())
        .connect_timeout(profile.connect_timeout())
        .timeout(profile.read_timeout())
        .build()
        .map_err(|error| JobError::new(ErrorKind::Internal, format!("client HTTP: {error}")))
}

/// Esito di una richiesta riuscita, con quanto si è aspettato per rispettare i
/// limiti: serve a dire all'utente che il lavoro è fermo ma non rotto (D17).
#[derive(Debug)]
pub struct Fetched {
    pub bytes: Vec<u8>,
    pub waited: Duration,
}

pub async fn fetch(
    client: &Client,
    courtesy: &Courtesy,
    profile: &NetworkProfile,
    url: &str,
) -> Result<Fetched, JobError> {
    let host = host_of(url)?;
    let (_turn, waited) = courtesy.wait_turn(&host, profile).await;

    let response = client.get(url).send().await.map_err(|error| {
        // Connessione caduta, DNS, timeout: è trasporto, si ritenta.
        JobError::new(ErrorKind::Transport, format!("{url}: {error}"))
    })?;

    let status = response.status();
    if status.is_success() {
        let bytes = response
            .bytes()
            .await
            .map_err(|error| JobError::new(ErrorKind::Transport, format!("{url}: {error}")))?;
        return Ok(Fetched {
            bytes: bytes.to_vec(),
            waited,
        });
    }

    Err(classify(status, retry_after_secs(&response), url, profile))
}

/// L'attesa la decide il **profilo della biblioteca** (D18), non una costante
/// del motore: dopo un 403 Gallica vuole dieci minuti, le altre due. Il tempo
/// dichiarato dal servizio, quando c'è, vince su tutto.
fn classify(
    status: StatusCode,
    retry_after: Option<u64>,
    url: &str,
    profile: &NetworkProfile,
) -> JobError {
    let code = status.as_u16();
    let error = match code {
        // "Stai correndo troppo", non "vietato per sempre": correzione
        // esplicita di D16 dopo le prove su Gallica.
        403 => JobError::new(ErrorKind::Throttled, format!("{url}: 403")),
        429 => JobError::new(ErrorKind::RateLimited, format!("{url}: 429")),
        404 | 410 => JobError::new(ErrorKind::NotFound, format!("{url}: {code}")),
        500..=599 => JobError::new(ErrorKind::Transport, format!("{url}: {code}")),
        _ => JobError::new(ErrorKind::Internal, format!("{url}: {code}")),
    };
    // Sul trasporto lasciamo crescere l'attesa al motore: è lì che vive il
    // raddoppio a ogni tentativo. Su 403 e 429 comanda il profilo.
    let declared = match (code, retry_after) {
        (_, Some(seconds)) => Some(seconds),
        (403 | 429, None) => Some(profile.wait_after(Some(code), 1, None)),
        _ => None,
    };
    match declared {
        Some(seconds) => JobError {
            retry_after: Some(Duration::from_secs(seconds)),
            ..error
        },
        None => error,
    }
}

fn retry_after_secs(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()
}

/// L'host serve a tenere i contatori dove contano: sul server che si affanna.
pub fn host_of(url: &str) -> Result<String, JobError> {
    url::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .ok_or_else(|| JobError::new(ErrorKind::Internal, format!("indirizzo non valido: {url}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iiif::network::CAUTIOUS;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn instant_profile() -> NetworkProfile {
        NetworkProfile {
            pause_min_ms: 0,
            pause_max_ms: 0,
            ..CAUTIOUS
        }
    }

    async fn fetch_from(server: &MockServer, route: &str) -> Result<Fetched, JobError> {
        let profile = instant_profile();
        let client = build_client(&profile).unwrap();
        let courtesy = Courtesy::new();
        fetch(
            &client,
            &courtesy,
            &profile,
            &format!("{}{route}", server.uri()),
        )
        .await
    }

    #[tokio::test]
    async fn a_successful_response_comes_back_whole() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/manifest.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"items":[]}"#))
            .mount(&server)
            .await;

        let fetched = fetch_from(&server, "/manifest.json").await.unwrap();

        assert_eq!(fetched.bytes, br#"{"items":[]}"#.to_vec());
    }

    #[tokio::test]
    async fn the_wait_after_a_403_comes_from_the_library_profile() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(403))
            .mount(&server)
            .await;
        let profile = NetworkProfile {
            pause_min_ms: 0,
            pause_max_ms: 0,
            ..crate::iiif::network::GALLICA
        };
        let client = build_client(&profile).unwrap();

        let error = fetch(
            &client,
            &Courtesy::new(),
            &profile,
            &format!("{}/page.jpg", server.uri()),
        )
        .await
        .unwrap_err();

        assert_eq!(error.retry_after, Some(Duration::from_secs(600)));
    }

    #[tokio::test]
    async fn a_403_is_a_slow_down_not_a_refusal() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(403))
            .mount(&server)
            .await;

        let error = fetch_from(&server, "/page.jpg").await.unwrap_err();

        assert_eq!(error.kind, ErrorKind::Throttled);
        assert!(
            error.kind.is_retryable(),
            "va ritentato, dopo l'attesa lunga"
        );
    }

    #[tokio::test]
    async fn a_429_carries_the_wait_declared_by_the_service() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "45"))
            .mount(&server)
            .await;

        let error = fetch_from(&server, "/page.jpg").await.unwrap_err();

        assert_eq!(error.kind, ErrorKind::RateLimited);
        assert_eq!(error.retry_after, Some(Duration::from_secs(45)));
    }

    #[tokio::test]
    async fn a_missing_page_is_not_retried() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let error = fetch_from(&server, "/page.jpg").await.unwrap_err();

        assert_eq!(error.kind, ErrorKind::NotFound);
        assert!(!error.kind.is_retryable());
    }

    #[tokio::test]
    async fn a_server_failure_is_transport_and_gets_another_chance() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&server)
            .await;

        let error = fetch_from(&server, "/page.jpg").await.unwrap_err();

        assert_eq!(error.kind, ErrorKind::Transport);
    }

    #[test]
    fn the_application_says_who_it_is() {
        assert!(user_agent().starts_with("Glossa/"));
    }
}
