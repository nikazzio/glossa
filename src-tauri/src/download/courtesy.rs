//! Le buone maniere verso le biblioteche.
//!
//! Il profilo lo dichiara il provider, ma i contatori si tengono **per host**:
//! un provider può servire ricerca e immagini da macchine diverse, e quella che
//! si affanna è la seconda. Qui vivono il limite a raffica a finestra
//! scorrevole, la concorrenza per host e il raffreddamento dopo un rifiuto.
//!
//! **Nessuna pausa fra due richieste riuscite**, come nel client di Scriptoria:
//! la stessa pausa che rende gentile uno scaricamento moltiplicata per i
//! tasselli di una schermata rendeva il visore inservibile. Chi ferma davvero è
//! il raffreddamento, e quello vale per tutti.
//!
//! Due classi di traffico, **un solo tetto**: ciò che l'utente sta guardando
//! (`Lane::Interactive`) e ciò che si scarica in blocco (`Lane::Bulk`). Il
//! secondo non può occupare l'ultimo posto verso un host, così cambiare pagina
//! resta possibile mentre un libro si scarica.

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

/// Sopra questa attesa vale la pena scriverla nel registro: sotto è il normale
/// scorrere della finestra a raffica.
const LONG_WAIT: Duration = Duration::from_secs(5);

/// La classe di traffico verso una biblioteca.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lane {
    /// Quello che si vede a schermo: manifesto in apertura, `info.json`,
    /// tasselli e miniature.
    Interactive,
    /// Lo scaricamento di un libro, di un intervallo o delle pagine mancanti.
    Bulk,
}

/// Stato di un singolo host: i posti in corsia e le richieste della finestra
/// corrente.
struct HostGate {
    /// Il tetto vero: nessuno parla a questo host se non ha un posto qui.
    seats: Arc<Semaphore>,
    /// Sottoinsieme dei posti che gli scaricamenti possono occupare. Sempre
    /// meno di `seats`, così un posto resta a chi guarda.
    bulk_seats: Arc<Semaphore>,
    timeline: Mutex<Timeline>,
    /// Il ritmo con cui questa corsia è nata: i semafori non si ridimensionano,
    /// quindi è anche quello che vale finché l'applicazione è aperta.
    profile: NetworkProfile,
}

/// Come sta andando la conversazione con un host, adesso. Serve a chi guarda:
/// «è collegato davvero» è una domanda con una risposta precisa.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostActivity {
    pub host: String,
    /// Posti occupati e posti totali verso questo host.
    pub in_use: usize,
    pub seats: usize,
    /// Di quelli occupati, quanti sono di uno scaricamento.
    pub bulk_in_use: usize,
    /// Richieste nella finestra a raffica, e quante ne ammette.
    pub window_used: usize,
    pub window_limit: u32,
    pub window_secs: u64,
    /// Secondi di raffreddamento che restano, `0` se non ce n'è.
    pub cooldown_secs: u64,
}

#[derive(Default)]
struct Timeline {
    recent: VecDeque<Instant>,
    /// Fino a quando questo host è in raffreddamento. Dopo un 403 o un 429 non
    /// basta far aspettare il lavoro che l'ha preso: **tutto** ciò che parla con
    /// quell'host deve rallentare, altrimenti un secondo scaricamento in corso
    /// continua a bussare mentre il primo aspetta.
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
    /// stiamo rispettando un limite o stiamo aspettando loro.
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
    _seat: OwnedSemaphorePermit,
    /// Presente solo per gli scaricamenti: è il posto nel sottoinsieme che li
    /// tiene sotto il tetto riservato.
    _bulk_seat: Option<OwnedSemaphorePermit>,
}

impl Courtesy {
    pub fn new() -> Self {
        Self::default()
    }

