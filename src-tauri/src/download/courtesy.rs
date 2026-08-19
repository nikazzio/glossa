//! Le buone maniere verso le biblioteche (D18).
//!
//! Il profilo lo dichiara il provider, ma i contatori si tengono **per host**:
//! un provider può servire ricerca e immagini da macchine diverse, e quella che
//! si affanna è la seconda. Qui vivono pausa fra richieste, limite a raffica a
//! finestra scorrevole e concorrenza per host.
//!
//! Non è una gentilezza astratta: con i valori di Gallica un manoscritto di 210
//! pagine richiede un quarto d'ora, e superarli significa farsi bandire — cioè
//! non scaricare più niente, per ore.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};

use crate::iiif::network::NetworkProfile;

/// Quanto si dorme al massimo prima di ricontrollare se è stato chiesto di
/// fermarsi. Un raffreddamento dura minuti: dormirlo tutto d'un fiato renderebbe
/// il lavoro sordo a pausa e annullamento.
const POLL_SLICE: Duration = Duration::from_millis(250);

/// Sopra questa attesa vale la pena scriverlo nel registro: sotto è la pausa
/// normale fra due richieste, e ce n'è una per ogni pagina.
const LONG_WAIT: Duration = Duration::from_secs(5);

/// Stato di un singolo host: chi sta parlando adesso, quando si è parlato
/// l'ultima volta, e le richieste della finestra corrente.
struct HostGate {
    permits: Arc<Semaphore>,
    timeline: Mutex<Timeline>,
}

#[derive(Default)]
struct Timeline {
    /// Quando si potrà parlare di nuovo. Si sorteggia **una volta**, quando la
    /// richiesta parte: rinnovare il sorteggio a ogni controllo farebbe uscire
    /// al primo numero basso, e la pausa media crollerebbe sotto quella
    /// dichiarata dal profilo — cioè si sarebbe meno cortesi del previsto.
    next_allowed: Option<Instant>,
    recent: VecDeque<Instant>,
    /// Fino a quando questo host è in raffreddamento. Dopo un 403 o un 429 non
    /// basta far aspettare il lavoro che l'ha preso: **tutto** ciò che parla con
    /// quell'host deve rallentare, altrimenti un secondo scaricamento in corso
    /// continua a bussare mentre il primo aspetta (D18).
    cooldown_until: Option<Instant>,
}

/// Quello che un lavoro dice e chiede mentre una richiesta è in corso.
pub struct Signals<'a> {
    /// Vero quando è stato chiesto di fermarsi: pausa o annullamento.
    pub stop: &'a (dyn Fn() -> bool + Sync),
    /// Alzato mentre è **la nostra cortesia** a far aspettare — pausa fra
    /// richieste, limite a raffica, raffreddamento — e abbassato appena il turno
    /// arriva.
    ///
    /// Serve a non chiamare «limite della biblioteca» un server semplicemente
    /// lento: sono due immobilità con cause opposte, e chi guarda deve sapere se
    /// stiamo rispettando un limite o stiamo aspettando loro (D17).
    pub courtesy_wait: &'a AtomicBool,
}

impl Signals<'_> {
    fn stop(&self) -> bool {
        (self.stop)()
    }
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

    /// Aspetta il proprio turno verso `host`, rispettando pausa fra richieste,
    /// limite a raffica, concorrenza e raffreddamento.
    ///
    /// `should_stop` viene guardato **durante** l'attesa: senza, un lavoro in
    /// raffreddamento non risponderebbe più né alla pausa né all'annullamento
    /// fino a scadenza, e terrebbe occupato il suo posto in corsia.
    /// `None` significa "fermato mentre aspettava".
    pub async fn wait_turn(
        &self,
        host: &str,
        profile: &NetworkProfile,
        signals: &Signals<'_>,
    ) -> Option<Turn> {
        let gate = self.gate_for(host, profile).await;
        let Ok(permit) = Arc::clone(&gate.permits).acquire_owned().await else {
            // Il semaforo di un host non viene mai chiuso: se succedesse, non
            // si parla con quell'host invece di dare per buono un turno.
            log::error!("cortesia: corsia chiusa verso {host}");
            return None;
        };

        Self::respect_timing(host, &gate, profile, signals).await?;
        Some(Turn { _permit: permit })
    }

    /// Mette un host in raffreddamento: da qui in avanti, per quei secondi,
    /// nessuno gli parla. Un raffreddamento più lungo di quello in corso lo
    /// estende, uno più corto non lo accorcia.
    pub async fn cool_down(&self, host: &str, profile: &NetworkProfile, seconds: u64) {
        if seconds == 0 {
            return;
        }
        log::warn!("courtesy cooldown host={host} seconds={seconds}");
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

    /// Aspetta finché non è il momento di parlare con questo host, oppure
    /// finché non viene chiesto di fermarsi (`None`).
    async fn respect_timing(
        host: &str,
        gate: &HostGate,
        profile: &NetworkProfile,
        signals: &Signals<'_>,
    ) -> Option<()> {
        loop {
            if signals.stop() {
                signals.courtesy_wait.store(false, Ordering::SeqCst);
                return None;
            }

            let delay = {
                let mut timeline = gate.timeline.lock().await;
                next_delay(&mut timeline, profile)
            };

            match delay {
                // L'attesa si spezza in fette brevi: fra una e l'altra si
                // guarda se nel frattempo è stato chiesto di fermarsi.
                Some(delay) => {
                    if delay > LONG_WAIT {
                        signals.courtesy_wait.store(true, Ordering::SeqCst);
                        log::debug!("courtesy waiting host={host} seconds={}", delay.as_secs());
                    }
                    tokio::time::sleep(delay.min(POLL_SLICE)).await
                }
                None => {
                    signals.courtesy_wait.store(false, Ordering::SeqCst);
                    return Some(());
                }
            }
        }
    }
}

