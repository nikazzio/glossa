//! Persistent search sessions. Execution belongs to the existing job engine.
pub mod commands;
mod handler;
mod store;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
pub use handler::SearchJob;
pub const JOB_TYPE: &str = "provider_search";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Criteria {
    pub query: String,
    pub title: String,
    pub author: String,
    pub publisher: String,
    pub institution: String,
    pub language: String,
    pub material: String,
    pub year_from: Option<u32>,
    pub year_to: Option<u32>,
}

impl Criteria {
    pub fn validate(&self) -> Result<(), String> {
        if self.query.trim().is_empty() {
            return Err("federation.queryRequired".into());
        }
        if self.query.trim().starts_with("http://") || self.query.trim().starts_with("https://") {
            return Err("federation.useDirect".into());
        }
        if !matches!(self.material.as_str(), "" | "manuscript" | "printed") {
            return Err("federation.invalidRequest".into());
        }
        for field in [&self.query, &self.title, &self.author, &self.publisher,
            &self.institution, &self.language, &self.material] {
            if field.len() > 1000 { return Err("federation.criteriaTooLong".into()); }
        }
        if self.year_from.into_iter().chain(self.year_to).any(|year| year == 0 || year > 9999)
            || matches!((self.year_from,self.year_to), (Some(a),Some(b)) if a>b) {
            return Err("federation.invalidYears".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchConfig {
    pub search_id: String,
    pub provider_key: String,
    pub result_set_id: String,
    pub page: u32,
    pub fresh: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRun {
    pub id: String,
    pub criteria: Criteria,
    pub providers: Vec<String>,
    pub group_id: String,
    pub derived_from_id: Option<String>,
    pub created_at: String,
    pub archived: bool,
    pub executions: Vec<Execution>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Execution {
    pub provider_key: String,
    pub generation: u32,
    pub result_set_id: String,
    pub page: u32,
    pub mode: String,
    pub job: crate::jobs::JobRecord,
    pub has_more: bool,
    pub received: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultPage {
    pub provider_key: String,
    pub execution_id: String,
    pub received_at: String,
    pub page: u32,
    pub results: Vec<crate::iiif::discovery::DiscoveryResult>,
}

pub fn new_id() -> String {
    use rand::Rng;
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Stable structured envelope; never include criteria, URLs, credentials or raw responses.
pub fn log_event(event: &str, search_id: &str, execution_id: &str, provider: &str, page: u32, details: serde_json::Value) {
    log::info!(target: "federation", "{}", serde_json::json!({
        "event": event, "domain": "federation", "searchId": search_id,
        "executionId": execution_id, "provider": provider, "page": page, "details": details
    }));
}
