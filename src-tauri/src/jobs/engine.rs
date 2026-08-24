//! L'orchestratore: una coda sola, dentro l'applicazione.
//!
//! Tiene i limiti per classe di risorsa, porta pausa e annullamento ai
//! gestori in modo cooperativo, conta i tentativi e le attese,
//! e alla riapertura rimette in ordine ciò che una chiusura brusca ha lasciato
//! a metà.
//!
//! Non sa niente di rete, di immagini o di documenti: quello è il mestiere dei
//! gestori, che si registrano per tipo di lavoro.
//!
//! ## I log della coda
//!
//! Una riga per evento, sempre nella stessa forma: `job <evento> id=… key=value`,
//! così una sola ricerca su `id=` ricostruisce la storia di un lavoro dal log.
//! I livelli sono scelti perché la build compilata resti leggibile:
//!
//! - `error`: il lavoro è finito male e serve una decisione — fallito, coda ferma;
//! - `warn`: è andato storto qualcosa che si rimedia da solo — tentativo
//!   rimandato, misura rifiutata dal servizio, punto non salvato, raffreddamento;
//! - `info`: il ciclo di vita — messo in coda, avviato, in pausa, ripreso,
//!   annullato, finito, recupero all'avvio, limiti letti;
//! - `debug`: il dettaglio per pagina e le attese di cortesia, che in produzione
//!   sarebbero centinaia di righe per libro.
//!
//! Il taglio fra `debug` e `info` è lo stesso che separa la build di sviluppo da
//! quella compilata (`lib.rs`): in sviluppo si vede tutto, nell'applicazione
//! installata restano ciclo di vita e problemi. `RUST_LOG` scavalca entrambi.

use async_trait::async_trait;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore};

use crate::db::DbWriteCoordinator;

use super::store::{self, NewJob};
use super::{
    BackoffProfile, JobControl, JobError, JobRecord, JobStatus, Outcome, Recovery, ResourceClass,
};

/// Ogni quanto l'orchestratore rilegge la coda quando nessuno lo sveglia. Le
/// creazioni e i cambi di stato lo svegliano subito: questo passo serve solo
/// alle attese fra un tentativo e l'altro, che scadono da sole.
const IDLE_TICK: Duration = Duration::from_millis(500);

/// Un tipo di lavoro. La logica lunga sta qui dentro, non nell'interfaccia.
#[async_trait]
pub trait JobHandler: Send + Sync {
    /// Con quale limite compete.
    fn resource_class(&self) -> ResourceClass;

    /// Cosa deve succedergli quando l'applicazione si riapre.
    fn recovery(&self) -> Recovery;

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError>;
}

/// Quello che un gestore può fare mentre lavora: guardare se gli è stato
/// chiesto di fermarsi, dire a che punto è, salvare dove è arrivato.
pub struct JobContext {
    pub id: String,
    pub config: String,
    pub checkpoint: Option<String>,
    /// Tentativo in corso, a partire da 1. Serve ai gestori che calcolano
    /// l'attesa prima del prossimo tentativo con i valori del loro profilo.
    pub attempt: u32,
    /// Quanti tentativi ha questo lavoro in tutto. Serve a sapere quando salire
    /// con l'errore non porta a nessuna ripresa.
    pub max_attempts: u32,
    control: Arc<JobControl>,
    db_path: PathBuf,
    last_progress: Mutex<Option<Instant>>,
    /// Vero mentre il lavoro è dichiarato fermo ad aspettare: la ripartenza va
    /// scritta subito, senza passare dal freno di un secondo.
    waiting: AtomicBool,
    observer: Observer,
    writes: DbWriteCoordinator,
    default_vault_root: PathBuf,
    /// Connessione tenuta aperta per la durata del lavoro.
    ///
    /// Un lavoro lungo scrive avanzamento a ogni unità, e ce ne sono centinaia:
    /// aprire ogni volta una connessione nuova significa centinaia di aperture e
    /// altrettante raffiche di PRAGMA, per un database che è sempre lo stesso
    /// file.
    database: tokio::sync::Mutex<Option<Connection>>,
}

/// Distanza minima fra due scritture di avanzamento: aggiornare a ogni
/// byte scriverebbe sul database centinaia di volte al secondo.
const PROGRESS_INTERVAL: Duration = Duration::from_secs(1);

impl JobContext {
    /// Da guardare al confine di ogni unità di lavoro — la pagina corrente, il
    /// file corrente. Pausa e annullamento sono cooperativi: niente si
    /// interrompe a metà.
    pub fn pause_requested(&self) -> bool {
        self.control.pause_requested()
    }

    pub fn cancel_requested(&self) -> bool {
        self.control.cancel_requested()
    }

    /// Avanzamento, messaggio e stima del tempo che manca — obbligatoria.
    /// Le chiamate più fitte di un secondo vengono scartate, tranne quella che
    /// porta il lavoro a termine e quella che lo fa ripartire da un'attesa.
    pub async fn report_progress(
        &self,
        progress: f64,
        message: Option<&str>,
        eta_seconds: Option<i64>,
    ) {
        self.report(progress, message, eta_seconds, None).await;
    }

