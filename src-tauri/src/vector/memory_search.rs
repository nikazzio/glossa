use super::embedding::{floats_to_blob, EmbeddingError};
use super::text_units::{self, PROFILE};
use rusqlite::Connection;
use serde::Serialize;
fn db(error: rusqlite::Error) -> EmbeddingError {
    EmbeddingError::Http(error.to_string())
}
#[derive(Serialize)]
pub struct PhraseMatchResult {
    pub phrase_memory_id: String,
    pub source_phrase: String,
    pub target_phrase: String,
    pub distance: f64,
    pub confidence: f64,
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub chunk_id: Option<String>,
    pub source_id: Option<String>,
    pub provenance: serde_json::Value,
    pub embedding_model: String,
    pub dimensions: usize,
}

pub struct SearchInput {
    pub workspace_id: String,
    pub query_embedding: Vec<f32>,
    pub threshold: f64,
    pub max_results: u32,
    pub embedding_model: String,
    pub all_workspaces: bool,
    pub source_language: Option<String>,
    pub target_language: Option<String>,
}

pub fn search(
    conn: &Connection,
    input: SearchInput,
) -> Result<Vec<PhraseMatchResult>, EmbeddingError> {
    let SearchInput {
        workspace_id,
        query_embedding,
        threshold,
        max_results,
        embedding_model,
        all_workspaces,
        source_language,
        target_language,
    } = input;
    text_units::validate_embedding(&embedding_model, &query_embedding)?;
    if !threshold.is_finite() || !(0.0..=1.0).contains(&threshold) || max_results == 0 {
        return Err(EmbeddingError::Parse(
            "Invalid search threshold or result limit".into(),
        ));
    }
    let mut query=conn.prepare("WITH compatible AS MATERIALIZED (
            SELECT pm.*, e.embedding FROM phrase_memory_entries pm JOIN text_embeddings e ON e.revision_id=pm.source_revision_id
            WHERE (:all=1 OR pm.workspace_id=:ws) AND e.provider='openai' AND e.model=:model AND e.dimensions=:dim AND e.profile=:profile
              AND (:src IS NULL OR pm.source_language=:src) AND (:tgt IS NULL OR pm.target_language=:tgt)
        ), ranked AS (
            SELECT *,vec_distance_cosine(embedding,:query) AS distance FROM compatible
        ) SELECT id,source_phrase,target_phrase,distance,confidence,workspace_id,project_id,chunk_id,source_id,
            provenance
            FROM ranked WHERE distance<:threshold ORDER BY distance,id LIMIT :limit").map_err(db)?;
    let rows=query.query_map(rusqlite::named_params! {":ws":workspace_id,":all":all_workspaces,":model":embedding_model,":dim":query_embedding.len(),":profile":PROFILE,
            ":src":source_language,":tgt":target_language,":query":floats_to_blob(&query_embedding),":threshold":threshold,":limit":max_results},|r|Ok(PhraseMatchResult {
            phrase_memory_id:r.get(0)?,source_phrase:r.get(1)?,target_phrase:r.get(2)?,distance:r.get(3)?,confidence:r.get(4)?,workspace_id:r.get(5)?,project_id:r.get(6)?,chunk_id:r.get(7)?,source_id:r.get(8)?,
            provenance:serde_json::from_str(&r.get::<_,String>(9)?).map_err(|e|rusqlite::Error::FromSqlConversionFailure(9,rusqlite::types::Type::Text,Box::new(e)))?,embedding_model:embedding_model.clone(),dimensions:query_embedding.len(),
        })).map_err(db)?.collect::<Result<Vec<_>,_>>().map_err(db)?;
    Ok(rows)
}
