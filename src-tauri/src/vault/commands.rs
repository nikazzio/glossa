//! Comandi Tauri del deposito.
//!
//! Sottili di proposito: la logica sta nei moduli `layout` e `integrity`, che
//! sono funzioni pure e testabili senza un'app in esecuzione.

use super::{absolute_path, classify_folder, directory_size, integrity, resolve_root, status};
use super::{FolderKind, VaultStatus};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderCheck {
    pub kind: FolderKind,
    /// Vero solo se ci si può davvero scrivere: l'esistenza non basta, una
    /// cartella di rete montata in sola lettura esiste.
    pub writable: bool,
}

/// Stato del deposito, senza scandire niente (D5).
#[tauri::command]
pub fn get_vault_status(
    app: tauri::AppHandle,
    configured_root: Option<String>,
) -> Result<VaultStatus, String> {
    status(&app, configured_root.as_deref())
}

/// Classifica una cartella candidata prima di adottarla come deposito (D1).
/// Non modifica niente: risponde soltanto.
#[tauri::command]
pub fn check_vault_folder(path: String) -> Result<FolderCheck, String> {
    let candidate = PathBuf::from(&path);
    let kind = classify_folder(&candidate)?;
    Ok(FolderCheck {
        writable: is_writable(&candidate),
        kind,
    })
}

/// Percorsi attesi di una digitalizzazione completa (D2), da passare poi alla
/// verifica. Costruirli qui invece che nel frontend tiene la disposizione in un
/// posto solo.
#[tauri::command]
pub fn expected_version_paths(
    provider_key: String,
    version_id: String,
    size_tag: String,
    page_count: u32,
) -> Result<Vec<String>, String> {
    Ok(
        super::layout::expected_version_paths(&provider_key, &version_id, &size_tag, page_count)?
            .into_iter()
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .collect(),
    )
}

