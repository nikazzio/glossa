//! Una cache sola per tutto quello che viene dalla rete: copertine, miniature
//! remote, risposte delle ricerche, e domani le pagine dei libri non scaricati.
//!
//! **Chiave: la richiesta. Valore: i byte**, con quando sono arrivati e quanto
//! pesano. Sono tutte risposte a una richiesta HTTP, e il magazzino è uno.
//!
//! Come nel deposito, **il disco è la verità**: non c'è nessun indice da tenere
//! allineato, quindi non c'è niente da riparare dopo una chiusura brusca e
//! cancellare la cartella a mano è un'operazione legittima.
//!
//! - un file per richiesta, il cui nome è l'impronta della richiesta, **più il
//!   suo file di lato** con tipo di contenuto, quando è arrivato e quando scade;
//! - quando è stata usata l'ultima volta lo dice la data del file, toccata alla
//!   lettura: una chiamata al sistema, non una scrittura su un indice;
//! - quanto occupa si somma camminando la cartella, e si fa quando serve —
//!   allo scarto e quando le impostazioni lo mostrano — non a ogni lettura.
//!
//! **Una voce senza il suo file di lato non si serve**: senza di lui non si sa
//! quando scade, e una ricerca che doveva valere un giorno varrebbe per sempre.
//! Si scarta, e la prossima richiesta ripassa dalla rete.
//!
//! Quello che sta qui **non è posseduto**: può sparire al prossimo giro di
//! scarto, non è mai contato nella scheda di Biblioteca e non entra in un
//! backup. Il modo di fissare una cosa è scaricarla nel deposito (D8).

pub mod commands;
pub mod request;

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::{Deserialize, Serialize};

pub use request::CacheKey;

/// Tetto predefinito, in byte (D8). Un manoscritto guardato a fondo lo esaurisce
/// in una sessione: è voluto, e la schermata deve dire quanto occupa.
pub const DEFAULT_MAX_BYTES: u64 = 512 * 1024 * 1024;
/// Scadenza predefinita delle ricerche, in ore.
pub const DEFAULT_SEARCH_TTL_HOURS: u64 = 24;

pub const MAX_BYTES_SETTING: &str = "cache_max_bytes";
pub const SEARCH_TTL_SETTING: &str = "search_cache_ttl_hours";

const META_SUFFIX: &str = ".meta";
const TEMP_SUFFIX: &str = ".part";

