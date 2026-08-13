//! L'orchestratore: una coda sola, dentro l'applicazione (D10).
//!
//! Tiene i limiti per classe di risorsa (D11), porta pausa e annullamento ai
//! gestori in modo cooperativo (D14, D15), conta i tentativi e le attese (D16),
//! e alla riapertura rimette in ordine ciò che una chiusura brusca ha lasciato
//! a metà (D13).
//!
//! Non sa niente di rete, di immagini o di documenti: quello è il mestiere dei
//! gestori, che si registrano per tipo di lavoro. In questa PR l'unico gestore
//! è quello finto dei test.

use async_trait::async_trait;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
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
    /// Con quale limite compete (D11).
    fn resource_class(&self) -> ResourceClass;

    /// Cosa deve succedergli quando l'applicazione si riapre (D13).
    fn recovery(&self) -> Recovery;

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError>;
}

/// Quello che un gestore può fare mentre lavora: guardare se gli è stato
/// chiesto di fermarsi, dire a che punto è, salvare dove è arrivato.
pub struct JobContext {
    pub id: String,
    pub config: String,
    pub checkpoint: Option<String>,
    control: Arc<JobControl>,
    db_path: PathBuf,
    last_progress: Mutex<Option<Instant>>,
    observer: Observer,
    writes: DbWriteCoordinator,
    default_vault_root: PathBuf,
}

/// Distanza minima fra due scritture di avanzamento (D17): aggiornare a ogni
/// byte scriverebbe sul database centinaia di volte al secondo.
const PROGRESS_INTERVAL: Duration = Duration::from_secs(1);

impl JobContext {
    /// Da guardare al confine di ogni unità di lavoro — la pagina corrente, il
    /// file corrente. Pausa e annullamento sono cooperativi: niente si
    /// interrompe a metà (D14, D15).
    pub fn pause_requested(&self) -> bool {
        self.control.pause_requested()
    }

    pub fn cancel_requested(&self) -> bool {
        self.control.cancel_requested()
    }

    /// Avanzamento, messaggio e stima del tempo che manca — obbligatoria (D17).
    /// Le chiamate più fitte di un secondo vengono scartate, tranne quella che
    /// porta il lavoro a termine.
    pub async fn report_progress(
        &self,
        progress: f64,
        message: Option<&str>,
        eta_seconds: Option<i64>,
    ) {
        self.write_progress(progress, message, eta_seconds, None, progress >= 1.0)
            .await;
    }

    /// Fermo, ma non rotto: sta rispettando i limiti della biblioteca (D17,
    /// D18). L'interfaccia lo dice diversamente da un errore, e la barra non
    /// finge di avanzare.
    pub async fn report_waiting(&self, reason: &str, eta_seconds: Option<i64>) {
        let current = self.progress_now().await;
        self.write_progress(current, None, eta_seconds, Some(reason), true)
            .await;
    }

    async fn progress_now(&self) -> f64 {
        let _write_guard = self.writes.lock().await;
        open(&self.db_path)
            .ok()
            .and_then(|conn| store::get(&conn, &self.id).ok().flatten())
            .map(|job| job.progress)
            .unwrap_or(0.0)
    }

    async fn write_progress(
        &self,
        progress: f64,
        message: Option<&str>,
        eta_seconds: Option<i64>,
        waiting_reason: Option<&str>,
        force: bool,
    ) {
        if !force && !self.due_for_a_write() {
            return;
        }
        let _write_guard = self.writes.lock().await;
        let Ok(conn) = open(&self.db_path) else {
            return;
        };
        if store::save_progress(
            &conn,
            &self.id,
            progress,
            message,
            eta_seconds,
            waiting_reason,
        )
        .is_ok()
        {
            self.observer.notify(&conn, &self.id);
        }
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
        let conn = open(&self.db_path)?;
        work(&conn)
    }

    /// La radice del deposito: quella scelta dall'utente, se c'è, altrimenti
    /// quella predefinita risolta all'avvio (D1).
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

