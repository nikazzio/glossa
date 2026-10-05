use super::memory_search::{search, SearchInput};
use super::text_units::*;
use rusqlite::{params, Connection};

type TestResult = Result<(), Box<dyn std::error::Error>>;
const SMALL: &str = "text-embedding-3-small";
const LARGE: &str = "text-embedding-3-large";

#[test]
fn incremental_upgrade_preserves_texts_and_only_identified_embeddings() -> TestResult {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))?;
    for (id, model) in [("known", Some(SMALL)), ("unknown", None)] {
        conn.execute(
            "INSERT INTO phrase_memory(id,source_phrase,target_phrase,confidence,
             source_language,target_language,tags,embedding,embedding_model,created_at)
             VALUES(?1,'È già: spada ⚔','A sword',0.9,'it','en','[\"arma\"]',?2,?3,CURRENT_TIMESTAMP)",
            params![id, super::embedding::floats_to_blob(&vector(SMALL)), model],
        )?;
    }
    conn.execute_batch(include_str!(
        "../../migrations/0002_workspace_memory_scope.sql"
    ))?;
    conn.execute_batch(include_str!("../../migrations/0003_text_corpus.sql"))?;
    conn.execute_batch(include_str!(
        "../../migrations/0004_pipeline_work_brief.sql"
    ))?;
    conn.execute_batch(include_str!(
        "../../migrations/0005_pipeline_shared_context.sql"
    ))?;
    conn.execute_batch(include_str!(
        "../../migrations/0006_pipeline_prompt_composition.sql"
    ))?;
    conn.execute_batch(include_str!("../../migrations/0007_work_languages.sql"))?;
    conn.execute_batch(include_str!(
        "../../migrations/0008_text_language_variety.sql"
    ))?;
    let entries = list(&conn, None, None)?;
    assert_eq!(entries.len(), 2);
    for entry in &entries {
        assert_eq!(entry.source_phrase, "È già: spada ⚔");
        assert_eq!(entry.target_phrase, "A sword");
        assert_eq!(entry.tags, vec!["arma"]);
        assert_eq!(entry.embeddings.len(), usize::from(entry.id == "known"));
        let hash: String = conn.query_row(
            "SELECT content_hash FROM text_unit_revisions WHERE id=?1",
            [&entry.source_revision_id],
            |row| row.get(0),
        )?;
        assert_eq!(hash, crate::provenance::fnv1a_hex(&entry.source_phrase));
    }
    assert!(!conn.prepare("PRAGMA foreign_key_check")?.exists([])?);
    Ok(())
}

fn connection() -> Result<Connection, Box<dyn std::error::Error>> {
    super::register_vec_extension();
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))?;
    conn.execute_batch(include_str!(
        "../../migrations/0002_workspace_memory_scope.sql"
    ))?;
    conn.execute_batch(include_str!("../../migrations/0003_text_corpus.sql"))?;
    conn.execute_batch(include_str!(
        "../../migrations/0004_pipeline_work_brief.sql"
    ))?;
    conn.execute_batch(include_str!(
        "../../migrations/0005_pipeline_shared_context.sql"
    ))?;
    conn.execute_batch(include_str!(
        "../../migrations/0006_pipeline_prompt_composition.sql"
    ))?;
    conn.execute_batch(include_str!("../../migrations/0007_work_languages.sql"))?;
    conn.execute_batch(include_str!(
        "../../migrations/0008_text_language_variety.sql"
    ))?;
    conn.execute_batch("INSERT INTO workspaces(id,name,created_at) VALUES('ws-a','Archivio',CURRENT_TIMESTAMP),('ws-b','Studio',CURRENT_TIMESTAMP);
        INSERT INTO projects(id,name,workspace_id,source_language,target_language) VALUES('project','Traduzione','ws-a','la','en');
        INSERT INTO translations(id,project_id,source_processing_text,translation_processing_text,position,translation_locked)
        VALUES('chunk','project','Salve amice','Hello friend',2,1);
        INSERT INTO sources(id,title,kind) VALUES('book','Libro medievale','manuscript');
        INSERT INTO source_versions(id,source_id,label,version_kind) VALUES('version','book','Testimone A','edition');
        INSERT INTO translation_origins(project_id,origin_type,source_version_id) VALUES('project','source_level','version');")?;
    Ok(conn)
}