/// Quanti byte devono entrare prima di rimettersi a camminare la cartella.
///
/// Camminarla a ogni copertina significava quaranta scansioni complete per una
/// pagina di risultati. Il tetto non ha bisogno di essere rispettato al byte:
/// deve essere rispettato, e basta controllarlo ogni tanto.
const WALK_AFTER_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheMeta {
    /// Il tipo dichiarato dal servizio, quando lo dichiara. Non si indovina:
    /// scrivere «JPEG» per abitudine è una bugia appena una biblioteca serve
    /// PNG.
    pub content_type: Option<String>,
    /// Quando è arrivata dalla rete. Non è la data del file, che alla lettura
    /// viene toccata e diventa «ultimo uso»: serve a dire a chi guarda **di
    /// quando** è il risultato che ha davanti.
    #[serde(default)]
    pub stored_at: Option<i64>,
    /// Secondi dall'epoca. `None` per ciò che non scade.
    pub expires_at: Option<i64>,
    /// La richiesta in chiaro: serve solo a capire cosa c'è dentro guardando la
    /// cartella. Nessuno la interroga.
    pub request: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheUsage {
    pub bytes: u64,
    pub files: u64,
}

pub struct HttpCache {
    root: PathBuf,
    /// Byte entrati dall'ultima camminata: sotto la soglia non si cammina.
    since_walk: AtomicU64,
    /// Un client per coppia di scadenze, riusato.
    ///
    /// Costruirne uno per immagine significa aprire una connessione nuova a
    /// ogni copertina: quaranta copertine dalla stessa biblioteca erano quaranta
    /// strette di mano, cioè il contrario della cortesia che questa cache serve
    /// a ottenere.
    clients: Mutex<HashMap<(u64, u64), Client>>,
}

impl HttpCache {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            since_walk: AtomicU64::new(0),
            clients: Mutex::new(HashMap::new()),
        }
    }

    /// Il client da usare verso una biblioteca con quel profilo, riusato fra le
    /// richieste che condividono le stesse scadenze.
    pub fn client_for(
        &self,
        profile: &crate::iiif::network::NetworkProfile,
    ) -> Result<Client, String> {
        let key = (profile.connect_timeout_secs, profile.read_timeout_secs);
        let mut clients = self
            .clients
            .lock()
            .map_err(|_| "cache occupata".to_string())?;
        if let Some(client) = clients.get(&key) {
            return Ok(client.clone());
        }
        let client =
            crate::download::fetch::build_client(profile).map_err(|error| error.message)?;
        clients.insert(key, client.clone());
        Ok(client)
    }

    /// I byte, se ci sono, non sono scaduti e sono descritti da un file di lato.
    pub fn get(&self, key: &CacheKey) -> Option<Vec<u8>> {
        self.get_with_meta(key).map(|(bytes, _)| bytes)
    }

    /// I byte e quello che si sa di loro: chi mostra un risultato conservato
    /// deve poter dire di quando è.
    pub fn get_with_meta(&self, key: &CacheKey) -> Option<(Vec<u8>, CacheMeta)> {
        let path = self.path_of(key);
        // Senza file di lato non si sa quando scade: si scarta invece di
        // servirlo per sempre.
        let Some(meta) = self.read_meta(key) else {
            if path.exists() {
                self.forget(&path);
            }
            return None;
        };
        if let Some(expires_at) = meta.expires_at {
            if now_secs() >= expires_at {
                self.forget(&path);
                return None;
            }
        }
        let bytes = fs::read(&path).ok()?;
        touch(&path);
        Some((bytes, meta))
    }

    /// Scrive la voce **in transito e poi al suo posto**, come ogni file che
    /// entra nel deposito: una scrittura interrotta non deve lasciare
    /// un'immagine a metà che poi viene servita come buona.
    ///
    /// Il file di lato si scrive **per primo**: se manca, la voce non è
    /// utilizzabile, e vale meno di non averla affatto.
    pub fn put(&self, key: &CacheKey, bytes: &[u8], meta: CacheMeta) -> io::Result<()> {
        let path = self.path_of(key);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let meta_path = self.meta_path_of(key);
        let encoded = serde_json::to_vec(&meta)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        if let Err(error) = write_atomically(&meta_path, &encoded) {
            let _ = fs::remove_file(&meta_path);
            return Err(error);
        }
        if let Err(error) = write_atomically(&path, bytes) {
            // Senza i byte il file di lato non descrive niente.
            let _ = fs::remove_file(&meta_path);
            let _ = fs::remove_file(&path);
            return Err(error);
        }
        self.since_walk
            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
        Ok(())
    }

    /// Quanto occupa **davvero**: le voci scadute non contano, e i file di lato
    /// sì, perché stanno sul disco come tutto il resto.
    pub fn usage(&self) -> CacheUsage {
        let mut usage = CacheUsage::default();
        for entry in self.entries() {
            if entry.expired {
                continue;
            }
            usage.bytes += entry.bytes;
            usage.files += 1;
        }
        usage
    }

    /// Butta prima ciò che è scaduto, poi le voci non usate da più tempo,
    /// finché non si scende sotto il tetto. Ritorna i byte liberati.
    pub fn evict_to(&self, cap_bytes: u64) -> u64 {
        self.since_walk.store(0, Ordering::Relaxed);
        let mut entries = self.entries();
        let mut freed = 0;

        // Le scadute se ne vanno comunque, tetto o non tetto.
        entries.retain(|entry| {
            if !entry.expired {
                return true;
            }
            self.forget(&entry.path);
            freed += entry.bytes;
            false
        });

        let mut total: u64 = entries.iter().map(|entry| entry.bytes).sum();
        if total <= cap_bytes {
            return freed;
        }
        entries.sort_by_key(|entry| entry.used_at);
        for entry in entries {
            if total <= cap_bytes {
                break;
            }
            self.forget(&entry.path);
            total = total.saturating_sub(entry.bytes);
            freed += entry.bytes;
        }
        freed
    }

    /// Vero quando è passata abbastanza roba da giustificare una camminata.
    pub fn due_for_a_walk(&self) -> bool {
        self.since_walk.load(Ordering::Relaxed) >= WALK_AFTER_BYTES
    }

    pub fn clear(&self) -> io::Result<()> {
        if self.root.exists() {
            fs::remove_dir_all(&self.root)?;
        }
        self.since_walk.store(0, Ordering::Relaxed);
        Ok(())
    }

    /// Una voce se ne va tutta intera: byte e file di lato.
    fn forget(&self, path: &Path) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(meta_path(path));
    }

    fn path_of(&self, key: &CacheKey) -> PathBuf {
        self.root.join(key.shard()).join(key.as_str())
    }

    fn meta_path_of(&self, key: &CacheKey) -> PathBuf {
        meta_path(&self.path_of(key))
    }

    fn read_meta(&self, key: &CacheKey) -> Option<CacheMeta> {
        let bytes = fs::read(self.meta_path_of(key)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    /// Cammina la cartella. Una voce è i byte **più** il suo file di lato:
    /// pesano entrambi sul disco, quindi contano entrambi sul tetto.
    fn entries(&self) -> Vec<Entry> {
        let mut found = Vec::new();
        let Ok(shards) = fs::read_dir(&self.root) else {
            return found;
        };
        let now = now_secs();
        for shard in shards.flatten() {
            let Ok(files) = fs::read_dir(shard.path()) else {
                continue;
            };
            for file in files.flatten() {
                let path = file.path();
                let name = path.to_string_lossy().to_string();
                // I file di lato e quelli in transito non sono voci: uno
                // descrive una voce, l'altro non è ancora niente.
                if name.ends_with(META_SUFFIX) || name.ends_with(TEMP_SUFFIX) {
                    continue;
                }
                let Ok(metadata) = file.metadata() else {
                    continue;
                };
                if !metadata.is_file() {
                    continue;
                }
                let used_at = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|elapsed| elapsed.as_secs())
                    .unwrap_or(0);
                let side = meta_path(&path);
                let side_bytes = fs::metadata(&side).map(|meta| meta.len()).unwrap_or(0);
                let meta: Option<CacheMeta> = fs::read(&side)
                    .ok()
                    .and_then(|bytes| serde_json::from_slice(&bytes).ok());
                // Senza file di lato la voce non è servibile: si tratta come
                // scaduta, così la camminata la porta via.
                let expired = match &meta {
                    None => true,
                    Some(meta) => meta.expires_at.map(|at| now >= at).unwrap_or(false),
                };
                found.push(Entry {
                    path,
                    bytes: metadata.len() + side_bytes,
                    used_at,
                    expired,
                });
            }
        }
        found
    }
}

