//! Persistenza dei lavori.
//!
//! Tutte le funzioni prendono una `Connection`: così il motore si prova con un
//! database in memoria, senza un'applicazione in esecuzione. Le scritture del
//! runtime passano comunque dal coordinatore di `db.rs`, che serializza tutto
//! ciò che tocca `glossa.db`.

use rusqlite::{params, Connection, OptionalExtension, Row};

use super::{JobError, JobRecord, JobStatus};

const COLUMNS: &str = "id, job_type, status, priority, progress, message, config, checkpoint, \
     attempt_count, max_attempts, error, error_kind, eta_seconds, waiting_reason, phase, \
     detail, depends_on_job_id, next_attempt_at, created_at, updated_at";

/// Cosa serve per mettere un lavoro in coda. Il resto lo mette il database.
#[derive(Debug, Clone)]
pub struct NewJob {
    pub id: String,
    pub job_type: String,
    pub priority: i64,
    pub config: String,
    pub max_attempts: u32,
    pub depends_on_job_id: Option<String>,
    pub workspace_id: Option<String>,
    /// Come si chiama il lavoro nel pannello, già in coda: chi lo ha messo in
    /// fila sa dire cos'è, il gestore lo saprà solo quando parte (D20).
    pub message: Option<String>,
}

fn row_to_record(row: &Row<'_>) -> rusqlite::Result<JobRecord> {
    let status: String = row.get(2)?;
    Ok(JobRecord {
        id: row.get(0)?,
        job_type: row.get(1)?,
        status: JobStatus::parse(&status).unwrap_or(JobStatus::Error),
        priority: row.get(3)?,
        progress: row.get(4)?,
        message: row.get(5)?,
        config: row.get(6)?,
        checkpoint: row.get(7)?,
        attempt_count: row.get::<_, i64>(8)? as u32,
        max_attempts: row.get::<_, i64>(9)? as u32,
        error: row.get(10)?,
        error_kind: row.get(11)?,
        eta_seconds: row.get(12)?,
        waiting_reason: row.get(13)?,
        phase: row.get(14)?,
        detail: row.get(15)?,
        depends_on_job_id: row.get(16)?,
        next_attempt_at: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

pub fn create(conn: &Connection, job: &NewJob) -> Result<JobRecord, String> {
    conn.execute(
        "INSERT INTO jobs (id, job_type, status, priority, config, max_attempts, \
         depends_on_job_id, workspace_id, message) \
         VALUES (?1, ?2, 'queued', ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            job.id,
            job.job_type,
            job.priority,
            job.config,
            job.max_attempts as i64,
            job.depends_on_job_id,
            job.workspace_id,
            job.message,
        ],
    )
    .map_err(|e| format!("Failed to queue the job: {e}"))?;
    get(conn, &job.id)?.ok_or_else(|| "the job disappeared right after being queued".to_string())
}

pub fn get(conn: &Connection, id: &str) -> Result<Option<JobRecord>, String> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM jobs WHERE id = ?1"),
        params![id],
        row_to_record,
    )
    .optional()
    .map_err(|e| format!("Failed to read the job: {e}"))
}

/// I lavori che il pannello mostra: quelli non ancora finiti **e quelli
/// terminati oggi** (D20).
///
/// I terminati servono: senza, la sezione «terminati oggi» si svuotava a ogni
/// riavvio dell'applicazione, perché l'elenco iniziale li escludeva e nessun
/// evento li riportava indietro. La finestra è la stessa che usa il pannello.
/// Lo storico completo non serve a nessuno finché non c'è l'area Analisi.
pub fn list_active(conn: &Connection) -> Result<Vec<JobRecord>, String> {
    query_many(
        conn,
        &format!(
            "SELECT {COLUMNS} FROM jobs \
             WHERE status NOT IN ('completed', 'cancelled', 'error') \
                OR finished_at >= datetime('now', '-1 day') \
             ORDER BY priority DESC, created_at"
        ),
        params![],
    )
}

