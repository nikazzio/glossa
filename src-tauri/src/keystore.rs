use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{LazyLock, Mutex},
};
use tauri::{AppHandle, Manager};

static API_KEY_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static FILE_STORE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

const KEYRING_SERVICE: &str = "io.github.nikazzio.glossa";

fn file_store_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;
    Ok(data_dir.join("keystore.master"))
}

fn file_store_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;
    Ok(data_dir.join("keystore.enc"))
}

fn set_owner_only_permissions(path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(path)
            .map_err(|e| format!("Failed to read file permissions: {e}"))?
            .permissions();
        permissions.set_mode(0o600);
        fs::set_permissions(path, permissions)
            .map_err(|e| format!("Failed to set restrictive file permissions: {e}"))?;
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let path_str = path.to_string_lossy();
        let username = std::env::var("USERNAME")
            .map_err(|_| "Cannot determine current Windows user".to_string())?;
        let acl_entry = format!("{}:F", username);
        let output = Command::new("icacls")
            .args([&*path_str, "/inheritance:r", "/grant:r", &acl_entry])
            .output()
            .map_err(|e| format!("icacls execution failed: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Failed to restrict keystore permissions: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    Ok(())
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("Invalid hex string".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("Invalid hex: {e}")))
        .collect()
}

/// Get or create the 32-byte master encryption key stored as hex in keystore.master.
/// The key is random and unique per app installation.
fn get_or_create_master_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let key_path = file_store_key_path(app)?;

    if key_path.exists() {
        let hex =
            fs::read_to_string(&key_path).map_err(|e| format!("Failed to read master key: {e}"))?;
        let bytes = from_hex(hex.trim())?;
        if bytes.len() != 32 {
            return Err("Master key file is corrupt".into());
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        return Ok(key);
    }

    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);

    if let Some(parent) = key_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    }
    fs::write(&key_path, to_hex(&key)).map_err(|e| format!("Failed to write master key: {e}"))?;
    set_owner_only_permissions(&key_path)?;

    Ok(key)
}

fn file_store_encrypt(app: &AppHandle, plaintext: &str) -> Result<String, String> {
    let master_key = get_or_create_master_key(app)?;
    let aes_key = Key::<Aes256Gcm>::from_slice(&master_key);
    let cipher = Aes256Gcm::new(aes_key);

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;

    Ok(format!("{}.{}", to_hex(&nonce_bytes), to_hex(&ciphertext)))
}

fn file_store_decrypt(app: &AppHandle, stored: &str) -> Result<String, String> {
    let master_key = get_or_create_master_key(app)?;
    let aes_key = Key::<Aes256Gcm>::from_slice(&master_key);
    let cipher = Aes256Gcm::new(aes_key);

    let parts: Vec<&str> = stored.splitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("Invalid encrypted key format".into());
    }

    let nonce_bytes = from_hex(parts[0])?;
    let ciphertext = from_hex(parts[1])?;

    if nonce_bytes.len() != 12 {
        return Err("Invalid nonce length".into());
    }

    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_slice())
        .map_err(|_| "Failed to decrypt API key (corrupt or wrong key)".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8 in decrypted key: {e}"))
}

fn file_store_load(app: &AppHandle) -> Result<HashMap<String, String>, String> {
    let path = file_store_data_path(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read key store: {e}"))?;
    serde_json::from_str(&contents).map_err(|e| format!("Failed to parse key store: {e}"))
}

fn file_store_write(app: &AppHandle, data: &HashMap<String, String>) -> Result<(), String> {
    let path = file_store_data_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    }
    let contents =
        serde_json::to_string(data).map_err(|e| format!("Failed to serialize key store: {e}"))?;
    let tmp_path = path.with_extension("enc.tmp");
    fs::write(&tmp_path, contents).map_err(|e| format!("Failed to write temp key store: {e}"))?;
    set_owner_only_permissions(&tmp_path)?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to replace key store atomically: {e}"))?;
    set_owner_only_permissions(&path)?;
    Ok(())
}

fn file_store_get(app: &AppHandle, provider: &str) -> Result<String, String> {
    let _guard = FILE_STORE_LOCK
        .lock()
        .map_err(|_| "File store lock poisoned".to_string())?;
    let data = file_store_load(app)?;
    let encrypted = data
        .get(provider)
        .ok_or_else(|| format!("Key not found in file store for {provider}"))?;
    file_store_decrypt(app, encrypted)
}

fn file_store_set(app: &AppHandle, provider: &str, key: &str) -> Result<(), String> {
    let _guard = FILE_STORE_LOCK
        .lock()
        .map_err(|_| "File store lock poisoned".to_string())?;
    let mut data = file_store_load(app)?;
    let encrypted = file_store_encrypt(app, key)?;
    data.insert(provider.to_string(), encrypted);
    file_store_write(app, &data)
}

fn file_store_remove(app: &AppHandle, provider: &str) {
    let Ok(_guard) = FILE_STORE_LOCK.lock() else {
        return;
    };
    if let Ok(mut data) = file_store_load(app) {
        data.remove(provider);
        let _ = file_store_write(app, &data);
    }
}

fn should_fallback_to_file_store(error: &keyring::Error) -> bool {
    matches!(
        error,
        keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_)
    )
}

fn keyring_entry(provider: &str) -> Result<keyring::Entry, String> {
    let username = format!("{}_API_KEY", provider.to_uppercase());
    keyring::Entry::new(KEYRING_SERVICE, &username).map_err(|e| format!("Keyring error: {e}"))
}

