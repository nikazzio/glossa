//! Prove sul lavoro di ottimizzazione dentro la coda.
//!
//! I test in `mod.rs` guardano le funzioni una per una — la previsione, una
//! pagina ridotta, una copiata così com'è. Qui gira il lavoro vero: la coda lo
//! fa partire, il gestore cammina la cartella di partenza e scrive quella
//! d'arrivo, pausa e ripresa passano dai flag cooperativi. Non serve nessuna
//! biblioteca finta, perché l'ottimizzazione non chiede niente a nessuno:
//! legge pagine già sul disco e ne scrive di nuove accanto.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rusqlite::Connection;

use crate::db::DbWriteCoordinator;
use crate::jobs::engine::{JobEngine, Observer};
use crate::jobs::store::{self, NewJob};
use crate::jobs::{JobRecord, JobStatus};

use super::{ImageOptimizationJob, JOB_TYPE};

const VERSION_ID: &str = "sver-prova";
const JOB_ID: &str = "optimize:sver-prova:800";
const PROVIDER: &str = "archive_org";
const SOURCE_SIZE_TAG: &str = "2000";
const TARGET_SIZE_TAG: &str = "800";

/// Un JPEG vero delle dimensioni chieste: il lavoro decodifica e ricomprime, e
/// un JPEG finto lo farebbe fallire per il motivo sbagliato.
fn jpeg(width: u32, height: u32) -> Vec<u8> {
    let mut pixels = image::RgbImage::new(width, height);
    for (x, y, pixel) in pixels.enumerate_pixels_mut() {
        *pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 128]);
    }
    let mut raw = Vec::new();
    image::DynamicImage::ImageRgb8(pixels)
        .write_to(
            &mut std::io::Cursor::new(&mut raw),
            image::ImageFormat::Jpeg,
        )
        .expect("codifica");
    raw
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("glossa_optimize_it_{name}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("cartella");
    dir
}

/// Un deposito con `pages` pagine da 1600×2000 nella cartella di misura
/// **di partenza**.
fn vault_with(name: &str, pages: u32) -> PathBuf {
    let root = temp_dir(name);
    std::fs::create_dir_all(source_dir(&root)).expect("cartella di misura");
    for index in 1..=pages {
        std::fs::write(
            source_dir(&root).join(format!("{index:04}.jpg")),
            jpeg(1600, 2000),
        )
        .expect("pagina");
    }
    root
}

fn source_dir(root: &Path) -> PathBuf {
    root.join("providers")
        .join(PROVIDER)
        .join(VERSION_ID)
        .join("pages")
        .join(SOURCE_SIZE_TAG)
}

/// Dove il lavoro scrive: mai la cartella di partenza.
fn derived_dir(root: &Path) -> PathBuf {
    root.join("derived")
        .join(PROVIDER)
        .join(VERSION_ID)
        .join(TARGET_SIZE_TAG)
}

fn staging_dir(root: &Path) -> PathBuf {
    root.join("staging")
        .join(format!("{VERSION_ID}-optimize-{TARGET_SIZE_TAG}"))
}

fn temp_db(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("glossa_optimize_it_{name}.db"));
    for candidate in [
        path.clone(),
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
    ] {
        let _ = std::fs::remove_file(candidate);
    }
    let conn = Connection::open(&path).expect("database");
    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .expect("chiavi");
    conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))
        .expect("migrazione");
    conn.execute(
        "INSERT INTO sources (id, title, kind) VALUES ('src-prova', 'Opera di prova', 'print')",
        [],
    )
    .expect("opera");
    conn.execute(
        "INSERT INTO source_versions (id, source_id, label, version_kind) \
         VALUES (?1, 'src-prova', 'Prova', 'iiif_manifest')",
        rusqlite::params![VERSION_ID],
    )
    .expect("digitalizzazione");
    path
}

fn engine_with(db: PathBuf, vault: PathBuf) -> Arc<JobEngine> {
    let mut engine = JobEngine::new(db, Observer::silent(), DbWriteCoordinator::default(), vault);
    engine.register(JOB_TYPE, Arc::new(ImageOptimizationJob));
    engine.load_limits().expect("limiti");
    Arc::new(engine)
}

fn optimize_job() -> NewJob {
    NewJob {
        id: JOB_ID.to_string(),
        job_type: JOB_TYPE.to_string(),
        priority: 5,
        config: serde_json::json!({
            "providerKey": PROVIDER,
            "versionId": VERSION_ID,
            "sourceSizeTag": SOURCE_SIZE_TAG,
            "targetSizeTag": TARGET_SIZE_TAG,
            "longEdge": 800,
            "quality": 82,
        })
        .to_string(),
        max_attempts: 1,
        depends_on_job_id: None,
        workspace_id: None,
        // Il nome lo mette il comando di messa in coda: qui si simula, perché la
        // prova è che il lavoro non lo cancelli mentre gira né alla fine.
        message: Some("Opera di prova".to_string()),
    }
}

