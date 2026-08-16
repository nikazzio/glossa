//! Il file di backup: sceglierlo, scriverlo, rileggerlo (#345, #407, D31).
//!
//! **Il percorso non attraversa mai l'interfaccia.** La finestra la apre il
//! backend, come per l'import dei documenti dopo #405: una webview compromessa
//! non può far leggere né scrivere un file a sua scelta. Il frontend manda il
//! contenuto e riceve il contenuto, mai un percorso.
//!
//! **Dentro c'è solo il database, mai le immagini** (D31): quelle si
//! riscaricano dalla biblioteca, tutto il resto no. Un backup da 40 GB non lo
//! fa nessuno; uno da pochi megabyte si fa ogni settimana.
//!
//! **Compresso**, perché il contenuto è testo e le traduzioni si comprimono di
//! circa dieci volte, e con un **manifesto** che dice versione dello schema e
//! impronta: un file troncato si riconosce prima di tentare il ripristino,
//! invece di scoprirlo a metà strada.

use std::io::{Read, Write};
use tauri_plugin_dialog::DialogExt;

/// Nome del file che, dentro l'archivio, porta i dati.
const PAYLOAD_ENTRY: &str = "backup.json";
/// Nome del file che porta versione e impronta.
const MANIFEST_ENTRY: &str = "manifest.json";

/// Estensione dell'archivio. Resta quella di prima: i file già fatti si
/// riconoscono dal contenuto, non dal nome.
const BACKUP_EXTENSION: &str = "glossa-backup";

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    /// Versione del formato dell'archivio, non dello schema del database:
    /// quella sta dentro i dati.
    format: u32,
    /// Impronta dei dati, per riconoscere un archivio troncato.
    content_hash: String,
    /// Quanto pesa il contenuto non compresso, per lo stesso motivo.
    content_bytes: usize,
}

const FORMAT_VERSION: u32 = 1;

/// Scrive un backup dove l'utente sceglie. Restituisce il percorso solo per
/// poterlo dire a schermo — non torna mai indietro come parametro.
#[tauri::command]
pub async fn write_backup(
    app: tauri::AppHandle,
    payload: String,
) -> Result<Option<String>, String> {
    let suggested = format!("glossa-backup-{}.{BACKUP_EXTENSION}", today());
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Salva il backup di Glossa")
        .set_file_name(&suggested)
        .add_filter("Backup di Glossa", &[BACKUP_EXTENSION])
        .save_file(move |picked| {
            let _ = sender.send(picked);
        });

    let Some(picked) = receiver
        .await
        .map_err(|_| "La scelta del file è stata interrotta".to_string())?
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|error| format!("Percorso non utilizzabile: {error}"))?;

    let archive = tauri::async_runtime::spawn_blocking(move || pack(&payload))
        .await
        .map_err(|error| format!("Compressione non riuscita: {error}"))??;
    std::fs::write(&path, archive)
        .map_err(|error| format!("Scrittura del backup non riuscita: {error}"))?;
    log::info!("backup written path={}", path.display());
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Apre un backup e ne restituisce il contenuto. Legge anche i file scritti
/// prima della compressione: erano JSON semplice.
#[tauri::command]
pub async fn read_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Apri un backup di Glossa")
        .add_filter("Backup di Glossa", &[BACKUP_EXTENSION, "json"])
        .add_filter("Tutti i file", &["*"])
        .pick_file(move |picked| {
            let _ = sender.send(picked);
        });

    let Some(picked) = receiver
        .await
        .map_err(|_| "La scelta del file è stata interrotta".to_string())?
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|error| format!("Percorso non utilizzabile: {error}"))?;

    let bytes = std::fs::read(&path)
        .map_err(|error| format!("Lettura del backup non riuscita: {error}"))?;
    let payload = tauri::async_runtime::spawn_blocking(move || unpack(&bytes))
        .await
        .map_err(|error| format!("Lettura del backup non riuscita: {error}"))??;
    log::info!(
        "backup read path={} bytes={}",
        path.display(),
        payload.len()
    );
    Ok(Some(payload))
}

