//! Comandi Tauri del deposito.
//!
//! Sottili di proposito: la logica sta nei moduli `layout` e `integrity`, che
//! sono funzioni pure e testabili senza un'app in esecuzione.

use super::{classify_folder, directory_stats, resolve_root, status};
use super::{FolderKind, VaultStatus};
use serde::Serialize;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// Crea il deposito predefinito all'avvio, se nessuno ne ha scelto un altro.
///
/// Senza questo, la cartella `vault/` dentro la cartella dati non esiste finché
/// non arriva il primo scaricamento, e lo stato del deposito risulterebbe
/// "non raggiungibile" — che è il messaggio del disco staccato, non della
/// cartella mai creata. Una radice **scelta dall'utente** invece non si crea
/// mai da soli: se non c'è, è perché il disco non è collegato.
pub fn ensure_default_root(app: &tauri::AppHandle) -> Result<(), String> {
    let db = crate::db::open_connection(&crate::storage_config::db_path(app)?)?;
    let configured: Option<String> = crate::jobs::store::read_setting(&db, "vault_root")?;
    let chosen = configured.filter(|value| !value.trim().is_empty());
    // Quello che una chiusura brusca ha lasciato nell'area di transito si
    // butta adesso: all'avvio non c'è nessun lavoro in corso, e lì dentro c'è
    // solo roba mai promossa.
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
pub(crate) fn root_of(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let configured = configured_root(app)?;
    resolve_root(app, configured.as_deref())
}

/// Stato del deposito, senza scandire niente.
#[tauri::command]
pub fn get_vault_status(app: tauri::AppHandle) -> Result<VaultStatus, String> {
    let configured = configured_root(&app)?;
    status(&app, configured.as_deref())
}

/// Crea la radice e il marcatore, se mancano. Idempotente.
///
/// Rifiuta una cartella che contiene altro: l'unico modo di adottare un
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
pub struct FreedSpace {
    pub deleted_files: usize,
    pub freed_bytes: u64,
}

/// Impedisce cancellazioni concorrenti con lavori sulla digitalizzazione.
fn refuse_while_version_working(app: &tauri::AppHandle, version_id: &str) -> Result<(), String> {
    let conn = crate::db::open_connection(&crate::storage_config::db_path(app)?)?;
    if crate::jobs::store::has_active_version_work(&conn, version_id)? {
        return Err("version_work_in_progress".to_string());
    }
    Ok(())
}

/// "Libera spazio": cancella le pagine scaricate di una digitalizzazione
/// **subito e per davvero**, senza passare dal cestino — spostare gigabyte nel
/// cestino non libera niente.
///
/// Le miniature restano: sono circa 3 MB e rendono il libro ancora sfogliabile.
/// Restano anche manifesto e derivati.
#[tauri::command]
pub async fn free_version_pages(
    app: tauri::AppHandle,
    writes: State<'_, crate::db::DbWriteCoordinator>,
    provider_key: String,
    version_id: String,
) -> Result<FreedSpace, String> {
    let _write_guard = writes.lock().await;
    refuse_while_version_working(&app, &version_id)?;
    let root = root_of(&app)?;
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
    use std::path::PathBuf;

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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultChoice {
    pub path: String,
    pub kind: FolderKind,
    pub writable: bool,
    /// Vero quando la cartella è stata davvero adottata come deposito.
    pub adopted: bool,
    /// La cartella sembra dentro un servizio di sincronizzazione. In
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
/// scrivere.
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

/// Cancella manifesto, miniature, pagine **e copie ricavate in locale** di una
/// digitalizzazione: l'opera sparisce del tutto, non solo dalle biblioteche.
#[tauri::command]
pub async fn delete_version_files(
    app: tauri::AppHandle,
    writes: State<'_, crate::db::DbWriteCoordinator>,
    provider_key: String,
    version_id: String,
) -> Result<FreedSpace, String> {
    let _write_guard = writes.lock().await;
    refuse_while_version_working(&app, &version_id)?;
    let root = root_of(&app)?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    // La chiave dichiarata dal catalogo si prova per prima, ma non è l'unica
    // possibile: le cartelle sono nominate con la chiave che valeva quando i
    // file sono stati scritti, e su un'opera aggiunta per indirizzo quella
    // chiave può essere cambiata da allora. Chiedendo solo la cartella
    // dichiarata, una rimozione trovava «niente da cancellare», rispondeva
    // zero file e lasciava tutto sul disco senza dire niente: riaggiungendo la
    // stessa opera le pagine tornavano da lì.
    let mut deleted_files = 0;
    let mut freed_bytes = 0;
    let mut wipe = |folder: std::path::PathBuf| -> Result<(), String> {
        if !folder.is_dir() {
            return Ok(());
        }
        let stats = directory_stats(&folder);
        deleted_files += stats.files;
        freed_bytes += stats.bytes;
        std::fs::remove_dir_all(&folder)
            .map_err(|e| format!("Failed to delete {}: {e}", folder.display()))
    };

    for key in provider_keys_holding(&root, &provider_key, &version_id) {
        wipe(root.join(super::layout::version_dir(&key, &version_id)?))?;
        wipe(root.join(super::layout::derived_version_dir(&key, &version_id)?))?;
    }
    Ok(FreedSpace {
        deleted_files,
        freed_bytes,
    })
}

/// Le chiavi di biblioteca sotto cui esiste davvero una cartella per questa
/// digitalizzazione, più quella dichiarata dal catalogo.
///
/// Si guardano sia le copie scaricate sia quelle ricavate in locale: una
/// riduzione può stare sotto una chiave diversa da quella degli originali.
fn provider_keys_holding(
    root: &std::path::Path,
    declared: &str,
    version_id: &str,
) -> Vec<String> {
    let mut keys = vec![declared.to_string()];
    for area in [super::layout::PROVIDERS_DIR, super::layout::DERIVED_DIR] {
        let Ok(entries) = std::fs::read_dir(root.join(area)) else {
            continue;
        };
        for provider in entries.flatten() {
            if !provider.path().join(version_id).is_dir() {
                continue;
            }
            let Some(key) = provider.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
    }
    keys
}

/// Libera una sola misura: una risoluzione scaricata, o una copia ricavata in
/// locale. Non tocca le altre — è questo che permette di tenere la copia
/// compressa e buttare l'originale, o viceversa.
#[tauri::command]
pub async fn free_version_size(
    app: tauri::AppHandle,
    writes: State<'_, crate::db::DbWriteCoordinator>,
    provider_key: String,
    version_id: String,
    size_tag: String,
    derived: bool,
) -> Result<FreedSpace, String> {
    let _write_guard = writes.lock().await;
    refuse_while_version_working(&app, &version_id)?;
    let root = root_of(&app)?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    let folder = if derived {
        root.join(super::layout::derived_size_dir(
            &provider_key,
            &version_id,
            &size_tag,
        )?)
    } else {
        root.join(super::layout::pages_dir(&provider_key, &version_id)?)
            .join(super::layout::safe_component(&size_tag)?)
    };
    if !folder.is_dir() {
        return Ok(FreedSpace {
            deleted_files: 0,
            freed_bytes: 0,
        });
    }
    let stats = directory_stats(&folder);
    std::fs::remove_dir_all(&folder)
        .map_err(|e| format!("Failed to free {}: {e}", folder.display()))?;
    Ok(FreedSpace {
        deleted_files: stats.files,
        freed_bytes: stats.bytes,
    })
}

/// Cancella i file che nessuna riga reclama.
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
            .prepare("SELECT id FROM source_versions")
            .map_err(|error| error.to_string())?;
        let known: std::collections::HashSet<String> = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .collect();

        let mut deleted_files = 0;
        let mut freed_bytes = 0;
        // Si rilegge il deposito adesso e non ci si fida del conto della
        // verifica: fra il controllo e la cancellazione può essere finito uno
        // scaricamento, e quella cartella non è più orfana.
        for orphan in super::verification::orphan_folders(&root, &known) {
            match std::fs::remove_dir_all(&orphan.path) {
                Ok(()) => {
                    // I **file** cancellati, non le cartelle: è il numero che
                    // l'interfaccia mostra, e «3» al posto di tremila fa
                    // sembrare innocua un'operazione che non lo è.
                    deleted_files += orphan.files;
                    freed_bytes += orphan.bytes;
                }
                // Una cartella che non si riesce a togliere non ferma le altre.
                Err(error) => {
                    log::warn!("orphan not deleted path={} {error}", orphan.path.display())
                }
            }
        }
        log::info!("vault orphans deleted files={deleted_files} bytes={freed_bytes}");
        Ok(FreedSpace {
            deleted_files,
            freed_bytes,
        })
    })
    .await
    .map_err(|error| format!("Deleting the orphan files failed: {error}"))?
}

/// Mette in coda la verifica del deposito.
///
/// Un lavoro solo per volta: chiederla due volte non ne apre due, restituisce
/// quella in corso. Rapida di default; completa su richiesta esplicita, perché
/// apre ogni file e su un deposito sincronizzato costringe il client a
/// scaricare tutto.
#[tauri::command]
pub async fn enqueue_vault_verification(
    jobs: tauri::State<'_, crate::jobs::commands::JobsState>,
    full: Option<bool>,
) -> Result<crate::jobs::JobRecord, String> {
    super::verification::enqueue(&jobs.0, full.unwrap_or(false)).await
}

/// "Tieni tutto insieme": deposito dentro la cartella dati, che è la
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
