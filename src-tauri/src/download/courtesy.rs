//! Le buone maniere verso le biblioteche (D18).
//!
//! Il profilo lo dichiara il provider, ma i contatori si tengono **per host**:
//! un provider può servire ricerca e immagini da macchine diverse, e quella che
//! si affanna è la seconda. Qui vivono pausa fra richieste, limite a raffica a
//! finestra scorrevole e concorrenza per host.
//!
//! Non è una gentilezza astratta: con i valori di Gallica un manoscritto di 210
//! carte richiede un quarto d'ora, e superarli significa farsi bandire — cioè
//! non scaricare più niente, per ore.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};

use crate::iiif::network::NetworkProfile;

/// Quanto si dorme al massimo prima di ricontrollare se è stato chiesto di
/// fermarsi. Un raffreddamento dura minuti: dormirlo tutto d'un fiato renderebbe
/// il lavoro sordo a pausa e annullamento.
const POLL_SLICE: Duration = Duration::from_millis(250);

/// Stato di un singolo host: chi sta parlando adesso, quando si è parlato
/// l'ultima volta, e le richieste della finestra corrente.
struct HostGate {
    permits: Arc<Semaphore>,
    timeline: Mutex<Timeline>,
}

#[derive(Default)]
struct Timeline {
    last_request: Option<Instant>,
    recent: VecDeque<Instant>,
    /// Fino a quando questo host è in raffreddamento. Dopo un 403 o un 429 non
    /// basta far aspettare il lavoro che l'ha preso: **tutto** ciò che parla con
    /// quell'host deve rallentare, altrimenti un secondo scaricamento in corso
    /// continua a bussare mentre il primo aspetta (D18).
    cooldown_until: Option<Instant>,
}

/// I contatori di tutti gli host visti finora.
#[derive(Default)]
pub struct Courtesy {
    hosts: Mutex<HashMap<String, Arc<HostGate>>>,
}

/// Il turno di parola verso un host: finché è vivo, occupa uno dei posti
/// concessi dalla concorrenza per host.
pub struct Turn {
    _permit: OwnedSemaphorePermit,
}

impl Courtesy {
    pub fn new() -> Self {
        Self::default()
    }

    /// Aspetta il proprio turno verso `host`, rispettando pausa, raffica e
    /// concorrenza. Restituisce quanto si è aspettato: serve a dire all'utente
    /// che il lavoro è fermo **per rispetto dei limiti**, non per un errore.
    ///
    /// `should_stop` viene guardato **durante** l'attesa. Senza, un lavoro
    /// entrato in raffreddamento — dieci minuti dopo un 403 su Gallica — non
    /// risponderebbe più né alla pausa né all'annullamento fino a scadenza, e
    /// terrebbe occupato il suo posto in corsia per tutto il tempo.
    pub async fn wait_turn(
        &self,
        host: &str,
        profile: &NetworkProfile,
        should_stop: &(dyn Fn() -> bool + Sync),
    ) -> Option<(Turn, Duration)> {
        let gate = self.gate_for(host, profile).await;
        let permit = Arc::clone(&gate.permits)
            .acquire_owned()
            .await
            .expect("il semaforo di un host non viene mai chiuso");

        let waited = Self::respect_timing(&gate, profile, should_stop).await?;
        Some((Turn { _permit: permit }, waited))
    }

    /// Mette un host in raffreddamento: da qui in avanti, per quei secondi,
    /// nessuno gli parla. Un raffreddamento più lungo di quello in corso lo
    /// estende, uno più corto non lo accorcia.
    pub async fn cool_down(&self, host: &str, profile: &NetworkProfile, seconds: u64) {
        if seconds == 0 {
            return;
        }
        let gate = self.gate_for(host, profile).await;
        let until = Instant::now() + Duration::from_secs(seconds);
        let mut timeline = gate.timeline.lock().await;
        timeline.cooldown_until = Some(match timeline.cooldown_until {
            Some(existing) if existing > until => existing,
            _ => until,
        });
    }

