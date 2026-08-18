//! Prove sul ciclo completo dello scaricamento, con una biblioteca finta.
//!
//! I test in `handler.rs` guardano le funzioni una per una. Qui gira il lavoro
//! vero — coda, manifesto, negoziazione, deposito, punto salvato — perché i tre
//! difetti che questo modulo chiude vivono nel *ciclo*, non in una funzione: una
//! carta che manca, un descrittore che non risponde, una ripresa che rinegozia.
//! Nessuno dei tre si vede provando una funzione da sola.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use wiremock::matchers::{method, path, path_regex};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::db::DbWriteCoordinator;
use crate::jobs::engine::{JobEngine, Observer};
use crate::jobs::store::{self, NewJob};
use crate::jobs::{JobRecord, JobStatus};

use super::courtesy::Courtesy;
use super::handler::{SourceDownloadJob, JOB_TYPE};

const VERSION_ID: &str = "sver-prova";
const JOB_ID: &str = "download:sver-prova";
const SIZE_TAG: &str = "2000";
/// Il profilo della biblioteca finta: nessuna pausa, perché la cortesia è
/// provata altrove e qui allungherebbe soltanto i test.
const INSTANT_PROFILE: &str = r#"{
  "pauseMinMs": 0, "pauseMaxMs": 0, "burstRequests": 1000, "burstWindowSecs": 1,
  "cooldown403Secs": 1, "cooldown429Secs": 1, "hostConcurrency": 1,
  "maxAttempts": 2, "backoffBaseSecs": 1, "backoffCapSecs": 1,
  "connectTimeoutSecs": 2, "readTimeoutSecs": 2, "needsViewerWarmup": false
}"#;

/// Un JPEG minimo ma **intero**: inizio e fine ci sono, quindi la validazione
/// dell'area di transito lo promuove (D16-bis). Non si decodifica, e va bene:
/// la miniatura che non si ricava è un avviso, non un errore.
fn jpeg() -> Vec<u8> {
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
    bytes.extend_from_slice(&[0u8; 64]);
    bytes.extend_from_slice(&[0xFF, 0xD9]);
    bytes
}

/// Manifesto Presentation 3 con `pages` carte, **tutte delle stesse
/// dimensioni**: un gruppo solo, quindi una lettura sola del descrittore. È la
/// forma che rende visibile una rinegoziazione di troppo.
fn manifest(server: &str, pages: u32) -> String {
    let canvases: Vec<String> = (1..=pages)
        .map(|index| {
            format!(
                r#"{{"label":{{"none":["c. {index}"]}},"width":2000,"height":3000,
                   "items":[{{"items":[{{"body":{{"service":[{{"id":"{server}/img/{index}"}}]}}}}]}}]}}"#
            )
        })
        .collect();
    format!(r#"{{"items":[{}]}}"#, canvases.join(","))
}

/// Descrittore che dichiara due misure: con il tetto a 2000 il lato lungo più
/// vicino è 1500, cioè la larghezza 1000.
const INFO_JSON: &str = r#"{"width":2000,"height":3000,
  "sizes":[{"width":1000,"height":1500},{"width":2000,"height":3000}]}"#;

fn temp_dir(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("glossa_download_it_{name}"));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).unwrap();
    path
}

/// Database con lo schema vero, l'opera in Biblioteca e il profilo istantaneo.
fn temp_db(name: &str, manifest_url: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("glossa_download_it_{name}.db"));
    let _ = std::fs::remove_file(&path);
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    for migration in [
        include_str!("../../migrations/0001_baseline_2_0.sql"),
        include_str!("../../migrations/0002_workspace_icon_key.sql"),
        include_str!("../../migrations/0003_vault_and_read_mode.sql"),
        include_str!("../../migrations/0004_jobs_runtime.sql"),
        include_str!("../../migrations/0005_job_phase.sql"),
        include_str!("../../migrations/0006_job_detail.sql"),
        include_str!("../../migrations/0007_download_policy.sql"),
        include_str!("../../migrations/0008_provenance_foundation.sql"),
        include_str!("../../migrations/0009_network_profiles.sql"),
        include_str!("../../migrations/0010_transcription_revisions_events.sql"),
        include_str!("../../migrations/0011_workspace_items.sql"),
    ] {
        conn.execute_batch(migration).expect("migration applies");
    }
    conn.execute(
        "INSERT INTO sources (id, title, kind) VALUES ('src-prova', 'Opera di prova', 'print')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO source_versions (id, source_id, label, version_kind, source_url) \
         VALUES (?1, 'src-prova', 'Prova', 'iiif_manifest', ?2)",
        rusqlite::params![VERSION_ID, manifest_url],
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
        Arc::new(SourceDownloadJob::new(Arc::new(Courtesy::new()))),
    );
    engine.load_limits().expect("limiti");
    Arc::new(engine)
}

fn download_job(manifest_url: &str) -> NewJob {
    NewJob {
        id: JOB_ID.to_string(),
        job_type: JOB_TYPE.to_string(),
        priority: 10,
        config: serde_json::json!({
            "providerKey": "prova",
            "versionId": VERSION_ID,
            "manifestUrl": manifest_url,
            "sizeTag": SIZE_TAG,
            "thumbnailEdge": 300,
        })
        .to_string(),
        max_attempts: 2,
        depends_on_job_id: None,
        workspace_id: None,
        message: None,
    }
}

/// Gira la coda finché il lavoro arriva a un capolinea. Un limite di tempo
/// invece di un numero di giri: un test che finisce presto non deve aspettare,
/// e uno che si blocca deve dirlo invece di passare.
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
            "il lavoro non è arrivato a un capolinea: {:?} al {:.0}%",
            record.status,
            record.progress * 100.0
        );
    }
}

