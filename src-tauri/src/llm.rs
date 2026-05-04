use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Notify;

static API_KEY_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static FILE_STORE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

// ── Types matching frontend ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntry {
    pub term: String,
    pub translation: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageConfig {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub model: String,
    pub provider: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineConfig {
    pub source_language: String,
    pub target_language: String,
    pub stages: Vec<StageConfig>,
    pub judge_prompt: String,
    pub judge_model: String,
    pub judge_provider: String,
    pub glossary: Vec<GlossaryEntry>,
    pub use_chunking: Option<bool>,
    pub markdown_aware: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeIssue {
    #[serde(rename = "type")]
    pub issue_type: String,
    pub severity: String,
    pub description: String,
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeResponse {
    pub rating: String,
    pub issues: Vec<JudgeIssue>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamToken {
    stream_id: String,
    token: String,
    done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_tokens: Option<u32>,
}

// ── Stream cancellation registry ─────────────────────────────────────

/// Cancellation handle stored in `StreamRegistry`.
///
/// `flag` is the synchronous source of truth (cheap atomic load before
/// each chunk). `notify` lets a task that is currently parked on
/// `resp.chunk().await` wake up immediately when cancellation is
/// requested, instead of waiting for the next byte from the provider.
pub struct CancelToken {
    flag: AtomicBool,
    notify: Notify,
}

impl CancelToken {
    fn new() -> Self {
        Self {
            flag: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    fn cancel(&self) {
        self.flag.store(true, Ordering::Release);
        self.notify.notify_waiters();
    }

    fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Acquire)
    }
}

/// Tracks in-flight streaming requests so the frontend can interrupt them.
///
/// When the user clicks "Stop", the frontend invokes `cancel_stream` with
/// the active stream id. The matching `CancelToken` is flipped and its
/// `Notify` fires; the SSE loop drops the response (closing the TCP
/// connection so the provider stops billing) and returns
/// `STREAM_CANCELLED_ERROR`.
#[derive(Default)]
pub struct StreamRegistry {
    cancels: Mutex<HashMap<String, Arc<CancelToken>>>,
}

impl StreamRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    fn register(&self, stream_id: &str) -> Arc<CancelToken> {
        let token = Arc::new(CancelToken::new());
        self.cancels
            .lock()
            .expect("StreamRegistry mutex poisoned")
            .insert(stream_id.to_string(), Arc::clone(&token));
        token
    }

    fn unregister(&self, stream_id: &str) {
        self.cancels
            .lock()
            .expect("StreamRegistry mutex poisoned")
            .remove(stream_id);
    }

    fn cancel(&self, stream_id: &str) {
        if let Some(token) = self
            .cancels
            .lock()
            .expect("StreamRegistry mutex poisoned")
            .get(stream_id)
        {
            token.cancel();
        }
    }
}

/// RAII guard that unregisters a stream id from the registry on drop,
/// even if the surrounding future is cancelled or panics.
struct StreamGuard<'a> {
    registry: &'a StreamRegistry,
    stream_id: String,
}

impl Drop for StreamGuard<'_> {
    fn drop(&mut self) {
        self.registry.unregister(&self.stream_id);
    }
}

/// Sentinel string used to identify a user-cancelled stream in error
/// flows; the frontend checks for this prefix to suppress the toast.
pub const STREAM_CANCELLED_ERROR: &str = "Stream cancelled";

// ── API Key management (OS Keychain) ─────────────────────────────────

const KEYRING_SERVICE: &str = "io.github.nikazzio.glossa";
const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const HTTP_CONNECT_TIMEOUT_SECS: u64 = 10;
const HTTP_REQUEST_TIMEOUT_SECS: u64 = 120;

const REFINE_STAGE_SYSTEM_PROMPT: &str = "\
You are an expert prompt engineer specializing in multi-stage AI translation pipelines.\n\
Your task: rewrite the user's translation-stage prompt to be clearer, more professional, \
and more effective for modern LLMs.\n\
Rules:\n\
- Preserve the original intent exactly — do not change what the stage is supposed to do\n\
- Use direct, imperative language\n\
- Be specific about register, tone, and quality expectations where relevant\n\
- Remove filler words and vague instructions\n\
- Output ONLY the rewritten prompt text — no preamble, no explanation, no quotes";

const REFINE_AUDIT_SYSTEM_PROMPT: &str = "\
You are an expert prompt engineer specializing in AI translation quality assessment.\n\
Your task: rewrite the user's audit/judge prompt to be more precise, structured, and \
effective for systematic quality evaluation.\n\
Rules:\n\
- Preserve the original evaluation intent — do not add criteria the user did not imply\n\
- Make evaluation criteria explicit and measurable\n\
- Reference relevant quality dimensions: accuracy, fluency, register, glossary adherence, grammar\n\
- Use professional translation-industry QA terminology where appropriate\n\
- Output ONLY the rewritten prompt text — no preamble, no explanation, no quotes";

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
    matches!(error, keyring::Error::NoStorageAccess(_))
}

fn keyring_entry(provider: &str) -> Result<keyring::Entry, String> {
    let username = format!("{}_API_KEY", provider.to_uppercase());
    keyring::Entry::new(KEYRING_SERVICE, &username).map_err(|e| format!("Keyring error: {e}"))
}

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(HTTP_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(HTTP_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Map an HTTP status to a short, user-safe explanation.
///
/// The provider response body may contain echoed prompts, headers, or PII;
/// we never propagate it to the frontend. The full body is logged via a
/// helper that compiles to a no-op outside `debug_assertions`, so release
/// binaries cannot surface the body even if a logger is wired up.
fn format_api_error(provider_label: &str, status: reqwest::StatusCode, body: &str) -> String {
    log_response_body(provider_label, status, body);
    let user_message = match status.as_u16() {
        400 => "bad request — check the model name or prompt",
        401 | 403 => "API key not authorized",
        404 => "model or endpoint not found",
        408 => "the provider timed out",
        413 => "input too large for the model",
        429 => "rate limited — retry shortly",
        500..=599 => "provider unavailable",
        _ => "unexpected response",
    };
    format!("{provider_label} API error ({status}): {user_message}")
}

/// Log the raw provider response body. Compiles to a no-op in release
/// builds so prompts/PII cannot leak through the logging subsystem.
#[cfg(debug_assertions)]
fn log_response_body(provider_label: &str, status: reqwest::StatusCode, body: &str) {
    log::debug!("{provider_label} API error body ({status}): {body}");
}

#[cfg(not(debug_assertions))]
fn log_response_body(_provider_label: &str, _status: reqwest::StatusCode, _body: &str) {}

/// Pick a short label from a base URL so error messages identify the
/// provider without leaking the URL itself.
fn provider_label_from_url(base_url: &str) -> &'static str {
    if base_url.contains("api.openai.com") {
        "OpenAI"
    } else if base_url.contains("api.deepseek.com") {
        "DeepSeek"
    } else if base_url.contains("11434") {
        "Ollama"
    } else {
        "Provider"
    }
}

/// Map a provider id (as used internally) to a human-readable label.
fn provider_label(provider: &str) -> &'static str {
    match provider {
        "gemini" => "Gemini",
        "openai" => "OpenAI",
        "deepseek" => "DeepSeek",
        "anthropic" => "Anthropic",
        "ollama" => "Ollama",
        _ => "Provider",
    }
}

