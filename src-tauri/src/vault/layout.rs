//! Disposizione dei file nel deposito (D2).
//!
//! Il disco riflette **solo la provenienza**: chi ha digitalizzato e chi
//! possiede l'esemplare sono fatti che non cambiano mai, mentre l'attribuzione
//! di una copia a un'edizione è un giudizio filologico che si rivede. Se
//! l'edizione stesse nel percorso, una riattribuzione comporterebbe lo
//! spostamento di gigabyte.
//!
//! Tutte le funzioni qui sono pure e restituiscono percorsi **relativi** alla
//! radice del deposito: `assets.vault_path` non contiene mai un percorso
//! assoluto, così spostare il deposito (D30) non invalida il database.

use std::path::{Path, PathBuf};

/// Radice di ciò che scarichiamo dalle biblioteche. `derived/` (ritagli e
/// immagini ottimizzate) e `trash/` (in attesa dello svuotamento, D6) arrivano
/// con le PR che li usano: qui non servono ancora.
pub(crate) const PROVIDERS_DIR: &str = "providers";
pub(crate) const PAGES_DIR: &str = "pages";
const THUMBNAILS_DIR: &str = "thumbnails";
pub(crate) const MANIFEST_FILE: &str = "manifest.json";

/// Area di transito (D16-bis): ci si scrive, si valida, e solo allora si
/// promuove. Sta accanto alle radici del layout perché quello che c'è dentro
/// **non** è ancora nel deposito.
pub const STAGING_DIR: &str = "staging";

/// Una componente di percorso, verificata. Da usare ogni volta che un valore
/// arrivato dal frontend diventa il nome di una cartella.
pub fn safe_component(value: &str) -> Result<&str, String> {
    if is_safe_component(value) {
        Ok(value)
    } else {
        Err(format!("Invalid path component for the vault: {value}"))
    }
}

/// Caratteri ammessi in una componente di percorso costruita da noi.
/// Chiavi provider e identificativi sono già ASCII, ma un valore che arrivasse
/// sporco non deve poter uscire dal deposito con `..` o una barra.
fn is_safe_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
}

/// Radici ammesse dentro il deposito. `trash/` arriverà con il cestino (D6).
const DERIVED_DIR: &str = "derived";
const ALLOWED_ROOTS: [&str; 2] = [PROVIDERS_DIR, DERIVED_DIR];
/// Estensioni che il deposito può contenere: carte e miniature, manifesto,
/// PDF fornito dalla biblioteca (D4-bis).
const ALLOWED_EXTENSIONS: [&str; 4] = ["jpg", "json", "jsonl", "pdf"];

/// Verifica che un `vault_path` abbia la forma prodotta da questo modulo.
///
/// I comandi di verifica ricevono l'elenco dei percorsi dal frontend, e la
/// radice del deposito è un'impostazione che la webview può scrivere: senza
/// questo controllo direbbero a chiunque sappia invocarli se un file qualsiasi
/// esiste. Il divieto di risalita in `absolute_path` impedisce di uscire dal
/// deposito, non di curiosare dentro una radice scelta ad arte.
pub fn validate_vault_path(relative: &str) -> Result<(), String> {
    let components: Vec<&str> = Path::new(relative)
        .components()
        .map(|component| component.as_os_str().to_str().unwrap_or(""))
        .collect();

    let Some((file_name, folders)) = components.split_last() else {
        return Err("empty vault path".to_string());
    };
    match folders.first() {
        Some(root) if ALLOWED_ROOTS.contains(root) => {}
        _ => return Err(format!("vault path outside the known layout: {relative}")),
    }
    if !folders.iter().all(|folder| is_safe_component(folder)) {
        return Err(format!("unsafe folder in a vault path: {relative}"));
    }

    let (stem, extension) = file_name
        .rsplit_once('.')
        .ok_or_else(|| format!("vault path without an extension: {relative}"))?;
    if !is_safe_component(stem) {
        return Err(format!("unsafe file name in a vault path: {relative}"));
    }
    if !ALLOWED_EXTENSIONS.contains(&extension) {
        return Err(format!("extension not allowed in the vault: {relative}"));
    }
    Ok(())
}

/// Cartella di una digitalizzazione: `providers/<chiave>/<id-versione>/`.
///
/// `provider_key` è la chiave del registry (#214), non il nome esteso
/// dell'istituzione; `version_id` è l'identificativo interno della
/// `source_version`, non un titolo (D2).
pub fn version_dir(provider_key: &str, version_id: &str) -> Result<PathBuf, String> {
    if !is_safe_component(provider_key) {
        return Err(format!(
            "Invalid provider key for a vault path: {provider_key}"
        ));
    }
    if !is_safe_component(version_id) {
        return Err(format!("Invalid version id for a vault path: {version_id}"));
    }
    Ok(Path::new(PROVIDERS_DIR).join(provider_key).join(version_id))
}

