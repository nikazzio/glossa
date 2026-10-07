//! Elenco delle lingue scaricato dalle fonti ufficiali.
//!
//! L'app include un elenco ISO 639-3 + Glottolog; «Aggiorna elenco lingue» ne
//! scarica uno nuovo. Qui solo il trasporto: scaricare i due file sorgente (dal
//! backend, fuori dai limiti CORS della webview) e conservare nella cartella dei
//! dati l'elenco già costruito dal frontend, che lo preferisce a quello incluso.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::llm::stream::shared_cloud_http_client;

const ISO_URL: &str = "https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab";
const GLOTTOLOG_URL: &str =
    "https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv";
const LANGUAGES_DIR: &str = "languages";
const ISO_FILE: &str = "iso639-3.json";
const VARIETIES_FILE: &str = "glottolog-varieties.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageSources {
    iso_tab: String,
    glottolog_csv: String,
}

/// I due elenchi nel formato incluso nell'app (JSON come testo).
#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct LanguageLists {
    iso: String,
    varieties: String,
}

async fn fetch_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("{url}: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("{url}: HTTP {status}"));
    }
    response
        .text()
        .await
        .map_err(|error| format!("{url}: {error}"))
}

#[tauri::command]
pub async fn languages_fetch_sources() -> Result<LanguageSources, String> {
    let client = shared_cloud_http_client()?;
    let (iso_tab, glottolog_csv) = tokio::try_join!(
        fetch_text(&client, ISO_URL),
        fetch_text(&client, GLOTTOLOG_URL)
    )?;
    Ok(LanguageSources {
        iso_tab,
        glottolog_csv,
    })
}

fn languages_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage_config::resolve_data_dir(app)?.join(LANGUAGES_DIR))
}

fn read_lists(dir: &Path) -> Result<Option<LanguageLists>, String> {
    let iso_path = dir.join(ISO_FILE);
    let varieties_path = dir.join(VARIETIES_FILE);
    if !iso_path.exists() || !varieties_path.exists() {
        return Ok(None);
    }
    let read = |path: &Path| fs::read_to_string(path).map_err(|error| error.to_string());
    Ok(Some(LanguageLists {
        iso: read(&iso_path)?,
        varieties: read(&varieties_path)?,
    }))
}

/// Ogni file passa da una copia temporanea: un'interruzione lascia l'elenco precedente intero.
fn write_lists(dir: &Path, lists: &LanguageLists) -> Result<(), String> {
    for text in [&lists.iso, &lists.varieties] {
        serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(text)
            .map_err(|error| format!("Invalid language list: {error}"))?;
    }
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    for (name, text) in [(ISO_FILE, &lists.iso), (VARIETIES_FILE, &lists.varieties)] {
        let target = dir.join(name);
        let temporary = dir.join(format!("{name}.tmp"));
        fs::write(&temporary, text).map_err(|error| error.to_string())?;
        fs::rename(&temporary, &target).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn languages_read_saved(app: tauri::AppHandle) -> Result<Option<LanguageLists>, String> {
    read_lists(&languages_dir(&app)?)
}

#[tauri::command]
pub fn languages_save(app: tauri::AppHandle, lists: LanguageLists) -> Result<(), String> {
    write_lists(&languages_dir(&app)?, &lists)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("glossa-languages-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn lists() -> LanguageLists {
        LanguageLists {
            iso: r#"{"retrievedAt":"2026-10-07","languages":[["ita","Italian","Italiano",0]]}"#
                .into(),
            varieties: r#"{"retrievedAt":"2026-10-07","varieties":{}}"#.into(),
        }
    }

    #[test]
    fn reading_without_saved_lists_returns_none() -> Result<(), String> {
        let dir = temp_dir("empty");
        assert_eq!(read_lists(&dir)?, None);
        Ok(())
    }

    #[test]
    fn saved_lists_are_read_back_unchanged() -> Result<(), String> {
        let dir = temp_dir("roundtrip");
        write_lists(&dir, &lists())?;
        assert_eq!(read_lists(&dir)?, Some(lists()));
        let _ = fs::remove_dir_all(&dir);
        Ok(())
    }

    #[test]
    fn invalid_json_is_rejected_and_previous_lists_stay() -> Result<(), String> {
        let dir = temp_dir("invalid");
        write_lists(&dir, &lists())?;
        let broken = LanguageLists {
            iso: "not json".into(),
            varieties: lists().varieties,
        };
        assert!(write_lists(&dir, &broken).is_err());
        assert_eq!(read_lists(&dir)?, Some(lists()));
        let _ = fs::remove_dir_all(&dir);
        Ok(())
    }
}