fn legacy_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve app config directory: {e}"))?;
    Ok(config_dir.join("api-keys.json"))
}

fn legacy_store_key(provider: &str) -> String {
    format!("{}_API_KEY", provider.to_uppercase())
}

fn read_legacy_api_key_from_store_value(
    value: &serde_json::Value,
    provider: &str,
) -> Option<String> {
    let store_key = legacy_store_key(provider);
    value[store_key.as_str()]
        .as_str()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(ToOwned::to_owned)
}

fn migrate_from_legacy_store(app: &AppHandle, provider: &str) -> Result<String, String> {
    let store_path = legacy_store_path(app)?;
    if !store_path.exists() {
        return Err("Legacy store not found".into());
    }

    let contents =
        fs::read_to_string(&store_path).map_err(|e| format!("Failed to read legacy store: {e}"))?;
    let mut parsed: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse legacy store: {e}"))?;

    let key = read_legacy_api_key_from_store_value(&parsed, provider)
        .ok_or_else(|| "Provider key not present in legacy store".to_string())?;

    if let Ok(entry) = keyring_entry(provider) {
        entry
            .set_password(&key)
            .map_err(|e| format!("Failed to migrate legacy key to keychain: {e}"))?;
    }

    if let Some(object) = parsed.as_object_mut() {
        object.remove(&legacy_store_key(provider));
        let serialized = serde_json::to_string_pretty(&parsed)
            .map_err(|e| format!("Failed to rewrite legacy store: {e}"))?;
        fs::write(&store_path, serialized)
            .map_err(|e| format!("Failed to update legacy store: {e}"))?;
    }

    log::info!("Migrated {provider} API key from legacy store to OS keychain");
    Ok(key)
}

fn get_api_key(app: &AppHandle, provider: &str) -> Result<String, String> {
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

    // 2. Migrate from legacy store if present
    if let Ok(key) = migrate_from_legacy_store(app, provider) {
        if let Ok(mut cache) = API_KEY_CACHE.lock() {
            cache.insert(provider.to_string(), key.clone());
        }
        return Ok(key);
    }

    // 3. Try encrypted file store (used when keychain was unavailable on this machine)
    if let Ok(key) = file_store_get(app, provider) {
        if let Ok(mut cache) = API_KEY_CACHE.lock() {
            cache.insert(provider.to_string(), key.clone());
        }
        return Ok(key);
    }

    // 4. Fallback to environment variable
    let env_key = match provider {
        "gemini" => "GEMINI_API_KEY",
        "openai" => "OPENAI_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        "deepseek" => "DEEPSEEK_API_KEY",
        _ => return Err(format!("Unknown provider: {provider}")),
    };

    std::env::var(env_key).map_err(|_| format!("{env_key} is not configured. Set it in Settings."))
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

// ── Non-streaming provider implementations ───────────────────────────

async fn call_gemini(
    client: &Client,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    );

    let mut gen_config = serde_json::json!({});
    if json_mode {
        gen_config = serde_json::json!({
            "responseMimeType": "application/json"
        });
    }

    let body = serde_json::json!({
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": [{
            "role": "user",
            "parts": [{"text": user_prompt}]
        }],
        "generationConfig": gen_config
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format_api_error("Gemini", status, &text));
    }

    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

    json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No text in Gemini response".to_string())
}

async fn call_openai_compatible(
    client: &Client,
    base_url: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    let url = format!("{base_url}/chat/completions");

    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    });

    if json_mode {
        body["response_format"] = serde_json::json!({"type": "json_object"});
    }

    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("API request failed: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format_api_error(
            provider_label_from_url(base_url),
            status,
            &text,
        ));
    }

    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {e}"))?;

    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No content in response".to_string())
}

async fn call_anthropic(
    client: &Client,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    let system = if json_mode {
        format!("{system_prompt}\nIMPORTANT: Return ONLY valid JSON.")
    } else {
        system_prompt.to_string()
    };

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "system": system,
        "messages": [{"role": "user", "content": user_prompt}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format_api_error("Anthropic", status, &text));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Anthropic response: {e}"))?;

    json["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No text in Anthropic response".to_string())
}

