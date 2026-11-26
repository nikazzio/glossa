//! Prove dell'estrazione: funzioni una per una e il lavoro vero nella coda.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rusqlite::Connection;

use super::render::tests::tiny_pdf;
use super::*;
use crate::db::DbWriteCoordinator;
use crate::jobs::engine::{JobEngine, Observer};
use crate::jobs::store::{self, NewJob};
use crate::jobs::{JobRecord, JobStatus};

const PROVIDER: &str = "local_import";
const PDF_VERSION: &str = "sver-pdf";
const IMAGE_VERSION: &str = "sver-pdf-img";

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("glossa_pdfpages_{name}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("cartella");
    dir
}

fn config() -> ExtractConfig {
    ExtractConfig {
        provider_key: PROVIDER.to_string(),
        pdf_version_id: PDF_VERSION.to_string(),
        image_version_id: IMAGE_VERSION.to_string(),
    }
}

/// Un deposito con il PDF di `pages` pagine nella cartella della copia PDF.
fn vault_with_pdf(name: &str, pages: usize) -> PathBuf {
    let root = temp_dir(name);
    let document = root.join(layout::document_path(PROVIDER, PDF_VERSION).expect("percorso"));
    std::fs::create_dir_all(document.parent().expect("cartella")).expect("cartella");
    std::fs::write(&document, tiny_pdf(pages)).expect("pdf");
    root
}

fn manifest_page(index: u32, label: &str) -> crate::download::manifest::Page {
    let mut parsed = crate::download::manifest::parse(
        generated_manifest(
            "v",
            1,
            &BTreeMap::new(),
            &BTreeMap::from([(1, label.to_string())]),
        )
        .to_string()
        .as_bytes(),
    )
    .expect("manifesto");
    let mut page = parsed.pages.remove(0);
    page.index = index;
    page
}

#[test]
fn labels_are_used_only_when_the_page_counts_match() {
    let pages = vec![manifest_page(1, "1r"), manifest_page(2, "1v")];
    assert_eq!(
        labels_if_counts_match(pages.clone(), 2)
            .get(&2)
            .map(String::as_str),
        Some("1v")
    );
    assert!(labels_if_counts_match(pages, 3).is_empty());
}

#[test]
fn the_generated_manifest_reads_back_with_one_local_page_per_pdf_page() {
    let records = BTreeMap::from([(
        1,
        PageRecord {
            index: 1,
            label: None,
            got: Some((800, 1200)),
            bytes: Some(1),
            checksum: None,
            at: 0,
            note: None,
        },
    )]);
    let labels = BTreeMap::from([(2, "f. 1v".to_string())]);
    let manifest = generated_manifest(IMAGE_VERSION, 2, &records, &labels);

    let parsed = crate::download::manifest::parse(manifest.to_string().as_bytes())
        .expect("il manifesto generato si rilegge");
    assert_eq!(parsed.pages.len(), 2);
    assert_eq!(parsed.pages[0].size, Some((800, 1200)));
    assert_eq!(parsed.pages[0].label.as_deref(), Some("1"));
    // La pagina non estratta tiene il suo posto con le misure della vicina.
    assert_eq!(parsed.pages[1].size, Some((800, 1200)));
    assert_eq!(parsed.pages[1].label.as_deref(), Some("f. 1v"));
    assert!(parsed
        .pages
        .iter()
        .all(|page| is_import_url(&page.image_service)));
}

#[test]
fn a_page_beyond_the_document_fails_without_writing_anything() {
    let root = vault_with_pdf("oltre", 1);
    let paths = Paths::new(&root, &config()).expect("percorsi");
    let pdf = render::open(tiny_pdf(1)).expect("pdf");

    let result = extract_one(
        &pdf,
        &paths,
        &Page {
            index: 2,
            label: None,
        },
    );

    assert!(result.is_err());
    assert!(!paths.size_dir.join("0002.jpg").exists());
}

fn temp_db(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("glossa_pdfpages_{name}.db"));
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
    let conn = Connection::open(&path).expect("database");
    conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))
        .expect("migrazione");
    conn.execute(
        "INSERT INTO sources (id, title, kind) VALUES ('src-prova', 'Opera importata', 'print')",
        [],
    )
    .expect("opera");
    conn.execute(
        "INSERT INTO source_versions (id, source_id, label, version_kind, is_primary) \
         VALUES (?1, 'src-prova', 'primary', 'pdf', 1), \
                (?2, 'src-prova', 'pdf_pages', 'iiif_manifest', 0)",
        rusqlite::params![PDF_VERSION, IMAGE_VERSION],
    )
    .expect("copie");
    path
}

