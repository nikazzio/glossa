//! Come si chiede un'immagine, da qualunque schermata.
//!
//! La domanda è «questa immagine, **a questa misura**», e la risposta si cerca
//! in quest'ordine:
//!
//! 1. nel deposito, a quella misura → si restituisce il file;
//! 2. nel deposito, a una misura più grande → si restituisce quello,
//!    rimpicciolito sul momento **e messo in cache**: rifarlo a ogni voltata di
//!    pagina significherebbe decodificare un JPEG grande ogni volta;
//! 3. nella cache → si restituisce;
//! 4. altrimenti si chiede alla biblioteca **passando dalla cortesia**, si mette
//!    in cache e si restituisce.
//!
//! Il visore futuro chiederà così: l'immagine di una pagina a una misura, senza
//! sapere se il libro è scaricato. È il motivo per cui questa cache è
//! riutilizzabile senza modifiche.
//!
//! **Mostrare e possedere restano due cose diverse**: quello che finisce qui non
//! è mai contato come scaricato, e la scheda di Biblioteca non lo guarda.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::Manager;

use super::{
    request::CacheRequest, CacheMeta, CacheUsage, HttpCache, DEFAULT_MAX_BYTES,
    DEFAULT_SEARCH_TTL_HOURS, MAX_BYTES_SETTING, SEARCH_TTL_SETTING,
};
use crate::download::courtesy::{Courtesy, Signals};
use crate::download::fetch;

/// Estremi accettati per il tetto: sotto i 32 MB la cache non serve a niente,
/// sopra i 32 GB è un errore di digitazione.
const MIN_MAX_BYTES: u64 = 32 * 1024 * 1024;
const MAX_MAX_BYTES: u64 = 32 * 1024 * 1024 * 1024;

/// Il tetto configurato, o il predefinito se il valore è illeggibile o assurdo.
pub fn max_bytes(conn: &rusqlite::Connection) -> u64 {
    crate::jobs::store::read_setting(conn, MAX_BYTES_SETTING)
        .ok()
        .flatten()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|bytes| (MIN_MAX_BYTES..=MAX_MAX_BYTES).contains(bytes))
        .unwrap_or(DEFAULT_MAX_BYTES)
}

/// Per quanto vale una risposta di ricerca, in ore.
pub fn search_ttl_hours(conn: &rusqlite::Connection) -> u64 {
    crate::jobs::store::read_setting(conn, SEARCH_TTL_SETTING)
        .ok()
        .flatten()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|hours| (1..=24 * 30).contains(hours))
        .unwrap_or(DEFAULT_SEARCH_TTL_HOURS)
}

fn connection(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    crate::db::open_connection(&crate::storage_config::db_path(app)?)
}

/// Metti in cache e, se il tetto è superato, butta il più vecchio.
///
/// Lo scarto si fa qui e non a ogni lettura: camminare la cartella costa, e
/// costa solo quando qualcosa è entrato.
pub fn store(
    app: &tauri::AppHandle,
    request: &CacheRequest,
    bytes: &[u8],
    content_type: Option<String>,
) {
    let cache = app.state::<Arc<HttpCache>>();
    let ttl = connection(app)
        .map(|conn| search_ttl_hours(&conn))
        .unwrap_or(DEFAULT_SEARCH_TTL_HOURS);
    let meta = CacheMeta {
        content_type,
        expires_at: request
            .expires()
            .then(|| super::now_secs() + (ttl * 3600) as i64),
        request: Some(format!("{request:?}")),
    };
    if let Err(error) = cache.put(&request.key(), bytes, meta) {
        // Una cache che non riesce a scrivere non è un guasto per chi guarda:
        // la prossima volta si ripassa dalla rete.
        log::warn!("cache write failed: {error}");
        return;
    }
    let cap = connection(app)
        .map(|conn| max_bytes(&conn))
        .unwrap_or(DEFAULT_MAX_BYTES);
    let freed = cache.evict_to(cap);
    if freed > 0 {
        log::info!("cache eviction freed {freed} bytes");
    }
}

/// I byte già in cache, se ci sono.
pub fn lookup(app: &tauri::AppHandle, request: &CacheRequest) -> Option<Vec<u8>> {
    app.state::<Arc<HttpCache>>().get(&request.key())
}