/// Quanto manca prima di poter parlare, o `None` se si può parlare adesso — e
/// in quel caso la richiesta viene segnata sulla linea del tempo dell'host.
///
/// I tre freni si guardano in ordine: raffreddamento, limite a raffica, pausa
/// fra due richieste. Il primo che dice di aspettare vince.
fn next_delay(timeline: &mut Timeline, profile: &NetworkProfile) -> Option<Duration> {
    let now = Instant::now();

    if let Some(until) = timeline.cooldown_until {
        if until > now {
            return Some(until - now);
        }
        timeline.cooldown_until = None;
    }

    let window = Duration::from_secs(profile.burst_window_secs);
    while timeline
        .recent
        .front()
        .is_some_and(|stamp| now.duration_since(*stamp) >= window)
    {
        timeline.recent.pop_front();
    }
    if timeline.recent.len() >= profile.burst_requests as usize {
        let oldest = timeline.recent.front().copied().unwrap_or(now);
        return Some(window.saturating_sub(now.duration_since(oldest)));
    }

    if let Some(until) = timeline.next_allowed {
        if until > now {
            return Some(until - now);
        }
    }

    // Sorteggiata qui, una volta per richiesta concessa.
    timeline.next_allowed = Some(now + pause_for(profile));
    timeline.recent.push_back(now);
    None
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

    /// Segnali di un lavoro che non si sta fermando, per i test che non
    /// guardano l'attesa di cortesia.
    fn signals<'a>(stop: &'a (dyn Fn() -> bool + Sync), waiting: &'a AtomicBool) -> Signals<'a> {
        Signals {
            stop,
            courtesy_wait: waiting,
        }
    }

    /// Turno atteso senza interruzioni, con quanto è durata l'attesa: i test
    /// misurano il tempo, il codice di produzione no.
    async fn turn(courtesy: &Courtesy, host: &str, profile: &NetworkProfile) -> (Turn, Duration) {
        let started = Instant::now();
        let stop = never_stop();
        let waiting = AtomicBool::new(false);
        let turn = courtesy
            .wait_turn(host, profile, &signals(&stop, &waiting))
            .await
            .expect("nessuno ha chiesto di fermarsi");
        (turn, started.elapsed())
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

    #[test]
    fn the_pause_is_drawn_once_not_at_every_check() {
        // Con il sorteggio ripetuto a ogni fetta d'attesa bastava un numero
        // basso per ripartire, e la pausa media finiva sotto quella dichiarata
        // dal profilo. Qui il secondo controllo deve trovare la stessa attesa,
        // solo più corta del tempo passato.
        let profile = NetworkProfile {
            pause_min_ms: 1_000,
            pause_max_ms: 20_000,
            ..crate::iiif::network::CAUTIOUS
        };
        let mut timeline = Timeline::default();

        assert!(
            next_delay(&mut timeline, &profile).is_none(),
            "la prima parte"
        );
        let first = next_delay(&mut timeline, &profile).expect("la seconda aspetta");
        let second = next_delay(&mut timeline, &profile).expect("aspetta ancora");

        assert!(second <= first);
        assert!(
            first - second < Duration::from_millis(100),
            "attesa risorteggiata: {first:?} poi {second:?}"
        );
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
            courtesy.wait_turn(
                "host",
                &profile,
                &signals(&|| true, &AtomicBool::new(false)),
            ),
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
