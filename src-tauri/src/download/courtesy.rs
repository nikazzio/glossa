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
    pub async fn wait_turn(&self, host: &str, profile: &NetworkProfile) -> (Turn, Duration) {
        let gate = self.gate_for(host).await;
        let permit = Arc::clone(&gate.permits)
            .acquire_owned()
            .await
            .expect("il semaforo di un host non viene mai chiuso");

        let waited = Self::respect_timing(&gate, profile).await;
        (Turn { _permit: permit }, waited)
    }

    async fn gate_for(&self, host: &str) -> Arc<HostGate> {
        let mut hosts = self.hosts.lock().await;
        Arc::clone(hosts.entry(host.to_string()).or_insert_with(|| {
            Arc::new(HostGate {
                permits: Arc::new(Semaphore::new(profile_permits(host))),
                timeline: Mutex::new(Timeline::default()),
            })
        }))
    }

    async fn respect_timing(gate: &HostGate, profile: &NetworkProfile) -> Duration {
        let started = Instant::now();
        loop {
            let sleep_for = {
                let mut timeline = gate.timeline.lock().await;
                let now = Instant::now();
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
            };

            match sleep_for {
                Some(delay) if !delay.is_zero() => tokio::time::sleep(delay).await,
                Some(_) => tokio::task::yield_now().await,
                None => return started.elapsed(),
            }
        }
    }
}

/// Posti concessi verso un host. Il valore vive nel profilo del provider, ma il
/// semaforo si crea una volta sola per host: il primo profilo che lo incontra
/// decide, e gli altri provider sullo stesso host si adeguano — è il server a
/// dover reggere, non il chiamante a doversi distinguere.
fn profile_permits(_host: &str) -> usize {
    // I profili tarati vanno da 2 a 4: si parte dal più prudente e lo si alza
    // solo quando il profilo del provider lo consente esplicitamente.
    2
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

        let (_turn, waited) = courtesy
            .wait_turn("gallica.bnf.fr", &fast(40, 100, 60))
            .await;

        assert!(waited < Duration::from_millis(20), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn two_requests_to_the_same_host_are_spaced_by_the_declared_pause() {
        let courtesy = Courtesy::new();
        let profile = fast(60, 100, 60);

        let (turn, _) = courtesy.wait_turn("gallica.bnf.fr", &profile).await;
        drop(turn);
        let (_turn, waited) = courtesy.wait_turn("gallica.bnf.fr", &profile).await;

        assert!(waited >= Duration::from_millis(40), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn hosts_are_counted_separately() {
        // Un provider può servire ricerca e immagini da macchine diverse: la
        // pausa verso l'una non deve rallentare l'altra.
        let courtesy = Courtesy::new();
        let profile = fast(200, 100, 60);

        let (turn, _) = courtesy.wait_turn("gallica.bnf.fr", &profile).await;
        drop(turn);
        let (_turn, waited) = courtesy.wait_turn("images.bnf.fr", &profile).await;

        assert!(waited < Duration::from_millis(50), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn the_burst_window_holds_back_the_extra_request() {
        let courtesy = Courtesy::new();
        // Due richieste al secondo di finestra, senza pausa fra le due.
        let profile = fast(0, 2, 1);

        let (a, _) = courtesy.wait_turn("host", &profile).await;
        drop(a);
        let (b, _) = courtesy.wait_turn("host", &profile).await;
        drop(b);
        let (_c, waited) = courtesy.wait_turn("host", &profile).await;

        assert!(
            waited >= Duration::from_millis(500),
            "la terza deve aspettare la finestra, ha atteso {waited:?}"
        );
    }
}