/// Non-streaming call that also returns token usage for judge calls.
async fn call_provider_for_judge(
    client: &Client,
    provider: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
) -> Result<(String, Option<(u32, u32)>), String> {
    match provider {
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            );
            let body = serde_json::json!({
                "systemInstruction": { "parts": [{"text": system_prompt}] },
                "contents": [{ "role": "user", "parts": [{"text": user_prompt}] }],
                "generationConfig": { "responseMimeType": "application/json" }
            });
            let resp = client
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Gemini request failed: {e}"))?;
            let status = resp.status();
            let text = resp
                .text()
                .await
                .map_err(|e| format!("Failed to read response: {e}"))?;
            if !status.is_success() {
                return Err(format_api_error("Gemini", status, &text));
            }
            let json: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;
            let content = json["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "No text in Gemini response".to_string())?;
            let usage = match (
                json["usageMetadata"]["promptTokenCount"].as_u64(),
                json["usageMetadata"]["candidatesTokenCount"].as_u64(),
            ) {
                (Some(i), Some(o)) => Some((i as u32, o as u32)),
                _ => None,
            };
            Ok((content, usage))
        }
        "openai" | "deepseek" | "ollama" => {
            let base_url = match provider {
                "openai" => "https://api.openai.com/v1".to_string(),
                "deepseek" => "https://api.deepseek.com".to_string(),
                "ollama" => format!("{OLLAMA_BASE_URL}/v1"),
                _ => unreachable!(),
            };
            let url = format!("{base_url}/chat/completions");
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "response_format": {"type": "json_object"}
            });
            let mut req = client.post(&url).json(&body);
            if !api_key.is_empty() {
                req = req.header("Authorization", format!("Bearer {api_key}"));
            }
            let resp = req
                .send()
                .await
                .map_err(|e| format!("API request failed: {e}"))?;
            let status = resp.status();
            let text = resp
                .text()
                .await
                .map_err(|e| format!("Failed to read response: {e}"))?;
            if !status.is_success() {
                return Err(format_api_error(
                    provider_label_from_url(&base_url),
                    status,
                    &text,
                ));
            }
            let json: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| format!("Failed to parse response: {e}"))?;
            let content = json["choices"][0]["message"]["content"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "No content in response".to_string())?;
            let usage = match (
                json["usage"]["prompt_tokens"].as_u64(),
                json["usage"]["completion_tokens"].as_u64(),
            ) {
                (Some(i), Some(o)) => Some((i as u32, o as u32)),
                _ => None,
            };
            Ok((content, usage))
        }
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "system": format!("{system_prompt}\nIMPORTANT: Return ONLY valid JSON, with no markdown formatting, code blocks, or extra text."),
                "messages": [{"role": "user", "content": user_prompt}]
            });
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Anthropic request failed: {e}"))?;
            let status = resp.status();
            let text = resp
                .text()
                .await
                .map_err(|e| format!("Failed to read response: {e}"))?;
            if !status.is_success() {
                return Err(format_api_error("Anthropic", status, &text));
            }
            let json: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| format!("Failed to parse Anthropic response: {e}"))?;
            let content = json["content"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "No text in Anthropic response".to_string())?;
            let usage = match (
                json["usage"]["input_tokens"].as_u64(),
                json["usage"]["output_tokens"].as_u64(),
            ) {
                (Some(i), Some(o)) => Some((i as u32, o as u32)),
                _ => None,
            };
            Ok((content, usage))
        }
        _ => Err(format!("Unsupported provider for judge: {provider}")),
    }
}

/// Route a non-streaming call to the correct provider
async fn call_provider(
    client: &Client,
    provider: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    match provider {
        "gemini" => {
            call_gemini(
                client,
                model,
                system_prompt,
                user_prompt,
                api_key,
                json_mode,
            )
            .await
        }
        "openai" => {
            call_openai_compatible(
                client,
                "https://api.openai.com/v1",
                model,
                system_prompt,
                user_prompt,
                api_key,
                json_mode,
            )
            .await
        }
        "deepseek" => {
            call_openai_compatible(
                client,
                "https://api.deepseek.com",
                model,
                system_prompt,
                user_prompt,
                api_key,
                json_mode,
            )
            .await
        }
        "anthropic" => {
            call_anthropic(
                client,
                model,
                system_prompt,
                user_prompt,
                api_key,
                json_mode,
            )
            .await
        }
        "ollama" => {
            call_openai_compatible(
                client,
                &format!("{OLLAMA_BASE_URL}/v1"),
                model,
                system_prompt,
                user_prompt,
                api_key,
                json_mode,
            )
            .await
        }
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}

// ── Streaming implementation ─────────────────────────────────────────

/// Extract text token from a streaming SSE data payload based on provider
fn extract_streaming_text(provider: &str, data: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(data).ok()?;

    match provider {
        "gemini" => json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .map(|s| s.to_string()),
        "openai" | "deepseek" | "ollama" => json["choices"][0]["delta"]["content"]
            .as_str()
            .map(|s| s.to_string()),
        "anthropic" => {
            if json["type"].as_str() == Some("content_block_delta") {
                json["delta"]["text"].as_str().map(|s| s.to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Build an HTTP request with streaming enabled for the given provider
async fn build_streaming_request(
    client: &Client,
    provider: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
) -> Result<reqwest::Response, String> {
    match provider {
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
            );
            let body = serde_json::json!({
                "systemInstruction": { "parts": [{"text": system_prompt}] },
                "contents": [{ "role": "user", "parts": [{"text": user_prompt}] }]
            });
            client
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Gemini request failed: {e}"))
        }
        "openai" | "deepseek" | "ollama" => {
            let base_url = match provider {
                "openai" => "https://api.openai.com/v1".to_string(),
                "deepseek" => "https://api.deepseek.com".to_string(),
                "ollama" => format!("{OLLAMA_BASE_URL}/v1"),
                _ => unreachable!(),
            };
            let url = format!("{base_url}/chat/completions");
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": true,
                "stream_options": {"include_usage": true}
            });
            let mut req = client.post(&url).json(&body);
            if !api_key.is_empty() {
                req = req.header("Authorization", format!("Bearer {api_key}"));
            }
            req.send()
                .await
                .map_err(|e| format!("API request failed: {e}"))
        }
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
                "stream": true
            });
            client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Anthropic request failed: {e}"))
        }
        _ => Err(format!("Unsupported provider for streaming: {provider}")),
    }
}