    /// A che punto è arrivato, per la ripresa (D13).
    pub async fn save_checkpoint(&self, checkpoint: &str) -> Result<(), String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        store::save_checkpoint(&conn, &self.id, checkpoint)
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

/// Connessione al database con le stesse impostazioni usate ovunque nell'app.
/// Esposta perché serve anche fuori dai lavori, per le scritture che il backend
/// fa da sé (per esempio la cartella del deposito scelta dal dialogo nativo).
pub fn open_database(path: &Path) -> Result<Connection, String> {
    open(path)
}

fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("DB open error: {e}"))?;
    conn.execute_batch(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; \
         PRAGMA busy_timeout=10000;",
    )
    .map_err(|e| format!("PRAGMA error: {e}"))?;
    Ok(conn)
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
        }
    }

    pub fn register(&mut self, job_type: &str, handler: Arc<dyn JobHandler>) {
        self.handlers.insert(job_type.to_string(), handler);
    }

    /// Legge i limiti dalle impostazioni (D11). `0` significa automatico.
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
            self.permits.insert(class, Arc::new(Semaphore::new(limit)));
        }
        Ok(())
    }

    pub fn connection(&self) -> Result<Connection, String> {
        open(&self.db_path)
    }

    /// Mette un lavoro in coda e sveglia l'orchestratore.
    pub async fn submit(&self, job: &NewJob) -> Result<JobRecord, String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        if !self.handlers.contains_key(&job.job_type) {
            return Err(format!("unknown job type: {}", job.job_type));
        }
        let record = store::create(&conn, job)?;
        self.observer.notify(&conn, &record.id);
        self.wake.notify_one();
        Ok(record)
    }

    /// Pausa (D14). Su un lavoro in esecuzione segna la richiesta e passa per
    /// `pausing`: il gestore si ferma al confine, non subito.
    pub async fn request_pause(&self, id: &str) -> Result<(), String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        let Some(job) = store::get(&conn, id)? else {
            return Err(format!("unknown job: {id}"));
        };
        match job.status {
            JobStatus::Running => {
                self.control_of(id).request_pause();
                store::set_status(&conn, id, JobStatus::Pausing)?;
            }
            JobStatus::Queued => {
                store::set_status(&conn, id, JobStatus::Paused)?;
            }
            _ => {}
        }
        self.observer.notify(&conn, id);
        Ok(())
    }

    /// Annullamento (D15). Cooperativo come la pausa; un lavoro annullato è
    /// terminale — si può ripetere da capo, non riprendere.
    pub async fn request_cancel(&self, id: &str) -> Result<(), String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        let Some(job) = store::get(&conn, id)? else {
            return Err(format!("unknown job: {id}"));
        };
        match job.status {
            JobStatus::Running | JobStatus::Pausing => {
                self.control_of(id).request_cancel();
                store::set_status(&conn, id, JobStatus::Cancelling)?;
            }
            status if !status.is_terminal() => {
                store::set_status(&conn, id, JobStatus::Cancelled)?;
            }
            _ => {}
        }
        self.observer.notify(&conn, id);
        Ok(())
    }

    /// Riprende un lavoro in pausa: riparte dal punto salvato, non da capo.
    pub async fn resume(&self, id: &str) -> Result<(), String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        store::requeue(&conn, id, false)?;
        self.observer.notify(&conn, id);
        self.wake.notify_one();
        Ok(())
    }

    /// Ritenta un lavoro fallito, su richiesta esplicita.
    pub async fn retry(&self, id: &str, from_scratch: bool) -> Result<(), String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        store::requeue(&conn, id, from_scratch)?;
        self.observer.notify(&conn, id);
        self.wake.notify_one();
        Ok(())
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

    /// Rimette in ordine ciò che una chiusura brusca ha lasciato a metà (D13).
    ///
    /// **Nessun lavoro riparte da solo**, con una sola eccezione a richiesta
    /// esplicita: gli scaricamenti, se l'impostazione è accesa.
    pub async fn recover_interrupted(&self) -> Result<usize, String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        let auto_resume = store::read_setting(&conn, "auto_resume_downloads")?
            .map(|value| value.trim() == "1")
            .unwrap_or(false);

        let interrupted = store::interrupted(&conn)?;
        let touched = interrupted.len();
        for job in interrupted {
            match job.status {
                // Chi stava annullando ha già deciso: si porta a termine.
                JobStatus::Cancelling => {
                    store::set_status(&conn, &job.id, JobStatus::Cancelled)?;
                }
                _ => match self.handlers.get(&job.job_type) {
                    // Tipo sconosciuto: non si butta e non si indovina.
                    None => store::park_as_paused(&conn, &job.id, false)?,
                    Some(handler) => match handler.recovery() {
                        Recovery::Resumable => {
                            let downloadable =
                                handler.resource_class() == ResourceClass::Network && auto_resume;
                            if downloadable {
                                store::requeue(&conn, &job.id, false)?;
                            } else {
                                store::park_as_paused(&conn, &job.id, false)?;
                            }
                        }
                        // Chi non sa riprendere va rifatto da capo, ma **non da
                        // solo**: rimetterlo in coda con l'orchestratore in moto
                        // lo farebbe ripartire al giro successivo, che è
                        // esattamente ciò che D13 esclude. Resta da parte, con il
                        // progresso azzerato perché non corrisponde più a niente,
                        // finché l'utente non lo rilancia.
                        Recovery::Restart => store::park_as_paused(&conn, &job.id, true)?,
                    },
                },
            }
            self.observer.notify(&conn, &job.id);
        }
        self.wake.notify_one();
        Ok(touched)
    }

    /// Un giro di coda: quanti lavori sono partiti.
    pub async fn tick(self: &Arc<Self>) -> Result<usize, String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        let ready = store::claimable(&conn)?;
        let mut started = 0;

        for job in ready {
            let Some(handler) = self.handlers.get(&job.job_type).cloned() else {
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
            if !store::set_status(&conn, &job.id, JobStatus::Running)? {
                continue;
            }
            store::increment_attempt(&conn, &job.id)?;
            self.observer.notify(&conn, &job.id);
            self.spawn(job, handler, permit);
            started += 1;
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
            control,
            db_path: self.db_path.clone(),
            last_progress: Mutex::new(None),
            observer: self.observer.clone(),
            writes: self.writes.clone(),
            default_vault_root: self.default_vault_root.clone(),
        };

        tokio::spawn(async move {
            let outcome = handler.run(context).await;
            let _permit = permit;
            if let Err(error) = engine.settle(&job, outcome).await {
                log::error!("job {}: {error}", job.id);
            }
            engine.forget_control(&job.id);
            engine.wake.notify_one();
        });
    }

    async fn settle(
        &self,
        job: &JobRecord,
        outcome: Result<Outcome, JobError>,
    ) -> Result<(), String> {
        let _write_guard = self.writes.lock().await;
        let conn = open(&self.db_path)?;
        match outcome {
            Ok(Outcome::Done) => {
                store::save_progress(&conn, &job.id, 1.0, None, Some(0), None)?;
                store::set_status(&conn, &job.id, JobStatus::Completed)?;
            }
            Ok(Outcome::Paused) => {
                store::set_status(&conn, &job.id, JobStatus::Paused)?;
            }
            Ok(Outcome::Cancelled) => {
                store::set_status(&conn, &job.id, JobStatus::Cancelled)?;
            }
            Err(error) => {
                // `attempt_count` è già stato incrementato alla partenza.
                let attempts = store::get(&conn, &job.id)?
                    .map(|current| current.attempt_count)
                    .unwrap_or(job.attempt_count + 1);
                let can_retry = error.kind.is_retryable() && attempts < job.max_attempts;
                if can_retry {
                    let wait = self.backoff.wait_for(&error, attempts);
                    store::schedule_retry(&conn, &job.id, &error, wait.as_secs() as i64)?;
                } else {
                    store::fail(&conn, &job.id, &error)?;
                }
            }
        }
        self.observer.notify(&conn, &job.id);
        Ok(())
    }

    /// Il giro continuo. Si sveglia da solo quando qualcosa cambia, e comunque
    /// ogni mezzo secondo, perché le attese fra i tentativi scadono da sole.
    pub async fn run_forever(self: Arc<Self>) {
        loop {
            if let Err(error) = self.tick().await {
                log::error!("jobs queue: {error}");
            }
            tokio::select! {
                _ = self.wake.notified() => {}
                _ = tokio::time::sleep(IDLE_TICK) => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jobs::store::NewJob;
    use crate::jobs::testing::{CounterJob, RestartOnlyJob};
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_db(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("glossa_jobs_{name}.db"));
        let _ = std::fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        for migration in [
            include_str!("../../migrations/0001_baseline_2_0.sql"),
            include_str!("../../migrations/0002_workspace_icon_key.sql"),
            include_str!("../../migrations/0003_vault_and_read_mode.sql"),
            include_str!("../../migrations/0004_jobs_runtime.sql"),
        ] {
            conn.execute_batch(migration).unwrap();
        }
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
        // CounterJob è di classe disco, che sta a 1 (D11).
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
        // D13: nessun lavoro riparte da solo alla riapertura.
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
        // L'altro ramo di D13: senza punti intermedi affidabili va rifatto da
        // capo — ma **non da solo**, altrimenti riaprire l'app farebbe
        // ripartire lavori che nessuno ha chiesto. Il progresso torna a zero
        // perché non corrisponde più a niente.
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
            },
        )
        .unwrap();
        store::set_status(&conn, "da-rifare", JobStatus::Running).unwrap();
        store::save_progress(&conn, "da-rifare", 0.7, None, None, None).unwrap();

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
            })
            .await;

        assert!(result.is_err());
    }
}
