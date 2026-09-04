//! I profili di rete e la misura delle pagine (#421, #422).
//!
//! **Un profilo è un ritmo, non una biblioteca.** I valori tarati sul campo
//! sono pochi — nel registro ce ne sono due — e si applicano a undici
//! biblioteche: tenerli per biblioteca vorrebbe dire ripetere gli stessi
//! numeri nove volte e non sapere più da dove vengono. Le biblioteche
//! *scelgono* un profilo.
//!
//! Quello che resta compilato nel registro e **non** entra nei profili sono le
//! caratteristiche della singola biblioteca — il preriscaldamento del
//! visualizzatore, l'intestazione di provenienza — che non sono un ritmo:
//! assegnare un profilo alla Vaticana non deve farle perdere la sessione.
//!
//! La misura delle pagine ha due livelli e non tre: **l'opera**, che è
//! dove la decisione la vuole perché dipende dal materiale, e **l'impostazione
//! generale**. Chi conserva il libro non c'entra con quanto è fitta la sua
//! scrittura.
//!
//! Il backend **riporta sempre i valori dentro i limiti** prima di usarli
//! il tetto sulle richieste insieme non serve a limitare l'utente,
//! serve a non farlo bandire, e un menu che si comporta bene non è una difesa.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::network::{NetworkProfile, CAUTIOUS, GALLICA};

/// Impostazione generale della misura delle pagine.
pub const SIZE_CAP_SETTING: &str = "download_size_cap";

/// Misura predefinita, in pixel sul lato lungo.
pub const DEFAULT_SIZE_CAP: u32 = 2000;

/// La politica «massima»: `size=max` nella specifica, nessun tetto.
pub const MAX_SIZE_CAP: &str = "max";

/// Estremi di una misura scritta in pixel. Sotto i 200 non si legge niente,
/// sopra i 10000 non esiste digitalizzazione che li serva.
const MIN_CAP_PIXELS: u32 = 200;
const MAX_CAP_PIXELS: u32 = 10_000;

/// **Il tetto non superabile** sulle richieste insieme verso una biblioteca.
pub const MAX_HOST_CONCURRENCY: usize = 4;

/// Il profilo che vale per chi non ne ha scelto un altro.
pub const DEFAULT_PROFILE_ID: &str = "normale";
/// Il ritmo lento, tarato su Gallica.
pub const SLOW_PROFILE_ID: &str = "lento";

/// Un ritmo, con il suo nome e i suoi valori.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    /// I due che nascono con l'applicazione: si modificano, non si eliminano.
    pub builtin: bool,
    pub values: NetworkProfile,
    /// Quante biblioteche lo usano. Risponde a «questi numeri a chi si
    /// applicano», che senza è una domanda senza risposta.
    pub used_by: usize,
}

/// Come chiedere le misure a una biblioteca.
///
/// Non è un ritmo e non entra nel profilo: due biblioteche possono meritare la
/// stessa prudenza e servire misure diverse.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SizePolicy {
    /// Come è sempre stato: i dimezzamenti quando la biblioteca li dichiara,
    /// altrimenti la larghezza calcolata sul tetto.
    #[default]
    Auto,
    /// Solo misure che la biblioteca tiene già pronte. Mai una costruita per
    /// noi: misurato, 2,3 s contro 26,6 s.
    ReadyOnly,
    /// La misura esatta chiesta, anche se va costruita al momento. Serve a chi
    /// vuole quel numero di pixel e accetta di aspettare.
    Exact,
}

impl SizePolicy {
    /// Una politica scritta da qualcuno. Tutto ciò che non si riconosce vale
    /// come «decidi tu»: non si scarica seguendo una parola che non si capisce.
    pub fn parse(value: &str) -> Self {
        match value.trim() {
            "readyOnly" => SizePolicy::ReadyOnly,
            "exact" => SizePolicy::Exact,
            _ => SizePolicy::Auto,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            SizePolicy::Auto => "auto",
            SizePolicy::ReadyOnly => "readyOnly",
            SizePolicy::Exact => "exact",
        }
    }
}

/// Una biblioteca, il ritmo che ha scelto e come le si chiedono le misure.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    /// Chiave del registro, oppure l'host per le opere aggiunte per indirizzo.
    pub key: String,
    pub label: String,
    pub profile_id: String,
    pub size_policy: SizePolicy,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    /// Assente per un profilo nuovo: l'identificativo lo assegna il backend.
    pub id: Option<String>,
    pub name: String,
    pub values: NetworkProfile,
}

