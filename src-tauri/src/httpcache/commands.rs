//! Come si chiede un'immagine, da qualunque schermata.
//!
//! La domanda è «questa immagine, **a questa misura**», e la risposta si cerca
//! in quest'ordine:
//!
//! 1. nel deposito, a quella misura → si restituisce il file;
//! 2. **nella cache** → si restituisce. Sta qui e non dopo il deposito perché
//!    il passo 3 produce proprio ciò che la cache conserva: cercarla dopo
//!    significherebbe rifare il rimpicciolimento a ogni voltata di pagina e non
//!    rileggere mai quello di prima;
//! 3. nel deposito, a una misura più grande → si restituisce quello,
//!    rimpicciolito sul momento **e messo in cache**;
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
    request::CacheRequest, CacheMeta, CacheUsage, HttpCache, ServedCounts, Source,
    DEFAULT_MAX_BYTES, DEFAULT_SEARCH_TTL_HOURS, MAX_BYTES_SETTING, SEARCH_TTL_SETTING,
};
use crate::download::courtesy::{Courtesy, Lane, Signals};
use crate::download::fetch;

/// Estremi accettati per il tetto: sotto i 32 MB la cache non serve a niente,
/// sopra i 32 GB è un errore di digitazione.
const MIN_MAX_BYTES: u64 = 32 * 1024 * 1024;
const MAX_MAX_BYTES: u64 = 32 * 1024 * 1024 * 1024;

/// La stessa qualità dell'ottimizzazione locale: è materiale derivato e
/// mostrato, non conservato.
const DOWNSCALE_QUALITY: u8 = 82;

/// Quanto vale la cache e per quanto valgono le ricerche, letti **in una volta
/// sola**.
///
/// Aprire il database due volte per ogni copertina significava ottanta aperture
/// per una pagina di risultati, tutte in contesa con il motore dei lavori sullo
/// stesso file.
struct Limits {
    max_bytes: u64,
    search_ttl_hours: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_bytes: DEFAULT_MAX_BYTES,
            search_ttl_hours: DEFAULT_SEARCH_TTL_HOURS,
        }
    }
}

fn limits(app: &tauri::AppHandle) -> Limits {
    let read = || {
        let Ok(path) = crate::storage_config::db_path(app) else {
            return (DEFAULT_MAX_BYTES, DEFAULT_SEARCH_TTL_HOURS);
        };
        let Ok(conn) = crate::db::open_connection(&path) else {
            return (DEFAULT_MAX_BYTES, DEFAULT_SEARCH_TTL_HOURS);
        };
        (max_bytes(&conn), search_ttl_hours(&conn))
    };
    let (max_bytes, search_ttl_hours) = match cache(app) {
        Some(cache) => cache.limits_for(read),
        None => read(),
    };
    Limits {
        max_bytes,
        search_ttl_hours,
    }
}

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

/// La cache, **se c'è**.
///
/// Può non esserci: se all'avvio la cartella dati non si risolve, l'applicazione
/// parte lo stesso e lo scrive nel registro. Chiederla senza guardare farebbe
/// cadere ricerche che prima funzionavano.
fn cache(app: &tauri::AppHandle) -> Option<Arc<HttpCache>> {
    app.try_state::<Arc<HttpCache>>()
        .map(|state| state.inner().clone())
}

/// Metti in cache e, ogni tanto, butta quello che non ci sta più.
///
/// Lo scarto non si fa a ogni voltata: camminare la cartella costa, e finché non
/// è entrato abbastanza non c'è niente di nuovo da decidere.
pub fn store(
    app: &tauri::AppHandle,
    request: &CacheRequest,
    bytes: &[u8],
    content_type: Option<String>,
) {
    let Some(cache) = cache(app) else {
        return;
    };
    let limits = limits(app);
    let meta = CacheMeta {
        content_type,
        stored_at: Some(super::now_secs()),
        expires_at: request
            .expires()
            .then(|| super::now_secs() + (limits.search_ttl_hours * 3600) as i64),
        request: Some(format!("{request:?}")),
    };
    if let Err(error) = cache.put(&request.key(), bytes, meta) {
        // Una cache che non riesce a scrivere non è un guasto per chi guarda:
        // la prossima volta si ripassa dalla rete.
        log::warn!("cache write failed: {error}");
        return;
    }
    if cache.due_for_a_walk() {
        let freed = cache.evict_to(limits.max_bytes);
        if freed > 0 {
            log::info!("cache eviction freed {freed} bytes");
        }
    }
}

