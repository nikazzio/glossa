//! Creazione e lettura dei backup dell'applicazione.
//!
//! Il percorso viene scelto dal backend. Il contenuto contiene il database, mai
//! le immagini del deposito. Il formato 2 offre due livelli: solo Glossa
//! (offuscamento documentato) e cifrato con password.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use tauri_plugin_dialog::DialogExt;

const PAYLOAD_ENTRY: &str = "backup.json";
const MANIFEST_ENTRY: &str = "manifest.json";
const BACKUP_EXTENSION: &str = "glossa-backup";
const FORMAT_VERSION: u32 = 2;
const MAGIC: &[u8] = b"GLOSSABK2\n";
const CHUNK_BYTES: usize = 64 * 1024;
const ARGON_MEMORY_KIB: u32 = 19_456;
const ARGON_ITERATIONS: u32 = 2;
const ARGON_PARALLELISM: u32 = 1;
const GLOSSA_ONLY_KEY: &[u8] = b"Glossa backup format 2 is obfuscation, not encryption.";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    privacy: BackupPrivacy,
    password: Option<String>,
    recovery_code: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum BackupPrivacy {
    GlossaOnly,
    Password,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveManifest {
    format: u32,
    content_hash: String,
    content_bytes: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptionHeader {
    format: u32,
    privacy: BackupPrivacy,
    password_salt: Option<Vec<u8>>,
    memory_kib: Option<u32>,
    iterations: Option<u32>,
    parallelism: Option<u32>,
    verifier_nonce: Option<Vec<u8>>,
    verifier: Option<Vec<u8>>,
    recovery_salt: Option<Vec<u8>>,
    recovery_verifier_nonce: Option<Vec<u8>>,
    recovery_verifier: Option<Vec<u8>>,
    password_key_nonce: Option<Vec<u8>>,
    password_key: Option<Vec<u8>>,
    recovery_key_nonce: Option<Vec<u8>>,
    recovery_key: Option<Vec<u8>>,
    chunk_nonce_prefix: Option<Vec<u8>>,
}

#[tauri::command]
pub async fn write_backup(
    app: tauri::AppHandle,
    payload: String,
    options: BackupOptions,
) -> Result<bool, String> {
    let suggested = format!("glossa-backup-{}.{BACKUP_EXTENSION}", today());
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Salva il backup di Glossa")
        .set_file_name(&suggested)
        .add_filter("Backup di Glossa", &[BACKUP_EXTENSION])
        .save_file(move |picked| {
            let _ = sender.send(picked);
        });
    let Some(picked) = receiver
        .await
        .map_err(|_| "La scelta del file è stata interrotta".to_string())?
    else {
        return Ok(false);
    };
    let path = picked
        .into_path()
        .map_err(|error| format!("Percorso non utilizzabile: {error}"))?;
    let archive = tauri::async_runtime::spawn_blocking(move || pack(&payload, &options))
        .await
        .map_err(|error| format!("Compressione non riuscita: {error}"))??;
    std::fs::write(&path, archive)
        .map_err(|error| format!("Scrittura del backup non riuscita: {error}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn read_backup(
    app: tauri::AppHandle,
    password: Option<String>,
) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Apri un backup di Glossa")
        .add_filter("Backup di Glossa", &[BACKUP_EXTENSION, "json"])
        .add_filter("Tutti i file", &["*"])
        .pick_file(move |picked| {
            let _ = sender.send(picked);
        });
    let Some(picked) = receiver
        .await
        .map_err(|_| "La scelta del file è stata interrotta".to_string())?
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|error| format!("Percorso non utilizzabile: {error}"))?;
    let bytes = std::fs::read(&path)
        .map_err(|error| format!("Lettura del backup non riuscita: {error}"))?;
    let payload = tauri::async_runtime::spawn_blocking(move || unpack(&bytes, password.as_deref()))
        .await
        .map_err(|error| format!("Lettura del backup non riuscita: {error}"))??;
    Ok(Some(payload))
}

fn pack(payload: &str, options: &BackupOptions) -> Result<Vec<u8>, String> {
    if options.privacy == BackupPrivacy::Password
        && (options.password.as_deref().map_or(true, str::is_empty)
            || options.recovery_code.as_deref().map_or(true, str::is_empty))
    {
        return Err("backup_password_required".to_string());
    }
    let archive = pack_zip(payload)?;
    let header = EncryptionHeader {
        format: FORMAT_VERSION,
        privacy: BackupPrivacy::GlossaOnly,
        password_salt: None,
        memory_kib: None,
        iterations: None,
        parallelism: None,
        verifier_nonce: None,
        verifier: None,
        recovery_salt: None,
        recovery_verifier_nonce: None,
        recovery_verifier: None,
        password_key_nonce: None,
        password_key: None,
        recovery_key_nonce: None,
        recovery_key: None,
        chunk_nonce_prefix: None,
    };
    match options.privacy {
        BackupPrivacy::GlossaOnly => envelope(header, xor_obfuscate(&archive)),
        BackupPrivacy::Password => pack_password(
            &archive,
            options.password.as_deref().unwrap_or_default(),
            options.recovery_code.as_deref().unwrap_or_default(),
        ),
    }
}

fn pack_zip(payload: &str) -> Result<Vec<u8>, String> {
    let manifest = ArchiveManifest {
        format: FORMAT_VERSION,
        content_hash: crate::provenance::fnv1a_hex(payload),
        content_bytes: payload.len(),
    };
    let mut archive = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    archive
        .start_file(MANIFEST_ENTRY, options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(
            serde_json::to_string(&manifest)
                .map_err(|error| error.to_string())?
                .as_bytes(),
        )
        .map_err(|error| error.to_string())?;
    archive
        .start_file(PAYLOAD_ENTRY, options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(payload.as_bytes())
        .map_err(|error| error.to_string())?;
    archive
        .finish()
        .map_err(|error| error.to_string())
        .map(|archive| archive.into_inner())
}

fn pack_password(archive: &[u8], password: &str, recovery_code: &str) -> Result<Vec<u8>, String> {
    let mut password_salt = vec![0; 16];
    let mut recovery_salt = vec![0; 16];
    let mut verifier_nonce = vec![0; 12];
    let mut prefix = vec![0; 4];
    let mut content_key = [0; 32];
    rand::thread_rng().fill_bytes(&mut password_salt);
    rand::thread_rng().fill_bytes(&mut recovery_salt);
    rand::thread_rng().fill_bytes(&mut content_key);
    rand::thread_rng().fill_bytes(&mut verifier_nonce);
    rand::thread_rng().fill_bytes(&mut prefix);
    let key = derive_key(
        password,
        &password_salt,
        ARGON_MEMORY_KIB,
        ARGON_ITERATIONS,
        ARGON_PARALLELISM,
    )?;
    let password_cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let verifier = password_cipher
        .encrypt(
            Nonce::from_slice(&verifier_nonce),
            &b"glossa backup password verifier"[..],
        )
        .map_err(|_| "backup_encryption_failed".to_string())?;
    let recovery_key = derive_key(
        recovery_code,
        &recovery_salt,
        ARGON_MEMORY_KIB,
        ARGON_ITERATIONS,
        ARGON_PARALLELISM,
    )?;
    let recovery_cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&recovery_key));
    let mut recovery_verifier_nonce = vec![0; 12];
    let mut password_key_nonce = vec![0; 12];
    let mut recovery_key_nonce = vec![0; 12];
    rand::thread_rng().fill_bytes(&mut recovery_verifier_nonce);
    rand::thread_rng().fill_bytes(&mut password_key_nonce);
    rand::thread_rng().fill_bytes(&mut recovery_key_nonce);
    let recovery_verifier = recovery_cipher
        .encrypt(
            Nonce::from_slice(&recovery_verifier_nonce),
            &b"glossa backup recovery verifier"[..],
        )
        .map_err(|_| "backup_encryption_failed".to_string())?;
    let password_key = password_cipher
        .encrypt(Nonce::from_slice(&password_key_nonce), &content_key[..])
        .map_err(|_| "backup_encryption_failed".to_string())?;
    let recovery_key = recovery_cipher
        .encrypt(Nonce::from_slice(&recovery_key_nonce), &content_key[..])
        .map_err(|_| "backup_encryption_failed".to_string())?;
    let header = EncryptionHeader {
        format: FORMAT_VERSION,
        privacy: BackupPrivacy::Password,
        password_salt: Some(password_salt),
        memory_kib: Some(ARGON_MEMORY_KIB),
        iterations: Some(ARGON_ITERATIONS),
        parallelism: Some(ARGON_PARALLELISM),
        verifier_nonce: Some(verifier_nonce),
        verifier: Some(verifier),
        recovery_salt: Some(recovery_salt),
        recovery_verifier_nonce: Some(recovery_verifier_nonce),
        recovery_verifier: Some(recovery_verifier),
        password_key_nonce: Some(password_key_nonce),
        password_key: Some(password_key),
        recovery_key_nonce: Some(recovery_key_nonce),
        recovery_key: Some(recovery_key),
        chunk_nonce_prefix: Some(prefix.clone()),
    };
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&content_key));
    let mut body = Vec::new();
    for (index, chunk) in archive.chunks(CHUNK_BYTES).enumerate() {
        let nonce = chunk_nonce(&prefix, index)?;
        let encrypted = cipher
            .encrypt(Nonce::from_slice(&nonce), chunk)
            .map_err(|_| "backup_encryption_failed".to_string())?;
        let length = u32::try_from(encrypted.len()).map_err(|_| "backup_too_large".to_string())?;
        body.extend_from_slice(&length.to_be_bytes());
        body.extend_from_slice(&encrypted);
    }
    envelope(header, body)
}

