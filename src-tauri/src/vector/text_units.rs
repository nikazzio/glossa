use super::embedding::{floats_to_blob, EmbeddingError};
use crate::provenance::fnv1a_hex;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

pub const PROFILE: &str = "source-verbatim-v1";
const SCOPE: &str = "(:ws IS NULL OR pm.workspace_id = :ws)";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EmbeddingInfo {
    pub provider: String,
    pub model: String,
    pub dimensions: usize,
    pub profile: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingInput {
    pub model: String,
    pub embedding: Vec<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhrasePair {
    pub source_phrase: String,
    pub target_phrase: String,
    pub confidence: f64,
    pub source_embedding: Vec<f32>,
}

#[derive(Debug, Serialize)]
pub struct MemoryEntry {
    pub id: String,
    pub unit_id: String,
    pub source_revision_id: String,
    pub target_revision_id: String,
    pub workspace_id: Option<String>,
    pub source_phrase: String,
    pub target_phrase: String,
    pub confidence: f64,
    pub source_language: String,
    pub target_language: String,
    pub author: Option<String>,
    pub work: Option<String>,
    pub domain: Option<String>,
    pub tags: Vec<String>,
    pub notes: Option<String>,
    pub chunk_id: Option<String>,
    pub project_id: Option<String>,
    pub source_id: Option<String>,
    pub source_version_id: Option<String>,
    pub provenance: serde_json::Value,
    pub embeddings: Vec<EmbeddingInfo>,
    pub created_at: String,
}

fn db(error: rusqlite::Error) -> EmbeddingError {
    EmbeddingError::Http(error.to_string())
}

pub use super::text_languages::{project_languages, revision_language, LanguageLabel};

pub fn dimensions(model: &str) -> Result<usize, EmbeddingError> {
    match model {
        "text-embedding-3-small" => Ok(1536),
        "text-embedding-3-large" => Ok(3072),
        _ => Err(EmbeddingError::Parse("Unsupported embedding model".into())),
    }
}

pub fn validate_embedding(model: &str, vector: &[f32]) -> Result<(), EmbeddingError> {
    if vector.len() != dimensions(model)?
        || vector.iter().any(|v| !v.is_finite())
        || vector.iter().all(|v| *v == 0.0)
    {
        return Err(EmbeddingError::Parse(
            "Invalid embedding dimensions or values".into(),
        ));
    }
    Ok(())
}

pub fn embedding_infos(
    conn: &Connection,
    revision_id: &str,
) -> Result<Vec<EmbeddingInfo>, EmbeddingError> {
    let mut query = conn.prepare("SELECT provider, model, dimensions, profile FROM text_embeddings WHERE revision_id=?1 ORDER BY model, profile").map_err(db)?;
    let rows = query
        .query_map([revision_id], |row| {
            Ok(EmbeddingInfo {
                provider: row.get(0)?,
                model: row.get(1)?,
                dimensions: row.get(2)?,
                profile: row.get(3)?,
            })
        })
        .map_err(db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db)?;
    Ok(rows)
}

pub fn put_embedding(
    conn: &Connection,
    revision_id: &str,
    input: &EmbeddingInput,
) -> Result<(), EmbeddingError> {
    validate_embedding(&input.model, &input.embedding)?;
    conn.execute("INSERT INTO text_embeddings (revision_id, provider, model, dimensions, profile, embedding) VALUES (?1, 'openai', ?2, ?3, ?4, ?5)
        ON CONFLICT(revision_id, provider, model, dimensions, profile) DO UPDATE SET embedding=excluded.embedding, created_at=CURRENT_TIMESTAMP",
        params![revision_id, input.model, input.embedding.len(), PROFILE, floats_to_blob(&input.embedding)]).map_err(db)?;
    let hash: String = conn
        .query_row(
            "SELECT content_hash FROM text_unit_revisions WHERE id=?1",
            [revision_id],
            |r| r.get(0),
        )
        .map_err(db)?;
    record_fact(
        conn,
        "text.embedding.saved",
        "text_revision",
        revision_id,
        Some(&input.model),
        Some(&hash),
    )?;
    Ok(())
}

pub(crate) fn record_fact(
    conn: &Connection,
    event_type: &str,
    entity_type: &str,
    id: &str,
    model: Option<&str>,
    hash: Option<&str>,
) -> Result<(), EmbeddingError> {
    let key: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .map_err(db)?;
    let workspace: Option<String>=conn.query_row("SELECT CASE WHEN pm.id IS NOT NULL THEN pm.workspace_id ELSE tu.workspace_id END FROM text_units tu
        LEFT JOIN phrase_memory_entries pm ON pm.unit_id=tu.id WHERE tu.id=?1 OR tu.id=(SELECT unit_id FROM text_unit_revisions WHERE id=?1)",
        [id],|r|r.get(0)).optional().map_err(db)?.flatten();
    let event = crate::provenance::Event {
        event_type: event_type.into(),
        entity_type: entity_type.into(),
        entity_id: id.into(),
        workspace_id: workspace,
        actor: "user",
        job_id: None,
        outcome: Some("completed".into()),
        duration_ms: None,
        error_kind: None,
        input_hash: hash.map(str::to_string),
        output_hash: hash.map(str::to_string),
        provider: model.map(|_| "openai".into()),
        model: model.map(str::to_string),
        config: Some(
            serde_json::json!({"model":model,"profile":PROFILE,"entityId":id}).to_string(),
        ),
        key_ref: Some(key),
    };
    crate::provenance::record(conn, &event).map_err(EmbeddingError::Http)
}

pub fn new_revision(
    conn: &Connection,
    unit: &str,
    role: &str,
    language: &LanguageLabel,
    text: &str,
) -> Result<String, EmbeddingError> {
    if text.trim().is_empty() || language.code.trim().is_empty() {
        return Err(EmbeddingError::Parse(
            "Text and language are required".into(),
        ));
    }
    let id: String = conn
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .map_err(db)?;
    conn.execute("INSERT INTO text_unit_revisions (id, unit_id, role, language, language_variety, language_note, text, content_hash, revision_number)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, COALESCE(MAX(revision_number),0)+1 FROM text_unit_revisions WHERE unit_id=?2 AND role=?3 AND language=?4",
        params![id, unit, role, language.code, language.variety, language.note, text, fnv1a_hex(text)]).map_err(db)?;
    record_fact(
        conn,
        "text.revision.created",
        "text_revision",
        &id,
        None,
        Some(&fnv1a_hex(text)),
    )?;
    Ok(id)
}

pub fn list(
    conn: &Connection,
    workspace: Option<&str>,
    chunk: Option<&str>,
) -> Result<Vec<MemoryEntry>, EmbeddingError> {
    list_with_id(conn, workspace, chunk, None)
}

fn list_with_id(
    conn: &Connection,
    workspace: Option<&str>,
    chunk: Option<&str>,
    id: Option<&str>,
) -> Result<Vec<MemoryEntry>, EmbeddingError> {
    let mut query=conn.prepare(&format!("SELECT pm.id, pm.unit_id, pm.source_revision_id, pm.target_revision_id, pm.workspace_id,
        pm.source_phrase, pm.target_phrase, pm.confidence, pm.source_language, pm.target_language, pm.author, pm.work, pm.domain,
        pm.notes, pm.chunk_id, pm.project_id, pm.source_id, pm.source_version_id, pm.provenance, pm.created_at
        FROM phrase_memory_entries pm WHERE {SCOPE} AND (:chunk IS NULL OR pm.chunk_id=:chunk) AND (:id IS NULL OR pm.id=:id) ORDER BY pm.created_at DESC, pm.id")).map_err(db)?;
    let mut entries = query
        .query_map(
            rusqlite::named_params! {":ws":workspace, ":chunk":chunk, ":id":id},
            |row| {
                let provenance: String = row.get(18)?;
                Ok(MemoryEntry {
                    id: row.get(0)?,
                    unit_id: row.get(1)?,
                    source_revision_id: row.get(2)?,
                    target_revision_id: row.get(3)?,
                    workspace_id: row.get(4)?,
                    source_phrase: row.get(5)?,
                    target_phrase: row.get(6)?,
                    confidence: row.get(7)?,
                    source_language: row.get(8)?,
                    target_language: row.get(9)?,
                    author: row.get(10)?,
                    work: row.get(11)?,
                    domain: row.get(12)?,
                    notes: row.get(13)?,
                    chunk_id: row.get(14)?,
                    project_id: row.get(15)?,
                    source_id: row.get(16)?,
                    source_version_id: row.get(17)?,
                    provenance: serde_json::from_str(&provenance).map_err(|e| {
                        rusqlite::Error::FromSqlConversionFailure(
                            18,
                            rusqlite::types::Type::Text,
                            Box::new(e),
                        )
                    })?,
                    tags: vec![],
                    embeddings: vec![],
                    created_at: row.get(19)?,
                })
            },
        )
        .map_err(db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db)?;
    for entry in &mut entries {
        entry.embeddings = embedding_infos(conn, &entry.source_revision_id)?;
        let mut tags = conn
            .prepare("SELECT name FROM text_unit_tags WHERE unit_id=?1 ORDER BY name")
            .map_err(db)?;
        entry.tags = tags
            .query_map([&entry.unit_id], |r| r.get(0))
            .map_err(db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db)?;
    }
    Ok(entries)
}

pub fn get(
    conn: &Connection,
    workspace: Option<&str>,
    id: &str,
) -> Result<MemoryEntry, EmbeddingError> {
    // Filter before reads of revisions/misures: changing scope cannot write an unrelated pair.
    let allowed = conn
        .query_row(
            &format!(
                "SELECT EXISTS(SELECT 1 FROM phrase_memory_entries pm WHERE pm.id=:id AND {SCOPE})"
            ),
            rusqlite::named_params! {":id":id, ":ws":workspace},
            |r| r.get::<_, bool>(0),
        )
        .map_err(db)?;
    if !allowed {
        return Err(EmbeddingError::Parse(
            "Memory entry is unavailable in this workspace".into(),
        ));
    }
    list_with_id(conn, workspace, None, Some(id))?
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| EmbeddingError::Parse("Memory entry not found".into()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    pub workspace_id: Option<String>,
    pub phrase_memory_id: String,
    pub source_revision_id: String,
    pub target_revision_id: String,
    pub source_phrase: String,
    pub target_phrase: String,
    pub embeddings: Vec<EmbeddingInput>,
}

pub fn update(conn: &mut Connection, input: UpdateInput) -> Result<u32, EmbeddingError> {
    let tx = conn.transaction().map_err(db)?;
    let entry = get(&tx, input.workspace_id.as_deref(), &input.phrase_memory_id)?;
    ensure_revisions(&entry, &input.source_revision_id, &input.target_revision_id)?;
    let source = input.source_phrase.trim();
    let target = input.target_phrase.trim();
    if source.is_empty() || target.is_empty() {
        return Err(EmbeddingError::Parse("Both texts are required".into()));
    }
    let source_id = if source != entry.source_phrase {
        let mut models = entry
            .embeddings
            .iter()
            .map(|e| e.model.as_str())
            .collect::<Vec<_>>();
        models.sort();
        models.dedup();
        let mut supplied = input
            .embeddings
            .iter()
            .map(|e| e.model.as_str())
            .collect::<Vec<_>>();
        supplied.sort();
        if models != supplied {
            return Err(EmbeddingError::Parse(
                "All source embeddings must be recalculated".into(),
            ));
        }
        let revision = new_revision(
            &tx,
            &entry.unit_id,
            "source",
            &revision_language(&tx, &entry.source_revision_id)?,
            source,
        )?;
        for embedding in &input.embeddings {
            put_embedding(&tx, &revision, embedding)?;
        }
        revision
    } else {
        if !input.embeddings.is_empty() {
            return Err(EmbeddingError::Parse(
                "Unchanged source requires no new embeddings".into(),
            ));
        }
        entry.source_revision_id
    };
    let target_id = if target != entry.target_phrase {
        new_revision(
            &tx,
            &entry.unit_id,
            "translation",
            &revision_language(&tx, &entry.target_revision_id)?,
            target,
        )?
    } else {
        entry.target_revision_id
    };
    tx.execute(
        "UPDATE phrase_memory SET source_revision_id=?1,target_revision_id=?2 WHERE id=?3",
        params![source_id, target_id, entry.id],
    )
    .map_err(db)?;
    tx.commit().map_err(db)?;
    Ok(1)
}

pub fn ensure_revisions(
    entry: &MemoryEntry,
    source: &str,
    target: &str,
) -> Result<(), EmbeddingError> {
    if entry.source_revision_id != source || entry.target_revision_id != target {
        return Err(EmbeddingError::Parse(
            "The text changed during this operation; reload before saving".into(),
        ));
    }
    Ok(())
}

pub fn save_pairs(
    conn: &mut Connection,
    project: &str,
    chunk: &str,
    model: &str,
    pairs: Vec<PhrasePair>,
) -> Result<u32, EmbeddingError> {
    dimensions(model)?;
    let tx = conn.transaction().map_err(db)?;
    // Le lingue sono quelle dell'opera da cui nasce la frase, lette qui: una sola fonte.
    let (source_language, target_language) = project_languages(&tx, project)?;
    let (workspace,project_name,chunk_source,chunk_target,position,approved): (Option<String>,String,String,String,Option<i64>,Option<String>)=tx.query_row(
        "SELECT p.workspace_id,p.name,t.source_processing_text,t.translation_processing_text,t.position,t.approved_revision_id
        FROM projects p JOIN translations t ON t.project_id=p.id WHERE p.id=?1 AND t.id=?2 AND t.translation_locked=1",
        params![project,chunk],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))).map_err(db)?;
    let workspace_name: Option<String> = if let Some(ws) = workspace.as_deref() {
        tx.query_row("SELECT name FROM workspaces WHERE id=?1", [ws], |r| {
            r.get(0)
        })
        .optional()
        .map_err(db)?
    } else {
        None
    };
    let book: Option<(String, String, String, String)> = tx
        .query_row(
            "SELECT s.id,v.id,s.title,v.label FROM translation_origins o
        LEFT JOIN transcription_documents d ON d.id=o.transcription_document_id
        JOIN source_versions v ON v.id=COALESCE(o.source_version_id,d.source_version_id)
        JOIN sources s ON s.id=v.source_id WHERE o.project_id=?1",
            [project],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(db)?;
    let mut added = 0;
    for pair in pairs {
        let source = pair.source_phrase.trim();
        let target = pair.target_phrase.trim();
        if source.is_empty() || target.is_empty() || !pair.confidence.is_finite() {
            return Err(EmbeddingError::Parse("Invalid text pair".into()));
        }
        validate_embedding(model, &pair.source_embedding)?;
        let existing: Option<(String,String)>=tx.query_row("SELECT id,source_revision_id FROM phrase_memory_entries WHERE project_id=?1 AND chunk_id=?2 AND source_phrase=?3 AND target_phrase=?4 AND source_language=?5 AND target_language=?6",
            params![project,chunk,source,target,source_language.code,target_language.code],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(db)?;
        if let Some((_, revision)) = existing {
            put_embedding(
                &tx,
                &revision,
                &EmbeddingInput {
                    model: model.into(),
                    embedding: pair.source_embedding,
                },
            )?;
            continue;
        }
        let unit: String = tx
            .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
            .map_err(db)?;
        let position_start = if chunk_source.match_indices(source).count() == 1 {
            chunk_source
                .find(source)
                .map(|start| chunk_source[..start].chars().count())
        } else {
            None
        };
        let provenance = serde_json::json!({"projectId":project,"projectName":project_name,"chunkId":chunk,"chunkPosition":position,
            "workspaceId":workspace,"workspaceName":workspace_name,"approvedTranslationRevisionId":approved,"sourceHash":fnv1a_hex(&chunk_source),"targetHash":fnv1a_hex(&chunk_target),
            "sourceId":book.as_ref().map(|b|&b.0),"sourceVersionId":book.as_ref().map(|b|&b.1),
            "sourceTitle":book.as_ref().map(|b|&b.2),"sourceVersionLabel":book.as_ref().map(|b|&b.3),"selection":{"exact":source,"start":position_start,"end":position_start.map(|start|start+source.chars().count())}});
        tx.execute("INSERT INTO text_units(id,source_id,source_version_id,workspace_id,provenance) VALUES(?1,?2,?3,?4,?5)",
            params![unit,book.as_ref().map(|b|&b.0),book.as_ref().map(|b|&b.1),workspace,provenance.to_string()]).map_err(db)?;
        let sr = new_revision(&tx, &unit, "source", &source_language, source)?;
        let tr = new_revision(&tx, &unit, "translation", &target_language, target)?;
        tx.execute("INSERT INTO phrase_memory(id,unit_id,source_revision_id,target_revision_id,project_id,chunk_id,confidence,work) VALUES(?1,?1,?2,?3,?4,?5,?6,?7)",
            params![unit,sr,tr,project,chunk,pair.confidence.clamp(0.0,1.0),book.as_ref().map(|b|&b.2)]).map_err(db)?;
        put_embedding(
            &tx,
            &sr,
            &EmbeddingInput {
                model: model.into(),
                embedding: pair.source_embedding,
            },
        )?;
        added += 1;
    }
    tx.commit().map_err(db)?;
    Ok(added)
}

pub fn set_tags(tx: &Transaction<'_>, unit: &str, tags: &[String]) -> Result<(), EmbeddingError> {
    tx.execute("DELETE FROM text_unit_tags WHERE unit_id=?1", [unit])
        .map_err(db)?;
    for name in tags {
        let name = name.trim();
        if name.is_empty() {
            return Err(EmbeddingError::Parse("Empty tag".into()));
        }
        tx.execute(
            "INSERT OR IGNORE INTO text_unit_tags(unit_id,name) VALUES(?1,?2)",
            params![unit, name],
        )
        .map_err(db)?;
    }
    record_fact(tx, "text.tags.changed", "text_unit", unit, None, None)?;
    Ok(())
}