/// I lavori pronti a partire: in coda, senza un'attesa ancora in corso (D16), e
/// con la dipendenza già completata se ne hanno una.
pub fn claimable(conn: &Connection) -> Result<Vec<JobRecord>, String> {
    query_many(
        conn,
        &format!(
            "SELECT {COLUMNS} FROM jobs \
             WHERE status = 'queued' \
               AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now')) \
               AND (depends_on_job_id IS NULL OR depends_on_job_id IN \
                    (SELECT id FROM jobs WHERE status = 'completed')) \
             ORDER BY priority DESC, created_at"
        ),
        params![],
    )
}

/// I lavori rimasti a metà da una chiusura brusca: in esecuzione o dentro una
/// transizione che nessuno ha portato a termine (D13).
pub fn interrupted(conn: &Connection) -> Result<Vec<JobRecord>, String> {
    query_many(
        conn,
        &format!(
            "SELECT {COLUMNS} FROM jobs WHERE status IN ('running', 'pausing', 'cancelling') \
             ORDER BY created_at"
        ),
        params![],
    )
}

fn query_many(
    conn: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<JobRecord>, String> {
    let mut statement = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to prepare the jobs query: {e}"))?;
    let rows = statement
        .query_map(params, row_to_record)
        .map_err(|e| format!("Failed to read the jobs: {e}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to read a job row: {e}"))
}

/// Cambia stato **solo se il lavoro non è già finito**.
///
/// È la protezione della terminalità richiesta da #218: un gestore che si
/// accorge tardi di essere stato annullato non deve poter riportare il lavoro
/// in esecuzione. Restituisce `false` quando l'aggiornamento è stato ignorato.
pub fn set_status(conn: &Connection, id: &str, status: JobStatus) -> Result<bool, String> {
    let changed = conn
        .execute(
            "UPDATE jobs SET status = ?2, updated_at = CURRENT_TIMESTAMP, \
             started_at = CASE WHEN ?2 = 'running' AND started_at IS NULL \
                               THEN CURRENT_TIMESTAMP ELSE started_at END, \
             finished_at = CASE WHEN ?2 IN ('completed', 'cancelled', 'error') \
                                THEN CURRENT_TIMESTAMP ELSE finished_at END \
             WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
            params![id, status.as_str()],
        )
        .map_err(|e| format!("Failed to update the job status: {e}"))?;
    Ok(changed > 0)
}

/// Avanzamento, messaggio, stima e motivo dell'attesa (D17). Il gestore chiama
/// al massimo una volta al secondo: il limite sta in `JobContext`, qui si
/// scrive e basta.
#[allow(clippy::too_many_arguments)]
pub fn save_progress(
    conn: &Connection,
    id: &str,
    progress: f64,
    message: Option<&str>,
    eta_seconds: Option<i64>,
    waiting_reason: Option<&str>,
    detail: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        // Il dettaglio viaggia con l'avanzamento: cambia insieme a lui, e una
        // scrittura separata raddoppierebbe gli aggiornamenti per ogni carta.
        // `COALESCE` lascia stare quello vecchio quando il gestore non ne manda
        // uno nuovo, invece di cancellarlo.
        "UPDATE jobs SET progress = ?2, message = ?3, eta_seconds = ?4, waiting_reason = ?5, \
         detail = COALESCE(?6, detail), updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
        params![id, progress, message, eta_seconds, waiting_reason, detail],
    )
    .map_err(|e| format!("Failed to save the job progress: {e}"))?;
    Ok(())
}

/// Cosa sta facendo adesso: lettura del manifesto, scelta della risoluzione,
/// scaricamento. La scrive il gestore quando cambia, non a ogni giro, perché il
/// pannello deve poterla leggere senza aspettare il freno di un secondo.
pub fn save_phase(conn: &Connection, id: &str, phase: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE jobs SET phase = ?2, updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
        params![id, phase],
    )
    .map_err(|e| format!("Failed to save the job phase: {e}"))?;
    Ok(())
}

/// A che punto era (D13). Senza, una ripresa ripartirebbe da zero.
pub fn save_checkpoint(conn: &Connection, id: &str, checkpoint: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE jobs SET checkpoint = ?2, updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
        params![id, checkpoint],
    )
    .map_err(|e| format!("Failed to save the job checkpoint: {e}"))?;
    Ok(())
}

