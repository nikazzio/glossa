//! Le cartelle di misura **sono** l'inventario, e si leggono da sole.
//!
//! È la cosa che il deposito sa dire meglio del database (piano §5.4). Le
//! domande che l'interfaccia deve poter fare hanno tutte risposta guardando il
//! disco, senza nessuna interrogazione e senza nessun accordo da mantenere:
//!
//! | Domanda | Risposta |
//! |---|---|
//! | a che misure ho questo libro? | i nomi delle cartelle dentro `pages/` |
//! | quante pagine a ciascuna? | quanti file in ognuna |
//! | è completo, a quella misura? | quei file contro il conteggio atteso |
//! | questo libro è solo online? | non c'è nessuna cartella `pages/` |
//! | quanto occupa, per misura? | la dimensione di ogni cartella |
//!
//! **La misura principale è quella con più pagine.** Serve a non chiamare
//! incompleto ciò che non lo è: una cartella `max` con tre file su 328 non è un
//! libro a metà, è un libro completo a 2000 con tre pagine prese a risoluzione
//! piena di proposito (§5.6).

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::download::sidecar;

/// Una cartella di misura, letta dal disco.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeFolder {
    /// Il nome della cartella, che è il **tetto** con cui si è scaricato.
    pub size_tag: String,
    /// Quante pagine ci sono davvero.
    pub pages: u32,
    /// Quanto occupano, file di lato compreso.
    pub bytes: u64,
    /// Quante pagine la biblioteca ha dichiarato di non servire: è ciò che
    /// permette di dire «completo per quanto la biblioteca serve» invece di un
    /// «incompleto» che sembra un lavoro a metà.
    pub missing: u32,
}

/// Cosa si ha di una digitalizzazione, e a che misure.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInventory {
    pub version_id: String,
    /// La biblioteca sotto cui stanno i file. Si legge dal percorso e non dal
    /// database, perché una digitalizzazione può aver lasciato cartelle sotto
    /// chiavi diverse.
    pub provider_key: String,
    pub sizes: Vec<SizeFolder>,
    /// La misura con cui il libro è stato scaricato: quella con più pagine.
    pub principal: Option<String>,
    /// Vero se il manifesto conservato è al suo posto.
    pub has_manifest: bool,
}

impl VersionInventory {
    /// Le pagine della misura principale: è il conteggio che la scheda mostra.
    pub fn principal_pages(&self) -> u32 {
        self.principal
            .as_ref()
            .and_then(|tag| self.sizes.iter().find(|size| &size.size_tag == tag))
            .map(|size| size.pages)
            .unwrap_or(0)
    }
}

/// L'inventario di una digitalizzazione, cercata **sotto tutte le biblioteche**:
/// la chiave si deduce da dati che possono essere già stati cancellati.
pub fn of_version(root: &Path, version_id: &str) -> Option<VersionInventory> {
    // La più fornita vince; a pari conteggio vince il nome della biblioteca,
    // così la risposta non dipende dall'ordine in cui il sistema elenca le
    // cartelle — che non è lo stesso su due macchine.
    version_folders(root, version_id)
        .into_iter()
        .map(|(provider_key, folder)| read_folder(&provider_key, version_id, &folder))
        .max_by(|a, b| {
            a.principal_pages()
                .cmp(&b.principal_pages())
                .then_with(|| b.provider_key.cmp(&a.provider_key))
        })
}

/// L'inventario di tutto il deposito, una voce per digitalizzazione trovata.
pub fn of_vault(root: &Path) -> Vec<VersionInventory> {
    let mut found = Vec::new();
    let Ok(providers) = std::fs::read_dir(root.join(crate::vault::layout::PROVIDERS_DIR)) else {
        return found;
    };
    for provider in providers.flatten() {
        let provider_key = provider.file_name().to_string_lossy().to_string();
        let Ok(versions) = std::fs::read_dir(provider.path()) else {
            continue;
        };
        for version in versions.flatten() {
            if !version.path().is_dir() {
                continue;
            }
            let version_id = version.file_name().to_string_lossy().to_string();
            found.push(read_folder(&provider_key, &version_id, &version.path()));
        }
    }
    found
}