/// Gira la coda finché il lavoro arriva a un capolinea, con un limite di tempo:
/// un test che si blocca deve dirlo invece di passare.
async fn run_until_terminal(engine: &Arc<JobEngine>) -> JobRecord {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        engine.tick().await.expect("giro di coda");
        tokio::time::sleep(Duration::from_millis(20)).await;
        let conn = engine.connection().expect("connessione");
        let record = store::get(&conn, JOB_ID)
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

fn page_bytes(dir: &Path, index: u32) -> u64 {
    std::fs::metadata(dir.join(format!("{index:04}.jpg")))
        .expect("pagina")
        .len()
}

#[tokio::test]
async fn the_job_writes_every_page_shrunk_into_the_derived_folder() {
    let root = vault_with("intero", 3);
    let source_before: Vec<u64> = (1..=3)
        .map(|index| page_bytes(&source_dir(&root), index))
        .collect();
    let engine = engine_with(temp_db("intero"), root.clone());
    engine.submit(&optimize_job()).await.expect("in coda");

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    // Il nome messo in coda deve arrivare fino alla fine: le scritture
    // dell'avanzamento e quella della chiusura non ne mandano uno nuovo, e senza
    // COALESCE lo cancellavano — la sezione «terminati oggi» diventava un elenco
    // di righe identiche.
    assert_eq!(record.message.as_deref(), Some("Opera di prova"));
    assert!(record.eta_seconds.is_some(), "e una stima del tempo");
    // La cartella di partenza non cambia mai: è la ragione stessa della copia
    // a parte, non solo un dettaglio d'implementazione.
    for index in 1..=3 {
        assert_eq!(
            page_bytes(&source_dir(&root), index),
            source_before[index as usize - 1],
            "pagina {index} della fonte intatta"
        );
        assert!(
            page_bytes(&derived_dir(&root), index) < source_before[index as usize - 1],
            "pagina {index} ridotta nella copia"
        );
    }
    // Ogni pagina lascia la sua riga con l'impronta dei byte nuovi: senza, la
    // verifica completa confronterebbe l'impronta di byte che non esistono più.
    let rows = crate::download::sidecar::read(&derived_dir(&root));
    assert_eq!(rows.len(), 3);
    assert!(rows.values().all(|row| row.checksum.is_some()));

    let _ = std::fs::remove_dir_all(&root);
}

#[tokio::test]
async fn running_it_twice_does_nothing_the_second_time() {
    let root = vault_with("due-volte", 2);
    let engine = engine_with(temp_db("due-volte"), root.clone());
    engine.submit(&optimize_job()).await.expect("in coda");
    run_until_terminal(&engine).await;
    let after_first = (
        page_bytes(&derived_dir(&root), 1),
        page_bytes(&derived_dir(&root), 2),
    );

    // Lo stesso lavoro, di nuovo: le pagine sono già nella cartella d'arrivo,
    // e non c'è motivo di rileggerle e riscriverle.
    engine
        .forget_finished(Some(JOB_ID))
        .await
        .expect("via il lavoro finito");
    engine.submit(&optimize_job()).await.expect("in coda");
    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    assert_eq!(
        (
            page_bytes(&derived_dir(&root), 1),
            page_bytes(&derived_dir(&root), 2)
        ),
        after_first,
        "nessun byte toccato al secondo giro"
    );
    // E nessuna riga in più: una pagina già presente non ne scrive un'altra.
    let rows = crate::download::sidecar::read(&derived_dir(&root));
    assert_eq!(rows.len(), 2);

    let _ = std::fs::remove_dir_all(&root);
}

#[tokio::test]
async fn an_unreadable_page_is_visible_and_the_job_does_not_claim_success() {
    let root = vault_with("pagina-illeggibile", 1);
    std::fs::write(source_dir(&root).join("0002.jpg"), b"not an image").unwrap();
    let engine = engine_with(temp_db("pagina-illeggibile"), root.clone());
    engine.submit(&optimize_job()).await.expect("in coda");

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Error);
    let detail: serde_json::Value =
        serde_json::from_str(record.detail.as_deref().unwrap()).unwrap();
    assert_eq!(detail["skipped"], 1);

    let _ = std::fs::remove_dir_all(&root);
}

#[tokio::test]
async fn a_paused_job_leaves_no_page_half_written_and_resumes() {
    let root = vault_with("pausa", 4);
    let engine = engine_with(temp_db("pausa"), root.clone());
    engine.submit(&optimize_job()).await.expect("in coda");
    engine.tick().await.expect("partenza");
    // La pausa arriva mentre il lavoro cammina: è cooperativa, quindi coglie
    // il lavoro fra il dispacciare una pagina e la prossima, non a metà di una
    // scrittura — quante pagine siano già promosse a quel punto dipende da
    // quanti nuclei le hanno lavorate insieme, e non è quello che si controlla
    // qui.
    engine.request_pause(JOB_ID).await.expect("pausa");

    let paused = loop {
        let conn = engine.connection().expect("connessione");
        let record = store::get(&conn, JOB_ID).expect("lettura").expect("c'è");
        if record.status == JobStatus::Paused {
            break record;
        }
        drop(conn);
        engine.tick().await.expect("giro");
        tokio::time::sleep(Duration::from_millis(20)).await;
    };
    assert_eq!(paused.status, JobStatus::Paused);
    // Niente in transito: quello che l'area di transito conteneva è stato
    // buttato, e ogni pagina già promossa nella cartella d'arrivo è intera.
    assert!(
        !staging_dir(&root).is_dir()
            || std::fs::read_dir(staging_dir(&root))
                .unwrap()
                .next()
                .is_none(),
        "area di transito vuota dopo la pausa"
    );
    if let Ok(entries) = std::fs::read_dir(derived_dir(&root)) {
        for entry in entries.flatten().filter(|entry| entry.path().is_file()) {
            if entry.file_name() == "pages.jsonl" {
                continue;
            }
            let bytes = entry.metadata().unwrap().len();
            assert!(bytes > 0, "{:?} intera, non a metà", entry.path());
        }
    }

    engine.resume(JOB_ID).await.expect("ripresa");
    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    let rows = crate::download::sidecar::read(&derived_dir(&root));
    assert_eq!(rows.len(), 4, "le quattro pagine hanno la loro riga");

    let _ = std::fs::remove_dir_all(&root);
}