    async fn gate_for(&self, host: &str, profile: &NetworkProfile) -> Arc<HostGate> {
        let mut hosts = self.hosts.lock().await;
        Arc::clone(hosts.entry(host.to_string()).or_insert_with(|| {
            Arc::new(HostGate {
                // La concorrenza la dichiara il profilo della biblioteca: due
                // verso Gallica, quattro verso chi regge di più (D18).
                permits: Arc::new(Semaphore::new(profile.host_concurrency.max(1))),
                timeline: Mutex::new(Timeline::default()),
            })
        }))
    }

    async fn respect_timing(
        gate: &HostGate,
        profile: &NetworkProfile,
        should_stop: &(dyn Fn() -> bool + Sync),
    ) -> Option<Duration> {
        let started = Instant::now();
        loop {
            if should_stop() {
                return None;
            }
            let sleep_for = {
                let mut timeline = gate.timeline.lock().await;
                let now = Instant::now();

                // Il raffreddamento viene prima di tutto: se l'host ha appena
                // detto di rallentare, non si discute.
                if let Some(until) = timeline.cooldown_until {
                    if until > now {
                        Some(until - now)
                    } else {
                        timeline.cooldown_until = None;
                        None
                    }
                } else {
                    None
                }
                .map(Some)
                .unwrap_or_else(|| {
                    let window = Duration::from_secs(profile.burst_window_secs);
                    while timeline
                        .recent
                        .front()
                        .is_some_and(|stamp| now.duration_since(*stamp) >= window)
                    {
                        timeline.recent.pop_front();
                    }

                    // Limite a raffica: se la finestra è piena si aspetta che ne
                    // esca la più vecchia, indipendentemente dalla concorrenza.
                    if timeline.recent.len() >= profile.burst_requests as usize {
                        let oldest = timeline.recent.front().copied().unwrap_or(now);
                        Some(window.saturating_sub(now.duration_since(oldest)))
                    } else {
                        // Pausa fra due richieste: durata scelta nell'intervallo
                        // dichiarato, per non presentarsi con un ritmo meccanico.
                        let pause = pause_for(profile);
                        let since_last = timeline
                            .last_request
                            .map(|last| now.duration_since(last))
                            .unwrap_or(pause);
                        if since_last < pause {
                            Some(pause - since_last)
                        } else {
                            timeline.last_request = Some(now);
                            timeline.recent.push_back(now);
                            None
                        }
                    }
                })
            };

            match sleep_for {
                // L'attesa si spezza in fette brevi: fra una e l'altra si
                // guarda se nel frattempo è stato chiesto di fermarsi.
                Some(delay) if !delay.is_zero() => {
                    tokio::time::sleep(delay.min(POLL_SLICE)).await;
                }
                Some(_) => tokio::task::yield_now().await,
                None => return Some(started.elapsed()),
            }
        }
    }
}