    /// Aspetta il proprio turno verso `host`, rispettando concorrenza, limite a
    /// raffica e raffreddamento.
    ///
    /// `stop` viene guardato **durante** l'attesa: senza, un lavoro in
    /// raffreddamento non risponderebbe più all'annullamento fino a scadenza, e
    /// terrebbe occupato il suo posto in corsia. `None` significa "fermato
    /// mentre aspettava".
    ///
    /// Uno scaricamento prende **due** posti: quello del suo sottoinsieme e poi
    /// quello generale. Il sottoinsieme è più piccolo del tetto, quindi un posto
    /// resta sempre libero per il visore e nessuno dei due può salire oltre il
    /// numero dichiarato dalla biblioteca.
    pub async fn wait_turn(
        &self,
        host: &str,
        profile: &NetworkProfile,
        lane: Lane,
        signals: &Signals<'_>,
    ) -> Option<Turn> {
        let gate = self.gate_for(host, profile).await;

        let bulk_seat = match lane {
            Lane::Bulk => Some(Self::take_seat(&gate.bulk_seats, host).await?),
            Lane::Interactive => None,
        };
        let seat = Self::take_seat(&gate.seats, host).await?;

        Self::respect_limits(host, &gate, profile, signals).await?;
        Some(Turn {
            _seat: seat,
            _bulk_seat: bulk_seat,
        })
    }

    /// Mette un host in raffreddamento: da qui in avanti, per quei secondi,
    /// nessuno gli parla — né il visore né gli scaricamenti. Un raffreddamento
    /// più lungo di quello in corso lo estende, uno più corto non lo accorcia.
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

    /// Un posto, o `None` se il semaforo fosse chiuso — non succede, ma dare per
    /// buono un turno che non è stato concesso significherebbe superare il tetto
    /// della biblioteca.
    async fn take_seat(seats: &Arc<Semaphore>, host: &str) -> Option<OwnedSemaphorePermit> {
        match Arc::clone(seats).acquire_owned().await {
            Ok(seat) => Some(seat),
            Err(_) => {
                log::error!("cortesia: corsia chiusa verso {host}");
                None
            }
        }
    }

    async fn gate_for(&self, host: &str, profile: &NetworkProfile) -> Arc<HostGate> {
        let mut hosts = self.hosts.lock().await;
        Arc::clone(hosts.entry(host.to_string()).or_insert_with(|| {
            Arc::new(HostGate {
                // La concorrenza la dichiara il profilo della biblioteca: due
                // verso Gallica, quattro verso chi regge di più.
                seats: Arc::new(Semaphore::new(profile.host_concurrency.max(1))),
                bulk_seats: Arc::new(Semaphore::new(profile.bulk_workers())),
                timeline: Mutex::new(Timeline::default()),
                profile: *profile,
            })
        }))
    }

    /// Lo stato di ogni host con cui si è parlato, in ordine di nome.
    ///
    /// Si legge senza aspettare nessuno: è una fotografia per chi guarda, e
    /// bloccare una richiesta vera per disegnarla sarebbe il contrario di quello
    /// che serve.
    pub async fn activity(&self) -> Vec<HostActivity> {
        let gates: Vec<(String, Arc<HostGate>)> = {
            let hosts = self.hosts.lock().await;
            hosts
                .iter()
                .map(|(host, gate)| (host.clone(), Arc::clone(gate)))
                .collect()
        };

        let mut activity = Vec::with_capacity(gates.len());
        for (host, gate) in gates {
            let seats = gate.profile.host_concurrency.max(1);
            let bulk_seats = gate.profile.bulk_workers();
            let window = Duration::from_secs(gate.profile.burst_window_secs);
            let now = Instant::now();
            let timeline = gate.timeline.lock().await;
            activity.push(HostActivity {
                host,
                in_use: seats - gate.seats.available_permits(),
                seats,
                bulk_in_use: bulk_seats - gate.bulk_seats.available_permits(),
                window_used: timeline
                    .recent
                    .iter()
                    .filter(|stamp| now.duration_since(**stamp) < window)
                    .count(),
                window_limit: gate.profile.burst_requests,
                window_secs: gate.profile.burst_window_secs,
                cooldown_secs: timeline
                    .cooldown_until
                    .filter(|until| *until > now)
                    .map(|until| (until - now).as_secs() + 1)
                    .unwrap_or(0),
            });
        }
        activity.sort_by(|a, b| a.host.cmp(&b.host));
        activity
    }