pub fn increment_attempt(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE jobs SET attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
        params![id],
    )
    .map_err(|e| format!("Failed to count the attempt: {e}"))?;
    Ok(())
}

/// Rimette in coda con un'attesa: il tentativo successivo non parte prima
/// (D16). Resta `queued`, perché per l'utente è ancora un lavoro in corso —
/// fermo, non fallito.
pub fn schedule_retry(
    conn: &Connection,
    id: &str,
    error: &JobError,
    wait_seconds: i64,
) -> Result<(), String> {
    conn.execute(
        // `eta_seconds` diventa **l'attesa prima del prossimo tentativo**: è
        // quello che l'interfaccia scrive accanto a «riprende fra…», e finché
        // conteneva la stima dello scaricamento diceva un numero vero al posto
        // sbagliato (D17). Alla ripartenza il gestore lo riscrive con la stima.
        "UPDATE jobs SET status = 'queued', \
         next_attempt_at = datetime('now', ?3), \
         error = ?2, error_kind = ?4, \
         waiting_reason = 'retry', eta_seconds = ?5, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
        params![
            id,
            error.message,
            format!("+{wait_seconds} seconds"),
            error.kind.as_str(),
            wait_seconds,
        ],
    )
    .map_err(|e| format!("Failed to schedule the retry: {e}"))?;
    Ok(())
}

/// Fallimento definitivo: tentativi esauriti, o errore che non si ritenta.
pub fn fail(conn: &Connection, id: &str, error: &JobError) -> Result<(), String> {
    conn.execute(
        "UPDATE jobs SET status = 'error', error = ?2, error_kind = ?3, waiting_reason = NULL, \
         finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
        params![id, error.message, error.kind.as_str()],
    )
    .map_err(|e| format!("Failed to record the job failure: {e}"))?;
    Ok(())
}

/// Riporta un lavoro in coda per un tentativo esplicito dell'utente: azzera
/// l'attesa e l'errore, non i tentativi già contati.
pub fn requeue(conn: &Connection, id: &str, reset_progress: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE jobs SET status = 'queued', error = NULL, error_kind = NULL, \
         waiting_reason = NULL, phase = NULL, detail = NULL, next_attempt_at = NULL, \
         finished_at = NULL, \
         progress = CASE WHEN ?2 THEN 0 ELSE progress END, \
         checkpoint = CASE WHEN ?2 THEN NULL ELSE checkpoint END, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1",
        params![id, reset_progress],
    )
    .map_err(|e| format!("Failed to requeue the job: {e}"))?;
    Ok(())
}

/// Mette da parte un lavoro interrotto, in attesa che l'utente decida (D13).
///
/// `reset_progress` serve a chi non sa riprendere: il progresso rimasto sul
/// database non corrisponde a niente di riutilizzabile, e mostrarlo sarebbe una
/// bugia. Chi sa riprendere invece lo conserva, insieme al punto salvato.
pub fn park_as_paused(conn: &Connection, id: &str, reset_progress: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE jobs SET status = 'paused', waiting_reason = NULL, \
         next_attempt_at = NULL, \
         progress = CASE WHEN ?2 THEN 0 ELSE progress END, \
         checkpoint = CASE WHEN ?2 THEN NULL ELSE checkpoint END, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status NOT IN ('completed', 'cancelled', 'error')",
        params![id, reset_progress],
    )
    .map_err(|e| format!("Failed to park the job: {e}"))?;
    Ok(())
}

/// Toglie dall'elenco i lavori finiti: completati, annullati, falliti.
///
/// Sono righe di storico che il pannello mostra per la giornata (D20); quando
/// diventano rumore si buttano. `id` limita la pulizia a un lavoro solo.
pub fn forget_finished(conn: &Connection, id: Option<&str>) -> Result<usize, String> {
    let removed = match id {
        Some(id) => conn.execute(
            "DELETE FROM jobs WHERE id = ?1 AND status IN ('completed', 'cancelled', 'error')",
            params![id],
        ),
        None => conn.execute(
            "DELETE FROM jobs WHERE status IN ('completed', 'cancelled', 'error')",
            [],
        ),
    }
    .map_err(|error| format!("Failed to clear finished jobs: {error}"))?;
    Ok(removed)
}