/// I byte già in cache, se ci sono.
pub fn lookup(app: &tauri::AppHandle, request: &CacheRequest) -> Option<Vec<u8>> {
    cache(app)?.get(&request.key())
}

/// I byte già in cache e **da quando ci sono**: chi mostra un risultato
/// conservato deve poter dire di quando è.
pub fn lookup_with_age(
    app: &tauri::AppHandle,
    request: &CacheRequest,
) -> Option<(Vec<u8>, Option<i64>)> {
    cache(app)?
        .get_with_meta(&request.key())
        .map(|(bytes, meta)| (bytes, meta.stored_at))
}

/// L'immagine chiesta, presa dove è: deposito, cache o biblioteca.
///
/// Restituisce byte **grezzi** e non un vettore serializzato: un `Vec<u8>` che
/// attraversa il ponte diventa un elenco di numeri in JSON — tre o quattro volte
/// i byte che trasporta, più il costo di rileggerli dall'altra parte. Su una
/// copertina si sente; su una pagina intera si sentirebbe molto.
#[tauri::command]
pub async fn cached_image(
    app: tauri::AppHandle,
    request: CacheRequest,
) -> Result<tauri::ipc::Response, String> {
    let (source, bytes) = resolve_and_release(&app, &request).await?;
    Ok(served(&app, &request, source, bytes))
}

/// Conserva nel deposito la pagina che il visore ha gia' aperto.
///
/// I byte passano dalla stessa risoluzione deposito/cache/rete del visore: di
/// norma sono gia' in memoria e il comando deve solo validarli e promuoverli.
#[tauri::command]
pub async fn keep_viewer_page(
    app: tauri::AppHandle,
    writes: tauri::State<'_, crate::db::DbWriteCoordinator>,
    request: CacheRequest,
) -> Result<bool, String> {
    let (version_id, index, size, provider_key) = match &request {
        CacheRequest::Page {
            version_id,
            index,
            size,
            provider_key: Some(provider_key),
            ..
        } if size != THUMB_SIZE => (
            version_id.as_str(),
            *index,
            size.as_str(),
            provider_key.as_str(),
        ),
        _ => return Err("pagina_non_conservabile".to_string()),
    };
    let _write_guard = writes.lock().await;
    let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
    if crate::jobs::store::has_active_version_work(&conn, version_id)? {
        return Err("version_work_in_progress".to_string());
    }
    drop(conn);

    let (_, bytes) = resolve_and_release(&app, &request).await?;
    let root = crate::vault::commands::root_of(&app)?;
    if !root.is_dir() {
        return Err("vault_unreachable".to_string());
    }
    let folder = root.join(crate::vault::layout::version_dir(provider_key, version_id)?);
    let size_dir = folder.join(crate::vault::layout::PAGES_DIR).join(size);
    let target = size_dir.join(crate::vault::layout::page_file_name(index));
    if target.is_file() {
        return Ok(false);
    }
    let staging = root
        .join(crate::vault::layout::STAGING_DIR)
        .join(format!("viewer-{version_id}"));
    let staged = staging.join(format!("page-{index:04}.jpg"));
    let checksum = crate::download::vault_io::stage_and_promote(
        &staged,
        &target,
        &bytes,
        crate::vault::integrity::FileKind::Image,
    )
    .map_err(|error| error.message)?;
    let record = crate::download::sidecar::PageRecord {
        index,
        label: None,
        got: image_dimensions(&bytes),
        bytes: Some(bytes.len() as u64),
        checksum: Some(checksum),
        at: crate::download::vault_io::now_secs(),
        note: None,
    };
    if let Err(error) = crate::download::sidecar::append(&size_dir, &record) {
        log::warn!("viewer page sidecar not written index={index} error={error}");
    }
    keep_thumbnail_in_vault(&app, &folder, index, &bytes);
    Ok(true)
}

