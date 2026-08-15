//! Quello che l'utente ha cambiato sulle biblioteche (#421, #422).
//!
//! Due cose distinte, che vivono nella stessa riga perché parlano della stessa
//! biblioteca: **il tetto di risoluzione** (D4) e **il profilo di rete** (D18).
//!
//! La precedenza è quella dichiarata dalle decisioni:
//!
//! - risoluzione: **fonte → biblioteca → globale**, perché la scelta dipende
//!   dal materiale e l'ultima parola ce l'ha chi guarda quella carta;
//! - profilo di rete: **modifica dell'utente → registro compilato →
//!   profilo prudente**. Nessuna fonte resta senza politica.
//!
//! Il backend **riporta sempre i valori dentro i limiti** prima di usarli
//! (D11): il tetto sulle richieste insieme verso una biblioteca non serve a
//! limitare l'utente, serve a non farlo bandire, e un menu che si comporta bene
//! non è una difesa — basta scrivere nel database a mano per scavalcarlo.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use super::network::{NetworkProfile, CAUTIOUS};

/// Impostazione globale del tetto di risoluzione (D4).
pub const SIZE_CAP_SETTING: &str = "download_size_cap";

/// Tetto predefinito, in pixel sul lato lungo.
pub const DEFAULT_SIZE_CAP: &str = "2000";

/// La politica «massima»: `size=max` nella specifica, nessun tetto.
pub const MAX_SIZE_CAP: &str = "max";

/// Estremi di un tetto scritto in pixel. Sotto i 200 non si legge niente,
/// sopra i 10000 non esiste digitalizzazione che li serva.
const MIN_CAP_PIXELS: u32 = 200;
const MAX_CAP_PIXELS: u32 = 10_000;

/// **Il tetto non superabile** sulle richieste insieme verso una biblioteca
/// (D11, D18). Vive anche qui e non solo nel menu: il menu è un aiuto, non una
/// difesa.
pub const MAX_HOST_CONCURRENCY: usize = 4;

/// Una biblioteca come la vede la schermata: quello che dichiara il registro,
/// più quello che l'utente ha cambiato.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettings {
    /// Chiave del registro dei provider, oppure un host per le fonti aggiunte
    /// per indirizzo diretto (D18).
    pub key: String,
    /// Nome leggibile. Per un host è l'host stesso: non c'è altro da dire.
    pub label: String,
    /// Falso per le voci aggiunte a mano su un host fuori dal registro.
    pub in_registry: bool,
    /// Vero quando esiste una modifica dell'utente: è ciò che rende utile il
    /// comando «riporta ai valori dell'applicazione».
    pub customised: bool,
    pub size_cap: Option<String>,
    /// Il profilo in vigore adesso, già riportato dentro i limiti.
    pub profile: NetworkProfile,
}

/// Il profilo di rete in vigore per una biblioteca (D18).
pub fn effective_profile(
    conn: &Connection,
    provider_key: &str,
    host: Option<&str>,
) -> NetworkProfile {
    // Prima la chiave del registro, poi l'host: una fonte aggiunta per
    // indirizzo diretto non ha voce nel registro, e l'host è l'unica cosa che
    // la identifica.
    stored_profile(conn, provider_key)
        .or_else(|| host.and_then(|host| stored_profile(conn, host)))
        .unwrap_or_else(|| registry_profile(provider_key))
}

/// Il profilo compilato nell'applicazione, o quello prudente per chi non è nel
/// registro: nessuna fonte resta senza politica (D18).
pub fn registry_profile(provider_key: &str) -> NetworkProfile {
    super::find_provider(provider_key)
        .map(|provider| provider.network)
        .unwrap_or(CAUTIOUS)
}

