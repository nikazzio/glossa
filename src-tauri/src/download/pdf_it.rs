//! Prove sul ciclo completo dello scaricamento del PDF, contro una biblioteca
//! finta.
//!
//! Quello che conta qui non è il conteggio delle pagine — provato a parte — ma
//! le tre promesse del deposito: nel deposito entra solo ciò che è stato
//! validato, il file promosso ha sempre la sua scheda, e un file arrivato
//! rovinato non resta da nessuna parte.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::db::DbWriteCoordinator;
use crate::jobs::engine::{JobEngine, Observer};
use crate::jobs::store::{self, NewJob};
use crate::jobs::{JobRecord, JobStatus};

use super::courtesy::Courtesy;
use super::pdf::{record_at, PdfDownloadJob, JOB_TYPE};

const VERSION_ID: &str = "sver-pdf";
const JOB_ID: &str = "pdf:sver-pdf";

/// Nessun freno: la cortesia è provata altrove e qui allungherebbe i test.
const INSTANT_PROFILE: &str = r#"{
  "burstRequests": 1000, "burstWindowSecs": 1,
  "cooldown403Secs": 1, "cooldown429Secs": 1, "hostConcurrency": 2,
  "workersPerJob": 1,
  "maxAttempts": 1, "backoffBaseSecs": 1, "backoffCapSecs": 1,
  "connectTimeoutSecs": 2, "readTimeoutSecs": 2, "needsViewerWarmup": false
}"#;

/// Un PDF vero, con due pagine: la validazione lo promuove e il conteggio
/// funziona.
fn pdf_bytes() -> Vec<u8> {
    let mut document = lopdf::Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let kids: Vec<lopdf::Object> = (0..2)
        .map(|_| {
            let contents = document.add_object(lopdf::Stream::new(
                lopdf::Dictionary::new(),
                b"BT ET".to_vec(),
            ));
            let mut page = lopdf::Dictionary::new();
            page.set("Type", "Page");
            page.set("Parent", pages_id);
            page.set("Contents", contents);
            lopdf::Object::Reference(document.add_object(page))
        })
        .collect();
    let mut pages = lopdf::Dictionary::new();
    pages.set("Type", "Pages");
    pages.set("Count", 2_i64);
    pages.set("Kids", kids);
    document
        .objects
        .insert(pages_id, lopdf::Object::Dictionary(pages));
    let mut catalog = lopdf::Dictionary::new();
    catalog.set("Type", "Catalog");
    catalog.set("Pages", pages_id);
    let catalog_id = document.add_object(catalog);
    document.trailer.set("Root", catalog_id);
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).expect("PDF di prova");
    bytes
}

fn temp_dir(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("glossa_pdf_it_{name}"));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).unwrap();
    path
}

fn temp_db(name: &str, document_url: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("glossa_pdf_it_{name}.db"));
    let _ = std::fs::remove_file(&path);
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))
        .expect("migration applies");
    conn.execute(
        "INSERT INTO sources (id, title, kind) VALUES ('src-pdf', 'Opera di prova', 'print')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO source_versions (id, source_id, label, version_kind, source_url) \
         VALUES (?1, 'src-pdf', 'PDF', 'pdf', ?2)",
        rusqlite::params![VERSION_ID, document_url],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO network_profiles (id, name, builtin, values_json) \
         VALUES ('prova', 'Prova', 0, ?1)",
        rusqlite::params![INSTANT_PROFILE],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO library_network_profiles (library_key, profile_id) VALUES ('prova', 'prova')",
        [],
    )
    .unwrap();
    path
}

fn engine_with(db: PathBuf, vault: PathBuf) -> Arc<JobEngine> {
    let mut engine = JobEngine::new(db, Observer::silent(), DbWriteCoordinator::default(), vault);
    engine.register(
        JOB_TYPE,
        Arc::new(PdfDownloadJob::new(Arc::new(Courtesy::new()))),
    );
    engine.load_limits().expect("limiti");
    Arc::new(engine)
}

fn pdf_job(document_url: &str) -> NewJob {
    NewJob {
        id: JOB_ID.to_string(),
        job_type: JOB_TYPE.to_string(),
        priority: 10,
        config: serde_json::json!({
            "providerKey": "prova",
            "versionId": VERSION_ID,
            "sourceUrl": document_url,
        })
        .to_string(),
        max_attempts: 1,
        depends_on_job_id: None,
        workspace_id: None,
        message: None,
    }
}

async fn run_until_terminal(engine: &Arc<JobEngine>) -> JobRecord {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        engine.tick().await.unwrap();
        tokio::time::sleep(Duration::from_millis(20)).await;
        let conn = engine.connection().unwrap();
        let record = store::get(&conn, JOB_ID).unwrap().unwrap();
        if record.status.is_terminal() {
            return record;
        }
        assert!(
            Instant::now() < deadline,
            "il lavoro non è arrivato a un capolinea: {:?}",
            record.status
        );
    }
}

fn document_path(vault: &std::path::Path) -> PathBuf {
    vault
        .join("providers/prova")
        .join(VERSION_ID)
        .join("document.pdf")
}