/// Il manifesto si conserva com'è, byte per byte (D2-bis): la normalizzazione
/// vive in memoria e nel database, l'originale resta la verità.
pub fn manifest_path(provider_key: &str, version_id: &str) -> Result<PathBuf, String> {
    Ok(version_dir(provider_key, version_id)?.join(MANIFEST_FILE))
}

/// Pagina a una data risoluzione: `pages/<dimensione>/0001.jpg`.
///
/// La stessa carta esiste in più risoluzioni (D4): il livello `<dimensione>`
/// evita che una richiesta a piena risoluzione sovrascriva quella standard.
/// Il numero è progressivo dal manifesto, a quattro cifre — **non**
/// l'etichetta della biblioteca, che può essere `12r`, `[iv]` o mancare (D2).
pub fn page_path(
    provider_key: &str,
    version_id: &str,
    size_tag: &str,
    page_index: u32,
) -> Result<PathBuf, String> {
    if !is_safe_component(size_tag) {
        return Err(format!("Invalid size tag for a vault path: {size_tag}"));
    }
    Ok(version_dir(provider_key, version_id)?
        .join(PAGES_DIR)
        .join(size_tag)
        .join(page_file_name(page_index)))
}

/// Le miniature si scaricano tutte all'aggiunta della fonte (D6): circa 3 MB
/// per un codice, e rendono il libro sfogliabile senza rete e senza pagine.
/// Non hanno livello di dimensione: ne esiste una sola per carta.
pub fn thumbnail_path(
    provider_key: &str,
    version_id: &str,
    page_index: u32,
) -> Result<PathBuf, String> {
    Ok(version_dir(provider_key, version_id)?
        .join(THUMBNAILS_DIR)
        .join(page_file_name(page_index)))
}

pub(crate) fn page_file_name(page_index: u32) -> String {
    format!("{page_index:04}.jpg")
}

/// Cartella che contiene tutte le risoluzioni di una digitalizzazione. È ciò
/// che "libera spazio" cancella (D6): restano manifesto e miniature.
pub fn pages_dir(provider_key: &str, version_id: &str) -> Result<PathBuf, String> {
    Ok(version_dir(provider_key, version_id)?.join(PAGES_DIR))
}