/// Da dove è arrivata l'ultima volta l'immagine chiesta così: deposito, memoria
/// di lavoro o biblioteca.
///
/// I byte tornano alla finestra grezzi, senza un posto dove infilare anche
/// questo; chi ha appena ricevuto una pagina lo chiede qui subito dopo. È una
/// lettura in memoria, non tocca né disco né rete, e non può mentire perché è
/// la stessa chiave della richiesta. `None` quando quella richiesta non è
/// passata di qui, o è passata troppe immagini fa.
#[tauri::command]
pub fn image_source(app: tauri::AppHandle, request: CacheRequest) -> Option<&'static str> {
    let source = cache(&app)?.source_of(request.key().as_str())?;
    Some(match source {
        Source::Vault => "vault",
        Source::Cache => "cache",
        Source::Network => "network",
    })
}

/// I byte di una risorsa remota — immagine **o manifesto** — presi dove sono e
/// segnati nel conto delle provenienze.
///
/// Esiste separata dal comando perché il visore ha bisogno degli stessi byte
/// senza farli attraversare il ponte: un manifesto di un libro può pesare
/// megabyte, e riportarlo alla finestra per rimandarlo indietro da leggere
/// significava trasformarlo due volte in un elenco di numeri.
pub async fn bytes_of(app: &tauri::AppHandle, request: &CacheRequest) -> Result<Vec<u8>, String> {
    let (source, bytes) = resolve_and_release(app, request).await?;
    if let Some(cache) = cache(app) {
        cache.served(source, bytes.len());
        cache.note_source(request.key().as_str(), source);
    }
    Ok(bytes)
}

