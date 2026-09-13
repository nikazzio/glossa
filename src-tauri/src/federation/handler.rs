use std::sync::Arc;
use async_trait::async_trait;
use tauri::Manager;
use crate::jobs::{engine::{JobContext,JobHandler},ErrorKind,JobError,Outcome,Recovery,ResourceClass};
use crate::iiif::{discovery::{Gate,SearchPage},search::SearchEndpoints};
use super::{store,SearchConfig};

pub struct SearchJob(pub tauri::AppHandle);

fn failure(message:String)->JobError {
    JobError::new(match message.as_str() {
        "search_rate_limited"=>ErrorKind::RateLimited,
        "search_unreachable"|"search_unavailable"=>ErrorKind::Transport,
        _=>ErrorKind::Format,
    },message)
}

#[async_trait]
impl JobHandler for SearchJob {
    fn resource_class(&self)->ResourceClass { ResourceClass::Network }
    fn recovery(&self)->Recovery { Recovery::Resumable }
    async fn run(&self,ctx:JobContext)->Result<Outcome,JobError> {
        let config:SearchConfig=serde_json::from_str(&ctx.config).map_err(|e|failure(e.to_string()))?;
        let started = std::time::Instant::now();
        let log = |event: &str, details: serde_json::Value| super::log_event(event, &config.search_id, &ctx.id, &config.provider_key, config.page, details);
        log("search.execution.started", serde_json::json!({"attempt":ctx.attempt}));
        if ctx.with_database(|conn|store::saved_page(conn,&config)).await.map_err(failure)? {
            log("search.page.recovered", serde_json::json!({}));
            return Ok(Outcome::Done);
        }
        let criteria=ctx.with_database(|conn|store::criteria(conn,&config.search_id)).await.map_err(failure)?;
        let provider=crate::iiif::find_provider(&config.provider_key).ok_or_else(||failure("federation.providerUnavailable".into()))?;
        let handler=provider.search_handler.filter(|_|provider.supports_search&&provider.is_enabled)
            .ok_or_else(||failure("federation.providerUnavailable".into()))?;
        let profile=ctx.with_database(|conn|Ok(crate::iiif::settings::effective_profile(conn,&config.provider_key,None))).await.map_err(failure)?;
        let courtesy=self.0.state::<Arc<crate::download::courtesy::Courtesy>>().inner().clone();
        let gate=Gate { courtesy:&courtesy,profile:&profile };
        let endpoints=SearchEndpoints { europeana_key:crate::keystore::get_api_key(&self.0,"europeana").ok(),..SearchEndpoints::default() };
        let client=crate::iiif::discovery::client().map_err(failure)?;
        let request=crate::httpcache::request::CacheRequest::Search {
            provider_key:config.provider_key.clone(),query:criteria.query.clone(),page:config.page,
            filters:std::collections::BTreeMap::from([("contract".into(),"federated-raw-v1".into())]),
        };
        let cache_entry=if config.fresh {None} else {
            crate::httpcache::commands::lookup_with_age(&self.0,&request)
                .and_then(|(bytes,at)|serde_json::from_slice::<SearchPage>(&bytes).ok().map(|page|(page,at)))
        };
        let cached_at=cache_entry.as_ref().map(|(_,at)|*at);
        let cached=cache_entry.map(|(page,_)|page);
        log("search.cache.checked", serde_json::json!({"hit":cached.is_some(),"fresh":config.fresh}));
        let work=async {
            if let Some(page)=cached {return Ok(page);}
            crate::iiif::search::run(&client,handler,&endpoints,&criteria.query,config.page,Some(&gate)).await
        };
        tokio::pin!(work);
        let page=loop {
            if ctx.cancel_requested(){log("search.execution.cancelled",serde_json::json!({}));return Ok(Outcome::Cancelled);}
            if ctx.pause_requested(){log("search.execution.paused",serde_json::json!({}));return Ok(Outcome::Paused);}
            tokio::select! {
                answer=&mut work=>break answer.map_err(|message| {
                    let safe = match message.as_str() {
                        "search_rate_limited" | "search_unreachable" | "search_unavailable" | "search_refused" | "search_key_missing" | "search_invalid_data" => message,
                        _ => "search_failed".into(),
                    };
                    log("search.execution.failed",serde_json::json!({"errorCode":safe,"durationMs":started.elapsed().as_millis()}));
                    failure(safe)
                })?,
                _=tokio::time::sleep(std::time::Duration::from_millis(100))=>{}
            }
        };
        if ctx.cancel_requested(){return Ok(Outcome::Cancelled);}
        // Commit before notification; a restarted job recognises the durable page.
        ctx.with_database(|conn|store::save_page(conn,&ctx.id,&config,&page)).await.map_err(failure)?;
        log("search.page.committed",serde_json::json!({"received":page.results.len(),"hasMore":page.has_more,"durationMs":started.elapsed().as_millis()}));
        if let Ok(bytes)=serde_json::to_vec(&page) {
            crate::httpcache::commands::store(&self.0,&request,&bytes,Some("application/json".into()));
        }
        let detail=serde_json::json!({"provider":config.provider_key,"searchId":config.search_id,
            "received":page.results.len(),"hasMore":page.has_more,"cachedAt":cached_at,
            "durationMs":started.elapsed().as_millis()}).to_string();
        ctx.report(1.0,None,None,Some(&detail)).await;
        Ok(Outcome::Done)
    }
}