    /// Come `report_progress`, con i **dettagli** che il tipo di lavoro sa dire:
    /// pagine fatte, byte arrivati e previsti, risoluzione chiesta, host. È JSON,
    /// e l'interfaccia mostra le chiavi che conosce.
    pub async fn report(
        &self,
        progress: f64,
        message: Option<&str>,
        eta_seconds: Option<i64>,
        detail: Option<&str>,
    ) {
        let was_waiting = self.waiting.swap(false, Ordering::SeqCst);
        self.write_progress(
            progress,
            message,
            eta_seconds,
            None,
            detail,
            was_waiting || progress >= 1.0,
        )
        .await;
    }

    /// Fermo per rispettare i limiti della biblioteca: non è un
    /// errore, ed è la stessa immobilità con il significato opposto — va detta
    /// diversamente, e la barra non deve fingere di avanzare.
    pub async fn report_waiting(
        &self,
        progress: f64,
        message: Option<&str>,
        eta_seconds: Option<i64>,
    ) {
        self.waiting.store(true, Ordering::SeqCst);
        self.write_progress(
            progress,
            message,
            eta_seconds,
            Some(super::WAITING_LIBRARY_LIMITS),
            None,
            true,
        )
        .await;
    }

    #[allow(clippy::too_many_arguments)]
    async fn write_progress(
        &self,
        progress: f64,
        message: Option<&str>,
        eta_seconds: Option<i64>,
        waiting_reason: Option<&str>,
        detail: Option<&str>,
        force: bool,
    ) {
        if !force && !self.due_for_a_write() {
            return;
        }
        let id = self.id.clone();
        let observer = self.observer.clone();
        let message = message.map(str::to_string);
        let waiting_reason = waiting_reason.map(str::to_string);
        let detail = detail.map(str::to_string);
        let _ = self
            .with_database(move |conn| {
                store::save_progress(
                    conn,
                    &id,
                    progress,
                    message.as_deref(),
                    eta_seconds,
                    waiting_reason.as_deref(),
                    detail.as_deref(),
                )?;
                observer.notify(conn, &id);
                Ok(())
            })
            .await;
    }

    fn due_for_a_write(&self) -> bool {
        let mut last = match self.last_progress.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        let now = Instant::now();
        match *last {
            Some(previous) if now.duration_since(previous) < PROGRESS_INTERVAL => false,
            _ => {
                *last = Some(now);
                true
            }
        }
    }

    /// Il database, con il lucchetto delle scritture già preso: i gestori
    /// scrivono le loro righe passando da qui, come tutto il resto dell'app.
    pub async fn with_database<T>(
        &self,
        work: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let _write_guard = self.writes.lock().await;
        let mut slot = self.database.lock().await;
        if slot.is_none() {
            *slot = Some(open(&self.db_path)?);
        }
        let conn = slot
            .as_ref()
            .ok_or_else(|| "connessione al database non disponibile".to_string())?;
        work(conn)
    }

    /// La radice del deposito: quella scelta dall'utente, se c'è, altrimenti
    /// quella predefinita risolta all'avvio.
    pub async fn vault_root(&self) -> Result<PathBuf, String> {
        let configured = self
            .with_database(|conn| store::read_setting(conn, "vault_root"))
            .await?;
        Ok(configured
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| self.default_vault_root.clone()))
    }

    /// Dichiara cosa sta facendo adesso (`manifest`, `downloading`, …).
    ///
    /// Va scritta quando **cambia**, non a ogni giro: è ciò che il pannello
    /// legge per dire momento per momento a che punto è il lavoro, e passa
    /// dritta senza il freno di un secondo che vale per l'avanzamento.
    pub async fn report_phase(&self, phase: &str) {
        log::debug!("job phase id={} phase={phase}", self.id);
        let id = self.id.clone();
        let phase = phase.to_string();
        let observer = self.observer.clone();
        let _ = self
            .with_database(move |conn| {
                store::save_phase(conn, &id, &phase)?;
                observer.notify(conn, &id);
                Ok(())
            })
            .await;
    }

    /// A che punto è arrivato, per la ripresa.
    pub async fn save_checkpoint(&self, checkpoint: &str) -> Result<(), String> {
        let id = self.id.clone();
        let checkpoint = checkpoint.to_string();
        self.with_database(move |conn| store::save_checkpoint(conn, &id, &checkpoint))
            .await
    }
}

/// Chi viene avvisato quando un lavoro cambia. In produzione è un evento verso
/// l'interfaccia; nei test è un raccoglitore.
#[derive(Clone)]
pub struct Observer(Arc<dyn Fn(JobRecord) + Send + Sync>);

impl Observer {
    pub fn new(sink: impl Fn(JobRecord) + Send + Sync + 'static) -> Self {
        Self(Arc::new(sink))
    }

    /// Nessuno da avvisare: serve ai test del motore.
    #[cfg(test)]
    pub fn silent() -> Self {
        Self(Arc::new(|_| {}))
    }

    fn notify(&self, conn: &Connection, id: &str) {
        if let Ok(Some(record)) = store::get(conn, id) {
            (self.0)(record);
        }
    }
}

fn open(path: &Path) -> Result<Connection, String> {
    crate::db::open_connection(path)
}

/// Il database dell'orchestratore, con il lucchetto delle scritture già preso.
/// Vive finché serve la connessione e la restituisce al posto suo.
struct DbGuard<'a> {
    _writes: tokio::sync::OwnedMutexGuard<()>,
    slot: tokio::sync::MutexGuard<'a, Option<Connection>>,
}

impl DbGuard<'_> {
    fn conn(&self) -> Result<&Connection, String> {
        self.slot
            .as_ref()
            .ok_or_else(|| "connessione al database non disponibile".to_string())
    }
}