/// Deposito, cache, deposito a misura più grande, biblioteca: in quest'ordine.
async fn resolve(
    app: &tauri::AppHandle,
    request: &CacheRequest,
) -> Result<(Source, Vec<u8>), String> {
    if let Some(bytes) = from_vault_exact(app, request)? {
        return Ok((Source::Vault, bytes));
    }
    // Prima della riduzione dal deposito: è lei che riempie la cache, e
    // cercarla dopo significherebbe non rileggerla mai.
    if let Some(bytes) = lookup(app, request) {
        return Ok((Source::Cache, bytes));
    }
    if let Some(bytes) = from_vault_larger(app, request)? {
        return Ok((Source::Vault, bytes));
    }

    // Da qui in avanti si va a disturbare una biblioteca: una richiesta per
    // volta per la stessa risorsa. Chi arriva secondo aspetta e poi ritrova i
    // byte in cache, invece di fare la stessa domanda due volte.
    let key = request.key().as_str().to_string();
    let turn = match cache(app) {
        Some(cache) => Some(cache.one_at_a_time(&key).await),
        None => None,
    };
    let _first = match &turn {
        Some(turn) => Some(turn.lock().await),
        None => None,
    };
    if turn.is_some() {
        if let Some(bytes) = lookup(app, request) {
            return Ok((Source::Cache, bytes));
        }
    }
    // Sul computer non c'è: si va dove la richiesta dice di andare. Una pagina
    // senza indirizzo remoto è una pagina che esiste solo in locale, e non c'è
    // niente da indovinare qui.
    let remote = match request {
        CacheRequest::Remote { url, .. } => Some(url.as_str()),
        CacheRequest::Page { remote_url, .. } => remote_url.as_deref(),
        CacheRequest::Search { .. } => None,
    };
    let Some(url) = remote else {
        return Err("Questa pagina non è disponibile in locale.".to_string());
    };

    let provider_key = request.provider_key().unwrap_or_default();
    let host = request.host();
    let read_profile = || {
        crate::storage_config::db_path(app)
            .and_then(|path| crate::db::open_connection(&path))
            .map(|conn| {
                crate::iiif::settings::effective_profile(&conn, provider_key, host.as_deref())
            })
            .unwrap_or(crate::iiif::network::CAUTIOUS)
    };

    // Client e ritmo si riusano: uno nuovo per immagine significa una
    // connessione nuova e una lettura del database per ogni tassello.
    let (profile, client) = match cache(app) {
        Some(cache) => {
            let profile = cache.profile_for(provider_key, host.as_deref(), read_profile);
            (profile, cache.client_for(&profile)?)
        }
        None => {
            let profile = read_profile();
            (
                profile,
                fetch::build_client(&profile).map_err(|error| error.message)?,
            )
        }
    };
    let courtesy = app.state::<Arc<Courtesy>>().inner().clone();
    let never_stops = || false;
    let waiting = AtomicBool::new(false);
    let signals = Signals {
        stop: &never_stops,
        courtesy_wait: &waiting,
    };
    let fetched = fetch::fetch(
        &client,
        &courtesy,
        &profile,
        url,
        lane_of(request),
        1,
        &signals,
    )
    .await
    .map_err(|error| error.message)?
    .ok_or_else(|| "Richiesta interrotta.".to_string())?;

    // Prima si prova a tenerla per sempre: se quell'opera ha già una cartella
    // per questa misura, la pagina appena arrivata è una pagina del libro, non
    // una copia di passaggio. Se il deposito la accoglie, la memoria di lavoro
    // non deve tenerne una seconda.
    if !keep_in_vault(app, request, &fetched.bytes) {
        store(app, request, &fetched.bytes, fetched.content_type);
    }
    Ok((Source::Network, fetched.bytes))
}

/// La pagina appena arrivata entra nel **deposito** invece che nella memoria di
/// lavoro, quando quell'opera ha già una cartella per la misura chiesta.
///
/// Sfogliando un libro scaricato a metà, le pagine che mancavano restano sul
/// computer senza che nessuno lanci niente. Vale solo a colpo sicuro:
///
/// - solo per una pagina intera chiesta per numero (mai una miniatura, mai un
///   tassello, mai una risorsa remota generica);
/// - solo se la cartella di quella misura **esiste già**: la misura è quella
///   decisa dallo scaricamento, non una inventata adesso;
/// - se il file c'è già non si sovrascrive niente: presenza del file = pagina
///   valida, è la regola del deposito;
/// - i byte sono quelli mandati dalla biblioteca, mai ricompressi da noi.
///
/// Si riusa la catena dello scaricamento — transito, validazione, spostamento
/// atomico, riga nell'inventario laterale con impronta e dimensioni — e si
/// ricava la miniatura come farebbe lui. Qualunque intoppo non è un guasto per
/// chi legge: la pagina si vede comunque, e finisce nella memoria di lavoro.
///
/// Ritorna vero solo se la pagina è davvero finita nel deposito.
fn keep_in_vault(app: &tauri::AppHandle, request: &CacheRequest, bytes: &[u8]) -> bool {
    let Ok(Some((version_id, index, size))) = page_of(request) else {
        return false;
    };
    if size == THUMB_SIZE {
        return false;
    }
    let Ok(root) = crate::vault::commands::root_of(app) else {
        return false;
    };
    let file = crate::vault::layout::page_file_name(index);
    for folder in version_folders(&root, version_id) {
        let size_dir = folder.join(crate::vault::layout::PAGES_DIR).join(size);
        if !size_dir.is_dir() {
            continue;
        }
        let target = size_dir.join(&file);
        if target.exists() {
            return false;
        }
        let staging = root
            .join(crate::vault::layout::STAGING_DIR)
            .join(format!("viewer-{version_id}"));
        if std::fs::create_dir_all(&staging).is_err() {
            return false;
        }
        let staged = staging.join(format!("page-{index:04}.jpg"));
        let promoted = crate::download::vault_io::stage_and_promote(
            &staged,
            &target,
            bytes,
            crate::vault::integrity::FileKind::Image,
        );
        let checksum = match promoted {
            Ok(checksum) => checksum,
            Err(error) => {
                log::warn!(
                    "viewer page not kept version={version_id} index={index} error={}",
                    error.message
                );
                let _ = std::fs::remove_file(&staged);
                return false;
            }
        };
        let record = crate::download::sidecar::PageRecord {
            index,
            label: None,
            got: image_dimensions(bytes),
            bytes: Some(bytes.len() as u64),
            checksum: Some(checksum),
            at: crate::download::vault_io::now_secs(),
            note: None,
        };
        if let Err(error) = crate::download::sidecar::append(&size_dir, &record) {
            // Il file è già dentro e vale: una riga mancante lo lascia con
            // impronta ignota, che la verifica completa tollera.
            log::warn!("viewer page sidecar not written index={index} error={error}");
        }
        keep_thumbnail_in_vault(app, &folder, index, bytes);
        log::info!("viewer page kept version={version_id} index={index} size={size}");
        return true;
    }
    false
}

