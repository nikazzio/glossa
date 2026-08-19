//! Prove sul ciclo completo dello scaricamento, contro una biblioteca finta.
//!
//! I test in `handler.rs`, `sizing.rs` e `sidecar.rs` guardano le funzioni una
//! per una. Qui gira il lavoro vero — coda, manifesto, deposito, file di lato —
//! perché i comportamenti che il piano §5.1-§5.4 descrive vivono nel *ciclo*:
//! una pagina che manca, una misura rifiutata, una ripresa che non richiede
//! quello che c'è già.

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

/// Manifesto Presentation 3 con `pages` pagine, tutte 2000×3000.
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

/// Quante volte è stato chiesto un descrittore: uno per libro, non uno per
/// pagina (§5.9).
async fn descriptor_requests(server: &MockServer) -> usize {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|request| request.url.path().ends_with("/info.json"))
        .count()
}

/// Le righe del file di lato di una cartella di misura.
fn sidecar_records(vault: &Path) -> std::collections::BTreeMap<u32, super::sidecar::PageRecord> {
    super::sidecar::read(
        &vault
            .join("providers/prova")
            .join(VERSION_ID)
            .join("pages")
            .join(SIZE_TAG),
    )
}

/// Quante immagini sono state chieste, descrittori esclusi.
async fn image_requests(server: &MockServer) -> usize {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|request| request.url.path().contains("/full/"))
        .count()
}

#[tokio::test]
async fn a_page_the_library_does_not_have_does_not_take_the_book_away() {
    // Un 404 non è ritentabile: se facesse fallire il lavoro, quel libro non
    // sarebbe scaricabile mai (fatto 7).
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
    assert_eq!(pages_on_disk(&vault), 3, "due pagine più il file di lato");
    // La pagina non servita lascia la sua riga: è ciò che permette
    // all'inventario di dire la verità e alla ripresa di non richiederla.
    let records = sidecar_records(&vault);
    assert!(records[&2].is_missing());
    assert!(records[&1].checksum.is_some());

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn a_page_that_keeps_failing_does_not_leave_the_book_truncated() {
    // Un 5xx che non passa nemmeno all'ultimo tentativo: prima si pagano le
    // attese del profilo, poi si prova la dimensione piena per quella pagina, e
    // se non basta si salta e si va avanti. Senza questo il ciclo ricadeva sulla
    // stessa pagina a ogni ripresa e le successive non arrivavano mai (§5.1).
    let server = MockServer::start().await;
    mount_manifest(&server, 3).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/2/full/.*"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg()))
        .mount(&server)
        .await;

    let vault = temp_dir("testarda_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("testarda", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    // Prima di saltarla il lavoro ha speso tutti i suoi tentativi: la pagina si
    // salta perché non c'è più nessuna ripresa, non al primo singhiozzo.
    assert_eq!(record.attempt_count, 2);
    assert_eq!(pages_on_disk(&vault), 3, "due pagine più il file di lato");
    let records = sidecar_records(&vault);
    // **Nessuna riga per la pagina guasta**: «non servita dalla biblioteca» è una
    // dichiarazione della biblioteca, e un guasto non è quello. Con la riga, la
    // ripresa l'avrebbe saltata per una settimana.
    assert!(
        !records.contains_key(&2),
        "un guasto non lascia niente scritto"
    );
    assert!(records[&3].checksum.is_some(), "e quella dopo è arrivata");

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn a_network_that_is_down_does_not_make_a_book_unreachable_for_a_week() {
    // La rete cade a metà lavoro: **nessuna** pagina arriva. Se ognuna lasciasse
    // la sua riga «non servita», per sette giorni ogni ripresa le salterebbe
    // tutte e morirebbe subito, e l'unica via d'uscita sarebbe «libera spazio»,
    // che porta via anche le pagine buone.
    let server = MockServer::start().await;
    mount_manifest(&server, 3).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;

    let vault = temp_dir("rete_giu_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("rete_giu", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Error);
    // Un guasto è ritentabile: dichiararlo «la biblioteca non ha servito nessuna
    // pagina» lo rendeva definitivo.
    assert_eq!(record.error_kind.as_deref(), Some("transport"));
    assert!(
        sidecar_records(&vault).is_empty(),
        "niente da saltare alla prossima ripresa"
    );

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn a_book_the_library_serves_no_page_of_is_not_a_success() {
    let server = MockServer::start().await;
    mount_manifest(&server, 2).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;

    let vault = temp_dir("vuoto_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("vuoto", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();

    let record = run_until_terminal(&engine).await;

    // La condizione si legge sulla cartella: nessuna pagina, nessun libro.
    assert_eq!(record.status, JobStatus::Error, "{:?}", record.error);

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn a_refused_size_switches_the_rest_of_the_book_to_the_full_size() {
    // 400 e 501 sono rifiuti **della misura** (§5.1): si smette di calcolare e
    // si passa alla dimensione piena, riducendo in casa. Un rifiuto buttato
    // invece di trecento.
    let server = MockServer::start().await;
    mount_manifest(&server, 3).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/max/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg()))
        .mount(&server)
        .await;
    // Qualunque larghezza calcolata viene rifiutata.
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/\d+,/.*"))
        .respond_with(ResponseTemplate::new(400))
        .mount(&server)
        .await;

    let vault = temp_dir("ripiego_vault");
    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("ripiego", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    // Tre pagine più il file di lato.
    assert_eq!(pages_on_disk(&vault), 4);
    // Il rifiuto si paga una volta sola: dalla seconda pagina in poi si chiede
    // direttamente la dimensione piena.
    let refused = server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|request| {
            request.url.path().contains("/full/") && !request.url.path().contains("/full/max/")
        })
        .count();
    assert_eq!(refused, 1, "un rifiuto buttato, non tre");

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn a_resumed_download_does_not_ask_again_for_what_is_already_on_disk() {
    // Non c'è più un punto salvato: riprendere significa rileggere la cartella
    // (§5.3).
    let server = MockServer::start().await;
    mount_manifest(&server, 3).await;
    mount_descriptors(&server).await;
    Mock::given(method("GET"))
        .and(path_regex(r"^/img/\d+/full/.*"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(jpeg()))
        .mount(&server)
        .await;

    let vault = temp_dir("ripresa_vault");
    let pages = vault
        .join("providers/prova")
        .join(VERSION_ID)
        .join("pages")
        .join(SIZE_TAG);
    std::fs::create_dir_all(&pages).unwrap();
    for index in 1..=2 {
        std::fs::write(pages.join(format!("{index:04}.jpg")), jpeg()).unwrap();
    }

    let manifest_url = format!("{}/manifest.json", server.uri());
    let engine = engine_with(temp_db("ripresa", &manifest_url), vault.clone());
    engine.submit(&download_job(&manifest_url)).await.unwrap();

    let record = run_until_terminal(&engine).await;

    assert_eq!(record.status, JobStatus::Completed, "{:?}", record.error);
    assert_eq!(
        image_requests(&server).await,
        1,
        "solo la pagina che mancava"
    );

    let _ = std::fs::remove_dir_all(&vault);
}

#[tokio::test]
async fn the_descriptor_is_read_once_for_the_whole_book() {
    // La misura si calcola; il descrittore serve solo a decidere **come**
    // calcolarla, e una lettura per libro basta (§5.9).
    let server = MockServer::start().await;
    mount_manifest(&server, 5).await;
    mount_descriptors(&server).await;
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
    assert_eq!(
        descriptor_requests(&server).await,
        1,
        "una lettura, non cinque"
    );

    let _ = std::fs::remove_dir_all(&vault);
}
