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

    /// Come lo compone il ciclo dello scaricamento: cartella delle pagine, nome
    /// della misura, nome del file.
    fn page_path(provider_key: &str, version_id: &str, size_tag: &str, index: u32) -> String {
        as_string(
            pages_dir(provider_key, version_id)
                .unwrap()
                .join(size_tag)
                .join(page_file_name(index)),
        )
    }

    #[test]
    fn page_path_has_a_directory_per_resolution() {
        assert_eq!(
            page_path("gallica", "abc123", "2000", 1),
            "providers/gallica/abc123/pages/2000/0001.jpg"
        );
        assert_eq!(
            page_path("gallica", "abc123", "max", 34),
            "providers/gallica/abc123/pages/max/0034.jpg"
        );
    }

    #[test]
    fn the_same_page_at_two_resolutions_does_not_collide() {
        // È il motivo per cui la cartella prende il nome dal tetto: una pagina
        // presa a piena risoluzione non sovrascrive quella standard (D4, §5.6).
        assert_ne!(
            page_path("vatican", "v1", "2000", 12),
            page_path("vatican", "v1", "max", 12)
        );
    }

    #[test]
    fn page_numbers_are_padded_to_four_digits() {
        assert!(page_path("gallica", "v1", "2000", 7).ends_with("/0007.jpg"));
        assert!(page_path("gallica", "v1", "2000", 1234).ends_with("/1234.jpg"));
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
    }

    #[test]
    fn pages_dir_is_what_freeing_space_removes() {
        assert_eq!(
            as_string(pages_dir("gallica", "v1").unwrap()),
            "providers/gallica/v1/pages"
        );
    }

    #[test]
    fn empty_or_odd_components_are_rejected() {
        assert!(version_dir("", "v1").is_err());
        assert!(version_dir("gallica", "").is_err());
        assert!(version_dir("gal lica", "v1").is_err());
        assert!(version_dir("gallica/sub", "v1").is_err());
    }
}
