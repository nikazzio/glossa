//! Il deposito: dove vivono i file scaricati dalle biblioteche (D1, D2).
//!
//! Il database resta nella cartella dati; il deposito è configurabile a parte,
//! così i gigabyte possono stare su un'altra partizione, un disco esterno o una
//! cartella sincronizzata senza portarci anche SQLite, che su una cartella
//! sincronizzata si corrompe (D1-bis).

pub mod commands;
pub mod integrity;
pub mod layout;

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Riconosce un deposito Glossa e impedisce di riversare migliaia di file in
/// una cartella scelta per errore (D1).
const MARKER_FILE: &str = ".glossa-vault";
const MARKER_CONTENT: &str = "glossa-vault v1\n";
/// Nome della cartella predefinita, dentro la cartella dati.
const DEFAULT_DIR: &str = "vault";

/// Cosa può contenere una cartella candidata a diventare deposito (D1, punto 3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderKind {
    /// Vuota o inesistente: si crea il deposito.
    Empty,
    /// Deposito Glossa già formato: si propone di ricollegarlo senza copiare,
    /// utile per spostare un disco fra due computer.
    ExistingVault,
    /// Contiene altro: ci si rifiuta.
    Foreign,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub path: String,
    /// Falso quando la radice non esiste: disco staccato, condivisione non
    /// montata, cartella cloud non ancora sincronizzata. **Caso diverso da
    /// singolo file mancante** (D1, D5): con la radice assente gli stati non si
    /// toccano e nessuno riscarica niente.
    pub reachable: bool,
    /// Vero quando il deposito sta dentro la cartella dati, cioè nessuno ha
    /// scelto una posizione propria.
    pub is_default: bool,
}

/// Radice predefinita: `vault/` accanto al database.
fn default_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage_config::resolve_data_dir(app)?.join(DEFAULT_DIR))
}

/// Radice configurata, senza toccare il disco.
///
/// L'impostazione arriva dal chiamante invece di essere letta qui: la lettura
/// di `app_settings` passa dal coordinatore delle scritture del database, e
/// questo modulo deve restare usabile anche dai test senza un'app in esecuzione.
pub fn resolve_root(app: &tauri::AppHandle, configured: Option<&str>) -> Result<PathBuf, String> {
    match configured.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => Ok(PathBuf::from(value)),
        None => default_root(app),
    }
}

/// Stato del deposito. Non scandisce niente: una sola chiamata al filesystem,
/// perché all'avvio serve sapere solo se la radice c'è (D5).
pub fn status(app: &tauri::AppHandle, configured: Option<&str>) -> Result<VaultStatus, String> {
    let root = resolve_root(app, configured)?;
    let is_default = configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none();
    Ok(VaultStatus {
        path: root.to_string_lossy().to_string(),
        reachable: root.is_dir(),
        is_default,
    })
}

/// Crea la radice se manca e ci scrive il marcatore. Idempotente.
pub fn ensure_root(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|e| format!("Failed to create the vault at {}: {e}", root.display()))?;
    let marker = root.join(MARKER_FILE);
    if !marker.exists() {
        fs::write(&marker, MARKER_CONTENT)
            .map_err(|e| format!("Failed to write the vault marker: {e}"))?;
    }
    Ok(())
}

/// Classifica una cartella candidata (D1). Il marcatore distingue un deposito
/// da ricollegare da una cartella qualunque piena di roba altrui.
pub fn classify_folder(candidate: &Path) -> Result<FolderKind, String> {
    if !candidate.exists() {
        return Ok(FolderKind::Empty);
    }
    if !candidate.is_dir() {
        return Err(format!("{} is not a folder", candidate.display()));
    }
    if candidate.join(MARKER_FILE).is_file() {
        return Ok(FolderKind::ExistingVault);
    }
    let mut entries = fs::read_dir(candidate)
        .map_err(|e| format!("Failed to read {}: {e}", candidate.display()))?;
    if entries.next().is_none() {
        Ok(FolderKind::Empty)
    } else {
        Ok(FolderKind::Foreign)
    }
}

/// Percorso assoluto di un file del deposito, a partire dal percorso relativo
/// conservato in `assets.vault_path`.
///
/// Rifiuta qualunque percorso che uscirebbe dalla radice: `vault_path` arriva
/// dal database, e il database è scrivibile dalla webview.
pub fn absolute_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative.is_absolute() {
        return Err("vault_path must be relative to the vault root".to_string());
    }
    if relative
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("vault_path must not escape the vault root".to_string());
    }
    Ok(root.join(relative))
}