fn engine_with(db: PathBuf, vault: PathBuf) -> Arc<JobEngine> {
    let mut engine = JobEngine::new(db, Observer::silent(), DbWriteCoordinator::default(), vault);
    engine.register(JOB_TYPE, Arc::new(PdfPageExtractionJob));
    engine.load_limits().expect("limiti");
    Arc::new(engine)
}

fn extraction_job() -> NewJob {
    NewJob {
        id: job_id(PDF_VERSION),
        job_type: JOB_TYPE.to_string(),
        priority: 5,
        config: serde_json::json!({
            "providerKey": PROVIDER,
            "pdfVersionId": PDF_VERSION,
            "imageVersionId": IMAGE_VERSION,
        })
        .to_string(),
        max_attempts: 1,
        depends_on_job_id: None,
        workspace_id: None,
        message: Some("Opera importata".to_string()),
    }
}

async fn run_until_terminal(engine: &Arc<JobEngine>) -> JobRecord {
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        engine.tick().await.expect("giro di coda");
        tokio::time::sleep(Duration::from_millis(20)).await;
        let conn = engine.connection().expect("connessione");
        let record = store::get(&conn, &job_id(PDF_VERSION))
            .expect("lettura")
            .expect("il lavoro c'è");
        if record.status.is_terminal() {
            return record;
        }
        assert!(
            Instant::now() < deadline,
            "il lavoro non finisce: {record:?}"
        );
    }
}

fn size_dir(root: &Path) -> PathBuf {
    root.join(layout::pages_dir(PROVIDER, IMAGE_VERSION).expect("percorso"))
        .join(SIZE_TAG)
}

#[tokio::test]
async fn the_job_draws_every_page_with_thumbnails_manifest_and_expected_count() {
    let root = vault_with_pdf("intero", 3);
    let db = temp_db("intero");
    let engine = engine_with(db.clone(), root.clone());
    engine.submit(&extraction_job()).await.expect("in coda");

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    let records = sidecar::read(&size_dir(&root));
    assert_eq!(records.len(), 3);
    for index in 1..=3u32 {
        assert!(size_dir(&root)
            .join(layout::page_file_name(index))
            .is_file());
        assert!(root
            .join(layout::thumbnail_path(PROVIDER, IMAGE_VERSION, index).expect("percorso"))
            .is_file());
    }
    let manifest =
        std::fs::read(root.join(layout::manifest_path(PROVIDER, IMAGE_VERSION).expect("percorso")))
            .expect("manifesto scritto");
    assert_eq!(
        crate::download::manifest::parse(&manifest)
            .expect("rilegge")
            .pages
            .len(),
        3
    );
    let expected: i64 = Connection::open(&db)
        .expect("db")
        .query_row(
            "SELECT expected_asset_count FROM source_versions WHERE id = ?1",
            [IMAGE_VERSION],
            |row| row.get(0),
        )
        .expect("conteggio");
    assert_eq!(expected, 3);
}

#[tokio::test]
async fn a_relaunched_job_keeps_the_pages_already_extracted() {
    let root = vault_with_pdf("ripresa", 2);
    // La pagina 1 è già nel deposito da un giro precedente, con la sua riga.
    std::fs::create_dir_all(size_dir(&root)).expect("cartella");
    let earlier =
        render::render_page(&render::open(tiny_pdf(2)).expect("pdf"), 0, 40).expect("pagina");
    std::fs::write(size_dir(&root).join("0001.jpg"), &earlier.jpeg).expect("pagina");
    sidecar::append(
        &size_dir(&root),
        &PageRecord {
            index: 1,
            label: None,
            got: Some((earlier.width, earlier.height)),
            bytes: Some(earlier.jpeg.len() as u64),
            checksum: None,
            at: 0,
            note: None,
        },
    )
    .expect("riga");
    let engine = engine_with(temp_db("ripresa"), root.clone());
    engine.submit(&extraction_job()).await.expect("in coda");

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    assert_eq!(
        std::fs::read(size_dir(&root).join("0001.jpg")).expect("pagina"),
        earlier.jpeg,
        "la pagina già estratta non si ridisegna"
    );
    assert!(size_dir(&root).join("0002.jpg").is_file());
}
