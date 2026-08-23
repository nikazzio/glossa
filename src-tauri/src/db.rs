use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::Acquire;
use std::fs;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};
use tokio::sync::Mutex;

/// Rust/sqlx owns the schema (see #211): this baseline runs on a fresh 2.0
/// glossa.db and every later change ships as a new file here, tracked by sqlx
/// in `_sqlx_migrations`.
static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Runs before any Tauri command or frontend `Database.load()` call, so the
/// schema is guaranteed to exist by the time the UI or the native vector
/// connection first touch glossa.db.
pub async fn run_startup_migrations(app: &tauri::AppHandle) -> Result<(), String> {
    let db_path = crate::storage_config::db_path(app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    // Same connection pragmas as runtime writes (see execute_transaction):
    // without busy_timeout a lock held by another process at startup (e.g.
    // another instance still shutting down) would fail migrations
    // immediately instead of waiting, like every other connection does.
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_millis(10_000));
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;

    MIGRATOR
        .run(&pool)
        .await
        .map_err(|error| error.to_string())?;

    pool.close().await;
    Ok(())
}

/// Apre una connessione rusqlite a `glossa.db` con le impostazioni che tutta
/// l'applicazione usa: chiavi esterne attive, WAL, attesa di dieci secondi
/// quando un'altra scrittura è in corso.
///
/// Sta qui perché era ripetuta in tre moduli diversi: tre copie della stessa
/// riga di PRAGMA sono tre occasioni di divergere, e la prima volta che una
/// dimentica `busy_timeout` il difetto si manifesta come un errore casuale
/// sotto carico.
pub fn open_connection(path: &std::path::Path) -> Result<rusqlite::Connection, String> {
    let conn = rusqlite::Connection::open(path).map_err(|e| format!("DB open error: {e}"))?;
    conn.execute_batch(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; \
         PRAGMA busy_timeout=10000;",
    )
    .map_err(|e| format!("PRAGMA error: {e}"))?;
    Ok(conn)
}

/// Serializes every runtime write to glossa.db, including commands that use
/// SQLx and commands that use the dedicated rusqlite vector connection.
/// Schema setup is intentionally separate and happens before the UI renders.
#[derive(Clone, Default)]
pub struct DbWriteCoordinator(Arc<Mutex<()>>);

impl DbWriteCoordinator {
    pub async fn lock(&self) -> tokio::sync::OwnedMutexGuard<()> {
        Arc::clone(&self.0).lock_owned().await
    }
}

#[derive(Debug, Deserialize)]
pub struct SqlStatement {
    query: String,
    #[serde(default)]
    params: Vec<JsonValue>,
}

#[tauri::command]
pub async fn execute_transaction(
    db_instances: State<'_, DbInstances>,
    write_coordinator: State<'_, DbWriteCoordinator>,
    db: String,
    statements: Vec<SqlStatement>,
) -> Result<(), String> {
    let _write_guard = write_coordinator.lock().await;
    let instances = db_instances.0.read().await;
    let db_pool = instances
        .get(&db)
        .ok_or_else(|| format!("Database not loaded: {db}"))?;

    match db_pool {
        DbPool::Sqlite(pool) => {
            // `foreign_keys` is per connection and SQLite ignores changes made
            // while a transaction is open. Configure the exact pooled
            // connection before beginning the transaction that carries a
            // frontend write.
            let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
            sqlx::query("PRAGMA journal_mode=WAL")
                .execute(&mut *connection)
                .await
                .map_err(|error| error.to_string())?;
            sqlx::query("PRAGMA synchronous=NORMAL")
                .execute(&mut *connection)
                .await
                .map_err(|error| error.to_string())?;
            sqlx::query("PRAGMA foreign_keys=ON")
                .execute(&mut *connection)
                .await
                .map_err(|error| error.to_string())?;
            sqlx::query("PRAGMA busy_timeout=10000")
                .execute(&mut *connection)
                .await
                .map_err(|error| error.to_string())?;
            let mut transaction = connection
                .begin()
                .await
                .map_err(|error| error.to_string())?;

            for statement in statements {
                let mut query = sqlx::query(&statement.query);
                for value in statement.params {
                    query = bind_json_value(query, value);
                }
                query
                    .execute(&mut *transaction)
                    .await
                    .map_err(|error| error.to_string())?;
            }

            transaction
                .commit()
                .await
                .map_err(|error| error.to_string())?;
            Ok(())
        }
        #[allow(unreachable_patterns)]
        _ => Err("Only SQLite transactions are supported".to_string()),
    }
}

#[tauri::command]
pub fn backup_database_file(
    app: tauri::AppHandle,
    reason: String,
) -> Result<Option<String>, String> {
    let data_dir = crate::storage_config::resolve_data_dir(&app)?;
    let db_path = crate::storage_config::db_path(&app)?;
    if !db_path.exists() {
        return Ok(None);
    }

    let safe_reason: String = reason
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let backup_path = data_dir.join(format!("glossa.{timestamp}.{safe_reason}.db.bak"));
    fs::copy(&db_path, &backup_path).map_err(|error| error.to_string())?;

    for suffix in ["wal", "shm"] {
        let sidecar_path = data_dir.join(format!("glossa.db-{suffix}"));
        if sidecar_path.exists() {
            let sidecar_backup_path =
                data_dir.join(format!("glossa.{timestamp}.{safe_reason}.db-{suffix}.bak"));
            fs::copy(&sidecar_path, sidecar_backup_path).map_err(|error| error.to_string())?;
        }
    }

    Ok(Some(backup_path.to_string_lossy().into_owned()))
}