    /// Aspetta finché non è il momento di parlare con questo host, oppure
    /// finché non viene chiesto di fermarsi (`None`).
    async fn respect_limits(
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
/// Due freni, in ordine: raffreddamento e limite a raffica. Il primo che dice di
/// aspettare vince. Fra due richieste riuscite non c'è nessuna pausa.
fn next_delay(timeline: &mut Timeline, profile: &NetworkProfile) -> Option<Duration> {
    let now = Instant::now();

    if let Some(delay) = cooldown_delay_at(timeline, now) {
        return Some(delay);
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

    timeline.recent.push_back(now);
    None
}

fn cooldown_delay_at(timeline: &mut Timeline, now: Instant) -> Option<Duration> {
    match timeline.cooldown_until {
        Some(until) if until > now => Some(until - now),
        Some(_) => {
            timeline.cooldown_until = None;
            None
        }
        None => None,
    }
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
    async fn turn(
        courtesy: &Courtesy,
        host: &str,
        profile: &NetworkProfile,
        lane: Lane,
    ) -> (Turn, Duration) {
        let started = Instant::now();
        let stop = never_stop();
        let waiting = AtomicBool::new(false);
        let turn = courtesy
            .wait_turn(host, profile, lane, &signals(&stop, &waiting))
            .await
            .expect("nessuno ha chiesto di fermarsi");
        (turn, started.elapsed())
    }

    fn profile(burst: u32, window_secs: u64) -> NetworkProfile {
        NetworkProfile {
            burst_requests: burst,
            burst_window_secs: window_secs,
            ..crate::iiif::network::CAUTIOUS
        }
    }

    #[tokio::test]
    async fn nothing_waits_between_two_successful_requests() {
        // È la scelta di Scriptoria: i freni sono la concorrenza, la raffica e
        // il raffreddamento. Una pausa per richiesta, moltiplicata per i
        // tasselli di una schermata, rendeva il visore inservibile.
        let courtesy = Courtesy::new();
        let rhythm = profile(100, 60);

        let (first, _) = turn(&courtesy, "gallica.bnf.fr", &rhythm, Lane::Bulk).await;
        drop(first);
        let (_second, waited) = turn(&courtesy, "gallica.bnf.fr", &rhythm, Lane::Bulk).await;

        assert!(waited < Duration::from_millis(20), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn a_running_download_always_leaves_a_seat_to_the_viewer() {
        // Il criterio di accettazione: lo scaricamento in corso non deve
        // impedire di cambiare pagina.
        let courtesy = Courtesy::new();
        let rhythm = NetworkProfile {
            host_concurrency: 2,
            workers_per_job: 8,
            ..profile(1_000, 60)
        };

        let (_busy, _) = turn(&courtesy, "host", &rhythm, Lane::Bulk).await;
        let second_download = tokio::time::timeout(
            Duration::from_millis(80),
            turn(&courtesy, "host", &rhythm, Lane::Bulk),
        )
        .await;
        let viewer = tokio::time::timeout(
            Duration::from_millis(80),
            turn(&courtesy, "host", &rhythm, Lane::Interactive),
        )
        .await;

        assert!(second_download.is_err(), "il secondo scaricamento aspetta");
        assert!(viewer.is_ok(), "il visore deve passare comunque");
    }

    #[tokio::test]
    async fn the_two_classes_never_add_up_beyond_the_declared_ceiling() {
        let courtesy = Courtesy::new();
        let rhythm = NetworkProfile {
            host_concurrency: 2,
            workers_per_job: 1,
            ..profile(1_000, 60)
        };

        let (_downloading, _) = turn(&courtesy, "host", &rhythm, Lane::Bulk).await;
        let (_viewing, _) = turn(&courtesy, "host", &rhythm, Lane::Interactive).await;
        let third = tokio::time::timeout(
            Duration::from_millis(80),
            turn(&courtesy, "host", &rhythm, Lane::Interactive),
        )
        .await;

        assert!(third.is_err(), "i posti erano due, il terzo aspetta");
    }

    #[tokio::test]
    async fn the_burst_window_counts_the_viewer_too() {
        // Il visore non è traffico invisibile: se non entrasse nel conto, una
        // schermata a zoom pieno sfonderebbe il limite al minuto senza che
        // nessuno se ne accorga.
        let courtesy = Courtesy::new();
        let rhythm = profile(2, 1);

        let (a, _) = turn(&courtesy, "host", &rhythm, Lane::Interactive).await;
        drop(a);
        let (b, _) = turn(&courtesy, "host", &rhythm, Lane::Bulk).await;
        drop(b);
        let (_c, waited) = turn(&courtesy, "host", &rhythm, Lane::Interactive).await;

        assert!(
            waited >= Duration::from_millis(500),
            "la terza deve aspettare la finestra, ha atteso {waited:?}"
        );
    }

    #[tokio::test]
    async fn hosts_are_counted_separately() {
        // Un provider può servire ricerca e immagini da macchine diverse: la
        // finestra dell'una non deve fermare l'altra.
        let courtesy = Courtesy::new();
        let rhythm = profile(1, 60);

        let (first, _) = turn(&courtesy, "gallica.bnf.fr", &rhythm, Lane::Bulk).await;
        drop(first);
        let (_second, waited) = turn(&courtesy, "images.bnf.fr", &rhythm, Lane::Bulk).await;

        assert!(waited < Duration::from_millis(50), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn a_cooldown_stops_everyone_talking_to_that_host() {
        // Dopo un 403 non basta far aspettare il lavoro che l'ha preso: il
        // visore continuerebbe a bussare mentre lo scaricamento aspetta.
        let courtesy = Courtesy::new();
        let rhythm = profile(100, 60);
        courtesy.cool_down("host", &rhythm, 1).await;

        let downloading = tokio::time::timeout(
            Duration::from_millis(120),
            turn(&courtesy, "host", &rhythm, Lane::Bulk),
        )
        .await;
        let viewing = tokio::time::timeout(
            Duration::from_millis(120),
            turn(&courtesy, "host", &rhythm, Lane::Interactive),
        )
        .await;

        assert!(downloading.is_err(), "l'host è in raffreddamento");
        assert!(viewing.is_err(), "vale anche per il visore");
    }

    #[tokio::test]
    async fn the_cooldown_of_one_host_does_not_touch_the_others() {
        let courtesy = Courtesy::new();
        let rhythm = profile(100, 60);
        courtesy.cool_down("gallica.bnf.fr", &rhythm, 5).await;

        let (_turn, waited) = turn(&courtesy, "images.vatlib.it", &rhythm, Lane::Bulk).await;

        assert!(waited < Duration::from_millis(50), "atteso {waited:?}");
    }

    #[tokio::test]
    async fn a_job_that_is_being_stopped_does_not_serve_out_its_cooldown() {
        // Dopo un 403 su Gallica il raffreddamento è di dieci minuti: dormirlo
        // tutto renderebbe il lavoro sordo a pausa e annullamento, e terrebbe
        // occupato il posto in corsia per tutto il tempo.
        let courtesy = Courtesy::new();
        let rhythm = profile(100, 60);
        courtesy.cool_down("host", &rhythm, 600).await;

        let outcome = tokio::time::timeout(
            Duration::from_millis(500),
            courtesy.wait_turn(
                "host",
                &rhythm,
                Lane::Bulk,
                &signals(&|| true, &AtomicBool::new(false)),
            ),
        )
        .await;

        assert!(
            outcome.expect("non deve restare appeso").is_none(),
            "chi si sta fermando non aspetta il raffreddamento"
        );
    }

    #[test]
    fn an_expired_cooldown_lets_the_host_talk_again() {
        let rhythm = profile(100, 60);
        let mut timeline = Timeline {
            cooldown_until: Some(Instant::now() - Duration::from_secs(1)),
            ..Timeline::default()
        };

        assert!(next_delay(&mut timeline, &rhythm).is_none());
        assert!(timeline.cooldown_until.is_none(), "va dimenticato");
    }
}
