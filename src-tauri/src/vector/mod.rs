pub mod embedding;

use rusqlite::{ffi::sqlite3_auto_extension, Connection, Result as RusqliteResult};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

#[derive(Clone)]
pub struct VectorDatabase {
    connection: Result<Arc<Mutex<Connection>>, String>,
}

impl VectorDatabase {
    pub fn initialize(app: &AppHandle) -> Self {
        let connection = get_db_path(app)
            .and_then(|db_path| open_vec_connection(&db_path).map_err(|error| error.to_string()))
            .map(|connection| Arc::new(Mutex::new(connection)));
        Self { connection }
    }

    pub fn connection(&self) -> Result<Arc<Mutex<Connection>>, String> {
        self.connection
            .as_ref()
            .map(Arc::clone)
            .map_err(Clone::clone)
    }
}

/// Register sqlite-vec as an auto-extension.
/// Must be called once at startup before opening any connection.
/// After registration every rusqlite::Connection will have vec_* functions available.
pub fn register_vec_extension() {
    // SAFETY: sqlite_vec::sqlite3_vec_init is a valid SQLite auto-extension entry point
    // whose C signature matches what sqlite3_auto_extension expects. The *const () cast
    // erases the type at the FFI boundary; transmute restores the concrete function pointer
    // type required by the API. This follows the documented sqlite-vec integration pattern.
    #[allow(clippy::missing_transmute_annotations)]
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    }
}

pub fn open_vec_connection(db_path: &PathBuf) -> RusqliteResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=10000;",
    )?;
    Ok(conn)
}

/// The frontend owns DDL. Native vector commands only verify the columns they
/// require so a stale or partially initialized database fails clearly instead
/// of attempting an ad-hoc migration.
pub fn verify_phrase_memory_schema(conn: &Connection) -> Result<(), String> {
    let mut statement = conn
        .prepare("PRAGMA table_info(phrase_memory)")
        .map_err(|error| error.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<RusqliteResult<Vec<_>>>()
        .map_err(|error| error.to_string())?;

    if columns.is_empty() {
        return Err("phrase_memory schema is not initialized yet".to_string());
    }
    if !columns.iter().any(|column| column == "embedding_model") {
        return Err(
            "phrase_memory.embedding_model is missing; run the frontend schema migration first"
                .to_string(),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn vec_ping(database: State<'_, VectorDatabase>) -> Result<String, String> {
    let database_connection = database.connection()?;
    let connection = database_connection
        .lock()
        .map_err(|_| "Vector database connection is unavailable".to_string())?;
    connection
        .query_row("SELECT vec_version()", [], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())
}

pub fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("glossa.db"))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reuses_the_same_connection_handle() -> RusqliteResult<()> {
        let database = VectorDatabase {
            connection: Ok(Arc::new(Mutex::new(Connection::open_in_memory()?))),
        };

        let first = database
            .connection()
            .expect("in-memory connection is available");
        let second = database
            .connection()
            .expect("in-memory connection is available");

        assert!(Arc::ptr_eq(&first, &second));
        Ok(())
    }

    #[test]
    fn retains_initialization_error_without_aborting_setup() {
        let database = VectorDatabase {
            connection: Err("cannot open database".to_string()),
        };

        assert_eq!(
            database.connection().err().as_deref(),
            Some("cannot open database")
        );
    }

    #[test]
    fn rejects_a_phrase_memory_schema_without_embedding_model() -> RusqliteResult<()> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("CREATE TABLE phrase_memory (id TEXT PRIMARY KEY)")?;

        let error = verify_phrase_memory_schema(&conn).expect_err("expected missing column error");

        assert!(error.contains("embedding_model"));
        Ok(())
    }
}