fn envelope(header: EncryptionHeader, body: Vec<u8>) -> Result<Vec<u8>, String> {
    let header = serde_json::to_vec(&header).map_err(|_| "backup_header_invalid".to_string())?;
    let length = u32::try_from(header.len()).map_err(|_| "backup_header_invalid".to_string())?;
    let mut output = Vec::with_capacity(MAGIC.len() + 4 + header.len() + body.len());
    output.extend_from_slice(MAGIC);
    output.extend_from_slice(&length.to_be_bytes());
    output.extend_from_slice(&header);
    output.extend_from_slice(&body);
    Ok(output)
}

fn unpack(bytes: &[u8], password: Option<&str>) -> Result<String, String> {
    let archive = if bytes.starts_with(MAGIC) {
        let (header, body) = parse_envelope(bytes)?;
        if header.format > FORMAT_VERSION {
            return Err("backup_format_too_new".to_string());
        }
        match header.privacy {
            BackupPrivacy::GlossaOnly => xor_obfuscate(body),
            BackupPrivacy::Password => unpack_password(&header, body, password)?,
        }
    } else {
        return Err("backup_format_unsupported".to_string());
    };
    unpack_zip(&archive)
}

fn parse_envelope(bytes: &[u8]) -> Result<(EncryptionHeader, &[u8]), String> {
    let length_start = MAGIC.len();
    let length_end = length_start + 4;
    let length: [u8; 4] = bytes
        .get(length_start..length_end)
        .ok_or_else(|| "backup_header_invalid".to_string())?
        .try_into()
        .map_err(|_| "backup_header_invalid".to_string())?;
    let header_end = length_end + u32::from_be_bytes(length) as usize;
    let header = serde_json::from_slice(
        bytes
            .get(length_end..header_end)
            .ok_or_else(|| "backup_header_invalid".to_string())?,
    )
    .map_err(|_| "backup_header_invalid".to_string())?;
    Ok((
        header,
        bytes
            .get(header_end..)
            .ok_or_else(|| "backup_header_invalid".to_string())?,
    ))
}

