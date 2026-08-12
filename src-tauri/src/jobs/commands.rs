//! Comandi Tauri dei lavori.
//!
//! Sottili di proposito: l'interfaccia crea un lavoro e lo osserva, non esegue
//! niente di lungo (D10). Tutta la logica sta nell'orchestratore.

use std::sync::Arc;
use tauri::{Emitter, Manager, State};

use super::engine::{JobEngine, Observer};
use super::store::{self, NewJob};
use super::JobRecord;

/// Nome dell'evento con cui l'orchestratore avvisa l'interfaccia. Un evento per
/// ogni cambio: l'interfaccia non interroga il database a intervalli (D17).
pub const JOB_EVENT: &str = "jobs:updated";

pub struct JobsState(pub Arc<JobEngine>);

/// Identificativo di un lavoro creato dal backend. Il frontend può passare il
/// proprio, come fa per le altre tabelle.
fn new_job_id() -> String {
    use rand::Rng;
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Quello che serve per mettere un lavoro in coda. Tutto facoltativo tranne il
/// tipo: il resto ha valori sensati.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewJobRequest {
    pub job_type: String,
    pub id: Option<String>,
    pub config: Option<String>,
    pub priority: Option<i64>,
    pub max_attempts: Option<u32>,
    pub depends_on_job_id: Option<String>,
    pub workspace_id: Option<String>,
}

#[tauri::command]
pub async fn create_job(
    jobs: State<'_, JobsState>,
    request: NewJobRequest,
) -> Result<JobRecord, String> {
    let job = NewJob {
        id: request.id.unwrap_or_else(new_job_id),
        job_type: request.job_type,
        priority: request.priority.unwrap_or(0),
        config: request.config.unwrap_or_else(|| "{}".to_string()),
        max_attempts: request.max_attempts.unwrap_or(3),
        depends_on_job_id: request.depends_on_job_id,
        workspace_id: request.workspace_id,
    };
    jobs.0.submit(&job).await
}

/// I lavori non ancora finiti. Lo storico completo non serve finché non c'è
/// l'area Analisi (#379).
#[tauri::command]
pub async fn list_active_jobs(jobs: State<'_, JobsState>) -> Result<Vec<JobRecord>, String> {
    let conn = jobs.0.connection()?;
    store::list_active(&conn)
}

#[tauri::command]
pub async fn get_job(jobs: State<'_, JobsState>, id: String) -> Result<Option<JobRecord>, String> {
    let conn = jobs.0.connection()?;
    store::get(&conn, &id)
}

/// Pausa cooperativa (D14): il lavoro passa per `pausing` e si ferma al confine
/// dell'unità di lavoro successiva. L'interfaccia mostra "in pausa…" e poi "in
/// pausa", non finge che sia immediato.
#[tauri::command]
pub async fn pause_job(jobs: State<'_, JobsState>, id: String) -> Result<(), String> {
    jobs.0.request_pause(&id).await
}

#[tauri::command]
pub async fn resume_job(jobs: State<'_, JobsState>, id: String) -> Result<(), String> {
    jobs.0.resume(&id).await
}

/// Annullamento cooperativo (D15). Terminale: si può ripetere da capo, non
/// riprendere.
#[tauri::command]
pub async fn cancel_job(jobs: State<'_, JobsState>, id: String) -> Result<(), String> {
    jobs.0.request_cancel(&id).await
}

#[tauri::command]
pub async fn retry_job(
    jobs: State<'_, JobsState>,
    id: String,
    from_scratch: Option<bool>,
) -> Result<(), String> {
    jobs.0.retry(&id, from_scratch.unwrap_or(false)).await
}

/// Avvia l'orchestratore all'apertura dell'applicazione: registra i gestori,
/// legge i limiti, rimette in ordine i lavori interrotti (D13) e mette in moto
/// il giro della coda.
pub fn start(app: &tauri::AppHandle) -> Result<(), String> {
    let db_path = crate::storage_config::db_path(app)?;
    let emitter = app.clone();
    let observer = Observer::new(move |record: JobRecord| {
        let _ = emitter.emit(JOB_EVENT, record);
    });

    let mut engine = JobEngine::new(
        db_path,
        observer,
        app.state::<crate::db::DbWriteCoordinator>().inner().clone(),
    );

    // In questa PR gli unici gestori sono quelli finti, e solo nelle build di
    // sviluppo: uno che sa riprendere e uno che va rifatto da capo, i due rami
    // di D13. Il primo gestore reale è lo scaricamento, che arriva con la PR 4.
    #[cfg(debug_assertions)]
    {
        engine.register("debug_counter", Arc::new(super::testing::CounterJob));
        engine.register(
            "debug_restart_only",
            Arc::new(super::testing::RestartOnlyJob),
        );
    }

    engine.load_limits()?;
    let engine = Arc::new(engine);
    app.manage(JobsState(Arc::clone(&engine)));

    let starting = Arc::clone(&engine);
    tauri::async_runtime::spawn(async move {
        if let Err(error) = starting.recover_interrupted().await {
            log::error!("jobs recovery: {error}");
        }
        starting.run_forever().await;
    });
    Ok(())
}
