use rusqlite::{params, Connection, OptionalExtension};
use super::{Criteria, Execution, ResultPage, SearchConfig, SearchRun, JOB_TYPE};
use crate::jobs::store::NewJob;
use crate::iiif::discovery::SearchPage;

pub fn run(conn: &Connection, id: &str) -> Result<SearchRun, String> {
    let (criteria, providers, group_id, derived_from_id, created_at, archived):
        (String,String,String,Option<String>,String,bool) = conn.query_row(
        "SELECT criteria,providers,group_id,derived_from_id,created_at,archived FROM search_runs WHERE id=?1",
        [id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)),
    ).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id,provider_key,generation,result_set_id,page,mode FROM search_executions WHERE search_id=?1 ORDER BY generation DESC, rowid")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,u32>(2)?,r.get::<_,String>(3)?,r.get::<_,u32>(4)?,r.get::<_,String>(5)?)))
        .map_err(|e| e.to_string())?;
    let mut executions = Vec::new();
    for row in rows {
        let (job_id,provider_key,generation,result_set_id,page,mode) = row.map_err(|e| e.to_string())?;
        let job = crate::jobs::store::get(conn,&job_id)?.ok_or("federation.missingJob")?;
        let (received,has_more) = coverage(conn,&result_set_id)?;
        executions.push(Execution { provider_key,generation,result_set_id,page,mode,job,received,has_more });
    }
    Ok(SearchRun { id:id.into(), criteria:serde_json::from_str(&criteria).map_err(|e|e.to_string())?,
        providers:serde_json::from_str(&providers).map_err(|e|e.to_string())?, group_id,derived_from_id,created_at,archived,executions })
}

pub fn list(conn: &Connection, offset: u32) -> Result<Vec<SearchRun>,String> {
    let mut stmt=conn.prepare("SELECT id FROM search_runs ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?1").map_err(|e|e.to_string())?;
    let ids=stmt.query_map([offset],|r| r.get::<_,String>(0)).map_err(|e|e.to_string())?
        .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    ids.iter().map(|id|run(conn,id)).collect()
}

pub fn exists(conn: &Connection,id:&str)->Result<bool,String> {
    conn.query_row("SELECT EXISTS(SELECT 1 FROM search_runs WHERE id=?1)",[id],|r|r.get(0)).map_err(|e|e.to_string())
}

pub fn criteria(conn:&Connection,id:&str)->Result<Criteria,String> {
    let value:String=conn.query_row("SELECT criteria FROM search_runs WHERE id=?1",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
    serde_json::from_str(&value).map_err(|e|e.to_string())
}

pub fn execution(conn:&Connection,config:&SearchConfig,generation:u32,mode:&str)->Result<NewJob,String> {
    let id=super::new_id();
    conn.execute("INSERT INTO search_executions(id,search_id,provider_key,generation,result_set_id,page,mode) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![id,config.search_id,config.provider_key,generation,config.result_set_id,config.page,mode]).map_err(|e|e.to_string())?;
    Ok(NewJob { id,job_type:JOB_TYPE.into(),priority:0,
        config:serde_json::to_string(config).map_err(|e|e.to_string())?,max_attempts:1,
        depends_on_job_id:None,workspace_id:None,
        message:Some(format!("{} · {}",crate::iiif::find_provider(&config.provider_key).map(|p|p.label).unwrap_or(&config.provider_key),criteria(conn,&config.search_id)?.query)) })
}

pub fn saved_page(conn:&Connection,config:&SearchConfig)->Result<bool,String> {
    conn.query_row("SELECT 1 FROM search_pages WHERE result_set_id=?1 AND page=?2",params![config.result_set_id,config.page],|_|Ok(())).optional()
        .map(|v|v.is_some()).map_err(|e|e.to_string())
}

pub fn save_page(conn:&Connection,job_id:&str,config:&SearchConfig,page:&SearchPage)->Result<(),String> {
    let tx=conn.unchecked_transaction().map_err(|e|e.to_string())?;
    tx.execute("INSERT OR IGNORE INTO search_pages(result_set_id,page,payload,received,has_more) VALUES(?1,?2,?3,?4,?5)",
        params![config.result_set_id,config.page,serde_json::to_string(page).map_err(|e|e.to_string())?,
            page.results.len() as i64,page.has_more]).map_err(|e|e.to_string())?;
    crate::jobs::store::save_checkpoint(&tx,job_id,"page_committed")?;
    tx.commit().map_err(|e|e.to_string())
}

/// Coverage comes from the stored counters: listing searches parses no payload.
fn coverage(conn:&Connection,set:&str)->Result<(usize,bool),String> {
    conn.query_row(
        "SELECT COALESCE(SUM(received),0), COALESCE((SELECT has_more FROM search_pages WHERE result_set_id=?1 ORDER BY page DESC LIMIT 1),0) \
         FROM search_pages WHERE result_set_id=?1",
        [set],
        |row| Ok((row.get::<_,i64>(0)? as usize,row.get::<_,bool>(1)?)),
    ).map_err(|e|e.to_string())
}

fn pages_for_set(conn:&Connection,set:&str)->Result<Vec<(u32,SearchPage,String)>,String> {
    let mut stmt=conn.prepare("SELECT page,payload,received_at FROM search_pages WHERE result_set_id=?1 ORDER BY page").map_err(|e|e.to_string())?;
    let pages = stmt.query_map([set],|r|Ok((r.get::<_,u32>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?)))
        .map_err(|e|e.to_string())?.map(|row|{
            let (n,p,at)=row.map_err(|e|e.to_string())?;
            Ok((n,serde_json::from_str(&p).map_err(|e|e.to_string())?,at))
        }).collect();
    pages
}

pub fn results(conn:&Connection,id:&str)->Result<Vec<ResultPage>,String> {
    results_for_execution(conn,id,None)
}

pub fn results_for_execution(conn:&Connection,id:&str,execution_id:Option<&str>)->Result<Vec<ResultPage>,String> {
    let run=run(conn,id)?;
    let mut seen=std::collections::HashSet::new();
    let mut pages=Vec::new();
    for e in run.executions {
        if execution_id.is_some_and(|wanted| wanted != e.job.id) {continue;}
        if !seen.insert(e.provider_key.clone()) { continue; }
        for (page,p,received_at) in pages_for_set(conn,&e.result_set_id)? {
            pages.push(ResultPage { provider_key:e.provider_key.clone(),execution_id:e.job.id.clone(),received_at,page,results:p.results });
        }
    }
    pages.sort_by(|a,b|a.received_at.cmp(&b.received_at).then(a.provider_key.cmp(&b.provider_key)).then(a.page.cmp(&b.page)));
    Ok(pages)
}
