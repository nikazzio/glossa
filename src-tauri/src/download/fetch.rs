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

/// Esito di una richiesta riuscita.
#[derive(Debug)]
pub struct Fetched {
    pub bytes: Vec<u8>,
}

/// Tentativi ravvicinati sulla **singola richiesta** (D16, primo livello):
/// una connessione che cade o un 5xx passeggero si riprovano subito, senza
/// disturbare il lavoro. Quando anche questi finiscono, l'errore sale al
/// secondo livello, dove le attese sono lunghe e le decide il profilo.
const TRANSPORT_ATTEMPTS: u32 = 3;
const TRANSPORT_PAUSE: Duration = Duration::from_millis(700);

/// `should_stop` interrompe l'attesa del turno quando il lavoro è stato messo
/// in pausa o annullato: `Ok(None)` significa "fermato mentre aspettava", non
/// "fallito".
///
/// `job_attempt` è il tentativo del **lavoro**, non della richiesta: serve a
/// calcolare l'attesa esponenziale con la base e il tetto del profilo della
/// biblioteca (D16), invece che con costanti del motore.
pub async fn fetch(
    client: &Client,
    courtesy: &Courtesy,
    profile: &NetworkProfile,
    url: &str,
    job_attempt: u32,
    should_stop: &(dyn Fn() -> bool + Sync),
) -> Result<Option<Fetched>, JobError> {
    let host = host_of(url)?;
    let mut last_error = None;

    for attempt in 1..=TRANSPORT_ATTEMPTS {
        let Some(_turn) = courtesy.wait_turn(&host, profile, should_stop).await else {
            return Ok(None);
        };

        match attempt_once(client, url, profile).await {
            Ok(bytes) => return Ok(Some(Fetched { bytes })),
            Err(error) => {
                // Un rifiuto per eccesso di richieste raffredda **l'host**, non
                // solo questo lavoro: un secondo scaricamento sullo stesso
                // server deve rallentare anche lui (D18).
                if matches!(error.kind, ErrorKind::Throttled | ErrorKind::RateLimited) {
                    let declared = error.retry_after.map(|wait| wait.as_secs());
                    let code = if error.kind == ErrorKind::Throttled {
                        403
                    } else {
                        429
                    };
                    courtesy
                        .cool_down(&host, profile, profile.wait_after(Some(code), 1, declared))
                        .await;
                    return Err(error);
                }
                if error.kind != ErrorKind::Transport {
                    return Err(error);
                }
                last_error = Some(error);
                if attempt < TRANSPORT_ATTEMPTS {
                    tokio::time::sleep(TRANSPORT_PAUSE * attempt).await;
                    if should_stop() {
                        return Ok(None);
                    }
                }
            }
        }
    }

    // Il trasporto ha rinunciato: l'attesa prima del prossimo tentativo del
    // lavoro la decide il profilo della biblioteca, non il motore.
    let error =
        last_error.unwrap_or_else(|| JobError::new(ErrorKind::Transport, "nessuna risposta"));
    Err(JobError {
        retry_after: Some(Duration::from_secs(profile.wait_after(
            None,
            job_attempt,
            None,
        ))),
        ..error
    })
}

async fn attempt_once(
    client: &Client,
    url: &str,
    profile: &NetworkProfile,
) -> Result<Vec<u8>, JobError> {
    let response = client
        .get(url)
        // Alcune biblioteche servono le immagini solo a chi le chiede come le
        // chiederebbe un browser.
        .header(
            reqwest::header::ACCEPT,
            "image/*,application/json;q=0.9,*/*;q=0.8",
        )
        .send()
        .await
        .map_err(|error| {
            // Connessione caduta, DNS, timeout: è trasporto, si ritenta.
            log::warn!("request failed url={url} error={error}");
            JobError::new(ErrorKind::Transport, "la biblioteca non risponde")
        })?;

    let status = response.status();
    if status.is_success() {
        return response
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(|error| {
                log::warn!("request truncated url={url} error={error}");
                JobError::new(ErrorKind::Transport, "risposta interrotta a metà")
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
    // L'indirizzo completo va nel registro, non nel messaggio: nel pannello
    // occupava tre righe di parametri IIIF e copriva il motivo vero.
    log::warn!("request refused url={url} status={code}");

    let error = match code {
        // "Stai correndo troppo", non "vietato per sempre": correzione
        // esplicita di D16 dopo le prove su Gallica.
        403 => JobError::new(
            ErrorKind::Throttled,
            "la biblioteca ha chiesto di rallentare (403)",
        ),
        429 => JobError::new(ErrorKind::RateLimited, "troppe richieste insieme (429)"),
        404 | 410 => JobError::new(
            ErrorKind::NotFound,
            format!("carta non disponibile ({code})"),
        ),
        500..=599 => JobError::new(
            ErrorKind::Transport,
            format!("errore del servizio della biblioteca ({code})"),
        ),
        // L'unico parametro che facciamo variare è la misura, quindi un
        // rifiuto di questo tipo riguarda quella (D4).
        400 => JobError::new(
            ErrorKind::Internal,
            "misura non disponibile per questa carta (400)",
        ),
        _ => JobError::new(ErrorKind::Internal, format!("richiesta rifiutata ({code})")),
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

    fn never_stop() -> impl Fn() -> bool + Sync {
        || false
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
            1,
            &never_stop(),
        )
        .await
        .map(|fetched| fetched.expect("nessuno ha chiesto di fermarsi"))
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
            1,
            &never_stop(),
        )
        .await
        .unwrap_err();

        assert_eq!(error.retry_after, Some(Duration::from_secs(600)));
    }

    #[tokio::test]
    async fn the_wait_between_job_attempts_comes_from_the_library_profile() {
        // D16: base e tetto dell'attesa esponenziale sono del profilo, non
        // costanti del motore. Gallica parte da 20 s e raddoppia.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(503))
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
            2,
            &never_stop(),
        )
        .await
        .unwrap_err();

        assert_eq!(error.kind, ErrorKind::Transport);
        assert_eq!(error.retry_after, Some(Duration::from_secs(40)));
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
    async fn a_passing_server_failure_is_retried_without_disturbing_the_job() {
        // Primo livello di D16: pochi tentativi ravvicinati sulla singola
        // richiesta, invisibili al lavoro. Senza, un 503 di un secondo
        // costerebbe venti secondi di attesa al livello del lavoro.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(503))
            .up_to_n_times(2)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(200).set_body_string("ok"))
            .mount(&server)
            .await;

        let fetched = fetch_from(&server, "/page.jpg").await.unwrap();

        assert_eq!(fetched.bytes, b"ok".to_vec());
    }

    #[tokio::test]
    async fn a_refusal_cools_down_the_whole_host_not_just_this_job() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "2"))
            .mount(&server)
            .await;
        let profile = instant_profile();
        let client = build_client(&profile).unwrap();
        let courtesy = Courtesy::new();
        let url = format!("{}/page.jpg", server.uri());

        let _ = fetch(&client, &courtesy, &profile, &url, 1, &never_stop())
            .await
            .unwrap_err();

        // Una seconda richiesta allo stesso host non parte: sta scontando il
        // raffreddamento, anche se è un altro lavoro a chiederla.
        let blocked = tokio::time::timeout(
            Duration::from_millis(150),
            fetch(&client, &courtesy, &profile, &url, 1, &never_stop()),
        )
        .await;
        assert!(blocked.is_err(), "l'host deve restare fermo");
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