/// Read an SSE stream, emit tokens via Tauri events, return the full text.
///
/// On every iteration `tokio::select!` races the next chunk read against
/// the cancellation `Notify`. If cancel fires while the task is parked
/// on a slow/idle provider, the response is dropped (closing the TCP
/// connection so the provider stops billing) and `STREAM_CANCELLED_ERROR`
/// is returned without waiting for the next byte.
async fn stream_response(
    app: &AppHandle,
    mut resp: reqwest::Response,
    provider: &str,
    stream_id: &str,
    cancel: &Arc<CancelToken>,
) -> Result<String, String> {
    let mut full_text = String::new();
    let mut buffer = String::new();
    let mut latest_input_tokens: Option<u32> = None;
    let mut latest_output_tokens: Option<u32> = None;
    // Anthropic splits usage across two events; track input separately.
    let mut anthropic_input_tokens: Option<u32> = None;

    loop {
        if cancel.is_cancelled() {
            drop(resp);
            return Err(STREAM_CANCELLED_ERROR.to_string());
        }
        let chunk_result = tokio::select! {
            biased;
            _ = cancel.notify.notified() => {
                drop(resp);
                return Err(STREAM_CANCELLED_ERROR.to_string());
            }
            chunk = resp.chunk() => chunk,
        };
        match chunk_result {
            Ok(Some(bytes)) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));

                // Process complete SSE lines
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim_end().to_string();
                    buffer = buffer[pos + 1..].to_string();

                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            continue;
                        }
                        if let Some(text) = extract_streaming_text(provider, data) {
                            if !text.is_empty() {
                                full_text.push_str(&text);
                                let _ = app.emit(
                                    "stream-token",
                                    StreamToken {
                                        stream_id: stream_id.to_string(),
                                        token: text,
                                        done: false,
                                        input_tokens: None,
                                        output_tokens: None,
                                    },
                                );
                            }
                        }

                        // Extract token usage from this SSE chunk.
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            match provider {
                                "openai" | "deepseek" | "ollama" => {
                                    // Final chunk with stream_options.include_usage = true
                                    if let (Some(i), Some(o)) = (
                                        json["usage"]["prompt_tokens"].as_u64(),
                                        json["usage"]["completion_tokens"].as_u64(),
                                    ) {
                                        latest_input_tokens = Some(i as u32);
                                        latest_output_tokens = Some(o as u32);
                                    }
                                }
                                "gemini" => {
                                    if let (Some(i), Some(o)) = (
                                        json["usageMetadata"]["promptTokenCount"].as_u64(),
                                        json["usageMetadata"]["candidatesTokenCount"].as_u64(),
                                    ) {
                                        latest_input_tokens = Some(i as u32);
                                        latest_output_tokens = Some(o as u32);
                                    }
                                }
                                "anthropic" => match json["type"].as_str() {
                                    Some("message_start") => {
                                        anthropic_input_tokens = json["message"]["usage"]
                                            ["input_tokens"]
                                            .as_u64()
                                            .map(|n| n as u32);
                                    }
                                    Some("message_delta") => {
                                        if let Some(out) = json["usage"]["output_tokens"].as_u64() {
                                            latest_input_tokens = anthropic_input_tokens;
                                            latest_output_tokens = Some(out as u32);
                                        }
                                    }
                                    _ => {}
                                },
                                _ => {}
                            }
                        }
                    }
                }
            }
            Ok(None) => break,
            Err(e) => return Err(format!("Stream error: {e}")),
        }
    }

    let _ = app.emit(
        "stream-token",
        StreamToken {
            stream_id: stream_id.to_string(),
            token: String::new(),
            done: true,
            input_tokens: latest_input_tokens,
            output_tokens: latest_output_tokens,
        },
    );

    Ok(full_text)
}