fn unpack_password(
    header: &EncryptionHeader,
    body: &[u8],
    password: Option<&str>,
) -> Result<Vec<u8>, String> {
    let password = password
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "backup_password_required".to_string())?;
    let (
        Some(password_salt),
        Some(memory),
        Some(iterations),
        Some(parallelism),
        Some(verifier_nonce),
        Some(verifier),
        Some(recovery_salt),
        Some(recovery_verifier_nonce),
        Some(recovery_verifier),
        Some(password_key_nonce),
        Some(password_key),
        Some(recovery_key_nonce),
        Some(recovery_key),
        Some(prefix),
    ) = (
        header.password_salt.as_deref(),
        header.memory_kib,
        header.iterations,
        header.parallelism,
        header.verifier_nonce.as_deref(),
        header.verifier.as_deref(),
        header.recovery_salt.as_deref(),
        header.recovery_verifier_nonce.as_deref(),
        header.recovery_verifier.as_deref(),
        header.password_key_nonce.as_deref(),
        header.password_key.as_deref(),
        header.recovery_key_nonce.as_deref(),
        header.recovery_key.as_deref(),
        header.chunk_nonce_prefix.as_deref(),
    )
    else {
        return Err("backup_header_invalid".to_string());
    };
    let password_key_derived =
        derive_key(password, password_salt, memory, iterations, parallelism)?;
    let password_cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&password_key_derived));
    let content_key = if password_cipher
        .decrypt(Nonce::from_slice(verifier_nonce), verifier)
        .is_ok()
    {
        password_cipher
            .decrypt(Nonce::from_slice(password_key_nonce), password_key)
            .map_err(|_| "backup_corrupt".to_string())?
    } else {
        let recovery_key_derived =
            derive_key(password, recovery_salt, memory, iterations, parallelism)?;
        let recovery_cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&recovery_key_derived));
        if recovery_cipher
            .decrypt(
                Nonce::from_slice(recovery_verifier_nonce),
                recovery_verifier,
            )
            .is_err()
        {
            return Err("backup_wrong_password".to_string());
        }
        recovery_cipher
            .decrypt(Nonce::from_slice(recovery_key_nonce), recovery_key)
            .map_err(|_| "backup_corrupt".to_string())?
    };
    let cipher =
        Aes256Gcm::new_from_slice(&content_key).map_err(|_| "backup_corrupt".to_string())?;
    let mut cursor = 0;
    let mut archive = Vec::new();
    let mut index = 0;
    while cursor < body.len() {
        let length: [u8; 4] = body
            .get(cursor..cursor + 4)
            .ok_or_else(|| "backup_corrupt".to_string())?
            .try_into()
            .map_err(|_| "backup_corrupt".to_string())?;
        cursor += 4;
        let end = cursor + u32::from_be_bytes(length) as usize;
        let encrypted = body
            .get(cursor..end)
            .ok_or_else(|| "backup_corrupt".to_string())?;
        let nonce = chunk_nonce(prefix, index)?;
        let chunk = cipher
            .decrypt(Nonce::from_slice(&nonce), encrypted)
            .map_err(|_| "backup_corrupt".to_string())?;
        archive.extend_from_slice(&chunk);
        cursor = end;
        index += 1;
    }
    Ok(archive)
}