fn vector(model: &str) -> Vec<f32> {
    vec![1.0; if model == SMALL { 1536 } else { 3072 }]
}
fn save(conn: &mut Connection, model: &str) -> Result<u32, super::embedding::EmbeddingError> {
    save_pairs(
        conn,
        "project",
        "chunk",
        model,
        vec![PhrasePair {
            source_phrase: "Salve".into(),
            target_phrase: "Hello".into(),
            confidence: 0.9,
            source_embedding: vector(model),
        }],
    )
}
fn change(entry: &MemoryEntry, source: &str, target: &str, models: &[&str]) -> UpdateInput {
    UpdateInput {
        workspace_id: entry.workspace_id.clone(),
        phrase_memory_id: entry.id.clone(),
        source_revision_id: entry.source_revision_id.clone(),
        target_revision_id: entry.target_revision_id.clone(),
        source_phrase: source.into(),
        target_phrase: target.into(),
        embeddings: models
            .iter()
            .map(|model| EmbeddingInput {
                model: (*model).into(),
                embedding: vector(model),
            })
            .collect(),
    }
}
fn find(
    conn: &Connection,
    model: &str,
    workspace: &str,
    global: bool,
    target: &str,
) -> Result<Vec<super::memory_search::PhraseMatchResult>, super::embedding::EmbeddingError> {
    search(
        conn,
        SearchInput {
            workspace_id: workspace.into(),
            query_embedding: vector(model),
            threshold: 0.5,
            max_results: 10,
            embedding_model: model.into(),
            all_workspaces: global,
            source_language: Some("la".into()),
            target_language: Some(target.into()),
        },
    )
}

#[test]
fn adding_and_recalculating_models_preserves_unit_and_other_embeddings() -> TestResult {
    let mut conn = connection()?;
    assert_eq!(save(&mut conn, SMALL)?, 1);
    assert_eq!(save(&mut conn, LARGE)?, 0);
    assert_eq!(save(&mut conn, SMALL)?, 0);
    let entries = list(&conn, None, None)?;
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].embeddings.len(), 2);
    assert_eq!(entries[0].source_id.as_deref(), Some("book"));
    assert_eq!(entries[0].source_version_id.as_deref(), Some("version"));
    assert_eq!(entries[0].provenance["workspaceName"], "Archivio");
    assert_eq!(entries[0].provenance["selection"]["start"], 0);
    assert_eq!(find(&conn, SMALL, "ws-a", false, "en")?.len(), 1);
    assert_eq!(find(&conn, LARGE, "ws-a", false, "en")?.len(), 1);
    let facts:i64=conn.query_row("SELECT count(*) FROM provenance_events WHERE event_type='text.embedding.saved' AND provider='openai' AND model IS NOT NULL",[],|row|row.get(0))?;
    assert_eq!(facts, 3);
    Ok(())
}

#[test]
fn compatible_search_excludes_other_models_profiles_languages_and_workspaces() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    let entry = list(&conn, None, None)?.remove(0);
    assert!(find(&conn, LARGE, "ws-a", false, "en")?.is_empty());
    assert!(find(&conn, SMALL, "ws-a", false, "it")?.is_empty());
    assert!(find(&conn, SMALL, "ws-b", false, "en")?.is_empty());
    assert_eq!(find(&conn, SMALL, "ws-b", true, "en")?.len(), 1);
    // Even equal-size vectors from another input profile must never be compared.
    conn.execute(
        "UPDATE text_embeddings SET profile='normalized-v1' WHERE revision_id=?1",
        [&entry.source_revision_id],
    )?;
    assert!(find(&conn, SMALL, "ws-a", false, "en")?.is_empty());
    conn.execute(
        "UPDATE text_embeddings SET profile=?1,model='different-model'",
        [PROFILE],
    )?;
    assert!(find(&conn, SMALL, "ws-a", false, "en")?.is_empty());
    Ok(())
}