/// Scrive i profili che nascono con l'applicazione, se non ci sono già, e
/// associa le biblioteche che nel registro hanno un ritmo proprio.
///
/// I valori vengono dal registro e non da un file di migrazione: il registro è
/// l'unico posto dove una biblioteca nuova si compila, e due elenchi degli
/// stessi numeri prima o poi divergono.
pub fn ensure_builtin_profiles(conn: &Connection) -> Result<(), String> {
    let stale = reseed_needed(conn)?;
    write_profile(conn, DEFAULT_PROFILE_ID, "Normale", true, &CAUTIOUS, stale)?;
    write_profile(conn, SLOW_PROFILE_ID, "Lento", true, &GALLICA, stale)?;
    if stale {
        mark_reseeded(conn)?;
    }

    for provider in super::PROVIDERS {
        if provider.network == GALLICA {
            conn.execute(
                "INSERT OR IGNORE INTO library_network_profiles (library_key, profile_id) \
                 VALUES (?1, ?2)",
                params![provider.key, SLOW_PROFILE_ID],
            )
            .map_err(|error| format!("profilo iniziale della biblioteca: {error}"))?;
        }
    }
    Ok(())
}

/// Quale versione dei ritmi predefiniti è già stata scritta.
///
/// Cambiare i numeri nel registro non basta: chi ha già l'applicazione ha i
/// vecchi salvati, e continuerebbe a usarli per sempre. Alzando questo numero i
/// due profili che nascono con l'applicazione tornano a quelli del registro. I
/// profili creati dall'utente non vengono toccati.
const BUILTIN_PROFILES_VERSION: i64 = 3;
const BUILTIN_PROFILES_VERSION_KEY: &str = "network_profiles_version";

fn reseed_needed(conn: &Connection) -> Result<bool, String> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![BUILTIN_PROFILES_VERSION_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("versione dei profili di rete: {error}"))?;
    Ok(stored.and_then(|value| value.parse::<i64>().ok()) != Some(BUILTIN_PROFILES_VERSION))
}

fn mark_reseeded(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![
            BUILTIN_PROFILES_VERSION_KEY,
            BUILTIN_PROFILES_VERSION.to_string()
        ],
    )
    .map_err(|error| format!("versione dei profili di rete: {error}"))?;
    Ok(())
}

fn write_profile(
    conn: &Connection,
    id: &str,
    name: &str,
    builtin: bool,
    values: &NetworkProfile,
    overwrite: bool,
) -> Result<(), String> {
    let statement = if overwrite {
        "INSERT INTO network_profiles (id, name, builtin, values_json) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(id) DO UPDATE SET values_json = excluded.values_json, \
         updated_at = CURRENT_TIMESTAMP"
    } else {
        "INSERT OR IGNORE INTO network_profiles (id, name, builtin, values_json) \
         VALUES (?1, ?2, ?3, ?4)"
    };
    conn.execute(
        statement,
        params![
            id,
            name,
            builtin,
            serde_json::to_string(values).map_err(|error| error.to_string())?
        ],
    )
    .map_err(|error| format!("profilo di rete: {error}"))?;
    Ok(())
}

/// Il profilo di rete in vigore per una biblioteca.
///
/// Prima il profilo scelto per quella chiave, poi quello scelto per il suo
/// host — le opere aggiunte per indirizzo diretto non hanno voce nel registro
/// — poi il predefinito. **Nessuna fonte resta senza politica.**
pub fn effective_profile(
    conn: &Connection,
    provider_key: &str,
    host: Option<&str>,
) -> NetworkProfile {
    chosen_profile(conn, provider_key)
        .or_else(|| host.and_then(|host| chosen_profile(conn, host)))
        .or_else(|| profile_values(conn, DEFAULT_PROFILE_ID))
        .unwrap_or(CAUTIOUS)
}