// ── Ollama-specific commands ─────────────────────────────────────────

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<String>, String> {
    let client = Client::new();
    let resp = client
        .get(format!("{OLLAMA_BASE_URL}/api/tags"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map_err(|_| "Cannot connect to Ollama. Is it running?".to_string())?;

    if !resp.status().is_success() {
        return Err("Ollama returned an error".into());
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid Ollama response: {e}"))?;

    let models = json["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

#[tauri::command]
pub async fn check_ollama_status() -> Result<bool, String> {
    let client = Client::new();
    match client
        .get(format!("{OLLAMA_BASE_URL}/"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

// ── Prompt builders ──────────────────────────────────────────────────

/// Returns a slice of `text` starting from the `(word_count - n)`-th word,
/// i.e. the trailing `n` words. Returns the full string if it has ≤ n words.
fn last_n_words(text: &str, n: usize) -> &str {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.len() <= n {
        return text.trim();
    }
    let start = words[words.len() - n];
    let offset = start.as_ptr() as usize - text.as_ptr() as usize;
    text[offset..].trim_start()
}

fn build_stage_prompts(
    text: &str,
    stage: &StageConfig,
    config: &PipelineConfig,
    previous_result: &Option<String>,
    previous_translation: &Option<String>,
) -> (String, String) {
    let glossary_str: String = config
        .glossary
        .iter()
        .map(|g| {
            format!(
                "- {} -> {} ({})",
                g.term,
                g.translation,
                g.notes.as_deref().unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let markdown_rules = if config.markdown_aware.unwrap_or(false) {
        "\n\nMarkdown Preservation Rules:\n\
         - Preserve every Markdown marker exactly as needed (*, **, _, [], (), headings, lists, block quotes, footnotes)\n\
         - Do not remove, reformat, or invent Markdown structure\n\
         - Translate only the human-language content while keeping Markdown syntax valid"
    } else {
        ""
    };

    let system_prompt = format!(
        "You are an expert translator and linguist specialized in {} to {} translation.\n\n\
         Core Instructions:\n{}\n\n\
         Glossary of Terms:\n{}{}",
        config.source_language,
        config.target_language,
        stage.prompt,
        if glossary_str.is_empty() {
            "No specific glossary entries.".to_string()
        } else {
            glossary_str
        },
        markdown_rules,
    );

    let context_block = match previous_translation {
        Some(prev) if !prev.is_empty() => {
            let tail = last_n_words(prev, 300);
            format!(
                "[Context from previous segment — do not translate, use only for stylistic and terminological coherence]\n\
                 {tail}\n\
                 [End of context]\n\n"
            )
        }
        _ => String::new(),
    };

    let user_prompt = match previous_result {
        Some(prev) if !prev.is_empty() => format!(
            "{context_block}Original: {text}\n\nPrevious Iteration: {prev}\n\n\
             Refine the above translation according to your instructions. Provide ONLY the final text."
        ),
        _ => format!("{context_block}Text to translate: {text}\n\nProvide ONLY the translated text."),
    };

    (system_prompt, user_prompt)
}

fn build_judge_prompts(
    original_text: &str,
    translation: &str,
    config: &PipelineConfig,
) -> (String, String) {
    let glossary_json = serde_json::to_string(&config.glossary).unwrap_or_default();

    let system_prompt = format!(
        "As a translation quality judge, evaluate the following translation.\n\
         Source ({src}): {original_text}\n\
         Target ({tgt}): {translation}\n\n\
         Specific Audit Instructions:\n{instructions}\n\n\
         Glossary to adhere to: {glossary_json}\n\n\
         {markdown_rules}\n\
         You MUST respond with a valid JSON object containing:\n\
         - rating: one of 'critical', 'poor', 'fair', 'good', 'excellent' \
           (semantic translation quality: critical=unusable, poor=weak, fair=usable with revision, \
           good=solid, excellent=publication-ready)\n\
         - issues: array of objects {{ type: 'glossary'|'fluency'|'accuracy'|'grammar', \
           severity: 'low'|'medium'|'high', description: string, suggestedFix: string }}",
        src = config.source_language,
        tgt = config.target_language,
        instructions = config.judge_prompt,
        markdown_rules = if config.markdown_aware.unwrap_or(false) {
            "When Markdown is present, verify that the translation preserves markers, footnotes, inline emphasis, and block structure exactly enough to remain valid Markdown."
        } else {
            ""
        },
    );

    let user_prompt = "Perform the audit now and return the JSON report.".to_string();

    (system_prompt, user_prompt)
}

// ── Coherence audit ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoherenceChunkInput {
    pub original: String,
    pub translation: String,
    pub prev_context: Option<String>,
    pub next_context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoherenceResponse {
    pub issues: Vec<JudgeIssue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
}

fn build_coherence_prompts(input: &CoherenceChunkInput, config: &PipelineConfig) -> (String, String) {
    let glossary_json = serde_json::to_string(&config.glossary).unwrap_or_default();

    let system_prompt = format!(
        "You are a translation coherence auditor for {src}→{tgt} translations.\n\
         Your task: identify cross-segment inconsistencies between a translated segment and its surrounding context.\n\
         Evaluate ONLY:\n\
         1. Terminology consistency — key terms translated differently than in adjacent segments\n\
         2. Narrative continuity — abrupt breaks in flow at segment boundaries\n\
         3. Glossary adherence — glossary terms used inconsistently with context\n\
         Do NOT re-evaluate standalone translation quality.\n\
         Glossary: {glossary}\n\n\
         Respond with valid JSON only:\n\
         {{\"issues\": [{{\"type\": \"consistency\"|\"glossary\", \
         \"severity\": \"low\"|\"medium\"|\"high\", \
         \"description\": \"string\", \"suggestedFix\": \"string\"}}]}}",
        src = config.source_language,
        tgt = config.target_language,
        glossary = glossary_json,
    );

    let prev_block = input
        .prev_context
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|ctx| format!("[Previous segment — context only]\n{ctx}\n[End of previous context]\n\n"))
        .unwrap_or_default();

    let next_block = input
        .next_context
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|ctx| format!("\n[Next segment — context only]\n{ctx}\n[End of next context]"))
        .unwrap_or_default();

    let user_prompt = format!(
        "{prev_block}[Current segment]\nOriginal: {original}\nTranslation: {translation}\n[End of current segment]{next_block}\n\n\
         Identify cross-segment coherence issues and return the JSON. If no issues, return {{\"issues\": []}}.",
        original = input.original,
        translation = input.translation,
    );

    (system_prompt, user_prompt)
}

#[tauri::command]
pub async fn run_coherence_for_chunk(
    app: AppHandle,
    input: CoherenceChunkInput,
    config: PipelineConfig,
) -> Result<CoherenceResponse, String> {
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = build_http_client()?;
    let (system_prompt, user_prompt) = build_coherence_prompts(&input, &config);

    let (result_text, usage) = call_provider_for_judge(
        &client,
        &config.judge_provider,
        &config.judge_model,
        &system_prompt,
        &user_prompt,
        &api_key,
    )
    .await?;

    let sanitized = sanitize_llm_json_output(&result_text);
    let parsed: serde_json::Value = serde_json::from_str(sanitized).map_err(|e| {
        format!("Failed to parse coherence JSON: {e}")
    })?;

    let issues: Vec<JudgeIssue> = parsed["issues"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    Some(JudgeIssue {
                        issue_type: v["type"].as_str()?.to_string(),
                        severity: v["severity"].as_str()?.to_string(),
                        description: v["description"].as_str()?.to_string(),
                        suggested_fix: v["suggestedFix"].as_str().map(|s| s.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(CoherenceResponse {
        issues,
        input_tokens: usage.map(|(i, _)| i),
        output_tokens: usage.map(|(_, o)| o),
    })
}

/// Strips markdown code fences and any preamble text that LLMs sometimes wrap around JSON output.
fn sanitize_llm_json_output(raw: &str) -> &str {
    let trimmed = raw.trim();
    match (trimmed.find('{'), trimmed.rfind('}')) {
        (Some(start), Some(end)) if end >= start => &trimmed[start..=end],
        _ => trimmed,
    }
}

fn parse_judge_rating(parsed: &serde_json::Value) -> String {
    if let Some(raw) = parsed["rating"].as_str() {
        match raw.trim().to_lowercase().as_str() {
            "critical" | "critico" | "critica" => return "critical".to_string(),
            "poor" | "scarso" => return "poor".to_string(),
            "fair" | "sufficiente" | "accettabile" | "discreto" => return "fair".to_string(),
            "good" | "buono" => return "good".to_string(),
            "excellent" | "ottimo" => return "excellent".to_string(),
            _ => {}
        }
    }

    "fair".to_string()
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn run_stage(
    app: AppHandle,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    previous_translation: Option<String>,
) -> Result<String, String> {
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = build_http_client()?;
    let (system_prompt, user_prompt) =
        build_stage_prompts(&text, &stage, &config, &previous_result, &previous_translation);

    call_provider(
        &client,
        &stage.provider,
        &stage.model,
        &system_prompt,
        &user_prompt,
        &api_key,
        false,
    )
    .await
}

#[tauri::command]
pub async fn run_stage_stream(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    previous_translation: Option<String>,
    stream_id: String,
) -> Result<String, String> {
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = build_http_client()?;
    let (system_prompt, user_prompt) =
        build_stage_prompts(&text, &stage, &config, &previous_result, &previous_translation);

    let cancel = registry.register(&stream_id);
    let _guard = StreamGuard {
        registry: registry.inner(),
        stream_id: stream_id.clone(),
    };

    if cancel.is_cancelled() {
        return Err(STREAM_CANCELLED_ERROR.to_string());
    }

    let resp = build_streaming_request(
        &client,
        &stage.provider,
        &stage.model,
        &system_prompt,
        &user_prompt,
        &api_key,
    )
    .await?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format_api_error(
            provider_label(&stage.provider),
            status,
            &text,
        ));
    }

    stream_response(&app, resp, &stage.provider, &stream_id, &cancel).await
}

/// Mark a streaming request as cancelled. Idempotent and safe to call
/// after the stream has finished — unknown ids are ignored.
#[tauri::command]
pub fn cancel_stream(registry: State<'_, StreamRegistry>, stream_id: String) {
    registry.cancel(&stream_id);
}

#[tauri::command]
pub async fn judge_translation(
    app: AppHandle,
    original_text: String,
    translation: String,
    config: PipelineConfig,
) -> Result<JudgeResponse, String> {
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = build_http_client()?;
    let (system_prompt, user_prompt) = build_judge_prompts(&original_text, &translation, &config);

    let (result_text, usage) = call_provider_for_judge(
        &client,
        &config.judge_provider,
        &config.judge_model,
        &system_prompt,
        &user_prompt,
        &api_key,
    )
    .await?;

    let sanitized = sanitize_llm_json_output(&result_text);
    let parsed: serde_json::Value = serde_json::from_str(sanitized).map_err(|e| {
        #[cfg(debug_assertions)]
        {
            let preview: String = result_text.chars().take(500).collect();
            let truncated = if result_text.chars().nth(500).is_some() {
                "…"
            } else {
                ""
            };
            eprintln!("Failed to parse judge JSON: {e}. Preview: {preview}{truncated}");
        }
        format!("Failed to parse judge JSON: {e}")
    })?;

    let rating = parse_judge_rating(&parsed);
    let issues: Vec<JudgeIssue> = parsed["issues"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    Some(JudgeIssue {
                        issue_type: v["type"].as_str()?.to_string(),
                        severity: v["severity"].as_str()?.to_string(),
                        description: v["description"].as_str()?.to_string(),
                        suggested_fix: v["suggestedFix"].as_str().map(|s| s.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(JudgeResponse {
        rating,
        issues,
        content: translation,
        input_tokens: usage.map(|(i, _)| i),
        output_tokens: usage.map(|(_, o)| o),
    })
}

#[tauri::command]
pub async fn refine_prompt(
    app: AppHandle,
    prompt: String,
    provider: String,
    model: String,
    context: String,
) -> Result<String, String> {
    let api_key = get_api_key(&app, &provider)?;
    let client = build_http_client()?;
    let system_prompt = if context == "audit" {
        REFINE_AUDIT_SYSTEM_PROMPT
    } else {
        REFINE_STAGE_SYSTEM_PROMPT
    };
    let user_prompt = format!("Rewrite this prompt professionally:\n\n{prompt}");
    call_provider(
        &client,
        &provider,
        &model,
        system_prompt,
        &user_prompt,
        &api_key,
        false,
    )
    .await
}

#[tauri::command]
pub async fn test_provider_connection(app: AppHandle, provider: String) -> Result<bool, String> {
    if provider == "ollama" {
        return check_ollama_status().await.and_then(|ok| {
            if ok {
                Ok(true)
            } else {
                Err("Ollama is not running".into())
            }
        });
    }

    let api_key = get_api_key(&app, &provider)?;
    let client = build_http_client()?;

    let result = call_provider(
        &client,
        &provider,
        match provider.as_str() {
            "gemini" => "gemini-3-flash-preview",
            "openai" => "gpt-4o-mini",
            "anthropic" => "claude-3-haiku-latest",
            "deepseek" => "deepseek-chat",
            _ => return Err(format!("Unknown provider: {provider}")),
        },
        "You are a test assistant.",
        "Reply with exactly: OK",
        &api_key,
        false,
    )
    .await;

    match result {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}

// ── Tests ────────────────────────────────────────────────────────────

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
    fn fallback_only_for_missing_storage_access() {
        let no_storage = keyring::Error::NoStorageAccess(Box::new(std::io::Error::other("locked")));
        let platform_failure =
            keyring::Error::PlatformFailure(Box::new(std::io::Error::other("boom")));

        assert!(should_fallback_to_file_store(&no_storage));
        assert!(!should_fallback_to_file_store(&platform_failure));
        assert!(!should_fallback_to_file_store(&keyring::Error::NoEntry));
    }

    fn make_config() -> PipelineConfig {
        PipelineConfig {
            source_language: "English".into(),
            target_language: "Italian".into(),
            stages: vec![],
            judge_prompt: "Evaluate translation quality.".into(),
            judge_model: "gemini-3-flash-preview".into(),
            judge_provider: "gemini".into(),
            glossary: vec![GlossaryEntry {
                term: "API".into(),
                translation: "API".into(),
                notes: Some("Keep as-is".into()),
            }],
            use_chunking: Some(true),
            markdown_aware: None,
        }
    }

    fn make_stage(provider: &str) -> StageConfig {
        StageConfig {
            id: "stg-1".into(),
            name: "Translation".into(),
            prompt: "Translate accurately.".into(),
            model: "test-model".into(),
            provider: provider.into(),
            enabled: true,
        }
    }

    // ── extract_streaming_text ───────────────────────────────────────

    #[test]
    fn extract_gemini_streaming() {
        let data = r#"{"candidates":[{"content":{"parts":[{"text":"Ciao"}]}}]}"#;
        assert_eq!(extract_streaming_text("gemini", data), Some("Ciao".into()));
    }

    #[test]
    fn extract_openai_streaming() {
        let data = r#"{"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(extract_streaming_text("openai", data), Some("Hello".into()));
    }

    #[test]
    fn extract_deepseek_streaming() {
        let data = r#"{"choices":[{"delta":{"content":"Bonjour"}}]}"#;
        assert_eq!(
            extract_streaming_text("deepseek", data),
            Some("Bonjour".into())
        );
    }

    #[test]
    fn extract_ollama_streaming() {
        let data = r#"{"choices":[{"delta":{"content":"Hola"}}]}"#;
        assert_eq!(extract_streaming_text("ollama", data), Some("Hola".into()));
    }

    #[test]
    fn extract_anthropic_content_block_delta() {
        let data = r#"{"type":"content_block_delta","delta":{"text":"Guten Tag"}}"#;
        assert_eq!(
            extract_streaming_text("anthropic", data),
            Some("Guten Tag".into())
        );
    }

    #[test]
    fn extract_anthropic_non_delta_returns_none() {
        let data = r#"{"type":"message_start","message":{"id":"msg_1"}}"#;
        assert_eq!(extract_streaming_text("anthropic", data), None);
    }

    #[test]
    fn extract_unknown_provider_returns_none() {
        let data = r#"{"text":"hello"}"#;
        assert_eq!(extract_streaming_text("unknown", data), None);
    }

    #[test]
    fn extract_invalid_json_returns_none() {
        assert_eq!(extract_streaming_text("gemini", "not json"), None);
    }

    #[test]
    fn extract_empty_content_returns_empty_string() {
        let data = r#"{"choices":[{"delta":{"content":""}}]}"#;
        assert_eq!(extract_streaming_text("openai", data), Some("".into()));
    }

    #[test]
    fn extract_missing_path_returns_none() {
        let data = r#"{"choices":[]}"#;
        assert_eq!(extract_streaming_text("openai", data), None);
    }

    // ── build_stage_prompts ─────────────────────────────────────────

    #[test]
    fn stage_prompt_without_previous() {
        let config = make_config();
        let stage = make_stage("gemini");
        let (system, user) = build_stage_prompts("Hello world", &stage, &config, &None);

        assert!(system.contains("English to Italian"));
        assert!(system.contains("Translate accurately."));
        assert!(system.contains("API -> API"));
        assert!(user.contains("Hello world"));
        assert!(!user.contains("Previous Iteration"));
    }

    #[test]
    fn stage_prompt_with_previous() {
        let config = make_config();
        let stage = make_stage("openai");
        let prev = Some("Ciao mondo".to_string());
        let (system, user) = build_stage_prompts("Hello world", &stage, &config, &prev);

        assert!(system.contains("English to Italian"));
        assert!(user.contains("Hello world"));
        assert!(user.contains("Ciao mondo"));
        assert!(user.contains("Previous Iteration"));
    }

    #[test]
    fn stage_prompt_empty_glossary() {
        let mut config = make_config();
        config.glossary = vec![];
        let stage = make_stage("gemini");
        let (system, _) = build_stage_prompts("text", &stage, &config, &None);

        assert!(system.contains("No specific glossary entries"));
    }

    #[test]
    fn stage_prompt_multiple_glossary_entries() {
        let mut config = make_config();
        config.glossary = vec![
            GlossaryEntry {
                term: "API".into(),
                translation: "API".into(),
                notes: Some("tech".into()),
            },
            GlossaryEntry {
                term: "bug".into(),
                translation: "errore".into(),
                notes: None,
            },
        ];
        let stage = make_stage("gemini");
        let (system, _) = build_stage_prompts("text", &stage, &config, &None);

        assert!(system.contains("API -> API (tech)"));
        assert!(system.contains("bug -> errore ()"));
    }

    #[test]
    fn markdown_aware_stage_prompt_preserves_syntax() {
        let mut config = make_config();
        config.markdown_aware = Some(true);
        let stage = make_stage("gemini");
        let (system, user) = build_stage_prompts("Text with note[^1].", &stage, &config, &None);

        assert!(system.contains("Markdown"));
        assert!(system.contains("Preserve every Markdown marker"));
        assert!(user.contains("Text with note[^1]."));
    }

    // ── build_judge_prompts ─────────────────────────────────────────

    #[test]
    fn judge_prompt_includes_source_and_target() {
        let config = make_config();
        let (system, user) = build_judge_prompts("Hello", "Ciao", &config);

        assert!(system.contains("English"));
        assert!(system.contains("Italian"));
        assert!(system.contains("Hello"));
        assert!(system.contains("Ciao"));
        assert!(system.contains("rating"));
        assert!(system.contains("critical"));
        assert!(system.contains("poor"));
        assert!(system.contains("fair"));
        assert!(system.contains("good"));
        assert!(system.contains("excellent"));
        assert!(system.contains("issues"));
        assert!(user.contains("audit"));
    }

    #[test]
    fn judge_prompt_includes_instructions() {
        let config = make_config();
        let (system, _) = build_judge_prompts("src", "tgt", &config);

        assert!(system.contains("Evaluate translation quality."));
    }

    #[test]
    fn judge_prompt_includes_glossary_json() {
        let config = make_config();
        let (system, _) = build_judge_prompts("src", "tgt", &config);

        assert!(system.contains("API"));
        assert!(system.contains("Keep as-is"));
    }

    #[test]
    fn parses_semantic_judge_rating() {
        let parsed = parse_judge_rating(&serde_json::json!({"rating": "sufficiente"}));
        assert_eq!(parsed, "fair");

        let parsed = parse_judge_rating(&serde_json::json!({"rating": "ottimo"}));
        assert_eq!(parsed, "excellent");
    }

    #[test]
    fn defaults_unknown_judge_rating_to_fair() {
        let parsed = parse_judge_rating(&serde_json::json!({"rating": "ambiguous"}));
        assert_eq!(parsed, "fair");
    }

    #[test]
    fn sanitize_clean_json_passthrough() {
        let s = r#"{"rating":"good","issues":[]}"#;
        assert_eq!(sanitize_llm_json_output(s), s);
    }

    #[test]
    fn sanitize_strips_json_fence() {
        let s = "```json\n{\"rating\":\"good\"}\n```";
        assert_eq!(sanitize_llm_json_output(s), r#"{"rating":"good"}"#);
    }

    #[test]
    fn sanitize_strips_bare_fence() {
        let s = "```\n{\"rating\":\"fair\"}\n```";
        assert_eq!(sanitize_llm_json_output(s), r#"{"rating":"fair"}"#);
    }

    #[test]
    fn sanitize_strips_preamble_and_fence() {
        let s = "Sure! Here is the evaluation:\n```json\n{\"rating\":\"poor\"}\n```\n";
        assert_eq!(sanitize_llm_json_output(s), r#"{"rating":"poor"}"#);
    }

    #[test]
    fn builds_http_client_with_timeouts() {
        let client = build_http_client();
        assert!(client.is_ok());
    }

    #[test]
    fn reads_legacy_api_key_from_store_file_contents() {
        let value = serde_json::json!({
            "OPENAI_API_KEY": "legacy-secret",
            "GEMINI_API_KEY": "other-secret"
        });

        let parsed = read_legacy_api_key_from_store_value(&value, "openai");
        assert_eq!(parsed, Some("legacy-secret".into()));
    }

    #[test]
    fn ignores_empty_legacy_api_keys() {
        let value = serde_json::json!({
            "OPENAI_API_KEY": ""
        });

        let parsed = read_legacy_api_key_from_store_value(&value, "openai");
        assert_eq!(parsed, None);
    }

    // ── Serialization ───────────────────────────────────────────────

    #[test]
    fn glossary_entry_deserializes() {
        let json = r#"{"term":"API","translation":"API","notes":"Keep"}"#;
        let entry: GlossaryEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.term, "API");
        assert_eq!(entry.notes, Some("Keep".into()));
    }

    #[test]
    fn judge_issue_serializes_type_as_type() {
        let issue = JudgeIssue {
            issue_type: "fluency".into(),
            severity: "low".into(),
            description: "Minor".into(),
            suggested_fix: None,
        };
        let json = serde_json::to_string(&issue).unwrap();
        assert!(json.contains(r#""type":"fluency"#));
        assert!(!json.contains("issue_type"));
    }

    #[test]
    fn stream_token_serializes_camel_case() {
        let token = StreamToken {
            stream_id: "s1".into(),
            token: "hi".into(),
            done: false,
            input_tokens: None,
            output_tokens: None,
        };
        let json = serde_json::to_string(&token).unwrap();
        assert!(json.contains("streamId"));
        assert!(!json.contains("stream_id"));
        // Optional None fields must not appear in the serialized output.
        assert!(!json.contains("inputTokens"));
        assert!(!json.contains("outputTokens"));
    }

    #[test]
    fn stream_token_with_usage_serializes_token_counts() {
        let token = StreamToken {
            stream_id: "s1".into(),
            token: String::new(),
            done: true,
            input_tokens: Some(100),
            output_tokens: Some(50),
        };
        let json = serde_json::to_string(&token).unwrap();
        assert!(json.contains("inputTokens"));
        assert!(json.contains("outputTokens"));
        assert!(json.contains("100"));
        assert!(json.contains("50"));
    }

    #[test]
    fn pipeline_config_roundtrip() {
        let config = make_config();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: PipelineConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.source_language, "English");
        assert_eq!(parsed.glossary.len(), 1);
    }

    // ── call_provider routing ───────────────────────────────────────

    #[tokio::test]
    async fn call_provider_rejects_unknown() {
        let client = Client::new();
        let result = call_provider(&client, "fake_provider", "m", "s", "u", "k", false).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported provider"));
    }

    // ── error sanitization ──────────────────────────────────────────

    #[test]
    fn format_api_error_omits_response_body() {
        let secret = "user prompt: Confidential unpublished manuscript text";
        let msg = format_api_error("OpenAI", reqwest::StatusCode::UNAUTHORIZED, secret);
        assert!(!msg.contains(secret), "response body must not leak: {msg}");
        assert!(msg.contains("OpenAI"));
        assert!(msg.contains("API key not authorized"));
    }

    #[test]
    fn format_api_error_maps_common_statuses() {
        let cases = [
            (reqwest::StatusCode::BAD_REQUEST, "bad request"),
            (reqwest::StatusCode::FORBIDDEN, "API key not authorized"),
            (
                reqwest::StatusCode::NOT_FOUND,
                "model or endpoint not found",
            ),
            (reqwest::StatusCode::TOO_MANY_REQUESTS, "rate limited"),
            (reqwest::StatusCode::BAD_GATEWAY, "provider unavailable"),
        ];
        for (status, expected) in cases {
            let msg = format_api_error("Anthropic", status, "any body");
            assert!(
                msg.contains(expected),
                "status {status} should map to '{expected}', got: {msg}"
            );
        }
    }

    #[test]
    fn provider_label_from_url_identifies_known_hosts() {
        assert_eq!(
            provider_label_from_url("https://api.openai.com/v1"),
            "OpenAI"
        );
        assert_eq!(
            provider_label_from_url("https://api.deepseek.com"),
            "DeepSeek"
        );
        assert_eq!(
            provider_label_from_url("http://localhost:11434/v1"),
            "Ollama"
        );
        assert_eq!(provider_label_from_url("https://example.com"), "Provider");
    }

    #[test]
    fn provider_label_handles_all_supported_providers() {
        assert_eq!(provider_label("gemini"), "Gemini");
        assert_eq!(provider_label("openai"), "OpenAI");
        assert_eq!(provider_label("deepseek"), "DeepSeek");
        assert_eq!(provider_label("anthropic"), "Anthropic");
        assert_eq!(provider_label("ollama"), "Ollama");
        assert_eq!(provider_label("unknown"), "Provider");
    }

    // ── stream registry ─────────────────────────────────────────────

    #[test]
    fn stream_registry_register_returns_unflagged_handle() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        assert!(!token.is_cancelled());
    }

    #[test]
    fn stream_registry_cancel_flips_the_flag() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        registry.cancel("s-1");
        assert!(token.is_cancelled());
    }

    #[test]
    fn stream_registry_cancel_unknown_id_is_noop() {
        let registry = StreamRegistry::new();
        // Must not panic, must not poison the mutex
        registry.cancel("never-registered");
        let token = registry.register("now-real");
        assert!(!token.is_cancelled());
    }

    #[test]
    fn stream_registry_unregister_drops_the_handle() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        registry.unregister("s-1");
        // After unregister, cancelling the same id is a no-op against the
        // already-removed entry — but the original Arc still observes its
        // previous value (false), proving the flag wasn't touched.
        registry.cancel("s-1");
        assert!(!token.is_cancelled());
    }

    #[test]
    fn stream_guard_unregisters_on_drop() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        {
            let _guard = StreamGuard {
                registry: &registry,
                stream_id: "s-1".to_string(),
            };
        } // guard drops here
          // After drop, cancelling has no effect on the registered handle
        registry.cancel("s-1");
        assert!(!token.is_cancelled());
    }

    #[tokio::test]
    async fn cancel_token_wakes_a_parked_waiter() {
        // Verify Notify wakes a task that is awaiting notified() the
        // moment cancel() is called. This is the property that makes
        // the SSE select! responsive even while a provider is idle.
        let token = Arc::new(CancelToken::new());
        let listener = {
            let token = Arc::clone(&token);
            tokio::spawn(async move {
                token.notify.notified().await;
                token.is_cancelled()
            })
        };

        // Yield once so the listener actually parks on notified().
        tokio::task::yield_now().await;

        token.cancel();

        let observed = tokio::time::timeout(std::time::Duration::from_millis(50), listener)
            .await
            .expect("listener did not wake within 50ms")
            .expect("listener task panicked");

        assert!(observed, "cancel flag must be set when notify wakes");
    }
}