#[test]
fn target_edits_preserve_source_revision_and_vectors_and_source_edits_archive_all() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    save(&mut conn, LARGE)?;
    let original = list(&conn, None, None)?.remove(0);
    update(&mut conn, change(&original, "Salve", "Greetings", &[]))?;
    let translated = get(&conn, None, &original.id)?;
    assert_eq!(translated.source_revision_id, original.source_revision_id);
    assert_ne!(translated.target_revision_id, original.target_revision_id);
    assert_eq!(translated.embeddings.len(), 2);
    update(
        &mut conn,
        change(&translated, "Salve amice", "Greetings", &[SMALL, LARGE]),
    )?;
    let revised = get(&conn, None, &original.id)?;
    assert_ne!(revised.source_revision_id, original.source_revision_id);
    assert_eq!(revised.embeddings.len(), 2);
    assert_eq!(
        embedding_infos(&conn, &original.source_revision_id)?.len(),
        2
    );
    assert_eq!(
        find(&conn, SMALL, "ws-a", false, "en")?[0].source_phrase,
        "Salve amice"
    );
    assert!(conn
        .execute(
            "UPDATE text_unit_revisions SET text='changed' WHERE id=?1",
            [&original.source_revision_id]
        )
        .is_err());
    Ok(())
}

#[test]
fn incomplete_or_invalid_recalculation_rolls_back_every_revision_and_embedding() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    save(&mut conn, LARGE)?;
    let original = list(&conn, None, None)?.remove(0);
    assert!(update(
        &mut conn,
        change(&original, "New source", "Hello", &[SMALL])
    )
    .is_err());
    let mut invalid = change(&original, "New source", "Hello", &[SMALL, LARGE]);
    invalid.embeddings[1].embedding = vec![1.0; 2];
    assert!(update(&mut conn, invalid).is_err());
    assert_eq!(
        get(&conn, None, &original.id)?.source_revision_id,
        original.source_revision_id
    );
    let revisions: i64 = conn.query_row("SELECT count(*) FROM text_unit_revisions", [], |row| {
        row.get(0)
    })?;
    assert_eq!(revisions, 2);
    Ok(())
}

#[test]
fn stale_edits_and_wrong_workspace_writes_are_rejected() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    let entry = list(&conn, None, None)?.remove(0);
    update(&mut conn, change(&entry, "Salve", "Greetings", &[]))?;
    assert!(update(&mut conn, change(&entry, "Salve", "Obsolete", &[])).is_err());
    let current = get(&conn, None, &entry.id)?;
    let mut wrong_scope = change(&current, "Salve", "Other", &[]);
    wrong_scope.workspace_id = Some("ws-b".into());
    assert!(update(&mut conn, wrong_scope).is_err());
    assert_eq!(get(&conn, None, &entry.id)?.target_phrase, "Greetings");
    Ok(())
}

#[test]
fn workspace_move_changes_scope_without_changing_historical_provenance() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    conn.execute(
        "UPDATE projects SET workspace_id='ws-b' WHERE id='project'",
        [],
    )?;
    assert!(find(&conn, SMALL, "ws-a", false, "en")?.is_empty());
    assert_eq!(find(&conn, SMALL, "ws-b", false, "en")?.len(), 1);
    let entry = list(&conn, Some("ws-b"), None)?.remove(0);
    assert_eq!(entry.provenance["workspaceId"], "ws-a");
    let tx = conn.transaction()?;
    set_tags(
        &tx,
        &entry.unit_id,
        &["arma".into(), "Arma".into(), "linguistica".into()],
    )?;
    tx.commit()?;
    assert_eq!(
        get(&conn, None, &entry.id)?.tags,
        vec!["arma", "linguistica"]
    );
    Ok(())
}

#[test]
fn invalid_vector_and_model_metadata_cannot_be_stored() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    let entry = list(&conn, None, None)?.remove(0);
    assert!(validate_embedding(SMALL, &vec![f32::NAN; 1536]).is_err());
    assert!(validate_embedding(SMALL, &vec![0.0; 1536]).is_err());
    assert!(conn
        .execute(
            "INSERT INTO text_embeddings(revision_id,provider,model,dimensions,profile,embedding)
        VALUES(?1,'openai','',1536,?2,?3)",
            params![entry.source_revision_id, PROFILE, vec![0u8; 6144]]
        )
        .is_err());
    assert!(conn
        .execute(
            "INSERT INTO text_embeddings(revision_id,provider,model,dimensions,profile,embedding)
        VALUES(?1,'openai',?2,3072,?3,?4)",
            params![entry.source_revision_id, LARGE, PROFILE, vec![0u8; 6144]]
        )
        .is_err());
    Ok(())
}

