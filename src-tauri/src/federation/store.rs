use super::{Criteria, Execution, ResultPage, SearchConfig, SearchRun, JOB_TYPE};
use crate::iiif::discovery::SearchPage;
use crate::jobs::store::NewJob;
use rusqlite::{params, Connection, OptionalExtension};

/// Le colonne del lavoro, qualificate: la stessa riga porta esecuzione e lavoro,
/// così un elenco di ricerche non interroga il database una volta per riga.
fn job_columns() -> String {
    crate::jobs::store::COLUMNS
        .split(',')
        .map(|column| format!("j.{}", column.trim()))
        .collect::<Vec<_>>()
        .join(",")
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(",")
}

pub fn run(conn: &Connection, id: &str) -> Result<SearchRun, String> {
    runs(conn, std::slice::from_ref(&id.to_string()))?
        .pop()
        .ok_or_else(|| "federation.missingSearch".to_string())
}

/// Tre interrogazioni in tutto, qualunque sia il numero di ricerche: intestazioni,
/// esecuzioni con il loro lavoro, pagine con i conteggi già scritti.
pub fn runs(conn: &Connection, ids: &[String]) -> Result<Vec<SearchRun>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let keys: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    let marks = placeholders(ids.len());

    let mut stmt = conn
        .prepare(&format!(
            "SELECT id,criteria,providers,group_id,derived_from_id,created_at,archived \
             FROM search_runs WHERE id IN ({marks})"
        ))
        .map_err(|e| e.to_string())?;
    let mut headers: std::collections::HashMap<String, SearchRun> = stmt
        .query_map(keys.as_slice(), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, bool>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .map(|row| {
            let (id, criteria, providers, group_id, derived_from_id, created_at, archived) =
                row.map_err(|e| e.to_string())?;
            Ok((
                id.clone(),
                SearchRun {
                    id,
                    criteria: serde_json::from_str(&criteria).map_err(|e| e.to_string())?,
                    providers: serde_json::from_str(&providers).map_err(|e| e.to_string())?,
                    group_id,
                    derived_from_id,
                    created_at,
                    archived,
                    executions: Vec::new(),
                },
            ))
        })
        .collect::<Result<_, String>>()?;

    let columns = job_columns();
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {columns},e.search_id,e.provider_key,e.generation,e.result_set_id,e.page,e.mode \
             FROM search_executions e JOIN jobs j ON j.id=e.id WHERE e.search_id IN ({marks}) \
             ORDER BY e.generation DESC, e.rowid"
        ))
        .map_err(|e| e.to_string())?;
    let columns_count = crate::jobs::store::COLUMNS.split(',').count();
    let rows = stmt
        .query_map(keys.as_slice(), |r| {
            Ok((
                crate::jobs::store::row_to_record(r)?,
                r.get::<_, String>(columns_count)?,
                r.get::<_, String>(columns_count + 1)?,
                r.get::<_, u32>(columns_count + 2)?,
                r.get::<_, String>(columns_count + 3)?,
                r.get::<_, u32>(columns_count + 4)?,
                r.get::<_, String>(columns_count + 5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let sets: Vec<String> = rows.iter().map(|row| row.4.clone()).collect();
    let pages = page_counters(conn, &sets)?;

    for (job, search_id, provider_key, generation, result_set_id, page, mode) in rows {
        let Some(target) = headers.get_mut(&search_id) else {
            continue;
        };
        let (received, has_more) = coverage_of(&pages, &result_set_id, generation);
        target.executions.push(Execution {
            provider_key,
            generation,
            result_set_id,
            page,
            mode,
            job,
            received,
            has_more,
        });
    }

    Ok(ids
        .iter()
        .filter_map(|id| headers.remove(id))
        .collect::<Vec<_>>())
}

/// Pagina, conteggio, generazione di chi l'ha scritta: i conteggi sono già in
/// tabella, quindi nessun risultato salvato viene riaperto per contarlo.
type PageCounter = (u32, usize, bool, u32);

fn page_counters(
    conn: &Connection,
    sets: &[String],
) -> Result<std::collections::HashMap<String, Vec<PageCounter>>, String> {
    let mut unique: Vec<String> = sets.to_vec();
    unique.sort();
    unique.dedup();
    if unique.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let keys: Vec<&dyn rusqlite::ToSql> = unique
        .iter()
        .map(|set| set as &dyn rusqlite::ToSql)
        .collect();
    let marks = placeholders(unique.len());
    let mut stmt = conn
        .prepare(&format!(
            "SELECT p.result_set_id,p.page,p.received,p.has_more,e.generation \
             FROM search_pages p LEFT JOIN search_executions e ON e.id=p.execution_id \
             WHERE p.result_set_id IN ({marks})"
        ))
        .map_err(|e| e.to_string())?;
    let mut counters: std::collections::HashMap<String, Vec<PageCounter>> =
        std::collections::HashMap::new();
    let rows = stmt
        .query_map(keys.as_slice(), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, u32>(1)?,
                r.get::<_, i64>(2)? as usize,
                r.get::<_, bool>(3)?,
                r.get::<_, Option<u32>>(4)?.unwrap_or(0),
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (set, page, received, has_more, generation) = row.map_err(|e| e.to_string())?;
        counters
            .entry(set)
            .or_default()
            .push((page, received, has_more, generation));
    }
    Ok(counters)
}

/// Una generazione vede le proprie pagine e quelle che l'hanno preceduta, mai
/// quelle scritte da un tentativo successivo.
fn coverage_of(
    pages: &std::collections::HashMap<String, Vec<PageCounter>>,
    set: &str,
    generation: u32,
) -> (usize, bool) {
    let Some(rows) = pages.get(set) else {
        return (0, false);
    };
    let visible = rows.iter().filter(|(_, _, _, gen)| *gen <= generation);
    let received = visible.clone().map(|(_, received, _, _)| received).sum();
    let has_more = visible
        .max_by_key(|(page, _, _, _)| *page)
        .map(|(_, _, more, _)| *more)
        .unwrap_or(false);
    (received, has_more)
}

pub fn list(conn: &Connection, offset: u32, limit: u32) -> Result<Vec<SearchRun>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM search_runs ORDER BY created_at DESC,id DESC LIMIT ?1 OFFSET ?2")
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map(params![limit, offset], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    runs(conn, &ids)
}

pub fn exists(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM search_runs WHERE id=?1)",
        [id],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn criteria(conn: &Connection, id: &str) -> Result<Criteria, String> {
    let value: String = conn
        .query_row("SELECT criteria FROM search_runs WHERE id=?1", [id], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&value).map_err(|e| e.to_string())
}

pub fn execution(
    conn: &Connection,
    config: &SearchConfig,
    generation: u32,
    mode: &str,
    query: &str,
) -> Result<NewJob, String> {
    let id = super::new_id();
    conn.execute("INSERT INTO search_executions(id,search_id,provider_key,generation,result_set_id,page,mode) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![id,config.search_id,config.provider_key,generation,config.result_set_id,config.page,mode]).map_err(|e|e.to_string())?;
    Ok(NewJob {
        id,
        job_type: JOB_TYPE.into(),
        priority: 0,
        config: serde_json::to_string(config).map_err(|e| e.to_string())?,
        max_attempts: 1,
        depends_on_job_id: None,
        workspace_id: None,
        message: Some(format!(
            "{} · {}",
            crate::iiif::find_provider(&config.provider_key)
                .map(|p| p.label)
                .unwrap_or(&config.provider_key),
            query
        )),
    })
}

pub fn saved_page(conn: &Connection, config: &SearchConfig) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM search_pages WHERE result_set_id=?1 AND page=?2",
        params![config.result_set_id, config.page],
        |_| Ok(()),
    )
    .optional()
    .map(|v| v.is_some())
    .map_err(|e| e.to_string())
}

pub fn save_page(
    conn: &Connection,
    job_id: &str,
    config: &SearchConfig,
    page: &SearchPage,
) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    // Riparare invece di ignorare: una pagina rimasta senza esecuzione non
    // sarebbe più né contata né mostrata, e nessun tentativo la riscriverebbe.
    tx.execute("INSERT INTO search_pages(result_set_id,page,payload,received,has_more,execution_id) VALUES(?1,?2,?3,?4,?5,?6) \
         ON CONFLICT(result_set_id,page) DO UPDATE SET execution_id=excluded.execution_id \
         WHERE search_pages.execution_id IS NULL",
        params![config.result_set_id,config.page,serde_json::to_string(page).map_err(|e|e.to_string())?,
            page.results.len() as i64,page.has_more,job_id]).map_err(|e|e.to_string())?;
    crate::jobs::store::save_checkpoint(&tx, job_id, "page_committed")?;
    tx.commit().map_err(|e| e.to_string())
}

/// Solo i risultati, estratti dal deposito senza passare da una struttura: la
/// schermata riceve lo stesso testo che era stato salvato.
type StoredPage = (u32, Box<serde_json::value::RawValue>, String, String);

fn pages_for_set(conn: &Connection, set: &str, generation: u32) -> Result<Vec<StoredPage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.page,json_extract(p.payload,'$.results'),p.received_at,e.id \
             FROM search_pages p LEFT JOIN search_executions e ON e.id=p.execution_id \
             WHERE p.result_set_id=?1 AND COALESCE(e.generation,0)<=?2 ORDER BY p.page",
        )
        .map_err(|e| e.to_string())?;
    let pages = stmt
        .query_map(params![set, generation], |r| {
            Ok((
                r.get::<_, u32>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            ))
        })
        .map_err(|e| e.to_string())?
        .map(|row| {
            let (page, results, at, owner) = row.map_err(|e| e.to_string())?;
            let raw =
                serde_json::value::RawValue::from_string(results.unwrap_or_else(|| "[]".into()))
                    .map_err(|e| e.to_string())?;
            Ok((page, raw, at, owner))
        })
        .collect();
    pages
}

pub fn results_for_execution(
    conn: &Connection,
    id: &str,
    execution_id: Option<&str>,
) -> Result<Vec<ResultPage>, String> {
    let run = run(conn, id)?;
    results_from_run(conn, run, execution_id)
}

pub fn results_from_run(
    conn: &Connection,
    run: SearchRun,
    execution_id: Option<&str>,
) -> Result<Vec<ResultPage>, String> {
    let mut seen = std::collections::HashSet::new();
    let mut pages = Vec::new();
    for e in run.executions {
        if execution_id.is_some_and(|wanted| wanted != e.job.id) {
            continue;
        }
        if !seen.insert(e.provider_key.clone()) {
            continue;
        }
        for (page, results, received_at, owner) in
            pages_for_set(conn, &e.result_set_id, e.generation)?
        {
            pages.push(ResultPage {
                provider_key: e.provider_key.clone(),
                execution_id: owner,
                received_at,
                page,
                results,
            });
        }
    }
    pages.sort_by(|a, b| {
        a.received_at
            .cmp(&b.received_at)
            .then(a.provider_key.cmp(&b.provider_key))
            .then(a.page.cmp(&b.page))
    });
    Ok(pages)
}
