//! Il deposito: dove vivono i file scaricati dalle biblioteche.
//!
//! Il database resta nella cartella dati; il deposito è configurabile a parte,
//! così i gigabyte possono stare su un'altra partizione, un disco esterno o una
//! cartella sincronizzata senza portarci anche SQLite, che su una cartella
//! sincronizzata si corrompe.

pub mod commands;
pub mod integrity;
pub mod layout;
pub mod verification;

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Riconosce un deposito Glossa e impedisce di riversare migliaia di file in
/// una cartella scelta per errore.
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
    /// singolo file mancante**: con la radice assente gli stati non si
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
/// perché all'avvio serve sapere solo se la radice c'è.
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

/// Butta quello che una chiusura brusca ha lasciato nell'area di transito.
///
/// Lì dentro c'è **solo** roba non ancora promossa: un file che ha
/// superato la validazione è già nel deposito, e uno che non l'ha superata non
/// serve a nessuno. Un lavoro ripreso riscarica quella pagina e basta.
///
/// Si chiama all'avvio, quando per definizione non c'è nessun lavoro in corso
/// che possa averci scritto dentro un istante fa. Restituisce quante cartelle
/// sono state buttate.
///
/// Un errore qui non impedisce di aprire l'applicazione: si dice e si va
/// avanti, al massimo restano dei file di troppo.
pub fn discard_stale_staging(root: &Path) -> usize {
    let staging = root.join(layout::STAGING_DIR);
    let Ok(entries) = fs::read_dir(&staging) else {
        return 0;
    };
    let mut discarded = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let removed = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
        match removed {
            Ok(()) => discarded += 1,
            Err(error) => log::warn!(
                "vault staging not cleaned path={} error={error}",
                path.display()
            ),
        }
    }
    if discarded > 0 {
        log::info!("vault staging cleaned entries={discarded}");
    }
    discarded
}

/// Classifica una cartella candidata. Il marcatore distingue un deposito
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

/// Quanti file contiene una cartella e quanto pesano. Serve a dire quanto
/// spazio libera un'operazione prima di eseguirla.
///
/// File e byte si contano nella **stessa** camminata: su una digitalizzazione
/// di migliaia di pagine, e ancora di più su un deposito di rete, ogni passata
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

    #[test]
    fn what_a_brutal_shutdown_left_in_the_staging_area_is_thrown_away() {
        // Lì dentro c'è solo roba mai promossa: tenerla non serve a
        // nessuno, e un lavoro ripreso riscarica quella pagina.
        let root = std::env::temp_dir().join("glossa_staging_cleanup");
        let _ = fs::remove_dir_all(&root);
        let leftover = root.join(layout::STAGING_DIR).join("sver-1");
        fs::create_dir_all(&leftover).unwrap();
        fs::write(leftover.join("0007.jpg"), b"mezza pagina").unwrap();
        let kept = root.join("providers");
        fs::create_dir_all(&kept).unwrap();

        let discarded = discard_stale_staging(&root);

        assert_eq!(discarded, 1);
        assert!(!leftover.exists(), "l'area di transito resta vuota");
        assert!(kept.is_dir(), "il deposito non si tocca");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_vault_without_a_staging_area_is_not_a_problem() {
        let root = std::env::temp_dir().join("glossa_staging_absent");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();

        assert_eq!(discard_stale_staging(&root), 0);

        let _ = fs::remove_dir_all(&root);
    }
}
