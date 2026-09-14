//! Lettura del log tecnico scritto da `tauri-plugin-log` (#413).
//!
//! Il file su disco è l'unica fonte: nessuna seconda coda, nessun buffer
//! parallelo in memoria. Filtri e taglio si applicano qui, non a schermo — il
//! file corrente arriva a 5 MB e i ruotati sono altri tre, caricarli interi
//! nella finestra per poi nasconderne l'87% costerebbe tempo e memoria per
//! niente.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// Prefissi dei target scritti dal programma. Tutto il resto arriva dalle
/// librerie di terze parti (query al database, portachiavi, connessioni HTTP)
/// e resta nascosto finché non lo si chiede esplicitamente.
const APP_TARGET_PREFIXES: [&str; 3] = ["glossa_lib", "federation", "webview"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    /// `YYYY-MM-DD HH:MM:SS`, come sta nel file: il plugin non scrive il fuso.
    pub timestamp: String,
    pub target: String,
    pub level: String,
    pub message: String,
    /// Falso per le righe delle librerie di terze parti.
    pub from_app: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogQuery {
    /// Quante righe restituire, dalla più recente all'indietro.
    pub limit: usize,
    /// Quante righe già mostrate saltare: è così che si carica il tratto
    /// precedente senza tenere aperto un cursore fra due chiamate.
    #[serde(default)]
    pub skip: usize,
    /// Livelli ammessi (`ERROR`, `WARN`, `INFO`, `DEBUG`, `TRACE`).
    /// Vuoto significa tutti.
    #[serde(default)]
    pub levels: Vec<String>,
    /// Testo cercato in target e messaggio, senza distinzione di maiuscole.
    #[serde(default)]
    pub query: Option<String>,
    /// Con `false` restano solo le righe scritte dal programma.
    #[serde(default)]
    pub include_dependencies: bool,
    /// Prefissi dei target ammessi fra quelli del programma. `None` significa
    /// tutti; una lista vuota significa nessuno — è il caso di chi guarda
    /// soltanto le librerie di terze parti.
    #[serde(default)]
    pub target_prefixes: Option<Vec<String>>,
}

fn is_app_target(target: &str) -> bool {
    APP_TARGET_PREFIXES
        .iter()
        .any(|prefix| target == *prefix || target.starts_with(&format!("{prefix}::")))
}

/// `[2026-09-14][12:05:49][federation][INFO] messaggio`
fn parse_line(line: &str) -> Option<LogLine> {
    let rest = line.strip_prefix('[')?;
    let (date, rest) = rest.split_once("][")?;
    let (time, rest) = rest.split_once("][")?;
    let (target, rest) = rest.split_once("][")?;
    let (level, message) = rest.split_once("] ")?;
    Some(LogLine {
        timestamp: format!("{date} {time}"),
        target: target.to_string(),
        level: level.to_string(),
        message: message.to_string(),
        from_app: is_app_target(target),
    })
}

/// I file del log, dal più recente al più vecchio. Il corrente non ha data nel
/// nome, i ruotati sì, e l'ordine alfabetico decrescente li mette in ordine di
/// tempo perché la data è scritta `YYYY-MM-DD_HH-MM-SS`.
fn log_files(dir: &PathBuf) -> Result<Vec<PathBuf>, String> {
    let mut rotated: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "log"))
        .collect();
    rotated.sort();
    rotated.reverse();
    // Il file corrente si chiama come l'app senza data: viene prima di tutti.
    let (current, older): (Vec<PathBuf>, Vec<PathBuf>) = rotated.into_iter().partition(|path| {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .is_some_and(|stem| !stem.contains('_'))
    });
    Ok(current.into_iter().chain(older).collect())
}

fn matches(line: &LogLine, query: &LogQuery, needle: Option<&str>) -> bool {
    if line.from_app {
        if let Some(prefixes) = &query.target_prefixes {
            if !prefixes.iter().any(|prefix| line.target.starts_with(prefix)) {
                return false;
            }
        }
    } else if !query.include_dependencies {
        return false;
    }
    if !query.levels.is_empty() && !query.levels.iter().any(|level| level == &line.level) {
        return false;
    }
    match needle {
        None => true,
        Some(needle) => {
            line.message.to_lowercase().contains(needle)
                || line.target.to_lowercase().contains(needle)
        }
    }
}

/// Le righe che soddisfano i filtri, dalla più recente all'indietro.
#[tauri::command]
pub async fn read_app_log(
    app: tauri::AppHandle,
    query: LogQuery,
) -> Result<Vec<LogLine>, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let needle = query
        .query
        .as_ref()
        .map(|text| text.trim().to_lowercase())
        .filter(|text| !text.is_empty());

    let mut collected: Vec<LogLine> = Vec::new();
    let mut skipped = 0usize;
    for path in log_files(&dir)? {
        // Un file ruotato pesa 5 MB: si legge intero, ma si smette appena il
        // tratto richiesto è completo invece di aprire anche i precedenti.
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        for line in content.lines().rev() {
            let Some(parsed) = parse_line(line) else {
                continue;
            };
            if !matches(&parsed, &query, needle.as_deref()) {
                continue;
            }
            if skipped < query.skip {
                skipped += 1;
                continue;
            }
            collected.push(parsed);
            if collected.len() >= query.limit {
                return Ok(collected);
            }
        }
    }
    Ok(collected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_real_line() {
        let line = parse_line(
            "[2026-09-14][12:05:49][federation][INFO] {\"event\":\"search.created\"}",
        )
        .expect("riga riconosciuta");
        assert_eq!(line.timestamp, "2026-09-14 12:05:49");
        assert_eq!(line.target, "federation");
        assert_eq!(line.level, "INFO");
        assert_eq!(line.message, "{\"event\":\"search.created\"}");
        assert!(line.from_app);
    }

    #[test]
    fn a_dependency_line_is_not_from_the_app() {
        let line = parse_line("[2026-09-14][12:05:49][sqlx::query][WARN] slow statement")
            .expect("riga riconosciuta");
        assert!(!line.from_app);
    }

    #[test]
    fn a_line_without_header_is_ignored() {
        assert!(parse_line("continuazione di un messaggio su più righe").is_none());
    }

    #[test]
    fn only_the_requested_app_targets_pass() {
        let query = LogQuery {
            limit: 10,
            target_prefixes: Some(vec!["glossa_lib::jobs".into()]),
            ..LogQuery::default()
        };
        let job = parse_line("[2026-09-14][12:05:49][glossa_lib::jobs::engine][INFO] a").unwrap();
        let search = parse_line("[2026-09-14][12:05:49][federation][INFO] b").unwrap();
        assert!(matches(&job, &query, None));
        assert!(!matches(&search, &query, None));
    }

    #[test]
    fn dependencies_stay_out_unless_asked() {
        let query = LogQuery { limit: 10, ..LogQuery::default() };
        let dependency = parse_line("[2026-09-14][12:05:49][sqlx::query][WARN] slow").unwrap();
        assert!(!matches(&dependency, &query, None));
        let asking = LogQuery { limit: 10, include_dependencies: true, ..LogQuery::default() };
        assert!(matches(&dependency, &asking, None));
    }

    #[test]
    fn nested_app_targets_count_as_app() {
        assert!(is_app_target("glossa_lib::iiif::search::vatican"));
        assert!(is_app_target("webview"));
        assert!(!is_app_target("glossa_libre::other"));
    }
}
