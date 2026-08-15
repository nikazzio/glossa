//! Comandi delle impostazioni di biblioteca (#421, #422).
//!
//! Sottili: la logica — precedenza, validazione, limiti — sta in `settings.rs`,
//! che si prova senza un'app in esecuzione. Passano dal backend e non dalla SQL
//! del frontend perché **il tetto sulle richieste insieme va applicato dove i
//! valori si usano** (D11), non solo dove si scelgono.

use super::network::NetworkProfile;
use super::settings::{self, LibrarySettings};

fn connection(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    crate::db::open_connection(&crate::storage_config::db_path(app)?)
}

/// Le biblioteche del registro con i loro valori in vigore, più le voci
/// aggiunte a mano su host che nel registro non compaiono.
#[tauri::command]
pub fn list_library_settings(app: tauri::AppHandle) -> Result<Vec<LibrarySettings>, String> {
    settings::list_settings(&connection(&app)?)
}

/// Salva quello che l'utente ha cambiato su una biblioteca.
///
/// Il profilo viene **riportato dentro i limiti** prima di essere scritto, e la
/// schermata rilegge quello che è stato davvero salvato: il valore che si vede
/// è quello che vale.
#[tauri::command]
pub async fn save_library_settings(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    key: String,
    size_cap: Option<String>,
    profile: NetworkProfile,
) -> Result<Vec<LibrarySettings>, String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("una biblioteca senza chiave non si può salvare".to_string());
    }
    let size_cap = size_cap
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(settings::normalise_cap);
    let profile = settings::within_limits(profile);

    let _write_guard = write_coordinator.lock().await;
    let conn = connection(&app)?;
    conn.execute(
        "INSERT INTO library_settings (key, size_cap, network_profile, updated_at) \
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP) \
         ON CONFLICT(key) DO UPDATE SET size_cap = excluded.size_cap, \
           network_profile = excluded.network_profile, updated_at = CURRENT_TIMESTAMP",
        rusqlite::params![
            key,
            size_cap,
            serde_json::to_string(&profile).map_err(|error| error.to_string())?
        ],
    )
    .map_err(|error| format!("salvataggio della biblioteca: {error}"))?;

    settings::list_settings(&conn)
}

/// Riporta una biblioteca ai valori compilati nell'applicazione: la riga se ne
/// va, e con lei la modifica. Una voce aggiunta a mano su un host sparisce del
/// tutto, perché sotto non c'è niente a cui tornare.
#[tauri::command]
pub async fn reset_library_settings(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    key: String,
) -> Result<Vec<LibrarySettings>, String> {
    let _write_guard = write_coordinator.lock().await;
    let conn = connection(&app)?;
    conn.execute(
        "DELETE FROM library_settings WHERE key = ?1",
        rusqlite::params![key],
    )
    .map_err(|error| format!("ripristino della biblioteca: {error}"))?;

    settings::list_settings(&conn)
}

/// Il profilo prudente, quello che vale per chi non ha voce nel registro
/// (D18). Serve alla schermata come punto di partenza quando si aggiunge a
/// mano una biblioteca per host: inventare quei valori nell'interfaccia
/// significherebbe tenerli in due posti.
#[tauri::command]
pub fn cautious_network_profile() -> NetworkProfile {
    super::network::CAUTIOUS
}

/// Il tetto scelto sulla singola fonte (D4), quando c'è.
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
        .map_err(|error| format!("tetto della fonte: {error}"))?;
    Ok(stored.flatten())
}

/// Sceglie il tetto per una fonte. `None` significa «come dice la biblioteca o
/// l'impostazione generale», che è il caso normale.
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
    .map_err(|error| format!("tetto della fonte: {error}"))?;
    Ok(size_cap)
}