/// Tutti i file che una digitalizzazione completa dovrebbe contenere.
///
/// Esposto perché la verifica (D5) deve sapere **quali** file cercare: se li
/// costruisse il frontend, la disposizione di D2 vivrebbe in due posti e prima
/// o poi divergerebbe.
///
/// Comprende manifesto e miniature, non solo le carte: il manifesto si
/// conserva sempre (D2-bis) e le miniature si scaricano all'aggiunta della
/// fonte (D6), quindi la loro assenza è un disallineamento come le altre.
pub fn expected_version_paths(
    provider_key: &str,
    version_id: &str,
    size_tag: &str,
    page_count: u32,
) -> Result<Vec<PathBuf>, String> {
    let mut paths = vec![manifest_path(provider_key, version_id)?];
    for index in 1..=page_count {
        paths.push(thumbnail_path(provider_key, version_id, index)?);
        paths.push(page_path(provider_key, version_id, size_tag, index)?);
    }
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn as_string(path: PathBuf) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    #[test]
    fn version_dir_uses_provider_then_version() {
        assert_eq!(
            as_string(version_dir("gallica", "abc123").unwrap()),
            "providers/gallica/abc123"
        );
    }

    #[test]
    fn page_path_has_a_directory_per_resolution() {
        assert_eq!(
            as_string(page_path("gallica", "abc123", "2000", 1).unwrap()),
            "providers/gallica/abc123/pages/2000/0001.jpg"
        );
        assert_eq!(
            as_string(page_path("gallica", "abc123", "max", 34).unwrap()),
            "providers/gallica/abc123/pages/max/0034.jpg"
        );
    }

    #[test]
    fn the_same_page_at_two_resolutions_does_not_collide() {
        let standard = page_path("vatican", "v1", "2000", 12).unwrap();
        let full = page_path("vatican", "v1", "max", 12).unwrap();
        assert_ne!(standard, full);
    }

    #[test]
    fn page_numbers_are_padded_to_four_digits() {
        assert!(as_string(page_path("gallica", "v1", "2000", 7).unwrap()).ends_with("/0007.jpg"));
        assert!(as_string(page_path("gallica", "v1", "2000", 1234).unwrap()).ends_with("/1234.jpg"));
    }

    #[test]
    fn thumbnails_have_no_resolution_level() {
        assert_eq!(
            as_string(thumbnail_path("gallica", "abc123", 2).unwrap()),
            "providers/gallica/abc123/thumbnails/0002.jpg"
        );
    }

    #[test]
    fn manifest_sits_next_to_the_pages() {
        assert_eq!(
            as_string(manifest_path("estense", "v9").unwrap()),
            "providers/estense/v9/manifest.json"
        );
    }

    #[test]
    fn every_path_is_relative_to_the_vault_root() {
        // Un percorso assoluto invaliderebbe il database appena il deposito
        // viene spostato (D30).
        for path in [
            version_dir("gallica", "v1").unwrap(),
            manifest_path("gallica", "v1").unwrap(),
            page_path("gallica", "v1", "2000", 1).unwrap(),
            thumbnail_path("gallica", "v1", 1).unwrap(),
            pages_dir("gallica", "v1").unwrap(),
        ] {
            assert!(path.is_relative(), "{path:?} deve essere relativo");
        }
    }

    #[test]
    fn traversal_attempts_are_rejected() {
        assert!(version_dir("..", "v1").is_err());
        assert!(version_dir("gallica", "../../etc").is_err());
        assert!(page_path("gallica", "v1", "../..", 1).is_err());
        assert!(expected_version_paths("..", "v1", "2000", 3).is_err());
    }

    #[test]
    fn expected_paths_cover_manifest_thumbnails_and_pages() {
        let paths: Vec<String> = expected_version_paths("gallica", "v1", "2000", 3)
            .unwrap()
            .into_iter()
            .map(as_string)
            .collect();

        // manifesto + (miniatura + carta) per ciascuna delle tre carte
        assert_eq!(paths.len(), 7);
        assert!(paths[0].ends_with("/manifest.json"));
        assert!(paths.iter().any(|p| p.ends_with("/thumbnails/0001.jpg")));
        assert!(paths.iter().any(|p| p.ends_with("/pages/2000/0003.jpg")));
    }

    #[test]
    fn a_version_with_no_declared_pages_still_expects_its_manifest() {
        // expected_asset_count nullo significa "non lo sappiamo ancora", non
        // "non c'è niente": il manifesto è stato comunque conservato.
        let paths = expected_version_paths("gallica", "v1", "2000", 0).unwrap();
        assert_eq!(paths.len(), 1);
        assert!(as_string(paths[0].clone()).ends_with("/manifest.json"));
    }

    #[test]
    fn pages_dir_is_what_freeing_space_removes() {
        assert_eq!(
            as_string(pages_dir("gallica", "v1").unwrap()),
            "providers/gallica/v1/pages"
        );
    }

    #[test]
    fn the_shapes_this_module_produces_are_accepted() {
        for path in [
            "providers/gallica/v1/manifest.json",
            "providers/gallica/v1/pages/2000/0001.jpg",
            "providers/gallica/v1/pages/max/0034.jpg",
            "providers/gallica/v1/thumbnails/0002.jpg",
            "providers/gallica/v1/document.pdf",
            "derived/asset123/0001.jpg",
        ] {
            assert!(validate_vault_path(path).is_ok(), "{path} deve passare");
        }
    }

    #[test]
    fn anything_else_in_the_vault_is_refused() {
        // Non è il divieto di uscire dal deposito — quello sta in
        // `absolute_path` — ma il divieto di chiedere di file che il layout non
        // produce mai, dentro una radice scelta dalla webview.
        for path in [
            "glossa.db",
            ".glossa-vault",
            "providers/gallica/v1/pages/2000/0001.exe",
            "providers/gallica/v1/note.txt",
            "providers/gal lica/v1/manifest.json",
            "trash/v1/0001.jpg",
            "manifest.json",
            "providers/gallica/v1/pages/2000/0001",
        ] {
            assert!(
                validate_vault_path(path).is_err(),
                "{path} deve essere rifiutato"
            );
        }
    }

    #[test]
    fn empty_or_odd_components_are_rejected() {
        assert!(version_dir("", "v1").is_err());
        assert!(version_dir("gallica", "").is_err());
        assert!(version_dir("gal lica", "v1").is_err());
        assert!(version_dir("gallica/sub", "v1").is_err());
    }
}