/// La miniatura della pagina appena tenuta, ricavata in casa come fa lo
/// scaricamento: dalla pagina che abbiamo già, senza chiedere niente in più.
fn keep_thumbnail_in_vault(
    app: &tauri::AppHandle,
    folder: &std::path::Path,
    index: u32,
    bytes: &[u8],
) {
    let target = folder
        .join(crate::vault::layout::THUMBNAILS_DIR)
        .join(crate::vault::layout::page_file_name(index));
    if target.exists() {
        return;
    }
    let Ok(thumbnail) = crate::images::thumbnail(bytes, thumbnail_edge(app)) else {
        return;
    };
    if let Some(parent) = target.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if let Err(error) = std::fs::write(&target, &thumbnail) {
        log::warn!("viewer thumbnail not kept index={index} error={error}");
    }
}

fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()
}

/// Come `resolve`, ma libera il turno anche quando la richiesta fallisce.
async fn resolve_and_release(
    app: &tauri::AppHandle,
    request: &CacheRequest,
) -> Result<(Source, Vec<u8>), String> {
    let outcome = resolve(app, request).await;
    if let Some(cache) = cache(app) {
        cache.turn_is_over(request.key().as_str()).await;
    }
    outcome
}

/// Segna la provenienza e restituisce i byte. Sapere quante immagini sono
/// arrivate senza toccare la rete è l'unica misura che dice se la cache serve.
fn served(
    app: &tauri::AppHandle,
    request: &CacheRequest,
    source: Source,
    bytes: Vec<u8>,
) -> tauri::ipc::Response {
    if let Some(cache) = cache(app) {
        cache.served(source, bytes.len());
        cache.note_source(request.key().as_str(), source);
    }
    tauri::ipc::Response::new(bytes)
}

/// Cosa sta facendo la rete verso le biblioteche, adesso.
///
/// Si chiede solo mentre il pannello è aperto: fuori di lì nessuno la guarda, e
/// interrogarla di continuo costerebbe senza dire niente di nuovo.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProbe {
    pub hosts: Vec<crate::download::courtesy::HostActivity>,
    pub served: ServedCounts,
}

#[tauri::command]
pub async fn network_probe(app: tauri::AppHandle) -> Result<NetworkProbe, String> {
    let courtesy = app
        .try_state::<Arc<Courtesy>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "cortesia non disponibile".to_string())?;
    Ok(NetworkProbe {
        hosts: courtesy.activity().await,
        served: cache(&app)
            .map(|cache| cache.served_counts())
            .unwrap_or_default(),
    })
}

/// La misura che chiede la miniatura invece di un numero di pixel.
pub const THUMB_SIZE: &str = "thumb";

