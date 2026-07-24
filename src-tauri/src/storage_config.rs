use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const DB_FILE_NAME: &str = "glossa.db";
const RUNTIME_CONFIG_FILE_NAME: &str = "runtime-config.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct RuntimeConfig {
    #[serde(default)]
    data_dir_override: Option<String>,
}

/// Fixed bootstrap file location — always the OS default config dir, never
/// itself affected by the override it stores. If this pointer file could
/// move with the override, the app would have no way to find it again.
fn runtime_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(RUNTIME_CONFIG_FILE_NAME))
        .map_err(|e| e.to_string())
}

fn load_runtime_config(app: &tauri::AppHandle) -> RuntimeConfig {
    let path = match runtime_config_path(app) {
        Ok(p) => p,
        Err(_) => return RuntimeConfig::default(),
    };
    fs::read_to_string(&path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn save_runtime_config(app: &tauri::AppHandle, config: &RuntimeConfig) -> Result<(), String> {
    let path = runtime_config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn default_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

pub(crate) fn is_writable_dir(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    let probe = dir.join(".glossa-write-check");
    match fs::write(&probe, b"") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Decides which directory holds glossa.db: the override if it looks like a
/// real, writable copy of the database, otherwise the default. Falls back
/// silently rather than opening a fresh empty database at a stale or
/// misconfigured override path — that would look like data loss to the user.
pub(crate) fn choose_data_dir(override_dir: Option<&Path>, default_dir: &Path) -> PathBuf {
    if let Some(dir) = override_dir {
        if dir.join(DB_FILE_NAME).is_file() && is_writable_dir(dir) {
            return dir.to_path_buf();
        }
        log::warn!(
            "storage_config: ignoring invalid data dir override {}, falling back to default",
            dir.display()
        );
    }
    default_dir.to_path_buf()
}

/// Resolves the folder containing glossa.db (+ WAL/SHM sidecars). This is the
/// single source of truth other modules (db.rs, vector/mod.rs,
/// llm/custom_profiles.rs) must use instead of reconstructing the path
/// themselves, so a configured override applies everywhere consistently.
pub fn resolve_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config = load_runtime_config(app);
    let default_dir = default_data_dir(app)?;
    Ok(choose_data_dir(
        config.data_dir_override.as_deref().map(Path::new),
        &default_dir,
    ))
}

pub fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_data_dir(app).map(|dir| dir.join(DB_FILE_NAME))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirStatus {
    pub path: String,
    pub is_override: bool,
}

#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle) -> Result<DataDirStatus, String> {
    let config = load_runtime_config(&app);
    let resolved = resolve_data_dir(&app)?;
    let default_dir = default_data_dir(&app)?;
    Ok(DataDirStatus {
        path: resolved.to_string_lossy().into_owned(),
        is_override: config.data_dir_override.is_some() && resolved != default_dir,
    })
}

/// Copies glossa.db (+ WAL/SHM sidecars) to `new_path`, verifies the copy
/// opens and passes `PRAGMA quick_check`, then switches the bootstrap
/// pointer to it. The original location is left untouched — nothing here
/// deletes it — so a failed migration or a crash before the next successful
/// launch never loses data; the app simply keeps using the old location
/// until the override is proven to work.
#[tauri::command]
pub async fn set_data_dir(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    new_path: String,
) -> Result<(), String> {
    let new_dir = PathBuf::from(&new_path);
    fs::create_dir_all(&new_dir).map_err(|e| format!("Cannot create destination folder: {e}"))?;
    if !is_writable_dir(&new_dir) {
        return Err("Destination folder is not writable".to_string());
    }

    let _write_guard = write_coordinator.lock().await;

    let current_dir = resolve_data_dir(&app)?;
    if current_dir == new_dir {
        return Err("The selected folder is already the current data location".to_string());
    }

    let current_db = current_dir.join(DB_FILE_NAME);
    if !current_db.is_file() {
        return Err("No existing database found to migrate".to_string());
    }

    let new_db = new_dir.join(DB_FILE_NAME);
    if new_db.exists() {
        return Err(
            "Destination folder already contains a glossa.db — choose an empty folder".to_string(),
        );
    }
    for suffix in ["wal", "shm"] {
        if new_dir.join(format!("glossa.db-{suffix}")).exists() {
            return Err(format!(
                "Destination folder already contains glossa.db-{suffix} — choose an empty folder"
            ));
        }
    }

    fs::copy(&current_db, &new_db).map_err(|e| format!("Copy failed: {e}"))?;
    for suffix in ["wal", "shm"] {
        let sidecar = current_dir.join(format!("glossa.db-{suffix}"));
        if sidecar.is_file() {
            fs::copy(&sidecar, new_dir.join(format!("glossa.db-{suffix}")))
                .map_err(|e| format!("Sidecar copy failed: {e}"))?;
        }
    }

    let verify_conn = rusqlite::Connection::open(&new_db)
        .map_err(|e| format!("Verification failed to open the copy: {e}"))?;
    let quick_check: String = verify_conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|e| format!("Verification query failed: {e}"))?;
    drop(verify_conn);
    if quick_check != "ok" {
        return Err(format!("Verification failed: {quick_check}"));
    }

    save_runtime_config(
        &app,
        &RuntimeConfig {
            data_dir_override: Some(new_path),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn choose_data_dir_uses_override_when_valid() {
        let dir = std::env::temp_dir().join("glossa_test_storage_override_valid");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(DB_FILE_NAME), b"fake db").unwrap();

        let default_dir = std::env::temp_dir();
        let result = choose_data_dir(Some(&dir), &default_dir);

        assert_eq!(result, dir);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn choose_data_dir_falls_back_when_override_has_no_db() {
        let dir = std::env::temp_dir().join("glossa_test_storage_override_empty");
        fs::create_dir_all(&dir).unwrap();

        let default_dir = std::env::temp_dir();
        let result = choose_data_dir(Some(&dir), &default_dir);

        assert_eq!(result, default_dir);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn choose_data_dir_falls_back_when_override_missing() {
        let dir = std::env::temp_dir().join("glossa_test_storage_override_missing_xyz");
        let default_dir = std::env::temp_dir();

        let result = choose_data_dir(Some(&dir), &default_dir);

        assert_eq!(result, default_dir);
    }

    #[test]
    fn choose_data_dir_uses_default_when_no_override() {
        let default_dir = std::env::temp_dir();
        let result = choose_data_dir(None, &default_dir);
        assert_eq!(result, default_dir);
    }

    #[test]
    fn is_writable_dir_accepts_temp_dir() {
        assert!(is_writable_dir(&std::env::temp_dir()));
    }

    #[test]
    fn is_writable_dir_rejects_missing_dir() {
        let dir = std::env::temp_dir().join("glossa_test_storage_nonexistent_xyz");
        assert!(!is_writable_dir(&dir));
    }
}