/// Quanti file contiene una cartella e quanto pesano. Serve a dire quanto
/// spazio libera un'operazione prima di eseguirla (D6, D30).
///
/// File e byte si contano nella **stessa** camminata: su una digitalizzazione
/// di migliaia di carte, e ancora di più su un deposito di rete, ogni passata
/// in più è un giro completo di chiamate al filesystem.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DirectoryStats {
    pub files: usize,
    pub bytes: u64,
}

pub fn directory_stats(path: &Path) -> DirectoryStats {
    let Ok(entries) = fs::read_dir(path) else {
        return DirectoryStats::default();
    };
    entries
        .filter_map(Result::ok)
        .fold(DirectoryStats::default(), |total, entry| {
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => {
                    let nested = directory_stats(&entry.path());
                    DirectoryStats {
                        files: total.files + nested.files,
                        bytes: total.bytes + nested.bytes,
                    }
                }
                Ok(kind) if kind.is_file() => DirectoryStats {
                    files: total.files + 1,
                    bytes: total.bytes + entry.metadata().map(|m| m.len()).unwrap_or(0),
                },
                _ => total,
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("glossa_vault_mod_{name}"));
        let _ = fs::remove_dir_all(&path);
        path
    }

    #[test]
    fn ensure_root_creates_the_folder_and_the_marker() {
        let root = temp_dir("ensure");

        ensure_root(&root).unwrap();

        assert!(root.is_dir());
        assert!(root.join(MARKER_FILE).is_file());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn ensure_root_is_idempotent() {
        let root = temp_dir("idempotent");
        ensure_root(&root).unwrap();
        fs::write(root.join("providers.keep"), b"x").unwrap();

        ensure_root(&root).unwrap();

        assert!(root.join("providers.keep").is_file(), "non deve ripulire");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_missing_folder_counts_as_empty() {
        let root = temp_dir("missing");
        assert_eq!(classify_folder(&root).unwrap(), FolderKind::Empty);
    }

    #[test]
    fn an_empty_folder_can_become_a_vault() {
        let root = temp_dir("empty");
        fs::create_dir_all(&root).unwrap();

        assert_eq!(classify_folder(&root).unwrap(), FolderKind::Empty);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_folder_with_the_marker_is_an_existing_vault() {
        let root = temp_dir("existing");
        ensure_root(&root).unwrap();
        fs::create_dir_all(root.join("providers/gallica/v1")).unwrap();

        assert_eq!(classify_folder(&root).unwrap(), FolderKind::ExistingVault);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_folder_with_other_content_is_refused() {
        // Il caso che il marcatore esiste per impedire: la cartella scelta per
        // errore, tipo la home.
        let root = temp_dir("foreign");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("tesi.docx"), b"x").unwrap();

        assert_eq!(classify_folder(&root).unwrap(), FolderKind::Foreign);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_file_is_not_a_candidate_folder() {
        let path = std::env::temp_dir().join("glossa_vault_not_a_dir");
        fs::write(&path, b"x").unwrap();

        assert!(classify_folder(&path).is_err());

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn absolute_path_joins_a_relative_vault_path() {
        let root = Path::new("/deposito");
        let joined = absolute_path(root, "providers/gallica/v1/pages/2000/0001.jpg").unwrap();
        assert!(joined.starts_with(root));
        assert!(joined.ends_with("0001.jpg"));
    }

    #[test]
    fn absolute_path_rejects_escapes_and_absolutes() {
        let root = Path::new("/deposito");
        assert!(absolute_path(root, "../../etc/passwd").is_err());
        assert!(absolute_path(root, "providers/../../fuori").is_err());
        assert!(absolute_path(root, "/etc/passwd").is_err());
    }

    #[test]
    fn directory_stats_counts_nested_files_and_bytes_together() {
        let root = temp_dir("size");
        fs::create_dir_all(root.join("providers/gallica/v1/pages/2000")).unwrap();
        fs::write(
            root.join("providers/gallica/v1/pages/2000/0001.jpg"),
            vec![0u8; 500],
        )
        .unwrap();
        fs::write(
            root.join("providers/gallica/v1/manifest.json"),
            vec![0u8; 100],
        )
        .unwrap();

        assert_eq!(
            directory_stats(&root),
            DirectoryStats {
                files: 2,
                bytes: 600
            }
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn directory_stats_of_a_missing_folder_is_zero() {
        assert_eq!(
            directory_stats(&temp_dir("absent")),
            DirectoryStats::default()
        );
    }
}