fn chosen_profile(conn: &Connection, library_key: &str) -> Option<NetworkProfile> {
    let id: Option<String> = conn
        .query_row(
            "SELECT profile_id FROM library_network_profiles WHERE library_key = ?1",
            params![library_key],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();
    profile_values(conn, &id?)
}

/// I valori di un profilo, già riportati dentro i limiti. Un JSON illeggibile
/// vale come assente: si scende al livello sotto invece di scaricare con
/// valori che non si sanno leggere.
fn profile_values(conn: &Connection, id: &str) -> Option<NetworkProfile> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT values_json FROM network_profiles WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();
    match serde_json::from_str::<NetworkProfile>(&raw?) {
        Ok(values) => Some(within_limits(values)),
        Err(error) => {
            log::warn!("network profile unreadable id={id} error={error}");
            None
        }
    }
}

/// L'elenco dei profili, con quante biblioteche usa ciascuno.
pub fn list_profiles(conn: &Connection) -> Result<Vec<Profile>, String> {
    let libraries = list_libraries(conn)?;
    let mut statement = conn
        .prepare(
            "SELECT id, name, builtin, values_json FROM network_profiles \
             ORDER BY builtin DESC, name",
        )
        .map_err(|error| format!("profili di rete: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, bool>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|error| format!("profili di rete: {error}"))?;

    let mut profiles = Vec::new();
    for row in rows {
        let (id, name, builtin, raw) = row.map_err(|error| error.to_string())?;
        let used_by = libraries
            .iter()
            .filter(|library| library.profile_id == id)
            .count();
        profiles.push(Profile {
            values: serde_json::from_str::<NetworkProfile>(&raw)
                .map(within_limits)
                .unwrap_or(CAUTIOUS),
            id,
            name,
            builtin,
            used_by,
        });
    }
    Ok(profiles)
}

/// Le biblioteche del registro con il profilo che usano, più le voci associate
/// a mano su un host che nel registro non c'è.
pub fn list_libraries(conn: &Connection) -> Result<Vec<Library>, String> {
    let mut statement = conn
        .prepare("SELECT library_key, profile_id FROM library_network_profiles")
        .map_err(|error| format!("biblioteche: {error}"))?;
    let chosen: Vec<(String, String)> = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|error| format!("biblioteche: {error}"))?
        .filter_map(Result::ok)
        .collect();
    let profile_of = |key: &str| {
        chosen
            .iter()
            .find(|(library, _)| library == key)
            .map(|(_, profile)| profile.clone())
            .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string())
    };

    let policies = size_policies(conn)?;
    let policy_of = |key: &str| {
        policies
            .iter()
            .find(|(library, _)| library == key)
            .map(|(_, policy)| *policy)
            .unwrap_or_default()
    };

    let mut libraries: Vec<Library> = super::PROVIDERS
        .iter()
        .map(|provider| Library {
            key: provider.key.to_string(),
            label: provider.label.to_string(),
            profile_id: profile_of(provider.key),
            size_policy: policy_of(provider.key),
        })
        .collect();

    // Un host associato a mano compare in elenco se ha scelto un ritmo oppure
    // una politica di misure: bastava una delle due a farlo esistere, e
    // guardare solo i ritmi lo faceva sparire dalla schermata dove era stato
    // configurato.
    let extra_keys: Vec<String> = chosen
        .iter()
        .map(|(key, _)| key.clone())
        .chain(policies.iter().map(|(key, _)| key.clone()))
        .filter(|key| super::find_provider(key).is_none())
        .fold(Vec::new(), |mut keys, key| {
            if !keys.contains(&key) {
                keys.push(key);
            }
            keys
        });

    libraries.extend(extra_keys.into_iter().map(|key| Library {
        profile_id: profile_of(&key),
        size_policy: policy_of(&key),
        label: key.clone(),
        key,
    }));
    Ok(libraries)
}

