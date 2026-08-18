//! Comandi Tauri del deposito.
//!
//! Sottili di proposito: la logica sta nei moduli `layout` e `integrity`, che
//! sono funzioni pure e testabili senza un'app in esecuzione.

use super::{absolute_path, classify_folder, directory_stats, integrity, resolve_root, status};
use super::{FolderKind, VaultStatus};
use integrity::FileKind;
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

/// Crea il deposito predefinito all'avvio, se nessuno ne ha scelto un altro.
///
/// Senza questo, la cartella `vault/` dentro la cartella dati non esiste finché
/// non arriva il primo scaricamento, e lo stato del deposito risulterebbe
/// "non raggiungibile" — che è il messaggio del disco staccato (D1), non della
/// cartella mai creata. Una radice **scelta dall'utente** invece non si crea
/// mai da soli: se non c'è, è perché il disco non è collegato.
pub fn ensure_default_root(app: &tauri::AppHandle) -> Result<(), String> {
    let db = crate::db::open_connection(&crate::storage_config::db_path(app)?)?;
    let configured: Option<String> = crate::jobs::store::read_setting(&db, "vault_root")?;
    let chosen = configured.filter(|value| !value.trim().is_empty());
    // Quello che una chiusura brusca ha lasciato nell'area di transito si
    // butta adesso: all'avvio non c'è nessun lavoro in corso, e lì dentro c'è
    // solo roba mai promossa (D16-bis).
    super::discard_stale_staging(&resolve_root(app, chosen.as_deref())?);
    if chosen.is_some() {
        // Una radice scelta dall'utente non si crea mai da soli: se non c'è, è
        // perché il disco non è collegato.
        return Ok(());
    }
    super::ensure_root(&resolve_root(app, None)?)
}

/// La radice scelta dall'utente, letta **qui**.
///
/// Prima arrivava come parametro dal frontend: significava che la webview
/// poteva far guardare — e far cancellare — dentro una cartella qualsiasi,
/// in contrasto con il principio di #405. Il percorso non attraversa più
/// l'interfaccia in nessuna direzione.
fn configured_root(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let conn = crate::db::open_connection(&crate::storage_config::db_path(app)?)?;
    crate::jobs::store::read_setting(&conn, "vault_root")
}

/// La radice da usare adesso: quella scelta, se c'è, altrimenti la predefinita.
fn root_of(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let configured = configured_root(app)?;
    resolve_root(app, configured.as_deref())
}