fn derive_key(
    password: &str,
    salt: &[u8],
    memory: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<[u8; 32], String> {
    let params = Params::new(memory, iterations, parallelism, Some(32))
        .map_err(|_| "backup_header_invalid".to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|_| "backup_key_derivation_failed".to_string())?;
    Ok(key)
}

fn chunk_nonce(prefix: &[u8], index: usize) -> Result<[u8; 12], String> {
    if prefix.len() != 4 {
        return Err("backup_header_invalid".to_string());
    }
    let mut nonce = [0; 12];
    nonce[..4].copy_from_slice(prefix);
    nonce[4..].copy_from_slice(
        &u64::try_from(index)
            .map_err(|_| "backup_too_large".to_string())?
            .to_be_bytes(),
    );
    Ok(nonce)
}

fn xor_obfuscate(bytes: &[u8]) -> Vec<u8> {
    bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ GLOSSA_ONLY_KEY[index % GLOSSA_ONLY_KEY.len()])
        .collect()
}

fn unpack_zip(bytes: &[u8]) -> Result<String, String> {
    let Ok(mut archive) = zip::ZipArchive::new(std::io::Cursor::new(bytes)) else {
        return Err("backup_unreadable".to_string());
    };
    let manifest: ArchiveManifest = {
        let mut entry = archive
            .by_name(MANIFEST_ENTRY)
            .map_err(|_| "backup_manifest_missing".to_string())?;
        let mut text = String::new();
        entry
            .read_to_string(&mut text)
            .map_err(|_| "backup_manifest_unreadable".to_string())?;
        serde_json::from_str(&text).map_err(|_| "backup_manifest_unreadable".to_string())?
    };
    if manifest.format > FORMAT_VERSION {
        return Err("backup_format_too_new".to_string());
    }
    let mut payload = String::new();
    archive
        .by_name(PAYLOAD_ENTRY)
        .map_err(|_| "backup_payload_missing".to_string())?
        .read_to_string(&mut payload)
        .map_err(|_| "backup_truncated".to_string())?;
    if payload.len() != manifest.content_bytes
        || crate::provenance::fnv1a_hex(&payload) != manifest.content_hash
    {
        return Err("backup_truncated".to_string());
    }
    Ok(payload)
}