pub struct JobEngine {
    handlers: HashMap<String, Arc<dyn JobHandler>>,
    /// Radice del deposito quando nessuno ne ha scelta una: risolta una volta
    /// all'avvio, perché richiede l'handle dell'applicazione.
    default_vault_root: PathBuf,
    permits: HashMap<ResourceClass, Arc<Semaphore>>,
    controls: Mutex<HashMap<String, Arc<JobControl>>>,
    db_path: PathBuf,
    observer: Observer,
    writes: DbWriteCoordinator,
    backoff: BackoffProfile,
    wake: Notify,
    /// Connessione riusata da tutti i giri della coda: il giro parte ogni mezzo
    /// secondo, e riaprire il database ogni volta significa due aperture al
    /// secondo per tutta la durata della sessione.
    database: tokio::sync::Mutex<Option<Connection>>,
}

impl JobEngine {
    pub fn new(
        db_path: PathBuf,
        observer: Observer,
        writes: DbWriteCoordinator,
        default_vault_root: PathBuf,
    ) -> Self {
        Self {
            handlers: HashMap::new(),
            default_vault_root,
            permits: HashMap::new(),
            controls: Mutex::new(HashMap::new()),
            db_path,
            observer,
            writes,
            backoff: BackoffProfile::default(),
            wake: Notify::new(),
            database: tokio::sync::Mutex::new(None),
        }
    }