fn version_folders(root: &Path, version_id: &str) -> Vec<(String, PathBuf)> {
    let Ok(providers) = std::fs::read_dir(root.join(crate::vault::layout::PROVIDERS_DIR)) else {
        return Vec::new();
    };
    providers
        .flatten()
        .filter_map(|provider| {
            let folder = provider.path().join(version_id);
            folder
                .is_dir()
                .then(|| (provider.file_name().to_string_lossy().to_string(), folder))
        })
        .collect()
}

fn read_folder(provider_key: &str, version_id: &str, folder: &Path) -> VersionInventory {
    let mut sizes: Vec<SizeFolder> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(folder.join(crate::vault::layout::PAGES_DIR)) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            sizes.push(read_size_folder(
                entry.file_name().to_string_lossy().to_string(),
                &entry.path(),
            ));
        }
    }
    // La più fornita: è quella con cui il libro è stato scaricato. A parità
    // vince il nome, così l'ordine non dipende da come il sistema elenca.
    sizes.sort_by(|a, b| {
        b.pages
            .cmp(&a.pages)
            .then_with(|| a.size_tag.cmp(&b.size_tag))
    });
    let principal = sizes
        .first()
        .filter(|size| size.pages > 0)
        .map(|size| size.size_tag.clone());
    VersionInventory {
        version_id: version_id.to_string(),
        provider_key: provider_key.to_string(),
        sizes,
        principal,
        has_manifest: folder.join(crate::vault::layout::MANIFEST_FILE).is_file(),
    }
}

/// Quante pagine ci sono in una cartella di misura, quanto occupano e quante la
/// biblioteca ha dichiarato di non servire. **Il file di lato pesa ma non è una
/// pagina**: la regola sta qui e in nessun altro posto, perché il ciclo dello
/// scaricamento chiede a questa funzione il suo stato di partenza.
pub(crate) fn read_size_folder(size_tag: String, dir: &Path) -> SizeFolder {
    let mut pages = 0;
    let mut bytes = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if !metadata.is_file() {
                continue;
            }
            bytes += metadata.len();
            // Il file di lato occupa spazio ma non è una pagina.
            if entry.file_name().to_string_lossy() != sidecar::SIDECAR_FILE {
                pages += 1;
            }
        }
    }
    let missing = sidecar::read(dir)
        .values()
        .filter(|record| record.is_missing())
        .count() as u32;
    SizeFolder {
        size_tag,
        pages,
        bytes,
        missing,
    }
}

/// L'inventario di una digitalizzazione. `None` se non c'è niente sul disco:
/// è il caso del libro solo online.
#[tauri::command]
pub fn version_inventory(
    app: tauri::AppHandle,
    version_id: String,
) -> Result<Option<VersionInventory>, String> {
    let root = crate::vault::commands::root_of(&app)?;
    Ok(of_version(&root, &version_id))
}