struct Entry {
    path: PathBuf,
    bytes: u64,
    used_at: u64,
    expired: bool,
}

fn meta_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(META_SUFFIX);
    PathBuf::from(name)
}

/// Scrivi di lato e poi sposta: chi legge vede il file vecchio o quello nuovo,
/// mai uno a metà.
fn write_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut temp = path.as_os_str().to_os_string();
    temp.push(TEMP_SUFFIX);
    let temp = PathBuf::from(temp);
    fs::write(&temp, bytes)?;
    match fs::rename(&temp, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(&temp);
            Err(error)
        }
    }
}

/// Segna che la voce è stata usata adesso. Se il sistema non lo permette non è
/// un errore: lo scarto butterà qualcosa di leggermente diverso, non è un dato
/// che debba essere esatto.
fn touch(path: &Path) {
    if let Ok(file) = fs::File::options().write(true).open(path) {
        let _ = file.set_modified(SystemTime::now());
    }
}

pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::request::CacheRequest;
    use super::*;

    fn temp_cache(name: &str) -> HttpCache {
        let root = std::env::temp_dir().join(format!("glossa-cache-{name}"));
        let _ = fs::remove_dir_all(&root);
        HttpCache::new(root)
    }

    fn remote(url: &str) -> CacheRequest {
        CacheRequest::Remote {
            url: url.to_string(),
            provider_key: None,
        }
    }

    #[test]
    fn what_goes_in_comes_out() {
        let cache = temp_cache("round-trip");
        let key = remote("https://example.org/a.jpg").key();
        cache
            .put(
                &key,
                b"pixel",
                CacheMeta {
                    content_type: Some("image/jpeg".into()),
                    ..CacheMeta::default()
                },
            )
            .expect("scrittura");

        let (bytes, meta) = cache.get_with_meta(&key).expect("la voce c'è");

        assert_eq!(bytes, b"pixel");
        assert_eq!(meta.content_type.as_deref(), Some("image/jpeg"));
    }

    #[test]
    fn a_request_never_made_is_not_there() {
        let cache = temp_cache("miss");
        assert!(cache
            .get(&remote("https://example.org/mai.jpg").key())
            .is_none());
    }

    #[test]
    fn an_expired_entry_is_not_returned_and_goes_away() {
        let cache = temp_cache("expired");
        let key = remote("https://example.org/vecchia.json").key();
        cache
            .put(
                &key,
                b"risultati di ieri",
                CacheMeta {
                    expires_at: Some(now_secs() - 1),
                    ..CacheMeta::default()
                },
            )
            .expect("scrittura");

        assert!(cache.get(&key).is_none());
        // E non resta a occupare spazio in attesa dello scarto.
        assert_eq!(cache.usage().files, 0);
    }

    #[test]
    fn an_entry_without_its_side_file_is_not_served_forever() {
        let cache = temp_cache("orphan");
        let key = remote("https://example.org/orfana.json").key();
        cache
            .put(&key, b"risultati", CacheMeta::default())
            .expect("scrittura");
        fs::remove_file(cache.meta_path_of(&key)).expect("il file di lato se ne va");

        // Senza il file di lato non si sa quando scade: meglio non averla.
        assert!(cache.get(&key).is_none());
        assert!(!cache.path_of(&key).exists());
    }

    #[test]
    fn expired_entries_go_away_even_below_the_cap() {
        let cache = temp_cache("expired-eviction");
        cache
            .put(
                &remote("https://example.org/ieri.json").key(),
                &[0u8; 100],
                CacheMeta {
                    expires_at: Some(now_secs() - 1),
                    ..CacheMeta::default()
                },
            )
            .expect("scrittura");

        assert!(cache.evict_to(u64::MAX) > 0);
        assert_eq!(cache.usage().files, 0);
    }

    #[test]
    fn eviction_drops_the_oldest_until_it_is_under_the_cap() {
        let cache = temp_cache("eviction");
        let old = remote("https://example.org/vecchia.jpg").key();
        let recent = remote("https://example.org/recente.jpg").key();
        cache
            .put(&old, &[0u8; 600], CacheMeta::default())
            .expect("scrittura");
        cache
            .put(&recent, &[0u8; 600], CacheMeta::default())
            .expect("scrittura");
        let path = cache.path_of(&old);
        let _ = fs::File::options()
            .write(true)
            .open(&path)
            .map(|file| file.set_modified(SystemTime::now() - std::time::Duration::from_secs(60)));

        let freed = cache.evict_to(1000);

        assert!(freed >= 600);
        assert!(cache.get(&old).is_none());
        assert!(cache.get(&recent).is_some());
    }

    #[test]
    fn nothing_is_thrown_away_below_the_cap() {
        let cache = temp_cache("under-cap");
        let key = remote("https://example.org/piccola.jpg").key();
        cache
            .put(&key, &[0u8; 10], CacheMeta::default())
            .expect("scrittura");

        assert_eq!(cache.evict_to(1000), 0);
        assert!(cache.get(&key).is_some());
    }

    #[test]
    fn usage_counts_the_side_file_too() {
        let cache = temp_cache("usage");
        cache
            .put(
                &remote("https://example.org/a.jpg").key(),
                &[0u8; 128],
                CacheMeta {
                    content_type: Some("image/jpeg".into()),
                    ..CacheMeta::default()
                },
            )
            .expect("scrittura");

        let usage = cache.usage();

        assert_eq!(usage.files, 1);
        // I byte del file di lato stanno sul disco come gli altri.
        assert!(usage.bytes > 128, "occupato {}", usage.bytes);
    }

    #[test]
    fn the_walk_waits_until_enough_has_come_in() {
        let cache = temp_cache("walk");
        cache
            .put(
                &remote("https://example.org/a.jpg").key(),
                &[0u8; 1024],
                CacheMeta::default(),
            )
            .expect("scrittura");
        assert!(!cache.due_for_a_walk());

        cache
            .put(
                &remote("https://example.org/grande.jpg").key(),
                &vec![0u8; WALK_AFTER_BYTES as usize],
                CacheMeta::default(),
            )
            .expect("scrittura");

        assert!(cache.due_for_a_walk());
    }

    #[test]
    fn clearing_leaves_nothing() {
        let cache = temp_cache("clear");
        let key = remote("https://example.org/a.jpg").key();
        cache
            .put(&key, b"pixel", CacheMeta::default())
            .expect("scrittura");

        cache.clear().expect("svuotamento");

        assert!(cache.get(&key).is_none());
        assert_eq!(cache.usage().files, 0);
    }

    #[test]
    fn a_half_written_entry_is_never_left_behind() {
        let cache = temp_cache("atomic");
        let key = remote("https://example.org/a.jpg").key();
        cache
            .put(&key, b"pixel", CacheMeta::default())
            .expect("scrittura");

        let leftovers: Vec<_> = fs::read_dir(cache.root.join(key.shard()))
            .expect("cartella")
            .flatten()
            .filter(|entry| entry.path().to_string_lossy().ends_with(TEMP_SUFFIX))
            .collect();
        assert!(leftovers.is_empty());
    }
}