#[test]
fn unapproved_chunk_cannot_be_archived() -> TestResult {
    let mut conn = connection()?;
    conn.execute("UPDATE translations SET translation_locked=0", [])?;
    assert!(save(&mut conn, SMALL).is_err());
    assert!(list(&conn, None, None)?.is_empty());
    Ok(())
}

#[test]
fn equal_texts_from_different_chunks_remain_separate_units() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    conn.execute("INSERT INTO translations(id,project_id,source_processing_text,translation_processing_text,translation_locked)
        VALUES('chunk-two','project','Salve amice','Hello friend',1)",[])?;
    save_pairs(
        &mut conn,
        "project",
        "chunk-two",
        SMALL,
        vec![PhrasePair {
            source_phrase: "Salve".into(),
            target_phrase: "Hello".into(),
            confidence: 1.0,
            source_embedding: vector(SMALL),
        }],
    )?;
    assert_eq!(list(&conn, None, None)?.len(), 2);
    Ok(())
}

#[test]
fn removing_translation_preserves_archived_texts_models_and_book_provenance() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    save(&mut conn, LARGE)?;
    let original = list(&conn, None, None)?.remove(0);
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE phrase_memory SET project_id=NULL,chunk_id=NULL WHERE project_id='project'",
        [],
    )?;
    tx.execute("DELETE FROM projects WHERE id='project'", [])?;
    tx.commit()?;
    let archived = get(&conn, None, &original.id)?;
    assert!(archived.workspace_id.is_none());
    assert!(archived.project_id.is_none());
    assert!(archived.chunk_id.is_none());
    assert_eq!(archived.embeddings.len(), 2);
    assert_eq!(archived.provenance["sourceTitle"], "Libro medievale");
    assert_eq!(archived.provenance["projectName"], "Traduzione");
    assert_eq!(find(&conn, SMALL, "ws-b", true, "en")?.len(), 1);
    assert!(find(&conn, SMALL, "ws-a", false, "en")?.is_empty());
    Ok(())
}

#[test]
fn relabelling_gives_saved_phrases_the_work_languages_keeping_text_and_measures() -> TestResult {
    let mut conn = connection()?;
    save(&mut conn, SMALL)?;
    conn.execute(
        "UPDATE projects SET source_language='lat', source_language_variety='medi1250',
         source_language_note='sec. XV', target_language='ita' WHERE id='project'",
        [],
    )?;
    assert_eq!(super::text_languages::count_relabels(&conn, "project")?, 1);

    let before = list(&conn, Some("ws-a"), None)?.remove(0);
    assert_eq!(
        super::text_languages::relabel_project(&mut conn, "project")?,
        1
    );
    let after = list(&conn, Some("ws-a"), None)?.remove(0);

    assert_eq!(
        (
            after.source_language.as_str(),
            after.target_language.as_str()
        ),
        ("lat", "ita")
    );
    assert_eq!(
        (after.source_phrase, after.target_phrase),
        (before.source_phrase, before.target_phrase)
    );
    assert_ne!(after.source_revision_id, before.source_revision_id);
    assert_eq!(after.embeddings, before.embeddings);
    let (variety, note): (Option<String>, String) = conn.query_row(
        "SELECT language_variety, language_note FROM text_unit_revisions WHERE id=?1",
        [&after.source_revision_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    assert_eq!(
        (variety.as_deref(), note.as_str()),
        (Some("medi1250"), "sec. XV")
    );
    // Le revisioni precedenti restano nello storico; un secondo passaggio non trova nulla.
    let revisions: i64 =
        conn.query_row("SELECT COUNT(*) FROM text_unit_revisions", [], |r| r.get(0))?;
    assert_eq!(revisions, 4);
    assert_eq!(super::text_languages::count_relabels(&conn, "project")?, 0);
    Ok(())
}
