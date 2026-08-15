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
        message: None,
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

/// Toglie dall'elenco i lavori finiti. Senza `id` li toglie tutti.
#[tauri::command]
pub async fn clear_finished_jobs(
    jobs: State<'_, JobsState>,
    id: Option<String>,
) -> Result<usize, String> {
    jobs.0.forget_finished(id.as_deref()).await
}

/// Mette in coda la verifica rapida del deposito, se l'impostazione è accesa.
async fn verify_on_startup(engine: &Arc<JobEngine>) -> Result<(), String> {
    let enabled = {
        let conn = engine.connection()?;
        super::store::read_setting(&conn, "verify_vault_on_startup")?
            .map(|value| value.trim() == "1")
            .unwrap_or(false)
    };
    if !enabled {
        return Ok(());
    }
    crate::vault::verification::enqueue(engine, false)
        .await
        .map(|_| ())
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
        crate::vault::resolve_root(app, None)?,
    );

    // I gestori veri. Carte e miniature parlano con le stesse biblioteche,
    // quindi **condividono i contatori di cortesia**: due contatori separati
    // sullo stesso host raddoppierebbero il ritmo verso quel server (D18).
    let courtesy = Arc::new(crate::download::courtesy::Courtesy::new());
    engine.register(
        crate::download::handler::JOB_TYPE,
        Arc::new(crate::download::handler::SourceDownloadJob::new(
            Arc::clone(&courtesy),
            crate::download::handler::Target::Pages,
        )),
    );
    engine.register(
        crate::download::handler::THUMBNAILS_JOB_TYPE,
        Arc::new(crate::download::handler::SourceDownloadJob::new(
            Arc::clone(&courtesy),
            crate::download::handler::Target::Thumbnails,
        )),
    );

    // La verifica del deposito: il primo lavoro che pesa sul processore e non
    // sulla rete (D5-bis).
    engine.register(
        crate::vault::verification::JOB_TYPE,
        Arc::new(crate::vault::verification::VaultVerificationJob),
    );

    // Accanto, nelle sole build di sviluppo, i due tipi finti che servono a
    // provare la coda senza rete: uno che sa riprendere e uno da rifare.
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
            log::error!("queue recovery failed error={error}");
        }
        // Controllo rapido all'avvio, **spento di default** (D5): chi lo accende
        // trova le segnalazioni pronte, chi non lo accende non paga niente.
        if let Err(error) = verify_on_startup(&starting).await {
            log::warn!("queue startup verification failed error={error}");
        }
        starting.run_forever().await;
    });
    Ok(())
}