fn pause_for(profile: &NetworkProfile) -> Duration {
    if profile.pause_max_ms <= profile.pause_min_ms {
        return Duration::from_millis(profile.pause_min_ms);
    }
    let span = profile.pause_max_ms - profile.pause_min_ms;
    let jitter = rand::random::<u64>() % (span + 1);
    Duration::from_millis(profile.pause_min_ms + jitter)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iiif::network::NetworkProfile;

    fn never_stop() -> impl Fn() -> bool + Sync {
        || false
    }

    /// Turno atteso senza interruzioni: nei test che non provano la fermata.
    async fn turn(courtesy: &Courtesy, host: &str, profile: &NetworkProfile) -> (Turn, Duration) {
        courtesy
            .wait_turn(host, profile, &never_stop())
            .await
            .expect("nessuno ha chiesto di fermarsi")
    }

    fn fast(pause_ms: u64, burst: u32, window_secs: u64) -> NetworkProfile {
        NetworkProfile {
            pause_min_ms: pause_ms,
            pause_max_ms: pause_ms,
            burst_requests: burst,
            burst_window_secs: window_secs,
            ..crate::iiif::network::CAUTIOUS
        }
    }

    #[tokio::test]
    async fn the_first_request_does_not_wait() {
        let courtesy = Courtesy::new();

        let (_turn, waited) = turn(&courtesy, "gallica.bnf.fr", &fast(40, 100, 60)).await;

        assert!(waited < Duration::from_millis(20), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn two_requests_to_the_same_host_are_spaced_by_the_declared_pause() {
        let courtesy = Courtesy::new();
        let profile = fast(60, 100, 60);

        let (first, _) = turn(&courtesy, "gallica.bnf.fr", &profile).await;
        drop(first);
        let (_second, waited) = turn(&courtesy, "gallica.bnf.fr", &profile).await;

        assert!(waited >= Duration::from_millis(40), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn hosts_are_counted_separately() {
        // Un provider può servire ricerca e immagini da macchine diverse: la
        // pausa verso l'una non deve rallentare l'altra.
        let courtesy = Courtesy::new();
        let profile = fast(200, 100, 60);

        let (first, _) = turn(&courtesy, "gallica.bnf.fr", &profile).await;
        drop(first);
        let (_second, waited) = turn(&courtesy, "images.bnf.fr", &profile).await;

        assert!(waited < Duration::from_millis(50), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn the_profile_decides_how_many_talk_to_a_host_at_once() {
        // Gallica ne regge due, chi regge di più ne ha quattro: il numero è
        // della biblioteca, non una costante nostra (D18).
        let courtesy = Courtesy::new();
        let strict = NetworkProfile {
            host_concurrency: 1,
            ..fast(0, 100, 60)
        };

        let (first, _) = turn(&courtesy, "host", &strict).await;
        let second =
            tokio::time::timeout(Duration::from_millis(80), turn(&courtesy, "host", &strict)).await;

        assert!(second.is_err(), "il posto era uno solo, il secondo aspetta");
        drop(first);
    }

    #[tokio::test]
    async fn a_cooldown_stops_everyone_talking_to_that_host() {
        // Dopo un 403 non basta far aspettare il lavoro che l'ha preso: un
        // secondo scaricamento sullo stesso host continuerebbe a bussare.
        let courtesy = Courtesy::new();
        let profile = fast(0, 100, 60);

        courtesy.cool_down("host", &profile, 1).await;
        let waited = tokio::time::timeout(
            Duration::from_millis(120),
            turn(&courtesy, "host", &profile),
        )
        .await;

        assert!(waited.is_err(), "l'host è in raffreddamento");
    }

    #[tokio::test]
    async fn the_cooldown_of_one_host_does_not_touch_the_others() {
        let courtesy = Courtesy::new();
        let profile = fast(0, 100, 60);
        courtesy.cool_down("gallica.bnf.fr", &profile, 5).await;

        let (_turn, waited) = turn(&courtesy, "images.vatlib.it", &profile).await;

        assert!(waited < Duration::from_millis(50), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn a_job_that_is_being_stopped_does_not_serve_out_its_cooldown() {
        // Dopo un 403 su Gallica il raffreddamento è di dieci minuti: dormirlo
        // tutto renderebbe il lavoro sordo a pausa e annullamento, e terrebbe
        // occupato il posto in corsia per tutto il tempo.
        let courtesy = Courtesy::new();
        let profile = fast(0, 100, 60);
        courtesy.cool_down("host", &profile, 600).await;

        let outcome = tokio::time::timeout(
            Duration::from_millis(500),
            courtesy.wait_turn("host", &profile, &|| true),
        )
        .await;

        assert!(
            outcome.expect("non deve restare appeso").is_none(),
            "chi si sta fermando non aspetta il raffreddamento"
        );
    }

    #[tokio::test]
    async fn the_burst_window_holds_back_the_extra_request() {
        let courtesy = Courtesy::new();
        // Due richieste al secondo di finestra, senza pausa fra le due.
        let profile = fast(0, 2, 1);

        let (a, _) = turn(&courtesy, "host", &profile).await;
        drop(a);
        let (b, _) = turn(&courtesy, "host", &profile).await;
        drop(b);
        let (_c, waited) = turn(&courtesy, "host", &profile).await;

        assert!(
            waited >= Duration::from_millis(500),
            "la terza deve aspettare la finestra, ha atteso {waited:?}"
        );
    }
}
