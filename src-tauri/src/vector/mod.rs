pub mod embedding;

use rusqlite::{ffi::sqlite3_auto_extension, Connection, Result as RusqliteResult};
use std::path::PathBuf;
use tauri::Manager;

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
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;",
    )?;
    Ok(conn)
}

#[tauri::command]
pub fn vec_ping(app: tauri::AppHandle) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    open_vec_connection(&db_path)
        .and_then(|conn| conn.query_row("SELECT vec_version()", [], |row| row.get::<_, String>(0)))
        .map_err(|e| e.to_string())
}

pub fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("glossa.db"))
        .map_err(|e| e.to_string())
}