/// Stato del deposito, senza scandire niente (D5).
#[tauri::command]
pub fn get_vault_status(app: tauri::AppHandle) -> Result<VaultStatus, String> {
    let configured = configured_root(&app)?;
    status(&app, configured.as_deref())
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
/// Rifiuta una cartella che contiene altro (D1): l'unico modo di adottare un
/// deposito è passare dalla finestra aperta dal backend, che classifica prima
/// di scrivere.
#[tauri::command]
pub fn initialize_vault(app: tauri::AppHandle) -> Result<(), String> {
    let root = root_of(&app)?;
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
    vault_paths: Vec<String>,
) -> Result<Vec<FileCheck>, String> {
    let root = root_of(&app)?;
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
    vault_paths: Vec<String>,
) -> Result<Vec<FileIntegrity>, String> {
    let root = root_of(&app)?;
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

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreedSpace {
    pub deleted_files: usize,
    pub freed_bytes: u64,
    /// I percorsi che **sono** stati liberati, compresi quelli che sul disco
    /// non c'erano già più.
    ///
    /// Chi ha chiamato toglie le righe di questi e solo di questi. Guardare il
    /// solo `failed` non basta: una cancellazione riuscita a metà lasciava le
    /// righe di tutti, comprese quelle dei file spariti, e la scheda continuava
    /// a contarli disponibili.
    pub deleted: Vec<String>,
    /// I percorsi che non è stato possibile cancellare.
    ///
    /// Il file è ancora lì: la sua riga deve restare, altrimenti diventa
    /// invisibile a ogni schermata senza aver liberato un byte.
    pub failed: Vec<String>,
}

/// "Libera spazio" (D6): cancella le pagine scaricate di una digitalizzazione
/// **subito e per davvero**, senza passare dal cestino — spostare gigabyte nel
/// cestino non libera niente.
///
/// Le miniature restano: sono circa 3 MB e rendono il libro ancora sfogliabile.
/// Restano anche manifesto e derivati.
///
/// **I percorsi arrivano dalle righe, non da una chiave ricostruita.** Prima si
/// componeva `providers/<biblioteca>/<versione>/pages` da una chiave passata da
/// fuori: con la chiave sbagliata la cartella non esisteva, il comando
/// dichiarava zero file liberati *senza errore*, e chi chiamava cancellava le
/// righe comunque. Le pagine restavano sul disco senza più niente che le
/// reclamasse — 153 carte in un caso reale, ritrovate una per una allo
/// scaricamento successivo. `assets.vault_path` sa dove sta ogni carta: è quello
/// che si cancella.
#[tauri::command]
pub fn free_version_pages(
    app: tauri::AppHandle,
    version_id: String,
    vault_paths: Vec<String>,
) -> Result<FreedSpace, String> {
    let root = root_of(&app)?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }

    let mut freed = FreedSpace::default();
    for relative in &vault_paths {
        // Il comando è raggiungibile dalla webview: accetta solo le pagine
        // **di questa** digitalizzazione, così non può diventare il modo di
        // cancellare il manifesto o il libro del vicino.
        if !is_page_of(relative, &version_id) {
            return Err(format!("not a page path of {version_id}: {relative}"));
        }
        let absolute = absolute_path(&root, relative)?;
        let size = std::fs::metadata(&absolute)
            .map(|meta| meta.len())
            .unwrap_or(0);
        match std::fs::remove_file(&absolute) {
            Ok(()) => {
                freed.deleted_files += 1;
                freed.freed_bytes += size;
                freed.deleted.push(relative.clone());
                prune_empty_parents(&root, &absolute);
            }
            // Un file che non c'è già più è spazio già libero: la sua riga va
            // via comunque, altrimenti la Biblioteca continua a contarlo.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                freed.deleted.push(relative.clone());
                prune_empty_parents(&root, &absolute)
            }
            Err(error) => {
                log::warn!("page not freed path={} error={error}", absolute.display());
                freed.failed.push(relative.clone());
            }
        }
    }
    log::info!(
        "vault pages freed version={version_id} files={} bytes={} failed={}",
        freed.deleted_files,
        freed.freed_bytes,
        freed.failed.len()
    );
    Ok(freed)
}

/// Un percorso di pagina appartiene a questa digitalizzazione:
/// `providers/<qualunque biblioteca>/<versione>/pages/…`.
fn is_page_of(relative: &str, version_id: &str) -> bool {
    let mut parts = relative.split('/');
    parts.next() == Some(super::layout::PROVIDERS_DIR)
        && parts.next().is_some()
        && parts.next() == Some(version_id)
        && parts.next() == Some("pages")
        && parts.next().is_some()
}