/// Retrieve the API key for a provider, trying (in order):
/// 1. OS keychain
/// 2. In-memory cache
/// 3. Encrypted local file store (used when keychain is unavailable)
/// 4. Environment variable
pub fn get_api_key(app: &AppHandle, provider: &str) -> Result<String, String> {
    // Ollama doesn't need an API key
    if provider == "ollama" {
        return Ok(String::new());
    }

    // 1. Try OS keychain
    if let Ok(entry) = keyring_entry(provider) {
        if let Ok(secret) = entry.get_password() {
            if !secret.is_empty() {
                if let Ok(mut cache) = API_KEY_CACHE.lock() {
                    cache.insert(provider.to_string(), secret.clone());
                }
                return Ok(secret);
            }
        }
    }

    if let Ok(cache) = API_KEY_CACHE.lock() {
        if let Some(secret) = cache.get(provider).filter(|secret| !secret.is_empty()) {
            return Ok(secret.clone());
        }
    }

    // 2. Try encrypted file store (used when keychain was unavailable on this machine)
    if let Ok(key) = file_store_get(app, provider) {
        if let Ok(mut cache) = API_KEY_CACHE.lock() {
            cache.insert(provider.to_string(), key.clone());
        }
        return Ok(key);
    }

    // 3. Fallback to environment variable (custom: providers never have env vars)
    if provider.starts_with("custom:") {
        return Err(format!(
            "API key for custom endpoint '{}' is not configured. Add it in Settings.",
            &provider["custom:".len()..]
        ));
    }
    let env_key = match provider {
        "gemini" => "GEMINI_API_KEY",
        "openai" => "OPENAI_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        "deepseek" => "DEEPSEEK_API_KEY",
        _ => return Err(format!("Unknown provider: {provider}")),
    };

    std::env::var(env_key).map_err(|_| format!("{env_key} is not configured. Set it in Settings."))
}

/// Sync helper for saving an API key — same logic as the Tauri command.
pub fn save_api_key_sync(app: &AppHandle, provider: &str, key: &str) -> Result<String, String> {
    let entry = keyring_entry(provider)?;
    match entry.set_password(key) {
        Ok(()) => {
            file_store_remove(app, provider);
            if let Ok(mut cache) = API_KEY_CACHE.lock() {
                cache.insert(provider.to_string(), key.to_string());
            }
            return Ok("keychain".to_string());
        }
        Err(error) if !should_fallback_to_file_store(&error) => {
            return Err(format!("Failed to save to keychain: {error}"));
        }
        Err(_) => {}
    }
    file_store_set(app, provider, key)?;
    if let Ok(mut cache) = API_KEY_CACHE.lock() {
        cache.insert(provider.to_string(), key.to_string());
    }
    Ok("file".to_string())
}

/// Sync helper for deleting an API key — same logic as the Tauri command.
pub fn delete_api_key_sync(app: &AppHandle, provider: &str) -> Result<(), String> {
    if let Ok(entry) = keyring_entry(provider) {
        let _ = entry.delete_credential();
    }
    file_store_remove(app, provider);
    if let Ok(mut cache) = API_KEY_CACHE.lock() {
        cache.remove(provider);
    }
    Ok(())
}

#[tauri::command]
pub async fn save_api_key(app: AppHandle, provider: String, key: String) -> Result<String, String> {
    // Try OS keychain first
    let entry = keyring_entry(&provider)?;
    match entry.set_password(&key) {
        Ok(()) => {
            // Remove from file store in case it was previously saved there
            file_store_remove(&app, &provider);
            if let Ok(mut cache) = API_KEY_CACHE.lock() {
                cache.insert(provider, key);
            }
            return Ok("keychain".to_string());
        }
        Err(error) if !should_fallback_to_file_store(&error) => {
            return Err(format!("Failed to save to keychain: {error}"));
        }
        Err(_) => {}
    }

    // Keychain unavailable — fall back to encrypted local file
    file_store_set(&app, &provider, &key)?;
    if let Ok(mut cache) = API_KEY_CACHE.lock() {
        cache.insert(provider.clone(), key);
    }
    log::warn!(
        "OS keychain unavailable for provider '{provider}'; key saved to encrypted local file"
    );
    Ok("file".to_string())
}

#[tauri::command]
pub async fn get_api_key_status(app: AppHandle, provider: String) -> Result<bool, String> {
    Ok(get_api_key(&app, &provider).is_ok())
}

#[tauri::command]
pub async fn delete_api_key(app: AppHandle, provider: String) -> Result<(), String> {
    // Best-effort delete from OS keychain
    if let Ok(entry) = keyring_entry(&provider) {
        let _ = entry.delete_credential();
    }
    // Best-effort delete from encrypted file store
    file_store_remove(&app, &provider);
    if let Ok(mut cache) = API_KEY_CACHE.lock() {
        cache.remove(&provider);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_roundtrip() {
        let original = b"hello world 12345678901234567";
        let hex = to_hex(original);
        let decoded = from_hex(&hex).expect("decode should succeed");
        assert_eq!(decoded, original);
    }

    #[test]
    fn fallback_for_storage_unavailable_errors() {
        let no_storage = keyring::Error::NoStorageAccess(Box::new(std::io::Error::other("locked")));
        // PlatformFailure also triggers fallback — covers WSL2 where the keyring
        // backend is unavailable and returns this variant instead of NoStorageAccess.
        let platform_failure =
            keyring::Error::PlatformFailure(Box::new(std::io::Error::other("boom")));

        assert!(should_fallback_to_file_store(&no_storage));
        assert!(should_fallback_to_file_store(&platform_failure));
        assert!(!should_fallback_to_file_store(&keyring::Error::NoEntry));
    }

}