pub fn read_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("Failed to read the setting {key}: {e}"))
}

#[cfg(test)]
pub(crate) mod test_support {
    use rusqlite::Connection;

    /// Database in memoria con lo schema **vero**: le migrazioni si applicano
    /// nell'ordine reale, così un test non può passare su uno schema inventato
    /// che diverge da quello dell'applicazione.
    pub fn migrated_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        for migration in [
            include_str!("../../migrations/0001_baseline_2_0.sql"),
            include_str!("../../migrations/0002_workspace_icon_key.sql"),
            include_str!("../../migrations/0003_vault_and_read_mode.sql"),
            include_str!("../../migrations/0004_jobs_runtime.sql"),
            include_str!("../../migrations/0005_job_phase.sql"),
            include_str!("../../migrations/0006_job_detail.sql"),
            include_str!("../../migrations/0007_download_policy.sql"),
            include_str!("../../migrations/0008_provenance_foundation.sql"),
            include_str!("../../migrations/0009_network_profiles.sql"),
            include_str!("../../migrations/0010_transcription_revisions_events.sql"),
        ] {
            conn.execute_batch(migration).expect("migration applies");
        }
        conn
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::migrated_connection;
    use super::*;
    use crate::jobs::ErrorKind;

    fn queued(conn: &Connection, id: &str) -> JobRecord {
        create(
            conn,
            &NewJob {
                id: id.to_string(),
                job_type: "debug_counter".to_string(),
                priority: 0,
                config: "{}".to_string(),
                max_attempts: 3,
                depends_on_job_id: None,
                workspace_id: None,
                message: None,
            },
        )
        .expect("job queued")
    }

    #[test]
    fn a_new_job_starts_queued_with_no_progress() {
        let conn = migrated_connection();

        let job = queued(&conn, "j1");

        assert_eq!(job.status, JobStatus::Queued);
        assert_eq!(job.progress, 0.0);
        assert_eq!(job.attempt_count, 0);
    }

    #[test]
    fn a_finished_job_ignores_late_updates() {
        // Protezione della terminalità: un gestore che si accorge tardi
        // dell'annullamento non deve rimettere il lavoro in esecuzione.
        let conn = migrated_connection();
        queued(&conn, "j2");
        set_status(&conn, "j2", JobStatus::Cancelled).unwrap();

        let applied = set_status(&conn, "j2", JobStatus::Running).unwrap();

        assert!(!applied, "l'aggiornamento tardivo va ignorato");
        assert_eq!(
            get(&conn, "j2").unwrap().unwrap().status,
            JobStatus::Cancelled
        );
    }