/// Il tetto di risoluzione in vigore per una digitalizzazione: fonte, poi
/// biblioteca, poi impostazione globale (D4).
pub fn effective_size_cap(
    conn: &Connection,
    provider_key: &str,
    version_id: &str,
) -> Result<String, String> {
    if let Some(cap) = version_size_cap(conn, version_id)? {
        return Ok(cap);
    }
    if let Some(cap) = library_size_cap(conn, provider_key)? {
        return Ok(cap);
    }
    Ok(crate::jobs::store::read_setting(conn, SIZE_CAP_SETTING)?
        .and_then(|value| normalise_cap(&value))
        .unwrap_or_else(|| DEFAULT_SIZE_CAP.to_string()))
}

/// Un tetto scritto da qualcuno, riportato in forma buona: `max`, oppure un
/// numero di pixel dentro estremi ragionevoli. Tutto il resto è come non
/// averlo scritto — non si scarica a una misura inventata da una stringa.
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
        .map_err(|error| format!("tetto della fonte: {error}"))?;
    Ok(stored.flatten().and_then(|value| normalise_cap(&value)))
}

fn library_size_cap(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let stored: Option<Option<String>> = conn
        .query_row(
            "SELECT size_cap FROM library_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("tetto della biblioteca: {error}"))?;
    Ok(stored.flatten().and_then(|value| normalise_cap(&value)))
}

/// Il profilo scritto dall'utente per questa chiave, già riportato dentro i
/// limiti. Un JSON illeggibile — scritto a mano, o rimasto da una forma
/// precedente — vale come assente: si torna al registro invece di scaricare con
/// valori che non si sanno leggere.
fn stored_profile(conn: &Connection, key: &str) -> Option<NetworkProfile> {
    let stored: Option<Option<String>> = conn
        .query_row(
            "SELECT network_profile FROM library_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .ok()?;
    let raw = stored.flatten()?;
    match serde_json::from_str::<NetworkProfile>(&raw) {
        Ok(profile) => Some(within_limits(profile)),
        Err(error) => {
            log::warn!("library profile unreadable key={key} error={error}");
            None
        }
    }
}

/// Riporta un profilo dentro i limiti, senza rifiutarlo.
///
/// Rifiutare vorrebbe dire lasciare l'utente senza sapere cosa è successo;
/// correggere in silenzio nasconderebbe la correzione. Qui si corregge e la
/// schermata rilegge quello che è stato davvero salvato, così il valore che si
/// vede è quello che vale.
pub fn within_limits(profile: NetworkProfile) -> NetworkProfile {
    let pause_min_ms = profile.pause_min_ms.min(60_000);
    NetworkProfile {
        pause_min_ms,
        // Una pausa massima sotto la minima significherebbe un intervallo
        // vuoto, e il sorteggio non saprebbe cosa estrarre.
        pause_max_ms: profile.pause_max_ms.clamp(pause_min_ms, 60_000),
        burst_requests: profile.burst_requests.clamp(1, 1_000),
        burst_window_secs: profile.burst_window_secs.clamp(1, 3_600),
        cooldown_403_secs: profile.cooldown_403_secs.min(86_400),
        cooldown_429_secs: profile.cooldown_429_secs.min(86_400),
        // Il tetto che non si supera (D11).
        host_concurrency: profile.host_concurrency.clamp(1, MAX_HOST_CONCURRENCY),
        max_attempts: profile.max_attempts.clamp(1, 10),
        backoff_base_secs: profile.backoff_base_secs.clamp(1, 600),
        backoff_cap_secs: profile
            .backoff_cap_secs
            .clamp(profile.backoff_base_secs.clamp(1, 600), 3_600),
        connect_timeout_secs: profile.connect_timeout_secs.clamp(1, 300),
        read_timeout_secs: profile.read_timeout_secs.clamp(1, 300),
        needs_viewer_warmup: profile.needs_viewer_warmup,
    }
}

/// Una riga di `library_settings`, come sta nel database.
struct StoredSettings {
    key: String,
    size_cap: Option<String>,
    profile: Option<NetworkProfile>,
}

fn stored_settings(conn: &Connection) -> Result<Vec<StoredSettings>, String> {
    let mut statement = conn
        .prepare("SELECT key, size_cap, network_profile FROM library_settings ORDER BY key")
        .map_err(|error| format!("impostazioni delle biblioteche: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|error| format!("impostazioni delle biblioteche: {error}"))?;

    let mut settings = Vec::new();
    for row in rows {
        let (key, size_cap, raw) = row.map_err(|error| error.to_string())?;
        settings.push(StoredSettings {
            key,
            size_cap: size_cap.as_deref().and_then(normalise_cap),
            profile: raw
                .and_then(|raw| serde_json::from_str::<NetworkProfile>(&raw).ok())
                .map(within_limits),
        });
    }
    Ok(settings)
}

/// L'elenco delle biblioteche per la schermata: prima quelle del registro, poi
/// le voci aggiunte a mano su un host che nel registro non c'è (D18).
pub fn list_settings(conn: &Connection) -> Result<Vec<LibrarySettings>, String> {
    let stored = stored_settings(conn)?;
    let found = |key: &str| stored.iter().find(|row| row.key == key);

    let mut listed: Vec<LibrarySettings> = super::PROVIDERS
        .iter()
        .map(|provider| {
            let saved = found(provider.key);
            LibrarySettings {
                key: provider.key.to_string(),
                label: provider.label.to_string(),
                in_registry: true,
                customised: saved.is_some(),
                size_cap: saved.and_then(|row| row.size_cap.clone()),
                profile: saved
                    .and_then(|row| row.profile)
                    .unwrap_or(provider.network),
            }
        })
        .collect();

    listed.extend(
        stored
            .iter()
            .filter(|row| super::find_provider(&row.key).is_none())
            .map(|row| LibrarySettings {
                key: row.key.clone(),
                label: row.key.clone(),
                in_registry: false,
                customised: true,
                size_cap: row.size_cap.clone(),
                profile: row.profile.unwrap_or(CAUTIOUS),
            }),
    );
    Ok(listed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
             CREATE TABLE source_versions (id TEXT PRIMARY KEY, size_cap TEXT);
             CREATE TABLE library_settings (key TEXT PRIMARY KEY, size_cap TEXT, \
                 network_profile TEXT, updated_at DATETIME);",
        )
        .unwrap();
        conn
    }

    fn save(conn: &Connection, key: &str, size_cap: Option<&str>, profile: Option<NetworkProfile>) {
        conn.execute(
            "INSERT INTO library_settings (key, size_cap, network_profile) VALUES (?1, ?2, ?3)",
            params![
                key,
                size_cap,
                profile.map(|profile| serde_json::to_string(&profile).unwrap())
            ],
        )
        .unwrap();
    }

    #[test]
    fn the_source_has_the_last_word_on_the_resolution() {
        // «Scelta alla fonte, non globale» (D4): dipende dal materiale.
        let conn = database();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('download_size_cap', '1000')",
            [],
        )
        .unwrap();
        save(&conn, "gallica", Some("1500"), None);
        conn.execute(
            "INSERT INTO source_versions (id, size_cap) VALUES ('sver-1', '3000')",
            [],
        )
        .unwrap();

        assert_eq!(
            effective_size_cap(&conn, "gallica", "sver-1").unwrap(),
            "3000"
        );
    }

    #[test]
    fn without_a_choice_on_the_source_the_library_decides() {
        let conn = database();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('download_size_cap', '1000')",
            [],
        )
        .unwrap();
        save(&conn, "gallica", Some("1500"), None);
        conn.execute(
            "INSERT INTO source_versions (id, size_cap) VALUES ('sver-1', NULL)",
            [],
        )
        .unwrap();

        assert_eq!(
            effective_size_cap(&conn, "gallica", "sver-1").unwrap(),
            "1500"
        );
    }

    #[test]
    fn with_nothing_chosen_anywhere_the_default_holds() {
        let conn = database();

        assert_eq!(
            effective_size_cap(&conn, "gallica", "sver-1").unwrap(),
            DEFAULT_SIZE_CAP
        );
    }

    #[test]
    fn a_cap_that_means_nothing_is_as_if_it_had_never_been_written() {
        let conn = database();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('download_size_cap', 'grandissima')",
            [],
        )
        .unwrap();

        assert_eq!(
            effective_size_cap(&conn, "gallica", "sver-1").unwrap(),
            DEFAULT_SIZE_CAP
        );
        assert_eq!(normalise_cap("MAX").as_deref(), Some("max"));
        assert_eq!(normalise_cap("12"), None, "sotto il minimo leggibile");
        assert_eq!(normalise_cap("999999"), None, "sopra ogni digitalizzazione");
    }

    #[test]
    fn the_users_profile_comes_before_the_one_compiled_in() {
        let conn = database();
        let slower = NetworkProfile {
            pause_min_ms: 5_000,
            ..CAUTIOUS
        };
        save(&conn, "gallica", None, Some(slower));

        assert_eq!(
            effective_profile(&conn, "gallica", None).pause_min_ms,
            5_000
        );
    }

    #[test]
    fn a_source_added_by_address_is_recognised_by_its_host() {
        // Nel registro non ha voce: l'host è l'unica cosa che la identifica
        // (D18).
        let conn = database();
        let tuned = NetworkProfile {
            burst_requests: 7,
            ..CAUTIOUS
        };
        save(&conn, "biblioteca.example.org", None, Some(tuned));

        assert_eq!(
            effective_profile(&conn, "generic", Some("biblioteca.example.org")).burst_requests,
            7
        );
    }

    #[test]
    fn without_any_change_the_registry_profile_holds() {
        let conn = database();

        assert_eq!(
            effective_profile(&conn, "gallica", None),
            super::super::network::GALLICA
        );
        assert_eq!(effective_profile(&conn, "mai-vista", None), CAUTIOUS);
    }

    #[test]
    fn the_concurrency_cap_holds_even_written_by_hand_in_the_database() {
        // Il menu ne offre al massimo quattro, ma il menu è un aiuto e non una
        // difesa: il tetto vale dove i valori si usano davvero (D11).
        let conn = database();
        let greedy = NetworkProfile {
            host_concurrency: 64,
            ..CAUTIOUS
        };
        save(&conn, "gallica", None, Some(greedy));

        assert_eq!(
            effective_profile(&conn, "gallica", None).host_concurrency,
            MAX_HOST_CONCURRENCY
        );
    }

    #[test]
    fn an_unreadable_profile_falls_back_to_the_registry() {
        let conn = database();
        conn.execute(
            "INSERT INTO library_settings (key, network_profile) VALUES ('gallica', 'non un json')",
            [],
        )
        .unwrap();

        assert_eq!(
            effective_profile(&conn, "gallica", None),
            super::super::network::GALLICA
        );
    }

    #[test]
    fn an_empty_pause_interval_is_impossible() {
        let backwards = NetworkProfile {
            pause_min_ms: 3_000,
            pause_max_ms: 500,
            ..CAUTIOUS
        };

        let fixed = within_limits(backwards);

        assert!(fixed.pause_max_ms >= fixed.pause_min_ms);
    }

    #[test]
    fn the_list_says_which_libraries_have_been_changed() {
        let conn = database();
        save(&conn, "gallica", Some("3000"), None);
        save(&conn, "biblioteca.example.org", None, Some(CAUTIOUS));

        let listed = list_settings(&conn).unwrap();
        let gallica = listed.iter().find(|row| row.key == "gallica").unwrap();
        let vatican = listed.iter().find(|row| row.key == "vatican").unwrap();
        let by_host = listed
            .iter()
            .find(|row| row.key == "biblioteca.example.org")
            .unwrap();

        assert!(gallica.customised && gallica.size_cap.as_deref() == Some("3000"));
        assert!(!vatican.customised, "chi non è stato toccato non lo dice");
        assert!(!by_host.in_registry, "aggiunta a mano su un host");
    }
}