/// L'immagine chiesta, presa dove è: deposito, cache o biblioteca.
#[tauri::command]
pub async fn cached_image(app: tauri::AppHandle, request: CacheRequest) -> Result<Vec<u8>, String> {
    if let Some(bytes) = from_vault(&app, &request)? {
        return Ok(bytes);
    }
    if let Some(bytes) = lookup(&app, &request) {
        return Ok(bytes);
    }
    let CacheRequest::Remote { url, .. } = &request else {
        // Una pagina che non è nel deposito e non è in cache la chiederà il
        // visore, che sa costruirne l'indirizzo. Finché non esiste, non c'è
        // niente da indovinare qui.
        return Err("Questa pagina non è disponibile in locale.".to_string());
    };

    let conn = connection(&app)?;
    let host = request.host();
    let profile = crate::iiif::settings::effective_profile(
        &conn,
        request.provider_key().unwrap_or_default(),
        host.as_deref(),
    );
    drop(conn);

    let client = fetch::build_client(&profile).map_err(|error| error.message)?;
    let courtesy = app.state::<Arc<Courtesy>>().inner().clone();
    let never_stops = || false;
    let waiting = AtomicBool::new(false);
    let signals = Signals {
        stop: &never_stops,
        courtesy_wait: &waiting,
    };
    let fetched = fetch::fetch(&client, &courtesy, &profile, url, 1, &signals)
        .await
        .map_err(|error| error.message)?
        .ok_or_else(|| "Richiesta interrotta.".to_string())?;

    store(
        &app,
        &request,
        &fetched.bytes,
        Some("image/jpeg".to_string()),
    );
    Ok(fetched.bytes)
}

/// Il deposito, che ha la precedenza su tutto: è roba posseduta, e non costa
/// una richiesta a nessuno.
fn from_vault(app: &tauri::AppHandle, request: &CacheRequest) -> Result<Option<Vec<u8>>, String> {
    let CacheRequest::Page {
        version_id,
        index,
        size,
    } = request
    else {
        return Ok(None);
    };
    let root = crate::vault::commands::root_of(app)?;
    for folder in version_folders(&root, version_id) {
        let pages = folder.join(crate::vault::layout::PAGES_DIR);
        let exact = pages
            .join(size)
            .join(crate::vault::layout::page_file_name(*index));
        if exact.is_file() {
            return std::fs::read(&exact)
                .map(Some)
                .map_err(|error| error.to_string());
        }
        // A una misura più grande: si rimpicciolisce sul momento. Meglio del
        // deposito che chiedere alla biblioteca una cosa che abbiamo già in
        // casa più bella.
        if let Some(bytes) = larger_in_vault(&pages, *index, size)? {
            let wanted = size.parse::<u32>().unwrap_or(0);
            if wanted > 0 {
                let smaller = crate::images::resize_jpeg(&bytes, wanted, DOWNSCALE_QUALITY)
                    .map_err(|error| error.to_string())?;
                store(app, request, &smaller, Some("image/jpeg".to_string()));
                return Ok(Some(smaller));
            }
            return Ok(Some(bytes));
        }
    }
    Ok(None)
}

/// La stessa qualità dell'ottimizzazione locale: è materiale derivato e
/// mostrato, non conservato.
const DOWNSCALE_QUALITY: u8 = 82;

/// Le cartelle di una digitalizzazione, cercate **sotto tutte le biblioteche**:
/// la stessa opera ha lasciato cartelle sotto chiavi diverse, e la chiave si
/// deduce da dati che possono essere già stati cancellati.
fn version_folders(root: &std::path::Path, version_id: &str) -> Vec<std::path::PathBuf> {
    let providers = root.join("providers");
    let Ok(entries) = std::fs::read_dir(providers) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|provider| provider.path().join(version_id))
        .filter(|folder| folder.is_dir())
        .collect()
}

/// La stessa pagina in una cartella di misura più grande di quella chiesta.
/// `max` conta come la più grande di tutte.
fn larger_in_vault(
    pages: &std::path::Path,
    index: u32,
    wanted: &str,
) -> Result<Option<Vec<u8>>, String> {
    let wanted_pixels = wanted.parse::<u32>().unwrap_or(u32::MAX);
    let Ok(entries) = std::fs::read_dir(pages) else {
        return Ok(None);
    };
    let mut best: Option<(u32, std::path::PathBuf)> = None;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let pixels = if name == "max" {
            u32::MAX
        } else {
            name.parse::<u32>().unwrap_or(0)
        };
        if pixels <= wanted_pixels {
            continue;
        }
        let candidate = entry
            .path()
            .join(crate::vault::layout::page_file_name(index));
        if !candidate.is_file() {
            continue;
        }
        // La più piccola fra quelle più grandi: meno byte da decodificare.
        if best
            .as_ref()
            .map(|(found, _)| pixels < *found)
            .unwrap_or(true)
        {
            best = Some((pixels, candidate));
        }
    }
    match best {
        Some((_, path)) => std::fs::read(&path)
            .map(Some)
            .map_err(|error| error.to_string()),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn cache_usage(app: tauri::AppHandle) -> Result<CacheUsage, String> {
    Ok(app.state::<Arc<HttpCache>>().usage())
}

#[tauri::command]
pub fn clear_cache(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<Arc<HttpCache>>()
        .clear()
        .map_err(|error| error.to_string())
}