    #[test]
    fn progress_does_not_touch_a_job_that_has_already_ended() {
        let conn = migrated_connection();
        queued(&conn, "j3");
        set_status(&conn, "j3", JobStatus::Completed).unwrap();

        save_progress(
            &conn,
            "j3",
            0.5,
            Some("a metà"),
            Some(60),
            None,
            Some(r#"{"units":{"done":1}}"#),
        )
        .unwrap();

        let job = get(&conn, "j3").unwrap().unwrap();
        assert_eq!(job.progress, 0.0);
        assert_eq!(job.message, None);
        assert_eq!(job.detail, None, "nemmeno i dettagli");
    }

    #[test]
    fn a_progress_without_details_keeps_the_ones_already_written() {
        // I dettagli cambiano meno spesso dell'avanzamento: chi non ne manda di
        // nuovi non deve cancellare quelli buoni.
        let conn = migrated_connection();
        queued(&conn, "j-detail");
        save_progress(
            &conn,
            "j-detail",
            0.1,
            None,
            None,
            None,
            Some(r#"{"units":{"done":1}}"#),
        )
        .unwrap();

        save_progress(&conn, "j-detail", 0.2, None, None, None, None).unwrap();

        let job = get(&conn, "j-detail").unwrap().unwrap();
        assert_eq!(job.detail.as_deref(), Some(r#"{"units":{"done":1}}"#));
    }

    #[test]
    fn a_job_waiting_for_its_retry_is_not_claimable_yet() {
        let conn = migrated_connection();
        queued(&conn, "j4");
        let error = JobError::new(ErrorKind::Throttled, "403");

        schedule_retry(&conn, "j4", &error, 600).unwrap();

        assert!(claimable(&conn).unwrap().is_empty(), "l'attesa deve valere");
        let job = get(&conn, "j4").unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Queued, "fermo, non fallito");
        assert_eq!(job.error_kind.as_deref(), Some("throttled"));
        assert_eq!(job.waiting_reason.as_deref(), Some("retry"));
        // Il tempo mostrato dev'essere quello che manca al tentativo, non la
        // stima dello scaricamento rimasta lì dal giro precedente.
        assert_eq!(job.eta_seconds, Some(600));
    }

    #[test]
    fn an_elapsed_wait_makes_the_job_claimable_again() {
        let conn = migrated_connection();
        queued(&conn, "j5");
        let error = JobError::new(ErrorKind::Transport, "connessione caduta");

        schedule_retry(&conn, "j5", &error, -5).unwrap();

        let ready: Vec<String> = claimable(&conn)
            .unwrap()
            .into_iter()
            .map(|j| j.id)
            .collect();
        assert_eq!(ready, vec!["j5".to_string()]);
    }

    #[test]
    fn a_job_waits_for_the_one_it_depends_on() {
        let conn = migrated_connection();
        queued(&conn, "first");
        create(
            &conn,
            &NewJob {
                id: "second".to_string(),
                job_type: "debug_counter".to_string(),
                priority: 0,
                config: "{}".to_string(),
                max_attempts: 3,
                depends_on_job_id: Some("first".to_string()),
                workspace_id: None,
                message: None,
            },
        )
        .unwrap();

        let ready: Vec<String> = claimable(&conn)
            .unwrap()
            .into_iter()
            .map(|j| j.id)
            .collect();
        assert_eq!(ready, vec!["first".to_string()]);

        set_status(&conn, "first", JobStatus::Completed).unwrap();
        let ready: Vec<String> = claimable(&conn)
            .unwrap()
            .into_iter()
            .map(|j| j.id)
            .collect();
        assert_eq!(ready, vec!["second".to_string()]);
    }

    #[test]
    fn higher_priority_goes_first() {
        let conn = migrated_connection();
        queued(&conn, "normale");
        create(
            &conn,
            &NewJob {
                id: "urgente".to_string(),
                job_type: "debug_counter".to_string(),
                priority: 10,
                config: "{}".to_string(),
                max_attempts: 3,
                depends_on_job_id: None,
                workspace_id: None,
                message: None,
            },
        )
        .unwrap();

        let ready: Vec<String> = claimable(&conn)
            .unwrap()
            .into_iter()
            .map(|j| j.id)
            .collect();
        assert_eq!(ready, vec!["urgente".to_string(), "normale".to_string()]);
    }

    #[test]
    fn interrupted_jobs_are_the_ones_left_mid_transition() {
        let conn = migrated_connection();
        queued(&conn, "in-corso");
        queued(&conn, "in-pausa");
        queued(&conn, "in-coda");
        set_status(&conn, "in-corso", JobStatus::Running).unwrap();
        set_status(&conn, "in-pausa", JobStatus::Pausing).unwrap();

        let found: Vec<String> = interrupted(&conn)
            .unwrap()
            .into_iter()
            .map(|job| job.id)
            .collect();

        assert!(found.contains(&"in-corso".to_string()));
        assert!(found.contains(&"in-pausa".to_string()));
        assert!(!found.contains(&"in-coda".to_string()));
    }

    #[test]
    fn a_retry_asked_by_the_user_clears_the_error_and_the_wait() {
        let conn = migrated_connection();
        queued(&conn, "j6");
        fail(&conn, "j6", &JobError::new(ErrorKind::Internal, "rotto")).unwrap();

        requeue(&conn, "j6", true).unwrap();

        let job = get(&conn, "j6").unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Queued);
        assert_eq!(job.error, None);
        assert_eq!(job.next_attempt_at, None);
        assert_eq!(job.progress, 0.0);
    }

    #[test]
    fn a_finished_job_keeps_its_checkpoint_and_its_attempts() {
        // Stessa protezione degli altri aggiornamenti: un gestore che scrive in
        // ritardo non tocca un lavoro già concluso.
        let conn = migrated_connection();
        queued(&conn, "j7");
        save_checkpoint(&conn, "j7", r#"{"done":4}"#).unwrap();
        set_status(&conn, "j7", JobStatus::Cancelled).unwrap();

        save_checkpoint(&conn, "j7", r#"{"done":99}"#).unwrap();
        increment_attempt(&conn, "j7").unwrap();

        let job = get(&conn, "j7").unwrap().unwrap();
        assert_eq!(job.checkpoint.as_deref(), Some(r#"{"done":4}"#));
        assert_eq!(job.attempt_count, 0);
    }

    #[test]
    fn the_panel_list_keeps_what_finished_today_and_drops_the_old() {
        // La sezione «terminati oggi» si riempiva solo con gli eventi: dopo un
        // riavvio restava vuota anche con i lavori finiti dieci minuti prima.
        let conn = migrated_connection();
        queued(&conn, "oggi");
        queued(&conn, "ieri");
        queued(&conn, "in-corso");
        queued(&conn, "fallito-vecchio");
        set_status(&conn, "oggi", JobStatus::Completed).unwrap();
        set_status(&conn, "ieri", JobStatus::Completed).unwrap();
        fail(
            &conn,
            "fallito-vecchio",
            &JobError::new(ErrorKind::NotFound, "404"),
        )
        .unwrap();
        conn.execute(
            "UPDATE jobs SET finished_at = datetime('now', '-3 days') WHERE id = 'fallito-vecchio'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE jobs SET finished_at = datetime('now', '-3 days') WHERE id = 'ieri'",
            [],
        )
        .unwrap();

        let listed: Vec<String> = list_active(&conn)
            .unwrap()
            .into_iter()
            .map(|job| job.id)
            .collect();

        assert!(listed.contains(&"oggi".to_string()));
        assert!(listed.contains(&"in-corso".to_string()));
        assert!(!listed.contains(&"ieri".to_string()));
        // Anche un fallito vecchio esce: restando dentro terrebbe acceso
        // l'indicatore in barra per sempre.
        assert!(!listed.contains(&"fallito-vecchio".to_string()));
    }

    #[test]
    fn clearing_finished_jobs_leaves_the_ones_still_going() {
        let conn = migrated_connection();
        queued(&conn, "finito");
        queued(&conn, "in-corso");
        queued(&conn, "in-coda");
        set_status(&conn, "finito", JobStatus::Completed).unwrap();
        set_status(&conn, "in-corso", JobStatus::Running).unwrap();

        let removed = forget_finished(&conn, None).unwrap();

        assert_eq!(removed, 1);
        assert!(get(&conn, "finito").unwrap().is_none());
        assert!(get(&conn, "in-corso").unwrap().is_some());
        assert!(get(&conn, "in-coda").unwrap().is_some());
    }

    #[test]
    fn a_single_job_can_be_dismissed_only_once_finished() {
        let conn = migrated_connection();
        queued(&conn, "vivo");

        assert_eq!(forget_finished(&conn, Some("vivo")).unwrap(), 0);

        set_status(&conn, "vivo", JobStatus::Cancelled).unwrap();
        assert_eq!(forget_finished(&conn, Some("vivo")).unwrap(), 1);
    }

    #[test]
    fn the_default_limits_and_the_auto_resume_switch_exist() {
        let conn = migrated_connection();

        assert_eq!(
            read_setting(&conn, "jobs_limit_disk").unwrap().as_deref(),
            Some("1")
        );
        assert_eq!(
            read_setting(&conn, "auto_resume_downloads")
                .unwrap()
                .as_deref(),
            Some("0"),
            "spenta di default: niente riparte da solo"
        );
    }
}