fn today() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0);
    let days = (now / 86_400) as i64;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn options(
        privacy: BackupPrivacy,
        password: Option<&str>,
        recovery_code: Option<&str>,
    ) -> BackupOptions {
        BackupOptions {
            privacy,
            password: password.map(str::to_owned),
            recovery_code: recovery_code.map(str::to_owned),
        }
    }
    #[test]
    fn every_privacy_level_round_trips() {
        for (privacy, password, recovery_code) in [
            (BackupPrivacy::GlossaOnly, None, None),
            (
                BackupPrivacy::Password,
                Some("correct horse battery staple"),
                Some("c1a2-b3c4-d5e6-f7a8-0123-4567-89ab-cdef"),
            ),
        ] {
            let archive = pack(
                r#"{"tables":{}}"#,
                &options(privacy, password, recovery_code),
            )
            .unwrap();
            assert_eq!(unpack(&archive, password).unwrap(), r#"{"tables":{}}"#);
            if let Some(recovery_code) = recovery_code {
                assert_eq!(
                    unpack(&archive, Some(recovery_code)).unwrap(),
                    r#"{"tables":{}}"#
                );
            }
        }
    }
    #[test]
    fn wrong_password_is_not_reported_as_corruption() {
        let archive = pack(
            "{}",
            &options(BackupPrivacy::Password, Some("one"), Some("recovery")),
        )
        .unwrap();
        assert_eq!(
            unpack(&archive, Some("two")).unwrap_err(),
            "backup_wrong_password"
        );
    }
    #[test]
    fn damaged_encrypted_block_is_reported_as_corruption() {
        let mut archive = pack(
            "{}",
            &options(BackupPrivacy::Password, Some("one"), Some("recovery")),
        )
        .unwrap();
        *archive.last_mut().unwrap() ^= 1;
        assert_eq!(unpack(&archive, Some("one")).unwrap_err(), "backup_corrupt");
    }
    #[test]
    fn previous_format_is_refused() {
        let archive = pack_zip("{}").unwrap();
        assert_eq!(
            unpack(&archive, None).unwrap_err(),
            "backup_format_unsupported"
        );
    }
    #[test]
    fn encrypted_backup_requires_both_ways_back_in() {
        let result = pack("{}", &options(BackupPrivacy::Password, Some("one"), None));
        assert_eq!(result.unwrap_err(), "backup_password_required");
    }
}
