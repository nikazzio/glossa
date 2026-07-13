use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::Acquire;
use std::fs;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool};
use tokio::sync::Mutex;

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
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    let db_path = app_config_dir.join("glossa.db");
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
    let backup_path = app_config_dir.join(format!("glossa.{timestamp}.{safe_reason}.db.bak"));
    fs::copy(&db_path, &backup_path).map_err(|error| error.to_string())?;

    for suffix in ["wal", "shm"] {
        let sidecar_path = app_config_dir.join(format!("glossa.db-{suffix}"));
        if sidecar_path.exists() {
            let sidecar_backup_path =
                app_config_dir.join(format!("glossa.{timestamp}.{safe_reason}.db-{suffix}.bak"));
            fs::copy(&sidecar_path, sidecar_backup_path).map_err(|error| error.to_string())?;
        }
    }

    Ok(Some(backup_path.to_string_lossy().into_owned()))
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
    } else {
        query.bind(value)
    }
}
