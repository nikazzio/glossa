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
//! - un file per richiesta, il cui nome è l'impronta della richiesta;
//! - quando è stata usata l'ultima volta lo dice la data del file, toccata alla
//!   lettura: una chiamata al sistema, non una scrittura su un indice;
//! - quanto occupa si somma camminando la cartella, e si fa quando serve —
//!   allo scarto e quando le impostazioni lo mostrano — non a ogni lettura.
//!
//! Quello che sta qui **non è posseduto**: può sparire al prossimo giro di
//! scarto, non è mai contato nella scheda di Biblioteca e non entra in un
//! backup. Il modo di fissare una cosa è scaricarla nel deposito (D8).

pub mod commands;
pub mod request;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheMeta {
    pub content_type: Option<String>,
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
}

impl HttpCache {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// I byte, se ci sono e non sono scaduti. La lettura tocca la data del file:
    /// è così che lo scarto sa cosa è vecchio.
    pub fn get(&self, key: &CacheKey) -> Option<Vec<u8>> {
        let path = self.path_of(key);
        let meta = self.read_meta(key);
        if let Some(expires_at) = meta.as_ref().and_then(|meta| meta.expires_at) {
            if now_secs() >= expires_at {
                // Scaduta: se ne va adesso, così non occupa spazio fino allo scarto.
                let _ = fs::remove_file(&path);
                let _ = fs::remove_file(self.meta_path_of(key));
                return None;
            }
        }
        let bytes = fs::read(&path).ok()?;
        touch(&path);
        Some(bytes)
    }

    pub fn put(&self, key: &CacheKey, bytes: &[u8], meta: CacheMeta) -> io::Result<()> {
        let path = self.path_of(key);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, bytes)?;
        if let Ok(encoded) = serde_json::to_vec(&meta) {
            fs::write(self.meta_path_of(key), encoded)?;
        }
        Ok(())
    }

    pub fn usage(&self) -> CacheUsage {
        let mut usage = CacheUsage::default();
        for entry in self.entries() {
            usage.bytes += entry.bytes;
            usage.files += 1;
        }
        usage
    }

    /// Butta le voci non usate da più tempo finché non si scende sotto il tetto.
    /// Ritorna i byte liberati.
    pub fn evict_to(&self, cap_bytes: u64) -> u64 {
        let mut entries = self.entries();
        let mut total: u64 = entries.iter().map(|entry| entry.bytes).sum();
        if total <= cap_bytes {
            return 0;
        }
        entries.sort_by_key(|entry| entry.used_at);
        let mut freed = 0;
        for entry in entries {
            if total <= cap_bytes {
                break;
            }
            if fs::remove_file(&entry.path).is_ok() {
                let _ = fs::remove_file(meta_path(&entry.path));
                total = total.saturating_sub(entry.bytes);
                freed += entry.bytes;
            }
        }
        freed
    }

    pub fn clear(&self) -> io::Result<()> {
        if self.root.exists() {
            fs::remove_dir_all(&self.root)?;
        }
        Ok(())
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

    /// Cammina la cartella. I file di lato non contano come voci: descrivono
    /// una voce, non sono una voce.
    fn entries(&self) -> Vec<Entry> {
        let mut found = Vec::new();
        let Ok(shards) = fs::read_dir(&self.root) else {
            return found;
        };
        for shard in shards.flatten() {
            let Ok(files) = fs::read_dir(shard.path()) else {
                continue;
            };
            for file in files.flatten() {
                let path = file.path();
                if path.to_string_lossy().ends_with(META_SUFFIX) {
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
                found.push(Entry {
                    path,
                    bytes: metadata.len(),
                    used_at,
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
}

fn meta_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(META_SUFFIX);
    PathBuf::from(name)
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
        assert_eq!(cache.get(&key).expect("la voce c'è"), b"pixel");
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
    fn eviction_drops_the_oldest_until_it_is_under_the_cap() {
        let cache = temp_cache("eviction");
        let old = remote("https://example.org/vecchia.jpg").key();
        let recent = remote("https://example.org/recente.jpg").key();
        cache
            .put(&old, &vec![0u8; 600], CacheMeta::default())
            .expect("scrittura");
        cache
            .put(&recent, &vec![0u8; 600], CacheMeta::default())
            .expect("scrittura");
        // La lettura della recente la marca come usata adesso; la vecchia resta
        // indietro di un minuto.
        let path = cache.path_of(&old);
        let _ = fs::File::options()
            .write(true)
            .open(&path)
            .map(|file| file.set_modified(SystemTime::now() - std::time::Duration::from_secs(60)));
        let freed = cache.evict_to(1000);
        assert_eq!(freed, 600);
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
    fn usage_counts_the_entries_and_not_their_side_files() {
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
        assert_eq!(usage.bytes, 128);
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
}