    async fn db_guard(&self) -> Result<DbGuard<'_>, String> {
        let writes = self.writes.lock().await;
        let mut slot = self.database.lock().await;
        if slot.is_none() {
            *slot = Some(open(&self.db_path)?);
        }
        Ok(DbGuard {
            _writes: writes,
            slot,
        })
    }

    pub fn register(&mut self, job_type: &str, handler: Arc<dyn JobHandler>) {
        self.handlers.insert(job_type.to_string(), handler);
    }

    /// Legge i limiti dalle impostazioni. `0` significa automatico.
    pub fn load_limits(&mut self) -> Result<(), String> {
        let conn = open(&self.db_path)?;
        for class in ResourceClass::ALL {
            let configured = store::read_setting(&conn, class.setting_key())?
                .and_then(|value| value.trim().parse::<usize>().ok())
                .unwrap_or(0);
            let limit = if configured == 0 {
                class.automatic_limit()
            } else {
                configured
            };
            log::info!(
                "queue limit lane={class:?} value={limit} source={}",
                if configured == 0 {
                    "automatico"
                } else {
                    "impostazione"
                }
            );
            self.permits.insert(class, Arc::new(Semaphore::new(limit)));
        }
        Ok(())
    }

    pub fn connection(&self) -> Result<Connection, String> {
        open(&self.db_path)
    }

    /// Mette un lavoro in coda e sveglia l'orchestratore.
    pub async fn submit(&self, job: &NewJob) -> Result<JobRecord, String> {
        let guard = self.db_guard().await?;
        let conn = guard.conn()?;
        if !self.handlers.contains_key(&job.job_type) {
            return Err(format!("unknown job type: {}", job.job_type));
        }
        let record = store::create(conn, job)?;
        log::info!(
            "job submitted id={} type={} priority={} attempts={}",
            record.id,
            record.job_type,
            record.priority,
            record.max_attempts
        );
        self.observer.notify(conn, &record.id);
        self.wake.notify_one();
        Ok(record)
    }

    /// Pausa. Su un lavoro in esecuzione segna la richiesta e passa per
    /// `pausing`: il gestore si ferma al confine, non subito.
    pub async fn request_pause(&self, id: &str) -> Result<(), String> {
        let guard = self.db_guard().await?;
        let conn = guard.conn()?;
        let Some(job) = store::get(conn, id)? else {
            return Err(format!("unknown job: {id}"));
        };
        match job.status {
            JobStatus::Running => {
                log::info!("job pause requested id={id}");
                self.control_of(id).request_pause();
                store::set_status(conn, id, JobStatus::Pausing)?;
            }
            JobStatus::Queued => {
                store::set_status(conn, id, JobStatus::Paused)?;
            }
            _ => {}
        }
        self.observer.notify(conn, id);
        Ok(())
    }

    /// Annullamento. Cooperativo come la pausa; un lavoro annullato è
    /// terminale — si può ripetere da capo, non riprendere.
    pub async fn request_cancel(&self, id: &str) -> Result<(), String> {
        let guard = self.db_guard().await?;
        let conn = guard.conn()?;
        let Some(job) = store::get(conn, id)? else {
            return Err(format!("unknown job: {id}"));
        };
        match job.status {
            JobStatus::Running | JobStatus::Pausing => {
                log::info!("job cancel requested id={id}");
                self.control_of(id).request_cancel();
                store::set_status(conn, id, JobStatus::Cancelling)?;
            }
            status if !status.is_terminal() => {
                store::set_status(conn, id, JobStatus::Cancelled)?;
            }
            _ => {}
        }
        self.observer.notify(conn, id);
        Ok(())
    }

    /// Riprende un lavoro in pausa: riparte dal punto salvato, non da capo.
    pub async fn resume(&self, id: &str) -> Result<(), String> {
        let guard = self.db_guard().await?;
        let conn = guard.conn()?;
        log::info!("job resumed id={id}");
        store::requeue(conn, id, false)?;
        // Riprendere non è ritentare: il conto dei tentativi ricomincia.
        store::reset_attempts(conn, id)?;
        self.observer.notify(conn, id);
        self.wake.notify_one();
        Ok(())
    }

    /// Ritenta un lavoro fallito, su richiesta esplicita.
    pub async fn retry(&self, id: &str, from_scratch: bool) -> Result<(), String> {
        let guard = self.db_guard().await?;
        let conn = guard.conn()?;
        log::info!("job relaunched id={id} from_scratch={from_scratch}");
        store::requeue(conn, id, from_scratch)?;
        // Un rilancio chiesto dall'utente riparte con tutti i tentativi a
        // disposizione: senza, un lavoro fallito ne aveva zero e il primo
        // errore di rete lo ributtava subito fra i falliti.
        store::reset_attempts(conn, id)?;
        self.observer.notify(conn, id);
        self.wake.notify_one();
        Ok(())
    }

    /// Toglie dall'elenco i lavori già finiti.
    pub async fn forget_finished(&self, id: Option<&str>) -> Result<usize, String> {
        let guard = self.db_guard().await?;
        store::forget_finished(guard.conn()?, id)
    }

    fn control_of(&self, id: &str) -> Arc<JobControl> {
        let mut controls = match self.controls.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        Arc::clone(
            controls
                .entry(id.to_string())
                .or_insert_with(|| Arc::new(JobControl::default())),
        )
    }

    fn forget_control(&self, id: &str) {
        let mut controls = match self.controls.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        controls.remove(id);
    }

    /// Rimette in ordine ciò che una chiusura brusca ha lasciato a metà.
    ///
    /// **Nessun lavoro riparte da solo**, con una sola eccezione a richiesta
    /// esplicita: gli scaricamenti, se l'impostazione è accesa.
    #[allow(clippy::doc_overindented_list_items)]
    pub async fn recover_interrupted(&self) -> Result<usize, String> {
        let guard = self.db_guard().await?;
        let conn = guard.conn()?;
        let auto_resume = store::read_setting(conn, "auto_resume_downloads")?
            .map(|value| value.trim() == "1")
            .unwrap_or(false);

        let interrupted = store::interrupted(conn)?;
        let touched = interrupted.len();
        let (mut requeued, mut parked, mut cancelled) = (0, 0, 0);
        for job in interrupted {
            log::debug!(
                "job recovering id={} type={} status={:?}",
                job.id,
                job.job_type,
                job.status
            );
            match job.status {
                // Chi stava annullando ha già deciso: si porta a termine.
                JobStatus::Cancelling => {
                    store::set_status(conn, &job.id, JobStatus::Cancelled)?;
                    cancelled += 1;
                }
                _ => match self.handlers.get(&job.job_type) {
                    // Tipo sconosciuto: non si butta e non si indovina.
                    None => {
                        log::warn!(
                            "job orphaned id={} type={} (nessun gestore, messo da parte)",
                            job.id,
                            job.job_type
                        );
                        parked += 1;
                        store::park_as_paused(conn, &job.id, false)?
                    }
                    Some(handler) => match handler.recovery() {
                        Recovery::Resumable => {
                            let downloadable =
                                handler.resource_class() == ResourceClass::Network && auto_resume;
                            if downloadable {
                                requeued += 1;
                                store::requeue(conn, &job.id, false)?;
                            } else {
                                parked += 1;
                                store::park_as_paused(conn, &job.id, false)?;
                            }
                        }
                        // I lavori non ripristinabili attendono un riavvio manuale.
                        Recovery::Restart => {
                            parked += 1;
                            store::park_as_paused(conn, &job.id, true)?
                        }
                    },
                },
            }
            self.observer.notify(conn, &job.id);
        }
        if touched > 0 {
            log::info!(
                "queue recovered interrupted={touched} requeued={requeued} parked={parked} cancelled={cancelled}"
            );
        }
        self.wake.notify_one();
        Ok(touched)
    }

    /// Un giro di coda: quanti lavori sono partiti.
    pub async fn tick(self: &Arc<Self>) -> Result<usize, String> {
        // Il lucchetto delle scritture si tiene solo per decidere **chi parte**.
        // I gestori, appena avviati, scrivono anche loro: tenerlo aperto fino a
        // dopo l'avvio significherebbe far aspettare ogni lavoro nuovo dietro a
        // quelli del giro in corso.
        let mut starting = Vec::new();
        {
            let guard = self.db_guard().await?;
            let conn = guard.conn()?;
            for job in store::claimable(conn)? {
                let Some(handler) = self.handlers.get(&job.job_type).cloned() else {
                    log::warn!("job unknown type id={} type={}", job.id, job.job_type);
                    continue;
                };
                let Some(semaphore) = self.permits.get(&handler.resource_class()).cloned() else {
                    continue;
                };
                let Ok(permit) = semaphore.try_acquire_owned() else {
                    // Corsia piena: il lavoro resta in coda e riproverà al giro
                    // successivo. Non si toglie dalla coda ciò che non parte.
                    continue;
                };
                if !store::set_status(conn, &job.id, JobStatus::Running)? {
                    continue;
                }
                store::increment_attempt(conn, &job.id)?;
                // La registrazione è **parte del contratto del motore**, non di
                // chi scrive un gestore: ogni lavoro registra avvio ed
                // esito senza che nessuno debba ricordarsene.
                record_fact(
                    conn,
                    &crate::provenance::Event::for_job(
                        crate::provenance::event_type::JOB_STARTED,
                        &job.id,
                        &job.job_type,
                        job.workspace_id.as_deref(),
                    ),
                );
                self.observer.notify(conn, &job.id);
                starting.push((job, handler, permit));
            }
        }

        let started = starting.len();
        for (job, handler, permit) in starting {
            log::info!(
                "job started id={} type={} attempt={}/{} lane={:?}",
                job.id,
                job.job_type,
                job.attempt_count + 1,
                job.max_attempts,
                handler.resource_class()
            );
            self.spawn(job, handler, permit);
        }
        Ok(started)
    }

    fn spawn(
        self: &Arc<Self>,
        job: JobRecord,
        handler: Arc<dyn JobHandler>,
        permit: OwnedSemaphorePermit,
    ) {
        let engine = Arc::clone(self);
        let control = self.control_of(&job.id);
        let context = JobContext {
            id: job.id.clone(),
            config: job.config.clone(),
            checkpoint: job.checkpoint.clone(),
            // `attempt_count` è stato incrementato alla partenza, sul record
            // che qui è ancora quello letto prima.
            attempt: job.attempt_count + 1,
            max_attempts: job.max_attempts,
            control,
            db_path: self.db_path.clone(),
            last_progress: Mutex::new(None),
            waiting: AtomicBool::new(false),
            observer: self.observer.clone(),
            writes: self.writes.clone(),
            default_vault_root: self.default_vault_root.clone(),
            database: tokio::sync::Mutex::new(None),
        };

        tokio::spawn(async move {
            let started = Instant::now();
            let outcome = handler.run(context).await;
            let _permit = permit;
            if let Err(error) = engine.settle(&job, outcome, started.elapsed()).await {
                log::error!("job settle failed id={} error={error}", job.id);
            }
            engine.forget_control(&job.id);
            engine.wake.notify_one();
        });
    }

    /// `elapsed` è quanto è durata **questa** esecuzione. Non si ricava dagli
    /// orari della tabella: `started_at` segna il primo avvio e non si azzera
    /// più, quindi su un lavoro messo in pausa la sera e ripreso la mattina
    /// dichiarava dodici ore di lavoro dove ce n'erano quaranta minuti.
    async fn settle(
        &self,
        job: &JobRecord,
        outcome: Result<Outcome, JobError>,
        elapsed: Duration,
    ) -> Result<(), String> {
        let guard = self.db_guard().await?;
        let conn = guard.conn()?;
        // Il progresso raggiunto vale quanto l'esito: è la prima cosa che si
        // vuole sapere leggendo il log di un lavoro finito male.
        let reached = store::get(conn, &job.id)?;
        let at = reached
            .as_ref()
            .map(|current| format!("{:.0}%", current.progress * 100.0))
            .unwrap_or_else(|| "?".to_string());

        // Cosa ha chiesto l'utente mentre il lavoro finiva. Si guarda una
        // volta sola: la pausa e l'annullamento battono il nuovo tentativo.
        let control = self.control_of(&job.id);
        let stop_asked = if control.cancel_requested() {
            Some(StopAsked::Cancel)
        } else if control.pause_requested() {
            Some(StopAsked::Pause)
        } else {
            None
        };

        // Come è andata, deciso **prima** del `match` che consuma l'esito.
        // `None` significa che il lavoro non è arrivato a un capolinea: una
        // pausa e un tentativo rimandato non sono la fine di niente, e il
        // fatto dell'avvio è già scritto.
        let reached_the_end: Option<(&'static str, Option<String>)> = match (&outcome, stop_asked) {
            (Ok(Outcome::Done), _) => Some(("completed", None)),
            (Ok(Outcome::Cancelled), _) | (Err(_), Some(StopAsked::Cancel)) => {
                Some(("cancelled", None))
            }
            (Ok(Outcome::Paused), _) | (Err(_), Some(StopAsked::Pause)) => None,
            (Err(error), None) => {
                let attempts = reached
                    .as_ref()
                    .map(|current| current.attempt_count)
                    .unwrap_or(job.attempt_count + 1);
                let will_retry = error.kind.is_retryable() && attempts < job.max_attempts;
                (!will_retry).then(|| ("error", Some(error.kind.as_str().to_string())))
            }
        };

        match outcome {
            Ok(Outcome::Done) => {
                store::save_progress(conn, &job.id, 1.0, None, Some(0), None, None)?;
                store::set_status(conn, &job.id, JobStatus::Completed)?;
                log::info!("job finished id={} type={}", job.id, job.job_type);
            }
            Ok(Outcome::Paused) => {
                store::set_status(conn, &job.id, JobStatus::Paused)?;
                log::info!("job paused id={} at={at}", job.id);
            }
            Ok(Outcome::Cancelled) => {
                store::set_status(conn, &job.id, JobStatus::Cancelled)?;
                log::info!("job cancelled id={} at={at}", job.id);
            }
            Err(ref error) => {
                // `attempt_count` è già stato incrementato alla partenza.
                let attempts = reached
                    .map(|current| current.attempt_count)
                    .unwrap_or(job.attempt_count + 1);
                let can_retry = stop_asked.is_none()
                    && error.kind.is_retryable()
                    && attempts < job.max_attempts;
                if let Some(asked) = stop_asked {
                    // **Chi ha chiesto di fermarsi ha ragione anche quando la
                    // richiesta era già fallita**: un errore incassato
                    // mentre l'utente premeva pausa faceva programmare un
                    // nuovo tentativo, e il lavoro ripartiva da solo dopo
                    // qualche minuto. In pausa non si riprova.
                    match asked {
                        StopAsked::Cancel => {
                            store::set_status(conn, &job.id, JobStatus::Cancelled)?;
                            log::info!("job cancelled while failing id={} at={at}", job.id);
                        }
                        StopAsked::Pause => {
                            store::park_as_paused(conn, &job.id, false)?;
                            log::info!(
                                "job paused while failing id={} at={at} error={}",
                                job.id,
                                error.message
                            );
                        }
                    }
                } else if can_retry {
                    let wait = self.backoff.wait_for(error, attempts);
                    log::warn!(
                        "job retry id={} attempt={}/{} kind={} wait={}s at={at} error={}",
                        job.id,
                        attempts,
                        job.max_attempts,
                        error.kind.as_str(),
                        wait.as_secs(),
                        error.message
                    );
                    store::schedule_retry(conn, &job.id, error, wait.as_secs() as i64)?;
                } else {
                    log::error!(
                        "job failed id={} attempts={}/{} kind={} at={at} error={}",
                        job.id,
                        attempts,
                        job.max_attempts,
                        error.kind.as_str(),
                        error.message
                    );
                    store::fail(conn, &job.id, error)?;
                }
            }
        }
        if let Some((result, error_kind)) = reached_the_end {
            let mut fact = crate::provenance::Event::for_job(
                crate::provenance::event_type::JOB_FINISHED,
                &job.id,
                &job.job_type,
                job.workspace_id.as_deref(),
            );
            fact.outcome = Some(result.to_string());
            fact.error_kind = error_kind;
            fact.duration_ms = Some(elapsed.as_millis() as i64);
            record_fact(conn, &fact);
        }
        self.observer.notify(conn, &job.id);
        Ok(())
    }

    /// Il giro continuo. Si sveglia da solo quando qualcosa cambia, e comunque
    /// ogni mezzo secondo, perché le attese fra i tentativi scadono da sole.
    pub async fn run_forever(self: Arc<Self>) {
        loop {
            if let Err(error) = self.tick().await {
                log::error!("queue tick failed error={error}");
            }
            tokio::select! {
                _ = self.wake.notified() => {}
                _ = tokio::time::sleep(IDLE_TICK) => {}
            }
        }
    }
}