/// A JSON array of small non-negative integers is how the frontend represents
/// a BLOB column (tauri-plugin-sql/JSON can't carry raw bytes otherwise) —
/// e.g. phrase_memory.embedding, round-tripped through a workspace backup.
/// Without this, such arrays fell through to the generic `JsonValue` bind
/// below, which sqlx serializes as JSON *text* instead of raw bytes, silently
/// corrupting the embedding for any semantic search that reads it back.
fn json_array_as_blob(array: &[JsonValue]) -> Option<Vec<u8>> {
    if array.is_empty() {
        return None;
    }
    array
        .iter()
        .map(|element| {
            element
                .as_u64()
                .filter(|byte| *byte <= u8::MAX as u64)
                .map(|byte| byte as u8)
        })
        .collect()
}

fn bind_json_value<'q>(
    query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: JsonValue,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    if value.is_null() {
        query.bind(None::<JsonValue>)
    } else if let Some(value) = value.as_str() {
        query.bind(value.to_owned())
    } else if let Some(value) = value.as_bool() {
        query.bind(value)
    } else if let Some(value) = value.as_i64() {
        query.bind(value)
    } else if let Some(value) = value.as_u64() {
        query.bind(value as i64)
    } else if let Some(value) = value.as_f64() {
        query.bind(value)
    } else if let Some(bytes) = value.as_array().and_then(|array| json_array_as_blob(array)) {
        query.bind(bytes)
    } else {
        query.bind(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn migrated_pool() -> sqlx::SqlitePool {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .expect("in-memory sqlite connection");
        MIGRATOR.run(&pool).await.expect("baseline migration runs");
        pool
    }

    #[tokio::test]
    async fn baseline_migration_creates_every_2_0_table() {
        let pool = migrated_pool().await;

        for table in [
            "sources",
            "source_versions",
            "source_pages",
            // I collegamenti fra workspace e item stanno tutti qui: la vecchia
            // tabella dei soli libri non esiste più (#213).
            "workspace_items",
            "assets",
            "transcription_documents",
            "transcription_segments",
            "transcription_revisions",
            "translation_origins",
            "jobs",
            "artifacts",
            "provenance_events",
        ] {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
            )
            .bind(table)
            .fetch_one(&pool)
            .await
            .unwrap_or_else(|error| panic!("querying sqlite_master for {table}: {error}"));
            assert_eq!(count, 1, "table {table} should exist after migration");
        }
    }

    #[tokio::test]
    async fn transcription_revisions_have_no_status_column() {
        // L'approvazione è un fatto che punta a una revisione, non uno stato
        // scritto sulla revisione: uno storico che si modifica non è uno
        // storico.
        let pool = migrated_pool().await;

        let columns: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info('transcription_revisions')")
                .fetch_all(&pool)
                .await
                .expect("colonne delle revisioni");

        assert!(!columns.iter().any(|name| name == "status"));
        assert!(columns.iter().any(|name| name == "content_hash"));
        assert!(columns
            .iter()
            .any(|name| name == "derived_from_revision_id"));

        let segment: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info('transcription_segments')")
                .fetch_all(&pool)
                .await
                .expect("colonne dei segmenti");
        assert!(segment.iter().any(|name| name == "approved_revision_id"));
        assert!(segment.iter().any(|name| name == "source_page_id"));
        assert!(!segment.iter().any(|name| name == "asset_id"));

        let page: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info('source_pages')")
                .fetch_all(&pool)
                .await
                .expect("colonne delle pagine logiche");
        assert!(page.iter().any(|name| name == "canvas_url"));
        assert!(page.iter().any(|name| name == "position"));

        let asset: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('assets')")
            .fetch_all(&pool)
            .await
            .expect("colonne delle rappresentazioni file");
        assert!(asset.iter().any(|name| name == "source_page_id"));
        assert!(asset.iter().any(|name| name == "origin"));
        assert!(!asset.iter().any(|name| name == "availability"));
    }

    #[tokio::test]
    async fn baseline_migration_seeds_default_workspace_on_a_fresh_database() {
        let pool = migrated_pool().await;

        let workspace_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspaces")
            .fetch_one(&pool)
            .await
            .expect("workspaces query");
        assert_eq!(workspace_count, 1);

        let active_workspace: String =
            sqlx::query_scalar("SELECT value FROM app_settings WHERE key = 'active_workspace_id'")
                .fetch_one(&pool)
                .await
                .expect("active_workspace_id row");
        assert_eq!(active_workspace, "ws_default");
    }

    #[test]
    fn converts_byte_array_to_blob() {
        let array = vec![
            JsonValue::from(0),
            JsonValue::from(32),
            JsonValue::from(169),
            JsonValue::from(255),
        ];
        assert_eq!(json_array_as_blob(&array), Some(vec![0, 32, 169, 255]));
    }

    #[test]
    fn rejects_empty_array() {
        assert_eq!(json_array_as_blob(&[]), None);
    }

    #[test]
    fn rejects_value_above_u8_range() {
        let array = vec![JsonValue::from(0), JsonValue::from(256)];
        assert_eq!(json_array_as_blob(&array), None);
    }

    #[test]
    fn rejects_negative_value() {
        let array = vec![JsonValue::from(-1)];
        assert_eq!(json_array_as_blob(&array), None);
    }

    #[test]
    fn rejects_non_numeric_element() {
        let array = vec![JsonValue::from(1), JsonValue::from("nope")];
        assert_eq!(json_array_as_blob(&array), None);
    }
}
