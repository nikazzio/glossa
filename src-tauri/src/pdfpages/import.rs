//! Un PDF dal computer, e il manifesto facoltativo, portati nel deposito.
//!
//! Stessa catena dello scaricamento: transito, validazione, spostamento
//! atomico, scheda accanto al documento. Nessuna richiesta di rete.

use serde::Serialize;
use std::path::Path;

use crate::download::pdf::{count_pages, write_record, DocumentRecord};
use crate::download::vault_io::{discard, now_secs, stage_and_promote};
use crate::iiif::discovery::{preview_from_manifest_bytes, recognitions, ManifestPreview};
use crate::vault::{integrity, layout};

/// Cartella del deposito delle opere importate senza manifesto. È una chiave
/// riservata, non una biblioteca: non compare fra le fonti della Ricerca.
pub const LOCAL_IMPORT_PROVIDER: &str = "local_import";

/// Valore di `importedFrom` nella scheda di un documento importato.
pub const IMPORTED_FROM_LOCAL_FILE: &str = "local_file";

const MANIFEST_UNREADABLE: &str = "manifest_unreadable";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFile {
    pub preview: ManifestPreview,
    /// La biblioteca riconosciuta dall'indirizzo che il manifesto dichiara.
    pub provider_key: String,
    pub pages: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDocument {
    pub pages: u32,
    pub bytes: u64,
}

/// Legge un manifesto salvato sul computer: dati dell'opera e biblioteca.
#[tauri::command]
pub fn read_manifest_file(path: String) -> Result<ManifestFile, String> {
    let bytes = std::fs::read(&path).map_err(|_| MANIFEST_UNREADABLE.to_string())?;
    manifest_file_of(&bytes)
}

fn manifest_file_of(bytes: &[u8]) -> Result<ManifestFile, String> {
    let pages = crate::download::manifest::parse(bytes)
        .map_err(|_| MANIFEST_UNREADABLE.to_string())?
        .pages
        .len();
    let preview = preview_from_manifest_bytes(bytes)?;
    let provider_key = provider_of(&preview.manifest_url);
    Ok(ManifestFile {
        preview,
        provider_key,
        pages,
    })
}

/// La biblioteca che riconosce l'indirizzo del manifesto; `generic` per un
/// indirizzo non riconosciuto, la cartella delle importazioni senza indirizzo.
fn provider_of(manifest_url: &str) -> String {
    if !manifest_url.starts_with("http") {
        return LOCAL_IMPORT_PROVIDER.to_string();
    }
    recognitions(manifest_url)
        .into_iter()
        .map(|recognition| recognition.provider_key)
        .find(|key| key != "generic")
        .unwrap_or_else(|| "generic".to_string())
}

/// Pagine e dimensione di un PDF scelto, prima di importarlo: la finestra le
/// mostra sotto il nome del file, o dice che il file non è un PDF leggibile.
#[tauri::command]
pub async fn inspect_pdf_file(path: String) -> Result<ImportedDocument, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(Path::new(&path)))
        .await
        .map_err(|error| error.to_string())?
}

fn inspect(path: &Path) -> Result<ImportedDocument, String> {
    let scan = integrity::scan_file(path, integrity::FileKind::Pdf);
    if !matches!(scan.validation, integrity::Validation::Valid) {
        return Err("pdf_invalid".to_string());
    }
    let bytes = std::fs::metadata(path)
        .map_err(|_| "pdf_unreadable".to_string())?
        .len();
    let pages = count_pages(path, bytes).ok_or("pdf_pages_unreadable")?;
    Ok(ImportedDocument { pages, bytes })
}

