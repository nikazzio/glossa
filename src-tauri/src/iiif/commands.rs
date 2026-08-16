//! Comandi dei profili di rete e della misura delle pagine (#421, #422).
//!
//! Sottili: la logica — precedenza, validazione, limiti — sta in `settings.rs`,
//! che si prova senza un'app in esecuzione. Passano dal backend e non dalla SQL
//! del frontend perché **il tetto sulle richieste insieme va applicato dove i
//! valori si usano** (D11), non solo dove si scelgono.

use super::settings::{self, Library, Profile, ProfileInput};

fn connection(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    crate::db::open_connection(&crate::storage_config::db_path(app)?)
}

/// Quello che serve alla schermata: i ritmi e chi li usa.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSettings {
    pub profiles: Vec<Profile>,
    pub libraries: Vec<Library>,
}

fn snapshot(conn: &rusqlite::Connection) -> Result<NetworkSettings, String> {
    Ok(NetworkSettings {
        profiles: settings::list_profiles(conn)?,
        libraries: settings::list_libraries(conn)?,
    })
}

#[tauri::command]
pub fn list_network_settings(app: tauri::AppHandle) -> Result<NetworkSettings, String> {
    let conn = connection(&app)?;
    settings::ensure_builtin_profiles(&conn)?;
    snapshot(&conn)
}

/// Salva un profilo, nuovo o esistente. Restituisce lo stato **come è stato
/// davvero scritto**: se un valore è stato riportato dentro i limiti, la
/// schermata mostra subito quello che vale.
#[tauri::command]
pub async fn save_network_profile(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    profile: ProfileInput,
) -> Result<NetworkSettings, String> {
    let _write_guard = write_coordinator.lock().await;
    let conn = connection(&app)?;
    settings::save_profile(&conn, &profile)?;
    snapshot(&conn)
}

#[tauri::command]
pub async fn delete_network_profile(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    id: String,
) -> Result<NetworkSettings, String> {
    let _write_guard = write_coordinator.lock().await;
    let conn = connection(&app)?;
    settings::delete_profile(&conn, &id)?;
    snapshot(&conn)
}

#[tauri::command]
pub async fn set_library_network_profile(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    library_key: String,
    profile_id: String,
) -> Result<NetworkSettings, String> {
    let _write_guard = write_coordinator.lock().await;
    let conn = connection(&app)?;
    settings::set_library_profile(&conn, &library_key, &profile_id)?;
    snapshot(&conn)
}

/// La misura scelta per la singola opera (D4), quando c'è.
#[tauri::command]
pub fn get_version_size_cap(
    app: tauri::AppHandle,
    version_id: String,
) -> Result<Option<String>, String> {
    let conn = connection(&app)?;
    let stored: Option<Option<String>> = conn
        .query_row(
            "SELECT size_cap FROM source_versions WHERE id = ?1",
            rusqlite::params![version_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("misura dell'opera: {error}"))?;
    Ok(stored.flatten())
}

/// Sceglie la misura per un'opera. `None` significa «come dice l'impostazione
/// generale», che è il caso normale.
#[tauri::command]
pub async fn set_version_size_cap(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    version_id: String,
    size_cap: Option<String>,
) -> Result<Option<String>, String> {
    let size_cap = size_cap
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(settings::normalise_cap);

    let _write_guard = write_coordinator.lock().await;
    let conn = connection(&app)?;
    conn.execute(
        "UPDATE source_versions SET size_cap = ?2 WHERE id = ?1",
        rusqlite::params![version_id, size_cap],
    )
    .map_err(|error| format!("misura dell'opera: {error}"))?;
    Ok(size_cap)
}