/// L'inventario di tutto il deposito: una voce per digitalizzazione trovata.
/// Sostituisce il `COUNT` sulle righe per pagina nella scheda di Biblioteca.
#[tauri::command]
pub fn library_inventory(app: tauri::AppHandle) -> Result<Vec<VersionInventory>, String> {
    let root = crate::vault::commands::root_of(&app)?;
    Ok(of_vault(&root))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("glossa-inventory-{name}"));
        let _ = std::fs::remove_dir_all(&root);
        root
    }

    fn put_page(root: &Path, provider: &str, version: &str, size: &str, index: u32) {
        let dir = root
            .join(crate::vault::layout::PROVIDERS_DIR)
            .join(provider)
            .join(version)
            .join(crate::vault::layout::PAGES_DIR)
            .join(size);
        std::fs::create_dir_all(&dir).expect("cartella");
        std::fs::write(dir.join(format!("{index:04}.jpg")), b"pixel").expect("pagina");
    }

    #[test]
    fn the_folders_say_what_there_is_and_at_what_size() {
        let root = temp_vault("sizes");
        for index in 1..=3 {
            put_page(&root, "archive_org", "v1", "2000", index);
        }
        put_page(&root, "archive_org", "v1", "max", 7);

        let inventory = of_version(&root, "v1").expect("la digitalizzazione c'è");

        assert_eq!(inventory.provider_key, "archive_org");
        assert_eq!(inventory.sizes.len(), 2);
        // La principale è la più fornita, non la più grande.
        assert_eq!(inventory.principal.as_deref(), Some("2000"));
        assert_eq!(inventory.principal_pages(), 3);
    }

    #[test]
    fn a_page_taken_whole_on_purpose_does_not_make_the_book_incomplete() {
        let root = temp_vault("mixed");
        for index in 1..=328 {
            put_page(&root, "archive_org", "v1", "2000", index);
        }
        put_page(&root, "archive_org", "v1", "max", 34);

        let inventory = of_version(&root, "v1").expect("la digitalizzazione c'è");

        // Completo a 2000, più una a piena risoluzione: non un libro a metà.
        assert_eq!(inventory.principal_pages(), 328);
        let extra = inventory
            .sizes
            .iter()
            .find(|size| size.size_tag == "max")
            .expect("la cartella max c'è");
        assert_eq!(extra.pages, 1);
    }

    #[test]
    fn two_sizes_with_the_same_number_of_pages_still_have_one_principal() {
        // Lo stesso libro scaricato due volte con tetti diversi. La finestra si
        // fida di questa dichiarazione invece di confrontare i conteggi, quindi
        // qui la risposta deve essere una sola e sempre la stessa.
        let root = temp_vault("tie");
        for index in 1..=10 {
            put_page(&root, "archive_org", "v1", "2000", index);
            put_page(&root, "archive_org", "v1", "max", index);
        }

        let inventory = of_version(&root, "v1").expect("la digitalizzazione c'è");

        assert_eq!(inventory.principal.as_deref(), Some("2000"));
        assert_eq!(inventory.principal_pages(), 10);
    }

    #[test]
    fn a_book_that_is_only_online_has_no_folder() {
        let root = temp_vault("remote-only");
        std::fs::create_dir_all(root.join(crate::vault::layout::PROVIDERS_DIR)).expect("radice");

        assert!(of_version(&root, "mai-scaricato").is_none());
    }

    #[test]
    fn the_side_file_weighs_but_is_not_a_page() {
        let root = temp_vault("sidecar");
        put_page(&root, "gallica", "v1", "2000", 1);
        let dir = root
            .join(crate::vault::layout::PROVIDERS_DIR)
            .join("gallica")
            .join("v1")
            .join(crate::vault::layout::PAGES_DIR)
            .join("2000");
        sidecar::append(
            &dir,
            &sidecar::PageRecord::not_served(2, None, 1_700_000_000),
        )
        .expect("riga");

        let inventory = of_version(&root, "v1").expect("la digitalizzazione c'è");
        let size = &inventory.sizes[0];

        assert_eq!(size.pages, 1, "il file di lato non è una pagina");
        assert_eq!(size.missing, 1, "e dice quante la biblioteca non serve");
        assert!(size.bytes > 5, "ma occupa spazio come tutto il resto");
    }

    #[test]
    fn the_same_work_under_two_libraries_is_found_anyway() {
        let root = temp_vault("two-providers");
        put_page(&root, "generic", "v1", "2000", 1);
        for index in 1..=5 {
            put_page(&root, "archive_org", "v1", "2000", index);
        }

        // Si tiene la più fornita: la chiave si deduce da dati che possono
        // essere già stati cancellati, quindi si guardano tutte.
        let inventory = of_version(&root, "v1").expect("la digitalizzazione c'è");
        assert_eq!(inventory.provider_key, "archive_org");
        assert_eq!(inventory.principal_pages(), 5);
    }

    #[test]
    fn two_libraries_with_the_same_number_of_pages_answer_the_same_way_every_time() {
        // Senza un criterio a pari conteggio la risposta dipende dall'ordine in
        // cui il sistema elenca le cartelle, che non è lo stesso su due macchine.
        let root = temp_vault("two-providers-tie");
        for provider in ["gallica", "archive_org"] {
            for index in 1..=3 {
                put_page(&root, provider, "v1", "2000", index);
            }
        }

        let inventory = of_version(&root, "v1").expect("la digitalizzazione c'è");

        assert_eq!(inventory.provider_key, "archive_org");
    }

    #[test]
    fn the_whole_vault_lists_every_digitisation_it_finds() {
        let root = temp_vault("whole");
        put_page(&root, "archive_org", "v1", "2000", 1);
        put_page(&root, "gallica", "v2", "2000", 1);

        let all = of_vault(&root);

        assert_eq!(all.len(), 2);
    }
}