/// Cosa ha chiesto l'utente mentre il lavoro stava finendo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StopAsked {
    Pause,
    Cancel,
}

/// Scrive un fatto nel registro.
///
/// Un errore qui **non cambia l'esito del lavoro**: la registrazione serve a
/// sapere cosa è successo, non a decidere cosa succede. Si dice nel log tecnico
/// e si va avanti.
fn record_fact(conn: &Connection, event: &crate::provenance::Event) {
    if let Err(error) = crate::provenance::record(conn, event) {
        log::warn!("job fact not recorded id={} error={error}", event.entity_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jobs::store::NewJob;
    use crate::jobs::testing::{CounterJob, RestartOnlyJob};
    use crate::jobs::ErrorKind;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_db(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("glossa_jobs_{name}.db"));
        let _ = std::fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))
            .unwrap();
        path
    }

    fn engine_with(path: PathBuf, observer: Observer) -> Arc<JobEngine> {
        let mut engine = JobEngine::new(
            path,
            observer,
            DbWriteCoordinator::default(),
            std::env::temp_dir().join("glossa_vault_tests"),
        );
        engine.register("debug_counter", Arc::new(CounterJob));
        engine.register("debug_restart_only", Arc::new(RestartOnlyJob));
        engine.load_limits().expect("limits");
        Arc::new(engine)
    }

    fn job(id: &str, config: &str) -> NewJob {
        NewJob {
            id: id.to_string(),
            job_type: "debug_counter".to_string(),
            priority: 0,
            config: config.to_string(),
            max_attempts: 3,
            depends_on_job_id: None,
            workspace_id: None,
            message: None,
        }
    }

    async fn settle(engine: &Arc<JobEngine>) {
        for _ in 0..200 {
            engine.tick().await.unwrap();
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    #[tokio::test]
    async fn a_queued_job_runs_and_completes() {
        let path = temp_db("completes");
        let engine = engine_with(path, Observer::silent());
        engine.submit(&job("j1", r#"{"steps":3}"#)).await.unwrap();

        settle(&engine).await;

        let conn = engine.connection().unwrap();
        let record = store::get(&conn, "j1").unwrap().unwrap();
        assert_eq!(record.status, JobStatus::Completed);
        assert_eq!(record.progress, 1.0);
    }

    #[tokio::test]
    async fn a_job_paused_while_failing_does_not_retry_on_its_own() {
        // Chi mette in pausa ha ragione anche quando la richiesta era già
        // fallita: prima il lavoro si programmava un nuovo tentativo e
        // ripartiva da solo dopo qualche minuto.
        let path = temp_db("pause_beats_retry");
        let engine = engine_with(path, Observer::silent());
        let record = engine
            .submit(&job("j-pause-fail", r#"{"steps":50,"stepMs":5}"#))
            .await
            .unwrap();

        // Il lavoro incassa un errore ritentabile mentre l'utente ha già
        // chiesto la pausa.
        engine.control_of("j-pause-fail").request_pause();
        engine
            .settle(
                &record,
                Err(JobError::new(
                    ErrorKind::Transport,
                    "connessione caduta".to_string(),
                )),
                Duration::from_millis(5),
            )
            .await
            .unwrap();

        let conn = engine.connection().unwrap();
        let record = store::get(&conn, "j-pause-fail").unwrap().unwrap();
        assert_eq!(record.status, JobStatus::Paused);
        assert!(
            record.next_attempt_at.is_none(),
            "nessun tentativo in programma: {:?}",
            record.next_attempt_at
        );
    }

    #[tokio::test]
    async fn a_finished_job_leaves_two_facts_in_the_register() {
        // La registrazione è parte del contratto del motore, non del gestore
        // un lavoro che nessuno ha istruito a registrare registra lo
        // stesso avvio ed esito.
        let path = temp_db("facts");
        let engine = engine_with(path, Observer::silent());
        engine
            .submit(&job("j-facts", r#"{"steps":2}"#))
            .await
            .unwrap();

        settle(&engine).await;

        let conn = engine.connection().unwrap();
        let facts: Vec<(String, Option<String>)> = conn
            .prepare("SELECT event_type, outcome FROM provenance_events WHERE job_id = ?1 ORDER BY event_type")
            .unwrap()
            .query_map(["j-facts"], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .map(Result::unwrap)
            .collect();

        assert_eq!(
            facts,
            vec![
                ("job.finished".to_string(), Some("completed".to_string())),
                ("job.started".to_string(), None),
            ]
        );
    }

    #[tokio::test]
    async fn a_job_run_twice_does_not_duplicate_its_facts() {
        // Rilanciare un lavoro riesegue lo stesso passo: senza identificativo
        // derivato, ogni conteggio finirebbe doppio.
        let path = temp_db("facts_once");
        let engine = engine_with(path, Observer::silent());
        engine
            .submit(&job("j-once", r#"{"steps":1}"#))
            .await
            .unwrap();
        settle(&engine).await;

        engine.retry("j-once", true).await.unwrap();
        settle(&engine).await;

        let conn = engine.connection().unwrap();
        let facts: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM provenance_events WHERE job_id = ?1",
                ["j-once"],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(facts, 2, "avvio ed esito, non quattro righe");
    }

    #[tokio::test]
    async fn the_interface_is_told_every_time_something_changes() {
        let path = temp_db("observer");
        let seen = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&seen);
        let engine = engine_with(
            path,
            Observer::new(move |_| {
                counter.fetch_add(1, Ordering::SeqCst);
            }),
        );

        engine.submit(&job("j2", r#"{"steps":2}"#)).await.unwrap();
        settle(&engine).await;

        assert!(
            seen.load(Ordering::SeqCst) >= 3,
            "creazione, partenza e fine sono almeno tre avvisi"
        );
    }

    #[tokio::test]
    async fn a_paused_job_stops_at_the_boundary_and_keeps_its_place() {
        let path = temp_db("pause");
        let engine = engine_with(path, Observer::silent());
        engine
            .submit(&job("j3", r#"{"steps":50,"stepMs":5}"#))
            .await
            .unwrap();
        engine.tick().await.unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;

        engine.request_pause("j3").await.unwrap();
        settle(&engine).await;

        let conn = engine.connection().unwrap();
        let record = store::get(&conn, "j3").unwrap().unwrap();
        assert_eq!(record.status, JobStatus::Paused);
        assert!(record.checkpoint.is_some(), "deve sapere dove era arrivato");
        assert!(record.progress > 0.0 && record.progress < 1.0);
    }

    #[tokio::test]
    async fn a_resumed_job_starts_again_from_its_checkpoint() {
        let path = temp_db("resume");
        let engine = engine_with(path, Observer::silent());
        engine
            .submit(&job("j4", r#"{"steps":40,"stepMs":5}"#))
            .await
            .unwrap();
        engine.tick().await.unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        engine.request_pause("j4").await.unwrap();
        settle(&engine).await;

        let conn = engine.connection().unwrap();
        let stopped_at = store::get(&conn, "j4").unwrap().unwrap().progress;
        engine.resume("j4").await.unwrap();
        settle(&engine).await;

        let record = store::get(&conn, "j4").unwrap().unwrap();
        assert_eq!(record.status, JobStatus::Completed);
        assert!(stopped_at > 0.0, "si era davvero fermato a metà");
    }

    #[tokio::test]
    async fn a_cancelled_job_is_terminal() {
        let path = temp_db("cancel");
        let engine = engine_with(path, Observer::silent());
        engine
            .submit(&job("j5", r#"{"steps":50,"stepMs":5}"#))
            .await
            .unwrap();
        engine.tick().await.unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;

        engine.request_cancel("j5").await.unwrap();
        settle(&engine).await;

        let conn = engine.connection().unwrap();
        let record = store::get(&conn, "j5").unwrap().unwrap();
        assert_eq!(record.status, JobStatus::Cancelled);
        assert!(record.status.is_terminal());
    }

    #[tokio::test]
    async fn a_temporary_failure_is_retried_after_a_wait() {
        let path = temp_db("retry");
        let engine = engine_with(path, Observer::silent());
        engine
            .submit(&job("j6", r#"{"steps":1,"failWith":"transport"}"#))
            .await
            .unwrap();

        engine.tick().await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;

        let conn = engine.connection().unwrap();
        let record = store::get(&conn, "j6").unwrap().unwrap();
        assert_eq!(
            record.status,
            JobStatus::Queued,
            "fermo in attesa, non fallito"
        );
        assert_eq!(record.error_kind.as_deref(), Some("transport"));
        assert!(record.next_attempt_at.is_some());
        assert!(
            store::claimable(&conn).unwrap().is_empty(),
            "non riparte subito"
        );
    }

    #[tokio::test]
    async fn what_cannot_be_retried_fails_at_the_first_attempt() {
        let path = temp_db("fail");
        let engine = engine_with(path, Observer::silent());
        engine
            .submit(&job("j7", r#"{"steps":1,"failWith":"notFound"}"#))
            .await
            .unwrap();

        engine.tick().await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;

        let conn = engine.connection().unwrap();
        let record = store::get(&conn, "j7").unwrap().unwrap();
        assert_eq!(record.status, JobStatus::Error);
        assert_eq!(record.attempt_count, 1, "non si insiste su un 404");
    }

    #[tokio::test]
    async fn only_one_job_per_lane_when_the_lane_allows_one() {
        let path = temp_db("lane");
        let engine = engine_with(path, Observer::silent());
        // CounterJob è di classe disco, che sta a 1.
        engine
            .submit(&job("a", r#"{"steps":30,"stepMs":5}"#))
            .await
            .unwrap();
        engine
            .submit(&job("b", r#"{"steps":30,"stepMs":5}"#))
            .await
            .unwrap();

        let started = engine.tick().await.unwrap();

        assert_eq!(started, 1, "la seconda resta in coda");
        let conn = engine.connection().unwrap();
        assert_eq!(
            store::get(&conn, "b").unwrap().unwrap().status,
            JobStatus::Queued
        );
    }

    #[tokio::test]
    async fn an_interrupted_job_comes_back_paused_not_running() {
        let path = temp_db("recovery");
        let engine = engine_with(path.clone(), Observer::silent());
        engine.submit(&job("j8", r#"{"steps":10}"#)).await.unwrap();
        let conn = engine.connection().unwrap();
        store::set_status(&conn, "j8", JobStatus::Running).unwrap();

        let touched = engine.recover_interrupted().await.unwrap();

        assert_eq!(touched, 1);
        assert_eq!(
            store::get(&conn, "j8").unwrap().unwrap().status,
            JobStatus::Paused
        );
    }

    #[tokio::test]
    async fn a_job_left_mid_cancellation_finishes_cancelling() {
        let path = temp_db("recovery_cancel");
        let engine = engine_with(path, Observer::silent());
        engine.submit(&job("j9", r#"{"steps":10}"#)).await.unwrap();
        let conn = engine.connection().unwrap();
        store::set_status(&conn, "j9", JobStatus::Running).unwrap();
        store::set_status(&conn, "j9", JobStatus::Cancelling).unwrap();

        engine.recover_interrupted().await.unwrap();

        assert_eq!(
            store::get(&conn, "j9").unwrap().unwrap().status,
            JobStatus::Cancelled
        );
    }

    #[tokio::test]
    async fn a_job_that_cannot_resume_waits_for_the_user_with_no_progress() {
        let path = temp_db("recovery_restart");
        let engine = engine_with(path, Observer::silent());
        let conn = engine.connection().unwrap();
        store::create(
            &conn,
            &NewJob {
                id: "da-rifare".to_string(),
                job_type: "debug_restart_only".to_string(),
                priority: 0,
                config: "{}".to_string(),
                max_attempts: 3,
                depends_on_job_id: None,
                workspace_id: None,
                message: None,
            },
        )
        .unwrap();
        store::set_status(&conn, "da-rifare", JobStatus::Running).unwrap();
        store::save_progress(&conn, "da-rifare", 0.7, None, None, None, None).unwrap();

        engine.recover_interrupted().await.unwrap();

        let record = store::get(&conn, "da-rifare").unwrap().unwrap();
        assert_eq!(record.status, JobStatus::Paused, "aspetta l'utente");
        assert_eq!(record.progress, 0.0);
        assert!(
            store::claimable(&conn).unwrap().is_empty(),
            "e non deve essere ripescato dal giro della coda"
        );
    }

    #[tokio::test]
    async fn a_job_of_an_unknown_type_is_parked_instead_of_being_lost() {
        let path = temp_db("unknown");
        let engine = engine_with(path, Observer::silent());
        let conn = engine.connection().unwrap();
        store::create(
            &conn,
            &NewJob {
                id: "orfano".to_string(),
                job_type: "scaricamento".to_string(),
                priority: 0,
                config: "{}".to_string(),
                max_attempts: 3,
                depends_on_job_id: None,
                workspace_id: None,
                message: None,
            },
        )
        .unwrap();
        store::set_status(&conn, "orfano", JobStatus::Running).unwrap();

        engine.recover_interrupted().await.unwrap();

        assert_eq!(
            store::get(&conn, "orfano").unwrap().unwrap().status,
            JobStatus::Paused
        );
    }

    #[tokio::test]
    async fn an_unknown_job_type_cannot_be_queued() {
        let path = temp_db("unknown_submit");
        let engine = engine_with(path, Observer::silent());

        let result = engine
            .submit(&NewJob {
                id: "x".to_string(),
                job_type: "inventato".to_string(),
                priority: 0,
                config: "{}".to_string(),
                max_attempts: 1,
                depends_on_job_id: None,
                workspace_id: None,
                message: None,
            })
            .await;

        assert!(result.is_err());
    }
}
