//! Richieste alle biblioteche, con cortesia e classificazione degli errori.

use reqwest::{Client, StatusCode};
use std::time::Duration;

use crate::iiif::network::NetworkProfile;
use crate::jobs::{ErrorKind, JobError};

use super::courtesy::{Courtesy, Lane, Signals};

/// Identificativo inviato alle biblioteche.
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
    /// Tipo dichiarato dal servizio.
    pub content_type: Option<String>,
}

/// Tentativi ravvicinati prima di applicare l'attesa del lavoro.
const TRANSPORT_ATTEMPTS: u32 = 3;
const TRANSPORT_PAUSE: Duration = Duration::from_millis(700);

/// Quanto aspetta al massimo una richiesta che qualcuno sta guardando.
///
/// Il profilo ne concede molti di più, e per uno scaricamento va bene: certe
/// biblioteche ricavano l'immagine al momento e vale la pena aspettarle. Ma il
/// visore tiene occupato un posto in corsia per tutto quel tempo, e chi guarda
/// resta davanti a una rotella. Meglio dirlo e lasciare il tasto per riprovare.
const INTERACTIVE_DEADLINE: Duration = Duration::from_secs(90);

/// I segnali del lavoro interrompono l'attesa del turno quando è stato messo in
/// pausa o annullato — `Ok(None)` significa "fermato mentre aspettava", non
/// "fallito" — e dicono a chi guarda se l'attesa è la nostra cortesia o la
/// lentezza del servizio.
///
/// `job_attempt` è il tentativo del **lavoro**, non della richiesta: serve a
/// calcolare l'attesa esponenziale con la base e il tetto del profilo della
/// biblioteca, invece che con costanti del motore.
/// `lane` dice se la richiesta è quella che l'utente sta guardando o parte di
/// uno scaricamento: cambia il posto in corsia, non i limiti né gli errori.
pub async fn fetch(
    client: &Client,
    courtesy: &Courtesy,
    profile: &NetworkProfile,
    url: &str,
    lane: Lane,
    job_attempt: u32,
    signals: &Signals<'_>,
) -> Result<Option<Fetched>, JobError> {
    let host = host_of(url)?;
    let mut last_error = None;
    // Una sola prova per ciò che si guarda: tre tentativi da un minuto l'uno
    // sono sei minuti di posto occupato, e nel frattempo non si vede niente.
    let attempts = match lane {
        Lane::Interactive => 1,
        Lane::Bulk => TRANSPORT_ATTEMPTS,
    };

    for attempt in 1..=attempts {
        let queued_at = std::time::Instant::now();
        let Some(_turn) = courtesy.wait_turn(&host, profile, lane, signals).await else {
            log::debug!("request dropped host={host} lane={lane:?} url={url}");
            return Ok(None);
        };
        let waited_ms = queued_at.elapsed().as_millis();
        let started_at = std::time::Instant::now();

        match attempt_within(client, url, profile, lane).await {
            Ok(fetched) => {
                // La riga che serve quando "sembra piantato": dice se il tempo
                // se n'è andato in coda da noi o dalla parte della biblioteca.
                log::debug!(
                    "request ok host={host} lane={lane:?} waited_ms={waited_ms} \
                     server_ms={} bytes={} url={url}",
                    started_at.elapsed().as_millis(),
                    fetched.bytes.len()
                );
                return Ok(Some(fetched));
            }
            Err(error) => {
                // Un rifiuto per eccesso di richieste raffredda **l'host**, non
                // solo questo lavoro: un secondo scaricamento sullo stesso
                // server deve rallentare anche lui.
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
                if attempt < attempts {
                    tokio::time::sleep(TRANSPORT_PAUSE * attempt).await;
                    if (signals.stop)() {
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

/// La richiesta, con la scadenza della sua classe.
async fn attempt_within(
    client: &Client,
    url: &str,
    profile: &NetworkProfile,
    lane: Lane,
) -> Result<Fetched, JobError> {
    let deadline = match lane {
        Lane::Interactive => INTERACTIVE_DEADLINE.min(profile.read_timeout()),
        Lane::Bulk => profile.read_timeout(),
    };
    match tokio::time::timeout(deadline, attempt_once(client, url, profile)).await {
        Ok(outcome) => outcome,
        Err(_) => {
            log::warn!("request timed out url={url} after_s={}", deadline.as_secs());
            Err(JobError::new(
                ErrorKind::Transport,
                "la biblioteca non ha risposto in tempo",
            ))
        }
    }
}

async fn attempt_once(
    client: &Client,
    url: &str,
    profile: &NetworkProfile,
) -> Result<Fetched, JobError> {
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
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.split(';').next().unwrap_or(value).trim().to_string());
        return response
            .bytes()
            .await
            .map(|bytes| Fetched {
                bytes: bytes.to_vec(),
                content_type,
            })
            .map_err(|error| {
                log::warn!("request truncated url={url} error={error}");
                JobError::new(ErrorKind::Transport, "risposta interrotta a metà")
            });
    }

    Err(classify(status, retry_after_secs(&response), url, profile))
}

/// L'attesa la decide il **profilo della biblioteca**, non una costante
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
        // Alcune biblioteche usano 403 per chiedere di rallentare.
        403 => JobError::new(
            ErrorKind::Throttled,
            "la biblioteca ha chiesto di rallentare (403)",
        ),
        429 => JobError::new(ErrorKind::RateLimited, "troppe richieste insieme (429)"),
        404 | 410 => JobError::new(
            ErrorKind::NotFound,
            format!("pagina non disponibile ({code})"),
        ),
        // L'unico parametro che facciamo variare è la misura, quindi un rifiuto
        // di questo tipo riguarda quella. Va **prima** dei 5xx, perché 501 sta
        // in quell'intervallo e non è un servizio che tossisce: è un servizio
        // che dice di non saper fare quello che gli abbiamo chiesto, e
        // ritentarlo tre volte non lo fa cambiare idea.
        400 | 501 => JobError::new(
            ErrorKind::SizeRejected,
            format!("misura non disponibile per questa pagina ({code})"),
        ),
        500..=599 => JobError::new(
            ErrorKind::Transport,
            format!("errore del servizio della biblioteca ({code})"),
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
        CAUTIOUS
    }

    fn never_stop() -> impl Fn() -> bool + Sync {
        || false
    }

    fn signals<'a>(
        stop: &'a (dyn Fn() -> bool + Sync),
        waiting: &'a std::sync::atomic::AtomicBool,
    ) -> Signals<'a> {
        Signals {
            stop,
            courtesy_wait: waiting,
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
            Lane::Bulk,
            1,
            &signals(&never_stop(), &std::sync::atomic::AtomicBool::new(false)),
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
        let profile = crate::iiif::network::GALLICA;
        let client = build_client(&profile).unwrap();

        let error = fetch(
            &client,
            &Courtesy::new(),
            &profile,
            &format!("{}/page.jpg", server.uri()),
            Lane::Bulk,
            1,
            &signals(&never_stop(), &std::sync::atomic::AtomicBool::new(false)),
        )
        .await
        .unwrap_err();

        assert_eq!(error.retry_after, Some(Duration::from_secs(600)));
    }

    #[tokio::test]
    async fn the_wait_between_job_attempts_comes_from_the_library_profile() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/page.jpg"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&server)
            .await;
        let profile = crate::iiif::network::GALLICA;
        let client = build_client(&profile).unwrap();

        let error = fetch(
            &client,
            &Courtesy::new(),
            &profile,
            &format!("{}/page.jpg", server.uri()),
            Lane::Bulk,
            2,
            &signals(&never_stop(), &std::sync::atomic::AtomicBool::new(false)),
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

        let _ = fetch(
            &client,
            &courtesy,
            &profile,
            &url,
            Lane::Bulk,
            1,
            &signals(&never_stop(), &std::sync::atomic::AtomicBool::new(false)),
        )
        .await
        .unwrap_err();

        // Una seconda richiesta allo stesso host non parte: sta scontando il
        // raffreddamento, anche se è un altro lavoro a chiederla.
        let blocked = tokio::time::timeout(
            Duration::from_millis(150),
            fetch(
                &client,
                &courtesy,
                &profile,
                &url,
                Lane::Interactive,
                1,
                &signals(&never_stop(), &std::sync::atomic::AtomicBool::new(false)),
            ),
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