/// Toglie le cartelle rimaste vuote sopra un file cancellato.
///
/// Senza, dopo "libera spazio" restano `pages/2000/` e `pages/` vuote, e la
/// verifica del deposito le conta come cartelle che nessuno reclama. Si ferma
/// alla prima cartella non vuota e non risale **mai** oltre la radice.
fn prune_empty_parents(root: &std::path::Path, from: &std::path::Path) {
    let mut current = from.parent();
    while let Some(dir) = current {
        if dir == root || !dir.starts_with(root) {
            return;
        }
        // `remove_dir` fallisce su una cartella non vuota: è il controllo.
        if std::fs::remove_dir(dir).is_err() {
            return;
        }
        current = dir.parent();
    }
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
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("glossa_vault_cmd_{name}"));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn only_the_pages_of_the_named_version_can_be_freed() {
        // Il comando è raggiungibile dalla webview: se accettasse qualunque
        // percorso, "libera spazio" diventerebbe il modo di cancellare il
        // manifesto, o il libro di un'altra digitalizzazione.
        assert!(is_page_of(
            "providers/archive_org/v1/pages/2000/0001.jpg",
            "v1"
        ));
        // La biblioteca non conta: la stessa opera ha lasciato cartelle sotto
        // più di una chiave, e le pagine vanno liberate dove sono davvero.
        assert!(is_page_of("providers/generic/v1/pages/2000/0001.jpg", "v1"));

        assert!(!is_page_of(
            "providers/archive_org/v2/pages/2000/0001.jpg",
            "v1"
        ));
        assert!(!is_page_of("providers/archive_org/v1/manifest.json", "v1"));
        assert!(!is_page_of(
            "providers/archive_org/v1/thumbnails/0001.jpg",
            "v1"
        ));
        assert!(!is_page_of("providers/archive_org/v1/pages", "v1"));
        assert!(!is_page_of("derived/v1/pages/2000/0001.jpg", "v1"));
    }

    #[test]
    fn freeing_space_takes_the_empty_folders_with_it() {
        // Senza, dopo "libera spazio" restano `pages/2000/` e `pages/` vuote, e
        // la verifica le conta come cartelle che nessuno reclama.
        let root = temp_dir("prune");
        let page = root.join("providers/archive_org/v1/pages/2000/0001.jpg");
        fs::create_dir_all(page.parent().unwrap()).unwrap();
        fs::write(&page, b"x").unwrap();
        fs::write(root.join("providers/archive_org/v1/manifest.json"), b"{}").unwrap();
        fs::remove_file(&page).unwrap();

        prune_empty_parents(&root, &page);

        assert!(!root.join("providers/archive_org/v1/pages").exists());
        // Si ferma alla prima cartella non vuota: il manifesto resta, e con lui
        // la sua cartella.
        assert!(root
            .join("providers/archive_org/v1/manifest.json")
            .is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn pruning_never_climbs_past_the_vault_root() {
        // La radice del deposito può essere una cartella scelta dall'utente, con
        // dentro altro: risalire oltre significherebbe cancellargliela.
        let root = temp_dir("prune_root");
        let page = root.join("providers/archive_org/v1/pages/2000/0001.jpg");
        fs::create_dir_all(page.parent().unwrap()).unwrap();

        prune_empty_parents(&root, &page);

        assert!(root.is_dir(), "la radice non si tocca");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_version_is_found_under_whichever_library_holds_it() {
        // La chiave della biblioteca si deduce da dati che possono essere già
        // stati cancellati: ricostruire il percorso da quella chiave lasciava le
        // cartelle sul disco per sempre. Si guarda sotto tutte.
        let root = temp_dir("folders");
        fs::create_dir_all(root.join("providers/generic/v1/pages")).unwrap();
        fs::create_dir_all(root.join("providers/archive_org/v1/thumbnails")).unwrap();
        fs::create_dir_all(root.join("providers/archive_org/v2")).unwrap();

        let found = version_folders(&root, "v1");

        assert_eq!(found.len(), 2, "trovate {found:?}");
        assert!(found.iter().all(|folder| folder.ends_with("v1")));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_vault_without_libraries_yet_has_no_folders_to_delete() {
        let root = temp_dir("folders_empty");
        assert!(version_folders(&root, "v1").is_empty());
        let _ = fs::remove_dir_all(&root);
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultChoice {
    pub path: String,
    pub kind: FolderKind,
    pub writable: bool,
    /// Vero quando la cartella è stata davvero adottata come deposito.
    pub adopted: bool,
    /// La cartella sembra dentro un servizio di sincronizzazione (D1-bis). In
    /// modalità streaming i file risultano presenti ma occupano zero byte, e la
    /// modalità di lettura "solo locale" diventerebbe una bugia.
    pub sync_folder: bool,
}

/// Nomi delle cartelle radice dei client di sincronizzazione più diffusi. È un
/// riconoscimento **per indizio**, non una certezza: il contrassegno vero dei
/// segnaposto è leggibile solo su Windows, e nemmeno lì in modo affidabile per
/// tutti i client. Serve a far comparire l'avvertenza, non a vietare la scelta.
const SYNC_FOLDER_HINTS: [&str; 6] = [
    "onedrive",
    "google drive",
    "googledrive",
    "dropbox",
    "icloud",
    "nextcloud",
];

fn looks_like_a_sync_folder(path: &std::path::Path) -> bool {
    let lowered = path.to_string_lossy().to_lowercase();
    SYNC_FOLDER_HINTS.iter().any(|hint| lowered.contains(hint))
}

/// Apre la finestra di scelta cartella **dal backend** e adotta il deposito.
///
/// Il percorso non attraversa la webview e nessun comando lo accetta come
/// parametro, come per l'import documenti dopo #405: il frontend riceve solo
/// l'esito. Rifiuta una cartella con altro contenuto e una dove non si può
/// scrivere (D1).
#[tauri::command]
pub async fn choose_vault_folder(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
) -> Result<Option<VaultChoice>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |picked| {
        let _ = sender.send(picked);
    });

    let Some(picked) = receiver
        .await
        .map_err(|_| "Folder selection was interrupted".to_string())?
    else {
        return Ok(None);
    };
    let folder = picked
        .into_path()
        .map_err(|error| format!("Unusable folder: {error}"))?;

    let kind = classify_folder(&folder)?;
    let writable = is_writable(&folder);
    let adoptable = writable && kind != FolderKind::Foreign;

    if adoptable {
        super::ensure_root(&folder)?;
        let _write_guard = write_coordinator.lock().await;
        let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('vault_root', ?1) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![folder.to_string_lossy()],
        )
        .map_err(|e| format!("Failed to save the vault folder: {e}"))?;
    }

    Ok(Some(VaultChoice {
        path: folder.to_string_lossy().to_string(),
        kind,
        writable,
        adopted: adoptable,
        sync_folder: looks_like_a_sync_folder(&folder),
    }))
}

/// Cancella **tutto** quello che una digitalizzazione ha nel deposito:
/// manifesto, miniature, pagine (D6).
///
/// È quello che serve quando l'opera esce dalla Biblioteca. Finché il cestino
/// non esiste, togliere un'opera e lasciarne i file sul disco produceva
/// cartelle che nessuno reclama più e che nessuna schermata sa mostrare:
/// riaggiungendo la stessa opera nasce un identificativo nuovo, quindi quei
/// file non sarebbero comunque tornati utili.
/// **Si cercano le cartelle, non si ricostruisce il percorso.** La stessa opera
/// di archive.org ha lasciato cartelle sotto `generic` e sotto `unknown`, perché
/// la chiave della biblioteca si deduce da dati che possono essere già stati
/// cancellati. Con la chiave sbagliata questo comando non trovava niente,
/// dichiarava di essere riuscito, e la cartella restava sul disco per sempre —
/// nove su dieci, in un deposito reale. Si guarda invece **sotto ogni
/// biblioteca** se esiste una cartella con questo identificativo.
#[tauri::command]
pub fn delete_version_files(
    app: tauri::AppHandle,
    version_id: String,
) -> Result<FreedSpace, String> {
    let root = root_of(&app)?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    super::layout::safe_component(&version_id)?;

    let mut freed = FreedSpace::default();
    let folders = version_folders(&root, &version_id);
    for folder in &folders {
        // Una sola camminata per file e byte, prima di cancellare.
        let stats = directory_stats(folder);
        match std::fs::remove_dir_all(folder) {
            Ok(()) => {
                freed.deleted_files += stats.files;
                freed.freed_bytes += stats.bytes;
            }
            Err(error) => {
                log::warn!(
                    "version folder not deleted path={} error={error}",
                    folder.display()
                );
                freed.failed.push(folder.to_string_lossy().to_string());
            }
        }
    }
    log::info!(
        "vault version deleted version={version_id} folders={} files={} bytes={} failed={}",
        folders.len(),
        freed.deleted_files,
        freed.freed_bytes,
        freed.failed.len()
    );
    Ok(freed)
}

/// Le cartelle che una digitalizzazione ha nel deposito, sotto qualunque
/// biblioteca.
fn version_folders(root: &std::path::Path, version_id: &str) -> Vec<std::path::PathBuf> {
    let Ok(entries) = std::fs::read_dir(root.join(super::layout::PROVIDERS_DIR)) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path().join(version_id))
        .filter(|folder| folder.is_dir())
        .collect()
}

/// Cancella i file che nessuna riga reclama (D5-bis).
///
/// **Riguarda il deposito adesso, non il conto dell'ultima verifica.** Fra la
/// verifica e questo comando può essere finito uno scaricamento: cancellare
/// sulla fede di un elenco vecchio toglierebbe file appena riconquistati. Per
/// questo si rilegge cosa il database dichiara e si cammina di nuovo le
/// cartelle, e si restituisce quanti ne sono stati tolti **davvero**.
#[tauri::command]
pub async fn delete_vault_orphans(app: tauri::AppHandle) -> Result<FreedSpace, String> {
    let root = root_of(&app)?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    let db_path = crate::storage_config::db_path(&app)?;

    tauri::async_runtime::spawn_blocking(move || {
        let conn = crate::db::open_connection(&db_path)?;
        let mut statement = conn
            .prepare(
                "SELECT vault_path FROM assets \
                 WHERE vault_path IS NOT NULL AND locality = 'local'",
            )
            .map_err(|error| error.to_string())?;
        let known: std::collections::HashSet<std::path::PathBuf> = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter_map(|relative| absolute_path(&root, &relative).ok())
            .collect();

        let mut freed = FreedSpace::default();
        for (path, bytes) in super::verification::orphan_files(&root, &known) {
            match std::fs::remove_file(&path) {
                Ok(()) => {
                    freed.deleted_files += 1;
                    freed.freed_bytes += bytes;
                    // Le cartelle che restano vuote sono orfane anche loro: un
                    // deposito reale ne aveva nove, di digitalizzazioni che
                    // nessuna riga reclamava più.
                    prune_empty_parents(&root, &path);
                }
                // Un file che non si riesce a togliere non ferma gli altri: si
                // dice nel registro e si va avanti, e il conto resta onesto.
                Err(error) => {
                    log::warn!("orphan not deleted path={} {error}", path.display());
                    freed.failed.push(path.to_string_lossy().to_string());
                }
            }
        }
        log::info!(
            "vault orphans deleted files={} bytes={} failed={}",
            freed.deleted_files,
            freed.freed_bytes,
            freed.failed.len()
        );
        Ok(freed)
    })
    .await
    .map_err(|error| format!("Deleting the orphan files failed: {error}"))?
}

/// Mette in coda la verifica del deposito (D5-bis).
///
/// Un lavoro solo per volta: chiederla due volte non ne apre due, restituisce
/// quella in corso. Rapida di default; completa su richiesta esplicita, perché
/// apre ogni file e su un deposito sincronizzato costringe il client a
/// scaricare tutto (D1-bis).
#[tauri::command]
pub async fn enqueue_vault_verification(
    jobs: tauri::State<'_, crate::jobs::commands::JobsState>,
    full: Option<bool>,
) -> Result<crate::jobs::JobRecord, String> {
    super::verification::enqueue(&jobs.0, full.unwrap_or(false)).await
}

/// "Tieni tutto insieme" (D1): deposito dentro la cartella dati, che è la
/// scelta predefinita e quella di chi non vuole pensarci.
#[tauri::command]
pub async fn use_default_vault_folder(
    app: tauri::AppHandle,
    write_coordinator: tauri::State<'_, crate::db::DbWriteCoordinator>,
) -> Result<VaultStatus, String> {
    let root = resolve_root(&app, None)?;
    super::ensure_root(&root)?;
    let _write_guard = write_coordinator.lock().await;
    let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('vault_root', '') \
         ON CONFLICT(key) DO UPDATE SET value = ''",
        [],
    )
    .map_err(|e| format!("Failed to reset the vault folder: {e}"))?;
    status(&app, None)
}