/// Mette i dati in un archivio con il suo manifesto.
fn pack(payload: &str) -> Result<Vec<u8>, String> {
    let manifest = Manifest {
        format: FORMAT_VERSION,
        content_hash: crate::provenance::fnv1a_hex(payload),
        content_bytes: payload.len(),
    };
    let mut archive = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    archive
        .start_file(MANIFEST_ENTRY, options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(
            serde_json::to_string(&manifest)
                .map_err(|error| error.to_string())?
                .as_bytes(),
        )
        .map_err(|error| error.to_string())?;
    archive
        .start_file(PAYLOAD_ENTRY, options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(payload.as_bytes())
        .map_err(|error| error.to_string())?;

    Ok(archive
        .finish()
        .map_err(|error| error.to_string())?
        .into_inner())
}

/// Tira fuori i dati da un archivio, controllando che siano interi.
///
/// Un file che non è un archivio si legge come JSON semplice: sono i backup
/// scritti prima che il formato fosse compresso.
fn unpack(bytes: &[u8]) -> Result<String, String> {
    let Ok(mut archive) = zip::ZipArchive::new(std::io::Cursor::new(bytes)) else {
        return String::from_utf8(bytes.to_vec())
            .map_err(|_| "backup_unreadable".to_string())
            .map(|text| text.trim().to_string());
    };

    let manifest: Manifest = {
        let mut entry = archive
            .by_name(MANIFEST_ENTRY)
            .map_err(|_| "backup_manifest_missing".to_string())?;
        let mut text = String::new();
        entry
            .read_to_string(&mut text)
            .map_err(|_| "backup_manifest_unreadable".to_string())?;
        serde_json::from_str(&text).map_err(|_| "backup_manifest_unreadable".to_string())?
    };
    if manifest.format > FORMAT_VERSION {
        return Err("backup_format_too_new".to_string());
    }

    let mut payload = String::new();
    archive
        .by_name(PAYLOAD_ENTRY)
        .map_err(|_| "backup_payload_missing".to_string())?
        .read_to_string(&mut payload)
        .map_err(|_| "backup_truncated".to_string())?;

    // L'impronta è ciò che distingue un archivio intero da uno interrotto a
    // metà scrittura: senza, il ripristino se ne accorgerebbe a lavoro
    // iniziato, con il database già svuotato.
    if payload.len() != manifest.content_bytes
        || crate::provenance::fnv1a_hex(&payload) != manifest.content_hash
    {
        return Err("backup_truncated".to_string());
    }
    Ok(payload)
}

/// La data di oggi, per il nome suggerito del file.
fn today() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0);
    // Giorni dal 1970 convertiti con l'algoritmo civile: niente dipendenze per
    // una data che serve solo a suggerire un nome.
    let days = (now / 86_400) as i64;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

/// Howard Hinnant, *chrono-Compatible Low-Level Date Algorithms*.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn what_goes_in_comes_out() {
        let payload = r#"{"tables":{"workspaces":[]}}"#;

        let archive = pack(payload).unwrap();

        assert!(!archive.is_empty());
        assert_eq!(unpack(&archive).unwrap(), payload);
    }

    #[test]
    fn a_truncated_archive_is_refused_before_the_restore_starts() {
        // Accorgersene a lavoro iniziato vorrebbe dire con il database già
        // svuotato.
        let archive = pack(r#"{"tables":{}}"#).unwrap();
        let cut = &archive[..archive.len() - 40];

        assert!(unpack(cut).is_err());
    }

    #[test]
    fn a_backup_written_before_the_archive_still_opens() {
        // I file scritti prima erano JSON semplice: rifiutarli vorrebbe dire
        // buttare i backup fatti finora.
        let plain = r#"{"tables":{"workspaces":[]}}"#;

        assert_eq!(unpack(plain.as_bytes()).unwrap(), plain);
    }

    #[test]
    fn text_that_is_not_a_backup_is_refused() {
        assert!(unpack(&[0xFF, 0xFE, 0x00]).is_err());
    }

    #[test]
    fn the_suggested_name_carries_a_real_date() {
        let name = today();

        assert_eq!(name.len(), 10, "{name}");
        assert!(name.starts_with("20"), "{name}");
    }
}