fn meta_path(vault: &std::path::Path) -> PathBuf {
    vault
        .join("providers/prova")
        .join(VERSION_ID)
        .join("document.json")
}

/// Niente resta nell'area di transito: quello che non è stato promosso non
/// occupa spazio e non confonde una ripresa.
fn staging_is_empty(vault: &std::path::Path) -> bool {
    !vault.join("staging").join(VERSION_ID).exists()
}

#[tokio::test]
async fn a_whole_pdf_is_promoted_with_its_record() {
    let server = MockServer::start().await;
    let bytes = pdf_bytes();
    Mock::given(method("GET"))
        .and(path("/opera.pdf"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(bytes.clone()))
        .mount(&server)
        .await;
    let url = format!("{}/opera.pdf", server.uri());
    let vault = temp_dir("intero");
    let engine = engine_with(temp_db("intero", &url), vault.clone());

    engine.submit(&pdf_job(&url)).await.unwrap();
    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed);
    let promoted = std::fs::read(document_path(&vault)).expect("il PDF è nel deposito");
    assert_eq!(promoted, bytes, "i byte promossi sono quelli serviti");

    let scheda = record_at(&meta_path(&vault)).expect("la scheda sta accanto al file");
    assert_eq!(scheda.bytes, bytes.len() as u64);
    assert_eq!(scheda.pages, Some(2), "le pagine si contano dal file");
    assert_eq!(scheda.source_url, url);
    assert!(!scheda.checksum.is_empty());
    assert!(staging_is_empty(&vault));
}

#[tokio::test]
async fn a_pdf_cut_in_the_middle_never_enters_the_vault() {
    // Il caso vero di uno scaricamento interrotto: la dimensione dichiarata è
    // quella giusta, ma il file finisce prima. Un controllo sulla lunghezza non
    // lo vedrebbe; la validazione della chiusura sì.
    let server = MockServer::start().await;
    let whole = pdf_bytes();
    let cut = whole[..whole.len() - 24].to_vec();
    Mock::given(method("GET"))
        .and(path("/opera.pdf"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(cut))
        .mount(&server)
        .await;
    let url = format!("{}/opera.pdf", server.uri());
    let vault = temp_dir("troncato");
    let engine = engine_with(temp_db("troncato", &url), vault.clone());

    engine.submit(&pdf_job(&url)).await.unwrap();
    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Error);
    assert!(
        !document_path(&vault).exists(),
        "un file troncato non entra nel deposito"
    );
    assert!(
        !meta_path(&vault).exists(),
        "senza file non resta una scheda che parla di lui"
    );
    assert!(staging_is_empty(&vault));
}

#[tokio::test]
async fn a_page_of_html_answered_instead_of_a_pdf_is_refused() {
    // Alcune biblioteche rispondono 200 con una pagina di errore: senza
    // validazione finirebbe nel deposito come se fosse il libro.
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/opera.pdf"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string("<!doctype html><html><body>not here</body></html>"),
        )
        .mount(&server)
        .await;
    let url = format!("{}/opera.pdf", server.uri());
    let vault = temp_dir("html");
    let engine = engine_with(temp_db("html", &url), vault.clone());

    engine.submit(&pdf_job(&url)).await.unwrap();
    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Error);
    assert!(!document_path(&vault).exists());
    assert!(staging_is_empty(&vault));
}

#[tokio::test]
async fn a_refusal_by_the_library_leaves_nothing_behind() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/opera.pdf"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;
    let url = format!("{}/opera.pdf", server.uri());
    let vault = temp_dir("rifiuto");
    let engine = engine_with(temp_db("rifiuto", &url), vault.clone());

    engine.submit(&pdf_job(&url)).await.unwrap();
    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Error);
    assert!(!document_path(&vault).exists());
    assert!(staging_is_empty(&vault));
}

/// Rilanciare dopo un guasto rifà lo scaricamento da capo — mezzo documento non
/// serve a niente — e questa volta lo porta a casa.
#[tokio::test]
async fn a_failed_download_can_be_redone_from_scratch() {
    let server = MockServer::start().await;
    let bytes = pdf_bytes();
    Mock::given(method("GET"))
        .and(path("/opera.pdf"))
        .respond_with(ResponseTemplate::new(500))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/opera.pdf"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(bytes.clone()))
        .mount(&server)
        .await;
    let url = format!("{}/opera.pdf", server.uri());
    let vault = temp_dir("ripresa");
    let engine = engine_with(temp_db("ripresa", &url), vault.clone());

    engine.submit(&pdf_job(&url)).await.unwrap();
    let first = run_until_terminal(&engine).await;
    assert_eq!(first.status, JobStatus::Error);
    assert!(!document_path(&vault).exists());

    engine
        .relaunch_with_config(JOB_ID, &pdf_job(&url).config)
        .await
        .unwrap();
    let second = run_until_terminal(&engine).await;

    assert_eq!(second.status, JobStatus::Completed);
    assert_eq!(
        std::fs::read(document_path(&vault)).expect("il PDF è nel deposito"),
        bytes
    );
    assert!(staging_is_empty(&vault));
}