/// Quanto è urgente questa immagine.
///
/// Una miniatura non deve mai togliere il posto alla pagina che si sta
/// guardando: due miniature che occupavano gli unici due posti di una
/// biblioteca severa lasciavano la pagina ad aspettare finché non scadeva.
fn lane_of(request: &CacheRequest) -> Lane {
    match request {
        CacheRequest::Page { size, .. } if size == THUMB_SIZE => Lane::Thumbnail,
        _ => Lane::Page,
    }
}

/// Il file già sul computer, alla misura chiesta. Ha la precedenza su tutto: è
/// roba posseduta, e non costa una richiesta a nessuno.
///
/// Le miniature hanno una cartella loro, che «libera spazio» non tocca: un libro
/// di cui si sono cancellate le pagine continua a sfogliarsi in piccolo.
fn from_vault_exact(
    app: &tauri::AppHandle,
    request: &CacheRequest,
) -> Result<Option<Vec<u8>>, String> {
    let Some((version_id, index, size)) = page_of(request)? else {
        return Ok(None);
    };
    // Deposito irraggiungibile — disco staccato, cartella di rete non montata —
    // significa «qui non c'è niente», non «errore»: la pagina si chiederà alla
    // biblioteca invece di lasciare il visore vuoto.
    let Ok(root) = crate::vault::commands::root_of(app) else {
        return Ok(None);
    };
    let file = crate::vault::layout::page_file_name(index);
    for folder in version_folders(&root, version_id) {
        let exact = if size == THUMB_SIZE {
            folder
                .join(crate::vault::layout::THUMBNAILS_DIR)
                .join(&file)
        } else {
            folder
                .join(crate::vault::layout::PAGES_DIR)
                .join(size)
                .join(&file)
        };
        if exact.is_file() {
            return std::fs::read(&exact)
                .map(Some)
                .map_err(|error| error.to_string());
        }
    }
    Ok(None)
}

/// La stessa pagina in una cartella più grande, rimpicciolita sul momento e
/// messa in cache: meglio del deposito che chiedere alla biblioteca una cosa che
/// abbiamo già in casa più bella.
///
/// È anche il modo in cui nasce la miniatura di un libro scaricato prima che le
/// miniature esistessero: si ricava dalla pagina, non si scarica.
fn from_vault_larger(
    app: &tauri::AppHandle,
    request: &CacheRequest,
) -> Result<Option<Vec<u8>>, String> {
    let Some((version_id, index, size)) = page_of(request)? else {
        return Ok(None);
    };
    // Chi chiede `max` vuole la più grande che c'è: se non è sul computer non
    // la si costruisce rimpicciolendo qualcos'altro.
    let Some(wanted) = wanted_edge(app, size) else {
        return Ok(None);
    };
    let Ok(root) = crate::vault::commands::root_of(app) else {
        return Ok(None);
    };
    for folder in version_folders(&root, version_id) {
        let pages = folder.join(crate::vault::layout::PAGES_DIR);
        let Some(bytes) = larger_in_vault(&pages, index, wanted)? else {
            continue;
        };
        let smaller = crate::images::resize_jpeg(&bytes, wanted, DOWNSCALE_QUALITY)
            .map_err(|error| error.to_string())?;
        store(app, request, &smaller, Some("image/jpeg".to_string()));
        return Ok(Some(smaller));
    }
    Ok(None)
}

/// Il lato lungo in pixel di una misura, o `None` quando non è un numero e
/// quindi non si può ricavare da una copia più grande.
fn wanted_edge(app: &tauri::AppHandle, size: &str) -> Option<u32> {
    if size == THUMB_SIZE {
        return Some(thumbnail_edge(app));
    }
    size.parse::<u32>().ok().filter(|pixels| *pixels > 0)
}

