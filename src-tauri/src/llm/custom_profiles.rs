use rusqlite::{params, Connection};
use tauri::Manager;

use crate::llm::provider::LlmProvider;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub requires_api_key: bool,
}

fn db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("glossa.db"))
        .map_err(|e| format!("cannot resolve db path: {e}"))
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| format!("DB open error: {e}"))?;
    conn.execute_batch("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("PRAGMA error: {e}"))?;
    ensure_schema(&conn)?;
    Ok(conn)
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS custom_providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            requires_api_key INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );",
    )
    .map_err(|e| format!("Schema error: {e}"))
}

pub fn get_profile(app: &tauri::AppHandle, id: &str) -> Result<CustomProviderProfile, String> {
    let conn = open_db(app)?;
    conn.query_row(
        "SELECT id, name, base_url, requires_api_key FROM custom_providers WHERE id = ?1",
        params![id],
        |row| {
            Ok(CustomProviderProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                requires_api_key: row.get::<_, i64>(3)? != 0,
            })
        },
    )
    .map_err(|e| format!("Profile not found ({id}): {e}"))
}

#[tauri::command]
pub fn list_custom_provider_profiles(
    app: tauri::AppHandle,
) -> Result<Vec<CustomProviderProfile>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, base_url, requires_api_key FROM custom_providers ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;
    let profiles = stmt
        .query_map([], |row| {
            Ok(CustomProviderProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                requires_api_key: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))?;
    Ok(profiles)
}

#[tauri::command]
pub fn save_custom_provider_profile(
    app: tauri::AppHandle,
    id: String,
    name: String,
    base_url: String,
    api_key: Option<String>,
    requires_api_key: bool,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO custom_providers (id, name, base_url, requires_api_key) VALUES (?1, ?2, ?3, ?4)",
        params![
            id,
            name,
            base_url,
            if requires_api_key { 1i64 } else { 0i64 },
        ],
    )
    .map_err(|e| format!("Save error: {e}"))?;

    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
        let keystore_id = format!("custom:{id}");
        crate::keystore::save_api_key_sync(&app, &keystore_id, &key)?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_custom_provider_profile(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute(
        "DELETE FROM custom_providers WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;

    let keystore_id = format!("custom:{id}");
    // Best-effort key removal — ignore errors (key may not exist)
    let _ = crate::keystore::delete_api_key_sync(&app, &keystore_id);

    Ok(())
}

#[tauri::command]
pub async fn test_custom_provider_connection(
    app: tauri::AppHandle,
    id: String,
    model: String,
) -> Result<bool, String> {
    let profile = get_profile(&app, &id)?;
    let keystore_id = format!("custom:{id}");
    let api_key = if profile.requires_api_key {
        crate::keystore::get_api_key(&app, &keystore_id)?
    } else {
        String::new()
    };

    let provider = crate::llm::providers::openai::custom_endpoint(profile.base_url);
    let client = provider.http_client()?;
    let structured = crate::llm::types::StructuredPrompt {
        system: vec![crate::llm::types::PromptBlock {
            text: "You are a test assistant.".to_string(),
            cacheable: false,
        }],
        user: "Reply with exactly: OK".to_string(),
    };
    let req = crate::llm::provider::LlmRequest {
        model: &model,
        structured: &structured,
        api_key: &api_key,
        json_mode: false,
        json_schema_strict: false,
        provider_options: None,
    };

    match provider.call(&client, &req).await {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}