/// Crea la radice e il marcatore, se mancano. Idempotente.
#[tauri::command]
pub fn initialize_vault(
    app: tauri::AppHandle,
    configured_root: Option<String>,
) -> Result<(), String> {
    let root = resolve_root(&app, configured_root.as_deref())?;
    super::ensure_root(&root)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCheck {
    pub vault_path: String,
    pub present: bool,
}

/// Verifica **rapida** di presenza (D5): elenca e confronta, non ricalcola le
/// impronte. Millisecondi anche per un manoscritto grande.
///
/// Se la radice non è raggiungibile risponde con un errore invece di dichiarare
/// tutto mancante: radice assente e file mancante sono casi diversi (D1), e
/// confonderli farebbe riscaricare l'intera biblioteca.
#[tauri::command]
pub fn verify_files_present(
    app: tauri::AppHandle,
    configured_root: Option<String>,
    vault_paths: Vec<String>,
) -> Result<Vec<FileCheck>, String> {
    let root = resolve_root(&app, configured_root.as_deref())?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    vault_paths
        .into_iter()
        .map(|vault_path| {
            let absolute = absolute_path(&root, &vault_path)?;
            Ok(FileCheck {
                present: absolute.is_file(),
                vault_path,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIntegrity {
    pub vault_path: String,
    /// `valid` | `corrupt` | `missing`
    pub state: String,
    pub detail: Option<String>,
    pub checksum: Option<String>,
}

/// Verifica **completa** di integrità (D5): apre ogni file e ne ricalcola
/// l'impronta. Lenta in proporzione ai gigabyte, e su un deposito sincronizzato
/// in streaming costringe il client a scaricare tutto (D1-bis) — chi chiama
/// deve avvisare prima di partire.
#[tauri::command]
pub fn verify_files_integrity(
    app: tauri::AppHandle,
    configured_root: Option<String>,
    vault_paths: Vec<String>,
) -> Result<Vec<FileIntegrity>, String> {
    let root = resolve_root(&app, configured_root.as_deref())?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    vault_paths
        .into_iter()
        .map(|vault_path| {
            let absolute = absolute_path(&root, &vault_path)?;
            let is_manifest = absolute.extension().is_some_and(|ext| ext == "json");
            let validation = if is_manifest {
                integrity::validate_manifest(&absolute)
            } else {
                integrity::validate_image(&absolute)
            };
            let (state, detail, checksum) = match validation {
                integrity::Validation::Valid => {
                    ("valid", None, integrity::file_checksum(&absolute).ok())
                }
                integrity::Validation::Corrupt(reason) => ("corrupt", Some(reason), None),
                integrity::Validation::Missing => ("missing", None, None),
            };
            Ok(FileIntegrity {
                vault_path,
                state: state.to_string(),
                detail,
                checksum,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreedSpace {
    pub deleted_files: usize,
    pub freed_bytes: u64,
}

/// "Libera spazio" (D6): cancella le pagine scaricate di una digitalizzazione
/// **subito e per davvero**, senza passare dal cestino — spostare gigabyte nel
/// cestino non libera niente.
///
/// Le miniature restano: sono circa 3 MB e rendono il libro ancora sfogliabile.
/// Restano anche manifesto e derivati.
#[tauri::command]
pub fn free_version_pages(
    app: tauri::AppHandle,
    configured_root: Option<String>,
    provider_key: String,
    version_id: String,
) -> Result<FreedSpace, String> {
    let root = resolve_root(&app, configured_root.as_deref())?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    let pages = root.join(super::layout::pages_dir(&provider_key, &version_id)?);
    if !pages.is_dir() {
        return Ok(FreedSpace {
            deleted_files: 0,
            freed_bytes: 0,
        });
    }
    let freed_bytes = directory_size(&pages);
    let deleted_files = count_files(&pages);
    std::fs::remove_dir_all(&pages)
        .map_err(|e| format!("Failed to free {}: {e}", pages.display()))?;
    Ok(FreedSpace {
        deleted_files,
        freed_bytes,
    })
}

fn count_files(path: &std::path::Path) -> usize {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| match entry.file_type() {
            Ok(kind) if kind.is_dir() => count_files(&entry.path()),
            Ok(kind) if kind.is_file() => 1,
            _ => 0,
        })
        .sum()
}

/// Scrivere un file di prova è l'unico modo affidabile di sapere se si può
/// scrivere: i permessi dichiarati mentono su rete e su volumi montati.
fn is_writable(path: &std::path::Path) -> bool {
    if !path.is_dir() {
        // Una cartella che non esiste ancora è scrivibile se lo è il genitore.
        return path
            .parent()
            .map(|parent| parent.is_dir() && is_writable(parent))
            .unwrap_or(false);
    }
    let probe = path.join(".glossa-write-check");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("glossa_vault_cmd_{name}"));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn an_existing_writable_folder_is_reported_writable() {
        let dir = temp_dir("writable");
        assert!(is_writable(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_folder_that_does_not_exist_yet_follows_its_parent() {
        let parent = temp_dir("parent");
        let child = parent.join("nuova");
        assert!(is_writable(&child));
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    fn a_folder_under_a_missing_parent_is_not_writable() {
        let path = PathBuf::from("/nonexistent_glossa_root_xyz/deposito");
        assert!(!is_writable(&path));
    }

    #[test]
    fn the_write_probe_leaves_nothing_behind() {
        let dir = temp_dir("probe");
        is_writable(&dir);
        let leftovers: Vec<_> = fs::read_dir(&dir).unwrap().filter_map(Result::ok).collect();
        assert!(
            leftovers.is_empty(),
            "la prova di scrittura non deve lasciare file"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn count_files_walks_the_whole_tree() {
        let dir = temp_dir("count");
        fs::create_dir_all(dir.join("pages/2000")).unwrap();
        fs::create_dir_all(dir.join("pages/max")).unwrap();
        fs::write(dir.join("pages/2000/0001.jpg"), b"a").unwrap();
        fs::write(dir.join("pages/2000/0002.jpg"), b"b").unwrap();
        fs::write(dir.join("pages/max/0001.jpg"), b"c").unwrap();

        assert_eq!(count_files(&dir.join("pages")), 3);

        let _ = fs::remove_dir_all(&dir);
    }
}