/// Le politiche di misura scelte, per chiave di biblioteca.
fn size_policies(conn: &Connection) -> Result<Vec<(String, SizePolicy)>, String> {
    let mut statement = conn
        .prepare("SELECT library_key, policy FROM library_size_policies")
        .map_err(|error| format!("politiche di misura: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("politiche di misura: {error}"))?;
    Ok(rows
        .filter_map(Result::ok)
        .map(|(key, policy)| (key, SizePolicy::parse(&policy)))
        .collect())
}

/// Come chiedere le misure a questa fonte.
///
/// Prima la scelta per quella chiave, poi quella per il suo host — le opere
/// aggiunte per indirizzo non hanno voce nel registro — poi «decidi tu».
pub fn effective_size_policy(
    conn: &Connection,
    provider_key: &str,
    host: Option<&str>,
) -> SizePolicy {
    chosen_size_policy(conn, provider_key)
        .or_else(|| host.and_then(|host| chosen_size_policy(conn, host)))
        .unwrap_or_default()
}

fn chosen_size_policy(conn: &Connection, library_key: &str) -> Option<SizePolicy> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT policy FROM library_size_policies WHERE library_key = ?1",
            params![library_key],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();
    stored.map(|value| SizePolicy::parse(&value))
}

/// Sceglie come chiedere le misure a una biblioteca.
///
/// «Decidi tu» non lascia una riga: è l'assenza di scelta, e tenerla scritta
/// vorrebbe dire due modi di dire la stessa cosa.
pub fn set_library_size_policy(
    conn: &Connection,
    library_key: &str,
    policy: SizePolicy,
) -> Result<(), String> {
    if policy == SizePolicy::Auto {
        conn.execute(
            "DELETE FROM library_size_policies WHERE library_key = ?1",
            params![library_key],
        )
        .map_err(|error| format!("politica di misura: {error}"))?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO library_size_policies (library_key, policy) VALUES (?1, ?2) \
         ON CONFLICT(library_key) DO UPDATE SET policy = excluded.policy",
        params![library_key, policy.as_str()],
    )
    .map_err(|error| format!("politica di misura: {error}"))?;
    Ok(())
}

/// Salva un profilo, nuovo o esistente, con i valori riportati dentro i
/// limiti. Restituisce l'identificativo scritto.
pub fn save_profile(conn: &Connection, input: &ProfileInput) -> Result<String, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("profile_name_required".to_string());
    }
    let values = within_limits(input.values);
    let values_json = serde_json::to_string(&values).map_err(|error| error.to_string())?;

    match input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        Some(id) => {
            conn.execute(
                "UPDATE network_profiles SET name = ?2, values_json = ?3, \
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![id, name, values_json],
            )
            .map_err(|error| format!("salvataggio del profilo: {error}"))?;
            Ok(id.to_string())
        }
        None => {
            let id = new_profile_id(conn, name);
            write_profile(conn, &id, name, false, &values, false)?;
            Ok(id)
        }
    }
}

