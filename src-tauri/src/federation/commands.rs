use super::{store, Criteria, ResultPage, SearchConfig, SearchRun};

/// Quante ricerche entrano in una pagina di storico. Il limite vive qui, non
/// nella schermata: chi chiede meno ne riceve meno, chi chiede troppo si ferma
/// qui invece di trascinare tutto lo storico a ogni evento dei lavori.
pub const HISTORY_PAGE: u32 = 50;
use crate::jobs::commands::JobsState;
use rusqlite::params;
use tauri::State;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSearch {
    pub id: String,
    pub criteria: Criteria,
    pub providers: Vec<String>,
    pub derived_from_id: Option<String>,
}

fn validate_provider(key: &str) -> Result<(), String> {
    let p = crate::iiif::find_provider(key).ok_or("federation.providerUnavailable")?;
    if !p.is_enabled || !p.supports_search || p.search_handler.is_none() {
        return Err("federation.providerUnavailable".into());
    }
    Ok(())
}

/// Copy the four related tables from one read transaction, even during a search.
#[tauri::command]
pub async fn export_search_history(
    jobs: State<'_, JobsState>,
) -> Result<serde_json::Value, String> {
    let conn = jobs.0.connection()?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut tables = serde_json::Map::new();
    for table in ["jobs", "search_runs", "search_executions", "search_pages"] {
        let predicate = if table == "jobs" {
            " WHERE job_type='provider_search'"
        } else {
            ""
        };
        let mut stmt = tx
            .prepare(&format!("SELECT * FROM {table}{predicate}"))
            .map_err(|e| e.to_string())?;
        let names = stmt
            .column_names()
            .iter()
            .map(|name| name.to_string())
            .collect::<Vec<_>>();
        let records = stmt
            .query_map([], |row| {
                let mut record = serde_json::Map::new();
                for (index, name) in names.iter().enumerate() {
                    let value = match row.get_ref(index)? {
                        rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                        rusqlite::types::ValueRef::Integer(v) => serde_json::json!(v),
                        rusqlite::types::ValueRef::Real(v) => serde_json::json!(v),
                        rusqlite::types::ValueRef::Text(v) => {
                            serde_json::json!(String::from_utf8_lossy(v))
                        }
                        rusqlite::types::ValueRef::Blob(v) => serde_json::json!(v),
                    };
                    record.insert(name.clone(), value);
                }
                Ok(serde_json::Value::Object(record))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        tables.insert(table.into(), serde_json::json!(records));
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(serde_json::Value::Object(tables))
}

#[tauri::command]
pub async fn create_search(
    app: tauri::AppHandle,
    jobs: State<'_, JobsState>,
    request: CreateSearch,
) -> Result<SearchRun, String> {
    let request = CreateSearch {
        criteria: Criteria {
            query: request.criteria.query.trim().to_string(),
            ..request.criteria
        },
        ..request
    };
    request.criteria.validate()?;
    if request.id.is_empty()
        || request.id.len() > 100
        || request.providers.is_empty()
        || request.providers.len() > 50
    {
        return Err("federation.invalidRequest".into());
    }
    let unique: std::collections::HashSet<_> = request.providers.iter().collect();
    if unique.len() != request.providers.len() {
        return Err("federation.invalidRequest".into());
    }
    for key in &request.providers {
        validate_provider(key)?;
        if key == "europeana"
            && crate::keystore::get_api_key(&app, key)
                .ok()
                .filter(|s| !s.trim().is_empty())
                .is_none()
        {
            return Err("search_key_missing".into());
        }
    }
    jobs.0.submit_transaction(|conn|{
        if store::exists(conn,&request.id)? {
            let existing=store::run(conn,&request.id)?;
            if existing.criteria!=request.criteria || existing.providers!=request.providers || existing.derived_from_id!=request.derived_from_id {
                return Err("federation.invalidRequest".into());
            }
            return Ok(((),Vec::new()));
        }
        let group=if let Some(parent)=&request.derived_from_id {
            let source=store::run(conn,parent)?;
            if source.criteria!=request.criteria {return Err("federation.invalidRequest".into());}
            if request.providers.iter().any(|key| source.providers.contains(key) || !crate::iiif::find_provider(key).is_some_and(|p| p.kind == crate::iiif::ProviderKind::Aggregator)) {
                return Err("federation.invalidRequest".into());
            }
            source.group_id
        } else {request.id.clone()};
        conn.execute("INSERT INTO search_runs(id,criteria,providers,group_id,derived_from_id) VALUES(?1,?2,?3,?4,?5)",
            params![request.id,serde_json::to_string(&request.criteria).map_err(|e|e.to_string())?,
            serde_json::to_string(&request.providers).map_err(|e|e.to_string())?,group,request.derived_from_id]).map_err(|e|e.to_string())?;
        let queued=request.providers.iter().map(|key| store::execution(conn,&SearchConfig {
            search_id:request.id.clone(),provider_key:key.clone(),result_set_id:super::new_id(),page:1,fresh:false,
        },1,"first",&request.criteria.query)).collect::<Result<Vec<_>,_>>()?;
        Ok(((),queued))
    }).await?;
    super::log_event(
        "search.created",
        &request.id,
        "",
        "",
        0,
        serde_json::json!({"providerCount":request.providers.len(),"derivedFromId":request.derived_from_id}),
    );
    jobs.0.with_read(|conn| store::run(conn, &request.id)).await
}

#[tauri::command]
pub async fn list_searches(
    jobs: State<'_, JobsState>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<SearchRun>, String> {
    // Una in più della pagina è ammessa: è così che la schermata scopre se
    // esiste un seguito senza chiedere una pagina intera in più.
    let limit = limit.unwrap_or(HISTORY_PAGE).clamp(1, HISTORY_PAGE + 1);
    jobs.0
        .with_read(|conn| store::list(conn, offset.unwrap_or(0), limit))
        .await
}

#[tauri::command]
pub async fn get_search_snapshot(
    jobs: State<'_, JobsState>,
    id: String,
    known_version: Option<String>,
) -> Result<serde_json::Value, String> {
    jobs.0
        .with_read(|conn| snapshot(conn, &id, known_version.as_deref()))
        .await
}

fn snapshot(
    conn: &rusqlite::Connection,
    id: &str,
    known_version: Option<&str>,
) -> Result<serde_json::Value, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let run = store::run(&tx, id)?;
    let mut seen = std::collections::HashSet::new();
    let version = run
        .executions
        .iter()
        .filter(|e| seen.insert(e.provider_key.as_str()))
        .map(|e| format!("{}:{}", e.job.id, e.job.checkpoint.as_deref().unwrap_or("")))
        .collect::<Vec<_>>()
        .join("|");
    let mut result = serde_json::json!({"run":run,"resultsVersion":version,"pages":null});
    if known_version != Some(version.as_str()) {
        result["pages"] = serde_json::json!(store::results_from_run(&tx, run, None)?);
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn list_search_results(
    jobs: State<'_, JobsState>,
    id: String,
    execution_id: Option<String>,
) -> Result<Vec<ResultPage>, String> {
    jobs.0
        .with_read(|conn| store::results_for_execution(conn, &id, execution_id.as_deref()))
        .await
}

/// Compare-and-swap against the visible execution makes repeated clicks safe.
#[tauri::command]
pub async fn relaunch_provider_search(
    jobs: State<'_, JobsState>,
    id: String,
    execution_id: String,
    mode: String,
) -> Result<SearchRun, String> {
    jobs.0
        .submit_transaction(|conn| {
            let run = store::run(conn, &id)?;
            let old = run
                .executions
                .iter()
                .find(|e| e.job.id == execution_id)
                .ok_or("federation.missingJob")?;
            validate_provider(&old.provider_key)?;
            let latest = run
                .executions
                .iter()
                .find(|e| e.provider_key == old.provider_key)
                .ok_or("federation.missingJob")?;
            // Un rilancio su un'esecuzione superata non è un successo silenzioso:
            // chi ha cliccato deve sapere che intanto è cambiata.
            if latest.job.id != execution_id {
                return Err("federation.staleExecution".into());
            }
            if !old.job.status.is_terminal() {
                return Err("federation.stopFirst".into());
            }
            let page = match mode.as_str() {
                "restart" => 1,
                "retry" if old.job.status == crate::jobs::JobStatus::Error => old.page,
                "continue"
                    if old.job.status == crate::jobs::JobStatus::Completed && old.has_more =>
                {
                    old.page.checked_add(1).ok_or("federation.invalidRequest")?
                }
                _ => return Err("federation.invalidRequest".into()),
            };
            let config = SearchConfig {
                search_id: id.clone(),
                provider_key: old.provider_key.clone(),
                result_set_id: if mode == "restart" {
                    super::new_id()
                } else {
                    old.result_set_id.clone()
                },
                page,
                fresh: mode == "restart",
            };
            let query = run.criteria.query.clone();
            Ok((
                (),
                vec![store::execution(
                    conn,
                    &config,
                    old.generation + 1,
                    &mode,
                    &query,
                )?],
            ))
        })
        .await?;
    super::log_event(
        "search.execution.relaunch_requested",
        &id,
        &execution_id,
        "",
        0,
        serde_json::json!({"mode":mode}),
    );
    jobs.0.with_read(|conn| store::run(conn, &id)).await
}
