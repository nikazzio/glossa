//! Comandi Tauri del deposito.
//!
//! Sottili di proposito: la logica sta nei moduli `layout` e `integrity`, che
//! sono funzioni pure e testabili senza un'app in esecuzione.

use super::{absolute_path, classify_folder, directory_stats, integrity, resolve_root, status};
use super::{FolderKind, VaultStatus};
use integrity::FileKind;
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
///
/// Rifiuta una cartella che contiene altro (D1). Il controllo sta qui e non
/// solo in `check_vault_folder`: sono due comandi distinti, e una schermata che
/// dimenticasse di chiamare il primo pianterebbe il marcatore in mezzo ai
/// documenti dell'utente, che da quel momento sembrerebbero un deposito.
#[tauri::command]
pub fn initialize_vault(
    app: tauri::AppHandle,
    configured_root: Option<String>,
) -> Result<(), String> {
    let root = resolve_root(&app, configured_root.as_deref())?;
    if classify_folder(&root)? == FolderKind::Foreign {
        return Err("vault_folder_not_empty".to_string());
    }
    super::ensure_root(&root)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCheck {
    pub vault_path: String,
    /// `present` | `missing` | `invalid`
    pub state: String,
    /// Perché il percorso è stato rifiutato, quando lo stato è `invalid`.
    pub detail: Option<String>,
}

/// Verifica **rapida** di presenza (D5): elenca e confronta, non ricalcola le
/// impronte. Millisecondi anche per un manoscritto grande.
///
/// Se la radice non è raggiungibile risponde con un errore invece di dichiarare
/// tutto mancante: radice assente e file mancante sono casi diversi (D1), e
/// confonderli farebbe riscaricare l'intera biblioteca.
///
/// Un percorso malformato in una riga **non** interrompe il controllo delle
/// altre: si segna quella riga come non valida e si va avanti. La verifica di
/// un manoscritto di duecento carte non può fermarsi tutta per un dato storto.
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
    Ok(vault_paths
        .into_iter()
        .map(|vault_path| check_one(&root, vault_path))
        .collect())
}

fn check_one(root: &std::path::Path, vault_path: String) -> FileCheck {
    match absolute_path(root, &vault_path) {
        Ok(absolute) => FileCheck {
            state: if absolute.is_file() {
                "present".to_string()
            } else {
                "missing".to_string()
            },
            detail: None,
            vault_path,
        },
        Err(reason) => FileCheck {
            state: "invalid".to_string(),
            detail: Some(reason),
            vault_path,
        },
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIntegrity {
    pub vault_path: String,
    /// `valid` | `corrupt` | `missing` | `invalid`
    pub state: String,
    pub detail: Option<String>,
    pub checksum: Option<String>,
}

/// Verifica **completa** di integrità (D5): apre ogni file, lo valida e ne
/// ricalcola l'impronta in una lettura sola. Lenta in proporzione ai gigabyte,
/// e su un deposito sincronizzato in streaming costringe il client a scaricare
/// tutto (D1-bis) — chi chiama deve avvisare prima di partire.
///
/// Come la verifica rapida, un percorso malformato non ferma le altre righe.
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
    Ok(vault_paths
        .into_iter()
        .map(|vault_path| scan_one(&root, vault_path))
        .collect())
}

fn scan_one(root: &std::path::Path, vault_path: String) -> FileIntegrity {
    let absolute = match absolute_path(root, &vault_path) {
        Ok(absolute) => absolute,
        Err(reason) => {
            return FileIntegrity {
                vault_path,
                state: "invalid".to_string(),
                detail: Some(reason),
                checksum: None,
            }
        }
    };
    // Il manifesto si riconosce dall'estensione: è l'unico file JSON che il
    // deposito contiene (D2).
    let kind = if absolute.extension().is_some_and(|ext| ext == "json") {
        FileKind::Manifest
    } else {
        FileKind::Image
    };
    let scan = integrity::scan_file(&absolute, kind);
    let (state, detail) = match scan.validation {
        integrity::Validation::Valid => ("valid", None),
        integrity::Validation::Corrupt(reason) => ("corrupt", Some(reason)),
        integrity::Validation::Missing => ("missing", None),
    };
    FileIntegrity {
        vault_path,
        state: state.to_string(),
        detail,
        checksum: scan.checksum,
    }
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
    // Una sola camminata per file e byte, prima di cancellare.
    let stats = directory_stats(&pages);
    std::fs::remove_dir_all(&pages)
        .map_err(|e| format!("Failed to free {}: {e}", pages.display()))?;
    Ok(FreedSpace {
        deleted_files: stats.files,
        freed_bytes: stats.bytes,
    })
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
    fn a_malformed_path_is_marked_invalid_without_stopping_the_others() {
        // Una riga storta nel database non deve far fallire il controllo
        // dell'intera digitalizzazione.
        let root = temp_dir("batch");
        fs::create_dir_all(root.join("providers/gallica/v1/pages/2000")).unwrap();
        fs::write(root.join("providers/gallica/v1/pages/2000/0001.jpg"), b"x").unwrap();

        let checks: Vec<FileCheck> = [
            "providers/gallica/v1/pages/2000/0001.jpg",
            "../fuori.jpg",
            "providers/gallica/v1/pages/2000/0002.jpg",
        ]
        .into_iter()
        .map(|path| check_one(&root, path.to_string()))
        .collect();

        assert_eq!(checks[0].state, "present");
        assert_eq!(checks[1].state, "invalid");
        assert!(checks[1].detail.is_some());
        assert_eq!(checks[2].state, "missing");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_full_check_marks_a_malformed_path_invalid_too() {
        let root = temp_dir("batch_integrity");

        let result = scan_one(&root, "/etc/passwd".to_string());

        assert_eq!(result.state, "invalid");
        assert_eq!(result.checksum, None);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_manifest_is_recognised_by_its_extension() {
        let root = temp_dir("kinds");
        fs::create_dir_all(root.join("providers/gallica/v1")).unwrap();
        fs::write(
            root.join("providers/gallica/v1/manifest.json"),
            br#"{"items":[]}"#,
        )
        .unwrap();

        let manifest = scan_one(&root, "providers/gallica/v1/manifest.json".to_string());

        assert_eq!(manifest.state, "valid", "un JSON valido non è un'immagine");
        assert!(manifest.checksum.is_some());

        let _ = fs::remove_dir_all(&root);
    }
}