/// Il lato lungo scelto per le miniature, o quello predefinito.
fn thumbnail_edge(app: &tauri::AppHandle) -> u32 {
    crate::storage_config::db_path(app)
        .and_then(|path| crate::db::open_connection(&path))
        .and_then(|conn| crate::download::thumbnail_edge(&conn))
        .unwrap_or(crate::images::DEFAULT_THUMBNAIL_EDGE)
}

/// La pagina chiesta, **dopo aver controllato che i suoi pezzi siano nomi e non
/// percorsi**.
///
/// Identificativo e misura arrivano dalla finestra e diventano cartelle: un
/// valore costruito ad arte uscirebbe dal deposito e leggerebbe file altrove. È
/// la stessa regola che vale per ogni altro comando del deposito (#405).
fn page_of(request: &CacheRequest) -> Result<Option<(&str, u32, &str)>, String> {
    let CacheRequest::Page {
        version_id,
        index,
        size,
        ..
    } = request
    else {
        return Ok(None);
    };
    let version_id = crate::vault::layout::safe_component(version_id)?;
    let size = crate::vault::layout::safe_component(size)?;
    Ok(Some((version_id, *index, size)))
}

/// Le cartelle di una digitalizzazione, cercate **sotto tutte le biblioteche**:
/// la stessa opera ha lasciato cartelle sotto chiavi diverse, e la chiave si
/// deduce da dati che possono essere già stati cancellati.
fn version_folders(root: &std::path::Path, version_id: &str) -> Vec<std::path::PathBuf> {
    let Ok(entries) = std::fs::read_dir(root.join("providers")) else {
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
    wanted_pixels: u32,
) -> Result<Option<Vec<u8>>, String> {
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
    Ok(cache(&app).map(|cache| cache.usage()).unwrap_or_default())
}

/// Applica il tetto **adesso**: dopo averlo abbassato, aspettare che entri
/// qualcosa di nuovo per liberare spazio non è quello che chi lo abbassa si
/// aspetta.
#[tauri::command]
pub fn apply_cache_cap(app: tauri::AppHandle) -> Result<CacheUsage, String> {
    let Some(cache) = cache(&app) else {
        return Ok(CacheUsage::default());
    };
    // Si arriva qui subito dopo aver cambiato il tetto: quello ricordato è
    // proprio il valore che non vale più.
    cache.forget_settings();
    let freed = cache.evict_to(limits(&app).max_bytes);
    if freed > 0 {
        log::info!("cache eviction freed {freed} bytes");
    }
    Ok(cache.usage())
}

/// Dimentica tetto e scadenza ricordati, senza toccare quello che è in cache.
///
/// Serve a chi cambia la **scadenza delle ricerche**: quel valore finisce nella
/// stessa fotografia del tetto, letta una volta sola, e senza questo passo le
/// ricerche fatte dopo continuavano a nascere con la scadenza di prima fino al
/// riavvio. Il tetto ha già la sua strada (`apply_cache_cap`), che oltre a
/// dimenticare libera anche lo spazio in eccesso.
#[tauri::command]
pub fn forget_cache_settings(app: tauri::AppHandle) {
    if let Some(cache) = cache(&app) {
        cache.forget_settings();
    }
}

/// Butta dalla memoria di lavoro tutto quello che riguarda una
/// digitalizzazione, e dice quanti byte ha liberato.
///
/// Si chiama togliendo un'opera dalla Biblioteca: è l'unico momento in cui
/// buttare è giusto. Vedi `HttpCache::forget_version`.
#[tauri::command]
pub fn forget_version_cache(app: tauri::AppHandle, version_id: String) -> u64 {
    match cache(&app) {
        Some(cache) => {
            let freed = cache.forget_version(&version_id);
            log::info!("cache forgot version={version_id} freed={freed}");
            freed
        }
        None => 0,
    }
}

#[tauri::command]
pub fn clear_cache(app: tauri::AppHandle) -> Result<(), String> {
    match cache(&app) {
        Some(cache) => cache.clear().map_err(|error| error.to_string()),
        None => Ok(()),
    }
}