/// Un identificativo leggibile ricavato dal nome, con un numero in coda se
/// esiste già: `notturno`, `notturno-2`.
fn new_profile_id(conn: &Connection, name: &str) -> String {
    let base: String = name
        .to_lowercase()
        .chars()
        .map(|letter| {
            if letter.is_alphanumeric() {
                letter
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let base = if base.is_empty() {
        "profilo".to_string()
    } else {
        base
    };
    let exists = |id: &str| {
        conn.query_row(
            "SELECT 1 FROM network_profiles WHERE id = ?1",
            params![id],
            |_| Ok(()),
        )
        .optional()
        .ok()
        .flatten()
        .is_some()
    };
    if !exists(&base) {
        return base;
    }
    (2..)
        .map(|suffix| format!("{base}-{suffix}"))
        .find(|candidate| !exists(candidate))
        .unwrap_or(base)
}

/// Elimina un profilo creato dall'utente.
///
/// Non si eliminano quelli che nascono con l'applicazione — sotto non
/// resterebbe niente — né uno in uso: prima si spostano le biblioteche che lo
/// usano, altrimenti resterebbero senza politica.
pub fn delete_profile(conn: &Connection, id: &str) -> Result<(), String> {
    let builtin: Option<bool> = conn
        .query_row(
            "SELECT builtin FROM network_profiles WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("profilo di rete: {error}"))?;
    match builtin {
        None => return Err("profile_not_found".to_string()),
        Some(true) => return Err("profile_builtin".to_string()),
        Some(false) => {}
    }

    let used: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_network_profiles WHERE profile_id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|error| format!("profilo di rete: {error}"))?;
    if used > 0 {
        return Err("profile_in_use".to_string());
    }

    conn.execute("DELETE FROM network_profiles WHERE id = ?1", params![id])
        .map_err(|error| format!("eliminazione del profilo: {error}"))?;
    Ok(())
}

/// Associa una biblioteca a un profilo.
pub fn set_library_profile(
    conn: &Connection,
    library_key: &str,
    profile_id: &str,
) -> Result<(), String> {
    if profile_values(conn, profile_id).is_none() {
        return Err("profile_not_found".to_string());
    }
    conn.execute(
        "INSERT INTO library_network_profiles (library_key, profile_id) VALUES (?1, ?2) \
         ON CONFLICT(library_key) DO UPDATE SET profile_id = excluded.profile_id",
        params![library_key, profile_id],
    )
    .map_err(|error| format!("profilo della biblioteca: {error}"))?;
    Ok(())
}

/// La misura delle pagine in vigore per una digitalizzazione: quella scelta
/// sull'opera, altrimenti l'impostazione generale.
pub fn effective_size_cap(conn: &Connection, version_id: &str) -> Result<String, String> {
    if let Some(cap) = version_size_cap(conn, version_id)? {
        return Ok(cap);
    }
    Ok(crate::jobs::store::read_setting(conn, SIZE_CAP_SETTING)?
        .and_then(|value| normalise_cap(&value))
        .unwrap_or_else(|| DEFAULT_SIZE_CAP.to_string()))
}

/// Una misura scritta da qualcuno, riportata in forma buona: `max`, oppure un
/// numero di pixel dentro estremi ragionevoli. Tutto il resto è come non
/// averla scritta — non si scarica a una misura inventata da una stringa.
pub fn normalise_cap(value: &str) -> Option<String> {
    let value = value.trim();
    if value.eq_ignore_ascii_case(MAX_SIZE_CAP) {
        return Some(MAX_SIZE_CAP.to_string());
    }
    value
        .parse::<u32>()
        .ok()
        .filter(|pixels| (MIN_CAP_PIXELS..=MAX_CAP_PIXELS).contains(pixels))
        .map(|pixels| pixels.to_string())
}

fn version_size_cap(conn: &Connection, version_id: &str) -> Result<Option<String>, String> {
    let stored: Option<Option<String>> = conn
        .query_row(
            "SELECT size_cap FROM source_versions WHERE id = ?1",
            params![version_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("misura dell'opera: {error}"))?;
    Ok(stored.flatten().and_then(|value| normalise_cap(&value)))
}

/// Riporta i valori dentro i limiti, senza rifiutarli.
///
/// Rifiutare lascerebbe l'utente senza sapere cosa è successo; correggere in
/// silenzio nasconderebbe la correzione. Qui si corregge e la schermata
/// rilegge quello che è stato davvero salvato, così il valore che si vede è
/// quello che vale.
pub fn within_limits(values: NetworkProfile) -> NetworkProfile {
    NetworkProfile {
        burst_requests: values.burst_requests.clamp(1, 1_000),
        burst_window_secs: values.burst_window_secs.clamp(1, 3_600),
        cooldown_403_secs: values.cooldown_403_secs.min(86_400),
        cooldown_429_secs: values.cooldown_429_secs.min(86_400),
        // Il tetto che non si supera.
        host_concurrency: values.host_concurrency.clamp(1, MAX_HOST_CONCURRENCY),
        // Quante pagine insieme: il tetto per host resta comunque quello sopra,
        // e `bulk_workers` tiene sempre un posto libero per il visore.
        workers_per_job: values.workers_per_job.clamp(1, MAX_HOST_CONCURRENCY),
        max_attempts: values.max_attempts.clamp(1, 10),
        backoff_base_secs: values.backoff_base_secs.clamp(1, 600),
        backoff_cap_secs: values
            .backoff_cap_secs
            .clamp(values.backoff_base_secs.clamp(1, 600), 3_600),
        connect_timeout_secs: values.connect_timeout_secs.clamp(1, 300),
        read_timeout_secs: values.read_timeout_secs.clamp(1, 300),
        // Non è un ritmo: resta come lo dichiara il registro.
        needs_viewer_warmup: values.needs_viewer_warmup,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
             CREATE TABLE source_versions (id TEXT PRIMARY KEY, size_cap TEXT);
             CREATE TABLE network_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, \
                 builtin INTEGER NOT NULL DEFAULT 0, values_json TEXT NOT NULL, \
                 updated_at DATETIME);
             CREATE TABLE library_network_profiles (library_key TEXT PRIMARY KEY, \
                 profile_id TEXT NOT NULL);
             CREATE TABLE library_size_policies (library_key TEXT PRIMARY KEY, \
                 policy TEXT NOT NULL);",
        )
        .unwrap();
        ensure_builtin_profiles(&conn).unwrap();
        conn
    }

    #[test]
    fn the_libraries_with_their_own_rhythm_start_on_it() {
        // Gallica è tarata a parte: nasce sul profilo lento, le altre sul
        // predefinito.
        let conn = database();
        let libraries = list_libraries(&conn).unwrap();

        let gallica = libraries.iter().find(|l| l.key == "gallica").unwrap();
        let archive = libraries.iter().find(|l| l.key == "archive_org").unwrap();

        assert_eq!(gallica.profile_id, SLOW_PROFILE_ID);
        assert_eq!(archive.profile_id, DEFAULT_PROFILE_ID);
    }

    #[test]
    fn the_builtin_rhythms_go_back_to_the_registry_when_the_registry_changes() {
        // Chi ha già l'applicazione ha i vecchi numeri salvati: senza questo
        // ritorno continuerebbe a scaricare con un ritmo che non esiste più.
        let conn = database();
        let old = NetworkProfile {
            burst_requests: 20,
            ..GALLICA
        };
        conn.execute(
            "UPDATE network_profiles SET values_json = ?2 WHERE id = ?1",
            params![SLOW_PROFILE_ID, serde_json::to_string(&old).unwrap()],
        )
        .unwrap();
        conn.execute(
            "DELETE FROM app_settings WHERE key = ?1",
            params![BUILTIN_PROFILES_VERSION_KEY],
        )
        .unwrap();

        ensure_builtin_profiles(&conn).unwrap();

        assert_eq!(profile_values(&conn, SLOW_PROFILE_ID), Some(GALLICA));
    }

    #[test]
    fn a_rhythm_chosen_by_hand_survives_the_next_start() {
        // Il ritorno al registro avviene una volta sola, non a ogni avvio: una
        // modifica dell'utente non deve sparire da sola.
        let conn = database();
        let mine = NetworkProfile {
            burst_requests: 33,
            ..GALLICA
        };
        conn.execute(
            "UPDATE network_profiles SET values_json = ?2 WHERE id = ?1",
            params![SLOW_PROFILE_ID, serde_json::to_string(&mine).unwrap()],
        )
        .unwrap();

        ensure_builtin_profiles(&conn).unwrap();

        assert_eq!(profile_values(&conn, SLOW_PROFILE_ID), Some(mine));
    }

    #[test]
    fn a_profile_says_how_many_libraries_use_it() {
        let conn = database();
        let profiles = list_profiles(&conn).unwrap();
        let normale = profiles
            .iter()
            .find(|p| p.id == DEFAULT_PROFILE_ID)
            .unwrap();

        assert!(normale.used_by > 1, "lo usano quasi tutte");
        assert!(normale.builtin);
    }

    #[test]
    fn changing_a_library_changes_which_rhythm_it_follows() {
        let conn = database();
        set_library_profile(&conn, "archive_org", SLOW_PROFILE_ID).unwrap();

        assert_eq!(
            effective_profile(&conn, "archive_org", None).burst_requests,
            GALLICA.burst_requests
        );
    }

    #[test]
    fn a_source_added_by_address_is_recognised_by_its_host() {
        // Nel registro non ha voce: l'host è l'unica cosa che la identifica.
        let conn = database();
        set_library_profile(&conn, "biblioteca.example.org", SLOW_PROFILE_ID).unwrap();

        assert_eq!(
            effective_profile(&conn, "generic", Some("biblioteca.example.org")).max_attempts,
            GALLICA.max_attempts
        );
    }

    #[test]
    fn the_concurrency_cap_holds_even_written_by_hand_in_the_database() {
        // Il menu ne offre al massimo quattro, ma il menu è un aiuto e non una
        // difesa: il tetto vale dove i valori si usano.
        let conn = database();
        save_profile(
            &conn,
            &ProfileInput {
                id: Some(DEFAULT_PROFILE_ID.to_string()),
                name: "Normale".to_string(),
                values: NetworkProfile {
                    host_concurrency: 64,
                    ..CAUTIOUS
                },
            },
        )
        .unwrap();

        assert_eq!(
            effective_profile(&conn, "archive_org", None).host_concurrency,
            MAX_HOST_CONCURRENCY
        );
    }

    #[test]
    fn a_profile_in_use_is_not_deleted_from_under_the_libraries() {
        let conn = database();
        let id = save_profile(
            &conn,
            &ProfileInput {
                id: None,
                name: "Notturno".to_string(),
                values: CAUTIOUS,
            },
        )
        .unwrap();
        set_library_profile(&conn, "archive_org", &id).unwrap();

        assert_eq!(
            delete_profile(&conn, &id),
            Err("profile_in_use".to_string())
        );
        assert_eq!(
            delete_profile(&conn, DEFAULT_PROFILE_ID),
            Err("profile_builtin".to_string())
        );
    }

    #[test]
    fn how_the_sizes_are_asked_is_a_choice_of_the_library_not_of_the_rhythm() {
        // Senza scelta vale «decidi tu», e cambiare il ritmo non la tocca: sono
        // due assi diversi, ed è il motivo per cui la politica non sta nel
        // profilo.
        let conn = database();
        assert_eq!(
            effective_size_policy(&conn, "gallica", None),
            SizePolicy::Auto
        );

        set_library_size_policy(&conn, "gallica", SizePolicy::ReadyOnly).unwrap();
        set_library_profile(&conn, "gallica", DEFAULT_PROFILE_ID).unwrap();

        assert_eq!(
            effective_size_policy(&conn, "gallica", None),
            SizePolicy::ReadyOnly
        );
    }

    #[test]
    fn choosing_decide_for_me_leaves_no_trace() {
        // Una riga che dice «predefinito» è un secondo modo di dire la stessa
        // cosa: tornando indietro la scelta se ne va.
        let conn = database();
        set_library_size_policy(&conn, "gallica", SizePolicy::Exact).unwrap();
        set_library_size_policy(&conn, "gallica", SizePolicy::Auto).unwrap();

        assert!(size_policies(&conn).unwrap().is_empty());
    }

    #[test]
    fn a_host_configured_by_hand_keeps_its_size_choice_in_the_list() {
        // La schermata elenca le biblioteche del registro più gli host
        // configurati a mano: guardare solo i ritmi faceva sparire dall'elenco
        // un host a cui era stata scelta soltanto una misura.
        let conn = database();
        set_library_size_policy(&conn, "biblioteca.example.org", SizePolicy::ReadyOnly).unwrap();

        let libraries = list_libraries(&conn).unwrap();
        let mine = libraries
            .iter()
            .find(|library| library.key == "biblioteca.example.org")
            .expect("l'host configurato a mano resta in elenco");

        assert_eq!(mine.size_policy, SizePolicy::ReadyOnly);
        assert_eq!(mine.profile_id, DEFAULT_PROFILE_ID);
        assert_eq!(
            effective_size_policy(&conn, "generic", Some("biblioteca.example.org")),
            SizePolicy::ReadyOnly
        );
    }

    #[test]
    fn a_size_policy_that_means_nothing_is_as_if_it_had_never_been_written() {
        // Scritta a mano nella banca dati: non si scarica seguendo una parola
        // che non si capisce.
        let conn = database();
        conn.execute(
            "INSERT INTO library_size_policies (library_key, policy) VALUES ('gallica', 'boh')",
            [],
        )
        .unwrap();

        assert_eq!(
            effective_size_policy(&conn, "gallica", None),
            SizePolicy::Auto
        );
    }

    #[test]
    fn the_work_has_the_last_word_on_the_page_size() {
        // «Scelta alla fonte, non globale»: dipende dal materiale.
        let conn = database();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('download_size_cap', '1000')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO source_versions (id, size_cap) VALUES ('sver-1', '3000'), ('sver-2', NULL)",
            [],
        )
        .unwrap();

        assert_eq!(effective_size_cap(&conn, "sver-1").unwrap(), "3000");
        assert_eq!(effective_size_cap(&conn, "sver-2").unwrap(), "1000");
        assert_eq!(effective_size_cap(&conn, "mai-vista").unwrap(), "1000");
    }

    #[test]
    fn a_size_that_means_nothing_is_as_if_it_had_never_been_written() {
        assert_eq!(normalise_cap("MAX").as_deref(), Some("max"));
        assert_eq!(normalise_cap("12"), None, "sotto il minimo leggibile");
        assert_eq!(normalise_cap("999999"), None, "sopra ogni digitalizzazione");
    }
}