fn pages_on_disk(vault: &Path) -> usize {
    let dir = vault
        .join("providers/prova")
        .join(VERSION_ID)
        .join("pages")
        .join(SIZE_TAG);
    std::fs::read_dir(dir)
        .map(|entries| entries.count())
        .unwrap_or(0)
}

fn recorded_pages(engine: &Arc<JobEngine>) -> i64 {
    let conn = engine.connection().unwrap();
    conn.query_row(
        "SELECT COUNT(*) FROM assets WHERE source_version_id = ?1 AND kind = 'image'",
        rusqlite::params![VERSION_ID],
        |row| row.get(0),
    )
    .unwrap()
}

async fn mount_manifest(server: &MockServer, pages: u32) {
    Mock::given(method("GET"))
        .and(path("/manifest.json"))
        .respond_with(ResponseTemplate::new(200).set_body_string(manifest(&server.uri(), pages)))
        .mount(server)
        .await;
}

async fn mount_descriptors(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/info\.json$"))
        .respond_with(ResponseTemplate::new(200).set_body_string(INFO_JSON))
        .mount(server)
        .await;
}

/// Quante volte è stato chiesto un descrittore. È il numero che dice se una
/// ripresa ha rinegoziato.
async fn descriptor_requests(server: &MockServer) -> usize {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|request| request.url.path().ends_with("/info.json"))
        .count()
}

#[tokio::test]
async fn a_page_the_library_does_not_have_does_not_take_the_book_away() {
    // Prima un 404 su una carta faceva fallire il lavoro, e rilanciarlo tornava
    // a morire sulla stessa carta: un libro con una pagina mancante non era
    // scaricabile **mai**. Adesso la carta si segna come fatta e si va avanti.
    let server = MockServer::start().await;
    mount_manifest(&server, 3).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/2/full/.*"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg()))
        .mount(&server)
        .await;

    let vault = temp_dir("mancante_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("mancante", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    assert_eq!(recorded_pages(&engine), 2, "le due carte che esistono");
    assert_eq!(pages_on_disk(&vault), 2);
    // Il punto salvato conta le carte **fatte**, saltata compresa: altrimenti
    // ogni ripresa tornerebbe a bussare alla carta che non c'è (D13).
    assert!(record.checkpoint.unwrap().contains(r#""done":3"#));

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn a_descriptor_that_does_not_answer_does_not_take_the_book_away() {
    // Il caso visto sul campo: `info.json` di una singola carta non rispondeva e
    // portava via il libro intero, due volte, al 47% e al 48%. Un descrittore
    // *illeggibile* ripiegava già sul riquadro; uno *non arrivato* no.
    let server = MockServer::start().await;
    mount_manifest(&server, 2).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/info\.json$"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg()))
        .mount(&server)
        .await;

    let vault = temp_dir("descrittore_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("descrittore", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    assert_eq!(recorded_pages(&engine), 2);
    // Si è ripiegato sul riquadro, che non ingrandisce mai: non su una
    // larghezza inventata.
    let asked: Vec<String> = server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .map(|request| request.url.path().to_string())
        .filter(|path| path.contains("/full/"))
        .collect();
    assert!(
        asked.iter().all(|path| path.contains("/full/!2000,2000/")),
        "misure chieste: {asked:?}"
    );

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn a_resumed_download_does_not_negotiate_the_size_again() {
    // Le misure stavano solo in memoria: ogni ripresa le richiedeva da capo. Sul
    // campo, 70 letture del descrittore per 39 gruppi distinti sullo stesso
    // libro, dove D4 prevede una lettura per gruppo.
    let server = MockServer::start().await;
    mount_manifest(&server, 4).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg()))
        .mount(&server)
        .await;

    let vault = temp_dir("ripresa_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let db = temp_db("ripresa", &manifest_url);
    let engine = engine_with(db, vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();
    // Il punto da cui riprende: due carte fatte e la misura del loro gruppo già
    // decisa, come l'avrebbe lasciato una pausa.
    {
        let conn = engine.connection().unwrap();
        store::save_checkpoint(&conn, JOB_ID, r#"{"done":2,"sizes":{"2000x3000":"1000,"}}"#)
            .unwrap();
    }

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    assert_eq!(
        descriptor_requests(&server).await,
        0,
        "nessuna rinegoziazione"
    );
    assert_eq!(
        recorded_pages(&engine),
        2,
        "solo le due carte che mancavano"
    );

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn without_a_remembered_size_the_resume_asks_the_descriptor_once() {
    // Il contrario del test sopra: senza le misure nel punto salvato la lettura
    // del descrittore ci vuole. Serve a dimostrare che l'altro test misura
    // qualcosa — con lo stesso apparecchio, la differenza è solo il punto
    // salvato.
    let server = MockServer::start().await;
    mount_manifest(&server, 4).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg()))
        .mount(&server)
        .await;

    let vault = temp_dir("ripresa_vuota_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("ripresa_vuota", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();
    {
        let conn = engine.connection().unwrap();
        store::save_checkpoint(&conn, JOB_ID, r#"{"done":2}"#).unwrap();
    }

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    assert_eq!(descriptor_requests(&server).await, 1, "una per gruppo");
    // E la misura negoziata finisce nel punto salvato, per la prossima ripresa.
    assert!(record
        .checkpoint
        .unwrap()
        .contains(r#""2000x3000":"1000,""#));

    let _ = std::fs::remove_dir_all(&vault);
}