/// Porta nel deposito il PDF scelto (e il manifesto, se c'è) come documento
/// della copia `version_id`.
#[tauri::command]
pub async fn import_pdf_document(
    app: tauri::AppHandle,
    version_id: String,
    provider_key: String,
    path: String,
    manifest_path: Option<String>,
) -> Result<ImportedDocument, String> {
    let root = crate::vault::commands::root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        import_into(
            &root,
            &version_id,
            &provider_key,
            Path::new(&path),
            manifest_path.as_deref().map(Path::new),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Salva accanto a un PDF già importato il manifesto caricato in seguito.
#[tauri::command]
pub async fn import_source_manifest(
    app: tauri::AppHandle,
    version_id: String,
    provider_key: String,
    path: String,
) -> Result<ManifestFile, String> {
    let root = crate::vault::commands::root_of(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let staging = staging_for(&root, &version_id)?;
        let result = store_manifest(
            &root,
            &staging,
            &version_id,
            &provider_key,
            Path::new(&path),
        );
        discard(&staging);
        result
    })
    .await
    .map_err(|error| error.to_string())?
}

fn staging_for(root: &Path, version_id: &str) -> Result<std::path::PathBuf, String> {
    let area = format!("{version_id}-import");
    let staging = root
        .join(layout::STAGING_DIR)
        .join(layout::safe_component(&area)?);
    std::fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    Ok(staging)
}

pub(crate) fn import_into(
    root: &Path,
    version_id: &str,
    provider_key: &str,
    pdf: &Path,
    manifest: Option<&Path>,
) -> Result<ImportedDocument, String> {
    let target = root.join(layout::document_path(provider_key, version_id)?);
    if target.is_file() {
        return Err("pdf_already_local".to_string());
    }
    let meta = root.join(layout::document_meta_path(provider_key, version_id)?);
    let staging = staging_for(root, version_id)?;
    let result = (|| {
        let staged = staging.join(layout::DOCUMENT_FILE);
        let bytes = std::fs::copy(pdf, &staged).map_err(|_| "pdf_unreadable".to_string())?;
        let scan = integrity::scan_file(&staged, integrity::FileKind::Pdf);
        let checksum = match scan.validation {
            integrity::Validation::Valid => scan.checksum.ok_or("pdf_invalid")?,
            _ => return Err("pdf_invalid".to_string()),
        };
        // Senza pagine contate (protetto, malformato, oltre 512 MB) le pagine
        // non si potrebbero nemmeno estrarre: meglio dirlo subito.
        let pages = count_pages(&staged, bytes).ok_or("pdf_pages_unreadable")?;

        if let Some(manifest) = manifest {
            store_manifest(root, &staging, version_id, provider_key, manifest)?;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::rename(&staged, &target).map_err(|error| error.to_string())?;
        let file_name = pdf
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        write_record(
            &meta,
            &DocumentRecord {
                source_url: file_name,
                bytes,
                pages: Some(pages),
                checksum,
                downloaded_at: now_secs(),
                imported_from: Some(IMPORTED_FROM_LOCAL_FILE.to_string()),
            },
        )
        .map_err(|error| error.message)?;
        Ok(ImportedDocument { pages, bytes })
    })();
    discard(&staging);
    result
}

fn store_manifest(
    root: &Path,
    staging: &Path,
    version_id: &str,
    provider_key: &str,
    manifest: &Path,
) -> Result<ManifestFile, String> {
    let bytes = std::fs::read(manifest).map_err(|_| MANIFEST_UNREADABLE.to_string())?;
    let file = manifest_file_of(&bytes)?;
    stage_and_promote(
        &staging.join(layout::SOURCE_MANIFEST_FILE),
        &root.join(layout::source_manifest_path(provider_key, version_id)?),
        &bytes,
        integrity::FileKind::Manifest,
    )
    .map_err(|error| error.message)?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pdfpages::render::tests::tiny_pdf;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("glossa_pdf_import_{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("cartella");
        dir
    }

    const GALLICA_MANIFEST: &str = r#"{
      "@id": "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k9604118j/manifest.json",
      "label": "Opera di prova",
      "sequences": [{ "canvases": [
        { "@id": "c1", "label": "1r", "width": 10, "height": 10,
          "images": [{ "resource": { "service": { "@id": "https://img/1" } } }] }
      ] }]
    }"#;

    #[test]
    fn a_valid_pdf_enters_the_vault_with_its_page_count_and_record() {
        let root = temp_dir("valido");
        let source = root.join("scaricato.pdf");
        std::fs::write(&source, tiny_pdf(3)).expect("pdf");

        let imported =
            import_into(&root, "sver-a", LOCAL_IMPORT_PROVIDER, &source, None).expect("importato");

        assert_eq!(imported.pages, 3);
        let document = root.join(layout::document_path(LOCAL_IMPORT_PROVIDER, "sver-a").unwrap());
        assert!(document.is_file());
        let record = crate::download::pdf::record_at(
            &root.join(layout::document_meta_path(LOCAL_IMPORT_PROVIDER, "sver-a").unwrap()),
        )
        .expect("scheda");
        assert_eq!(record.source_url, "scaricato.pdf");
        assert_eq!(
            record.imported_from.as_deref(),
            Some(IMPORTED_FROM_LOCAL_FILE)
        );
        assert!(!root
            .join(layout::STAGING_DIR)
            .join("sver-a-import")
            .exists());
    }

    #[test]
    fn inspecting_a_pdf_tells_pages_and_size_without_copying_it() {
        let root = temp_dir("ispeziona");
        let source = root.join("opera.pdf");
        let bytes = tiny_pdf(2);
        std::fs::write(&source, &bytes).expect("pdf");

        let facts = inspect(&source).expect("letto");

        assert_eq!((facts.pages, facts.bytes), (2, bytes.len() as u64));
        assert!(!root.join(layout::PROVIDERS_DIR).exists());
    }

    #[test]
    fn a_file_that_is_not_a_pdf_is_refused_and_nothing_is_written() {
        let root = temp_dir("non_pdf");
        let source = root.join("foto.jpg");
        std::fs::write(&source, b"non sono un pdf").expect("file");

        let result = import_into(&root, "sver-b", LOCAL_IMPORT_PROVIDER, &source, None);

        assert_eq!(result.err().as_deref(), Some("pdf_invalid"));
        assert!(!root
            .join(layout::document_path(LOCAL_IMPORT_PROVIDER, "sver-b").unwrap())
            .exists());
    }

    #[test]
    fn a_truncated_pdf_is_refused() {
        let root = temp_dir("troncato");
        let source = root.join("troncato.pdf");
        let bytes = tiny_pdf(2);
        std::fs::write(&source, &bytes[..bytes.len() / 2]).expect("pdf");

        assert!(import_into(&root, "sver-c", LOCAL_IMPORT_PROVIDER, &source, None).is_err());
    }

    #[test]
    fn the_manifest_is_kept_beside_the_pdf_and_names_its_library() {
        let root = temp_dir("manifesto");
        let source = root.join("opera.pdf");
        std::fs::write(&source, tiny_pdf(1)).expect("pdf");
        let manifest = root.join("manifest.json");
        std::fs::write(&manifest, GALLICA_MANIFEST).expect("manifesto");

        import_into(&root, "sver-d", "gallica", &source, Some(&manifest)).expect("importato");

        assert!(root
            .join(layout::source_manifest_path("gallica", "sver-d").unwrap())
            .is_file());
        let file = manifest_file_of(GALLICA_MANIFEST.as_bytes()).expect("letto");
        assert_eq!(file.provider_key, "gallica");
        assert_eq!(file.pages, 1);
    }

    #[test]
    fn an_unreadable_manifest_is_reported() {
        assert_eq!(
            manifest_file_of(b"{ non json").err().as_deref(),
            Some(MANIFEST_UNREADABLE)
        );
    }

    #[test]
    fn a_manifest_without_an_address_goes_to_the_import_folder() {
        assert_eq!(provider_of(""), LOCAL_IMPORT_PROVIDER);
    }
}
