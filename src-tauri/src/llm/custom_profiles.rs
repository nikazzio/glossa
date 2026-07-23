use rusqlite::{params, Connection};
use tauri::Manager;
use url::Url;

use crate::llm::provider::LlmProvider;

fn is_loopback_host(host: &url::Host<&str>) -> bool {
    match host {
        url::Host::Domain(domain) => domain.eq_ignore_ascii_case("localhost"),
        url::Host::Ipv4(ip) => ip.is_loopback(),
        url::Host::Ipv6(ip) => ip.is_loopback(),
    }
}

/// Rejects custom endpoints that would send credentials over an unencrypted
/// connection to anything other than the local machine (e.g. a self-hosted
/// Ollama instance on 127.0.0.1). A plain-HTTP endpoint reachable over the
/// network could leak the API key to anyone able to observe the traffic.
fn validate_base_url(base_url: &str) -> Result<(), String> {
    let parsed = Url::parse(base_url).map_err(|e| format!("Invalid provider URL: {e}"))?;
    match parsed.scheme() {
        "https" => Ok(()),
        "http" => {
            let host = parsed
                .host()
                .ok_or_else(|| "Provider URL is missing a host".to_string())?;
            if is_loopback_host(&host) {
                Ok(())
            } else {
                Err("Non-local HTTP endpoints are not allowed — use HTTPS, or point to a loopback address (localhost/127.0.0.1) for local providers".to_string())
            }
        }
        other => Err(format!("Unsupported provider URL scheme: {other}")),
    }
}

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
    conn.execute_batch(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=10000;",
    )
        .map_err(|e| format!("PRAGMA error: {e}"))?;
    verify_schema(&conn)?;
    Ok(conn)
}

fn verify_schema(conn: &Connection) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'custom_providers')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Schema verification error: {e}"))?;
    if exists {
        Ok(())
    } else {
        Err("Database schema is not initialized yet".to_string())
    }
}

pub fn get_profile(app: &tauri::AppHandle, id: &str) -> Result<CustomProviderProfile, String> {
    let conn = open_db(app)?;
    let profile = conn
        .query_row(
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
        .map_err(|e| format!("Profile not found ({id}): {e}"))?;
    validate_base_url(&profile.base_url)?;
    Ok(profile)
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
pub async fn save_custom_provider_profile(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    id: String,
    name: String,
    base_url: String,
    api_key: Option<String>,
    requires_api_key: bool,
) -> Result<(), String> {
    validate_base_url(&base_url)?;
    let _write_guard = write_coordinator.lock().await;
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
pub async fn delete_custom_provider_profile(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
    id: String,
) -> Result<(), String> {
    let _write_guard = write_coordinator.lock().await;
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM custom_providers WHERE id = ?1", params![id])
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_endpoint() {
        assert!(validate_base_url("https://api.example.com/v1").is_ok());
    }

    #[test]
    fn accepts_http_localhost() {
        assert!(validate_base_url("http://localhost:11434/v1").is_ok());
    }

    #[test]
    fn accepts_http_loopback_ipv4() {
        assert!(validate_base_url("http://127.0.0.1:11434/v1").is_ok());
    }

    #[test]
    fn accepts_http_loopback_ipv6() {
        assert!(validate_base_url("http://[::1]:11434/v1").is_ok());
    }

    #[test]
    fn rejects_http_public_host() {
        let result = validate_base_url("http://api.example.com/v1");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Non-local HTTP"));
    }

    #[test]
    fn rejects_http_public_ip() {
        assert!(validate_base_url("http://93.184.216.34/v1").is_err());
    }

    #[test]
    fn rejects_unsupported_scheme() {
        let result = validate_base_url("ftp://example.com/v1");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Unsupported provider URL scheme"));
    }

    #[test]
    fn rejects_malformed_url() {
        assert!(validate_base_url("not a url").is_err());
    }
}
