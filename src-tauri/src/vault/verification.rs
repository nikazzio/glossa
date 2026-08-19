//! La verifica del deposito come lavoro (D5-bis; D5 modificata dal §5.4).
//!
//! **Il disco è la verità**: l'elenco da controllare si ricava camminando le
//! cartelle di misura, non interrogando il database. Le impronte stanno nel file
//! di lato di ogni cartella (`download::sidecar`).
//!
//! Un file **senza la sua riga** nel file di lato è una pagina presente di cui
//! non si conosce l'impronta: la verifica rapida la vede, la completa la salta e
//! **non** la dichiara corrotta. È il caso di un'interruzione fra promozione e
//! scrittura della riga, e dei depositi riempiti prima che il file di lato
//! esistesse.
//!
//! **Le miniature non si verificano affatto**: si ricavano dalla pagina, e una
//! che manca o è rovinata si rigenera. Il manifesto entra nell'elenco ma senza
//! checksum registrato, quindi la completa lo controlla solo strutturalmente:
//! quando è arrivato era già stato validato.
//!
//! Orfano è una **cartella di digitalizzazione che il database non conosce
//! più** (D5-bis): nell'uso normale si ignora, ma occupa spazio e nessuno la
//! reclamerà mai.
//!
//! Due livelli, perché costano diversamente:
//!
//! - **rapido**: il file c'è o non c'è. Millisecondi anche per un manoscritto;
//! - **completo**: si apre ogni file, si valida e si ricalcola l'impronta. Lento
//!   in proporzione ai gigabyte, e su un deposito sincronizzato in streaming
//!   costringe il client a scaricare tutto (D1-bis).
//!
//! **Non corregge niente da solo** (D5, D5-bis): constata e riferisce.

use async_trait::async_trait;
use serde::Deserialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};

use super::integrity;

pub const JOB_TYPE: &str = "vault_verification";

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationConfig {
    /// Vero per la verifica completa: apre ogni file e ne ricalcola l'impronta.
    #[serde(default)]
    pub full: bool,
}

/// Le fasi, come le legge il pannello.
mod phase {
    pub const FILES: &str = "checking_files";
    pub const ORPHANS: &str = "looking_for_orphans";
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub intact: u32,
    pub missing: u32,
    pub corrupt: u32,
    pub orphans: u32,
    pub orphan_bytes: u64,
}

impl Report {
    /// Il resoconto in quattro categorie (D5-bis), come lo legge il pannello.
    pub fn message(&self) -> String {
        format!(
            "integri {} · mancanti {} · corrotti {} · orfani {}",
            self.intact, self.missing, self.corrupt, self.orphans
        )
    }

    /// Gli stessi numeri in forma strutturata: l'interfaccia li mostra uno per
    /// uno quando si apre la riga, invece di far leggere una frase.
    pub fn detail(&self, checked: u32, total: u32, full: bool) -> String {
        serde_json::json!({
            "units": { "done": checked, "total": total, "label": "items" },
            "intact": self.intact,
            "missing": self.missing,
            "corrupt": self.corrupt,
            "orphans": { "count": self.orphans, "bytes": self.orphan_bytes },
            "level": if full { "full" } else { "quick" },
        })
        .to_string()
    }
}

pub struct VaultVerificationJob;

#[async_trait]
impl JobHandler for VaultVerificationJob {
    fn resource_class(&self) -> ResourceClass {
        // Il primo lavoro pesante per il processore e non per la rete: è anche
        // il motivo per cui D5-bis lo vuole, perché prova che i limiti separati
        // di D11 funzionano davvero.
        ResourceClass::Cpu
    }

    fn recovery(&self) -> Recovery {
        // Non ha punti intermedi che valga la pena salvare: rifarla costa una
        // scansione, e una scansione a metà non dice niente di utile.
        Recovery::Restart
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        let stop = || ctx.pause_requested() || ctx.cancel_requested();
        let config: VerificationConfig = serde_json::from_str(&ctx.config).unwrap_or_default();

        let root = ctx
            .vault_root()
            .await
            .map_err(|error| JobError::new(ErrorKind::Storage, error))?;
        // Radice assente non è «tutti i file mancanti» (D1): si dichiara il
        // deposito non raggiungibile e non si tocca nessuno stato.
        if !root.is_dir() {
            return Err(JobError::new(
                ErrorKind::Storage,
                "vault_unreachable".to_string(),
            ));
        }

        ctx.report_phase(phase::FILES).await;
        let known = registered_files(&root);
        let total = known.len() as u32;
        log::info!(
            "job verification starting id={} files={total} full={}",
            ctx.id,
            config.full
        );

        let mut report = Report::default();

        for (done, file) in known.iter().enumerate() {
            if stop() {
                return Ok(stopped(&ctx));
            }
            let absolute = &file.path;

            if config.full {
                let scan = integrity::scan_file(absolute, kind_of(absolute));
                match scan.validation {
                    integrity::Validation::Missing => report.missing += 1,
                    integrity::Validation::Corrupt(reason) => {
                        log::warn!("vault corrupt path={} reason={reason}", absolute.display());
                        report.corrupt += 1;
                    }
                    // L'impronta si **confronta**: firma e terminatore intatti
                    // non dicono niente su quello che c'è in mezzo, e un file
                    // marcito dentro passerebbe per integro. Senza impronta
                    // registrata non c'è confronto da fare, e la pagina si
                    // conta come intatta invece che come corrotta (§5.4).
                    integrity::Validation::Valid => match (&file.checksum, &scan.checksum) {
                        (Some(expected), Some(found)) if expected != found => {
                            log::warn!(
                                "vault checksum mismatch path={} expected={expected} found={found}",
                                absolute.display()
                            );
                            report.corrupt += 1;
                        }
                        _ => report.intact += 1,
                    },
                }
            } else if absolute.is_file() {
                report.intact += 1;
            } else {
                report.missing += 1;
            }

            let done = done as u32 + 1;
            ctx.report(
                f64::from(done) / f64::from(total.max(1)),
                Some(&report.message()),
                None,
                Some(&report.detail(done, total, config.full)),
            )
            .await;
            // Una scansione di gigabyte non deve tenersi il filo: fra un file e
            // l'altro si lascia respirare chi aspetta.
            tokio::task::yield_now().await;
        }

        if stop() {
            return Ok(stopped(&ctx));
        }

        ctx.report_phase(phase::ORPHANS).await;
        let (orphans, orphan_bytes) = orphans(&root, &known_versions(&ctx).await?);
        report.orphans = orphans;
        report.orphan_bytes = orphan_bytes;

        log::info!(
            "job verification complete id={} intact={} missing={} corrupt={} orphans={} orphan_bytes={}",
            ctx.id,
            report.intact,
            report.missing,
            report.corrupt,
            report.orphans,
            report.orphan_bytes
        );
        ctx.report(
            1.0,
            Some(&report.message()),
            Some(0),
            Some(&report.detail(total, total, config.full)),
        )
        .await;
        Ok(Outcome::Done)
    }
}

fn stopped(ctx: &JobContext) -> Outcome {
    if ctx.cancel_requested() {
        Outcome::Cancelled
    } else {
        Outcome::Paused
    }
}

/// Il manifesto si riconosce dall'estensione: è l'unico file JSON del deposito.
fn kind_of(path: &Path) -> integrity::FileKind {
    if path.extension().is_some_and(|ext| ext == "json") {
        integrity::FileKind::Manifest
    } else {
        integrity::FileKind::Image
    }
}

/// Un file da controllare, con l'impronta scritta quando è arrivato.
///
/// `checksum: None` significa «impronta ignota»: la verifica completa lo salta
/// invece di dichiararlo corrotto.
struct Registered {
    path: PathBuf,
    checksum: Option<String>,
}

/// Tutti i file del deposito che vale la pena controllare, ricavati dalle
/// cartelle: pagine di ogni cartella di misura, più il manifesto conservato.
fn registered_files(root: &Path) -> Vec<Registered> {
    let mut found = Vec::new();
    for inventory in crate::download::inventory::of_vault(root) {
        let version_dir = root
            .join(super::layout::PROVIDERS_DIR)
            .join(&inventory.provider_key)
            .join(&inventory.version_id);
        if inventory.has_manifest {
            found.push(Registered {
                path: version_dir.join(super::layout::MANIFEST_FILE),
                checksum: None,
            });
        }
        for size in &inventory.sizes {
            let size_dir = version_dir
                .join(super::layout::PAGES_DIR)
                .join(&size.size_tag);
            let records = crate::download::sidecar::read(&size_dir);
            let Ok(entries) = std::fs::read_dir(&size_dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file()
                    || entry.file_name().to_string_lossy() == crate::download::sidecar::SIDECAR_FILE
                {
                    continue;
                }
                let checksum = page_index_of(&path)
                    .and_then(|index| records.get(&index))
                    .and_then(|record| record.checksum.clone());
                found.push(Registered { path, checksum });
            }
        }
    }
    found.sort_by(|a, b| a.path.cmp(&b.path));
    found
}

/// Il numero di pagina dal nome del file (`0034.jpg` → 34).
fn page_index_of(path: &Path) -> Option<u32> {
    path.file_stem()?.to_string_lossy().parse::<u32>().ok()
}

/// Gli identificativi delle digitalizzazioni che il database conosce.
async fn known_versions(ctx: &JobContext) -> Result<HashSet<String>, JobError> {
    ctx.with_database(|conn| {
        let mut statement = conn
            .prepare("SELECT id FROM source_versions")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.collect::<rusqlite::Result<HashSet<_>>>()
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| JobError::new(ErrorKind::Storage, error))
}

/// Una cartella orfana: dove sta, quanti file contiene e quanto pesa.
///
/// Il conto dei **file** viaggia con la cartella perché è quello che si dice
/// all'utente: «tre cartelle» non gli dice niente, e annunciare «3 file» quando
/// sono tremila è una bugia in un messaggio che avverte di un'operazione
/// irreversibile.
pub struct Orphan {
    pub path: PathBuf,
    pub files: usize,
    pub bytes: u64,
}

/// Le cartelle di digitalizzazioni che il database non conosce più. Si guarda
/// solo sotto `providers/`: l'area di transito è di passaggio, e `derived/`
/// appartiene a chi l'ha prodotta.
///
/// Restituisce l'elenco e non solo il conto perché lo usa anche la
/// cancellazione (D5-bis).
///
/// **Un elenco vuoto di digitalizzazioni conosciute non rende orfano tutto il
/// deposito.** Un database appena creato, un ripristino interrotto a metà o una
/// lettura andata storta lo lascerebbero vuoto, e la conseguenza sarebbe
/// cancellare l'intero deposito. Nel dubbio non si tocca niente: chi ha davvero
/// tolto tutte le opere ha già visto sparire le loro cartelle con «togli».
pub fn orphan_folders(root: &Path, known: &HashSet<String>) -> Vec<Orphan> {
    let mut found = Vec::new();
    if known.is_empty() {
        return found;
    }
    let Ok(providers) = std::fs::read_dir(root.join(super::layout::PROVIDERS_DIR)) else {
        return found;
    };
    for provider in providers.flatten() {
        let Ok(versions) = std::fs::read_dir(provider.path()) else {
            continue;
        };
        for version in versions.flatten() {
            let path = version.path();
            if !path.is_dir() {
                continue;
            }
            if known.contains(&version.file_name().to_string_lossy().to_string()) {
                continue;
            }
            let stats = super::directory_stats(&path);
            found.push(Orphan {
                path,
                files: stats.files,
                bytes: stats.bytes,
            });
        }
    }
    found
}

/// Quanti **file** orfani ci sono e quanto occupano: la cartella è dove stanno,
/// non l'unità di misura.
fn orphans(root: &Path, known: &HashSet<String>) -> (u32, u64) {
    let found = orphan_folders(root, known);
    (
        found.iter().map(|orphan| orphan.files).sum::<usize>() as u32,
        found.iter().map(|orphan| orphan.bytes).sum(),
    )
}

/// Mette in coda la verifica, o restituisce quella già in corso.
///
/// Un lavoro per livello: chiederla due volte non ne apre due. Una verifica
/// vecchia e finita non si riprende, si rifà da capo — il deposito nel frattempo
/// è cambiato.
pub async fn enqueue(
    engine: &std::sync::Arc<crate::jobs::engine::JobEngine>,
    full: bool,
) -> Result<crate::jobs::JobRecord, String> {
    let id = if full {
        "verification:full"
    } else {
        "verification:quick"
    };

    let existing = {
        let conn = engine.connection()?;
        crate::jobs::store::get(&conn, id)?
    };
    if let Some(job) = existing {
        if !job.status.is_terminal() {
            return Ok(job);
        }
        engine.retry(id, true).await?;
        let conn = engine.connection()?;
        return crate::jobs::store::get(&conn, id)?
            .ok_or_else(|| "la verifica è sparita subito dopo la messa in coda".to_string());
    }

    engine
        .submit(&crate::jobs::store::NewJob {
            id: id.to_string(),
            job_type: JOB_TYPE.to_string(),
            priority: 1,
            config: serde_json::json!({ "full": full }).to_string(),
            max_attempts: 1,
            depends_on_job_id: None,
            workspace_id: None,
            message: None,
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_report_says_all_four_categories() {
        // D5-bis vuole le quattro categorie insieme: dirne tre lascia credere
        // che la quarta sia zero.
        let report = Report {
            intact: 198,
            missing: 12,
            corrupt: 1,
            orphans: 3,
            orphan_bytes: 4_096,
        };

        assert_eq!(
            report.message(),
            "integri 198 · mancanti 12 · corrotti 1 · orfani 3"
        );
    }

    #[test]
    fn a_file_rotten_inside_is_not_intact() {
        // Firma e terminatore restano al loro posto: solo il confronto con
        // l'impronta registrata quando il file è arrivato può accorgersene
        // (D5).
        let dir = std::env::temp_dir().join("glossa_verification_checksum");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("0001.jpg");
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
        bytes.extend_from_slice(&[7u8; 64]);
        bytes.extend_from_slice(&[0xFF, 0xD9]);
        std::fs::write(&file, &bytes).unwrap();
        let arrived = integrity::scan_file(&file, integrity::FileKind::Image)
            .checksum
            .unwrap();

        // Un byte cambiato nel mezzo, dove nessun controllo di forma guarda.
        bytes[30] = 9;
        std::fs::write(&file, &bytes).unwrap();
        let now = integrity::scan_file(&file, integrity::FileKind::Image);

        assert_eq!(
            now.validation,
            integrity::Validation::Valid,
            "la forma regge"
        );
        assert_ne!(now.checksum.unwrap(), arrived, "l'impronta no");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_digitisation_the_database_no_longer_knows_is_an_orphan() {
        let root = std::env::temp_dir().join("glossa_verification_orphans");
        let _ = std::fs::remove_dir_all(&root);
        for version in ["v1", "v2"] {
            let pages = root.join(format!("providers/gallica/{version}/pages/2000"));
            std::fs::create_dir_all(&pages).unwrap();
            // Tre pagine ciascuna: così il conto dei file non coincide con
            // quello delle cartelle, e contare le cartelle si vede.
            for index in 1..=3 {
                std::fs::write(pages.join(format!("000{index}.jpg")), b"pagina").unwrap();
            }
        }

        // Il database conosce solo v1: la cartella di v2 non la reclama nessuno.
        let known: HashSet<String> = ["v1".to_string()].into_iter().collect();
        let (count, bytes) = orphans(&root, &known);

        // **File, non cartelle**: è il numero che finisce nel messaggio che
        // avverte dell'operazione irreversibile.
        assert_eq!(count, 3);
        assert_eq!(bytes, 3 * "pagina".len() as u64);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_empty_library_does_not_make_the_whole_vault_an_orphan() {
        // Database appena creato, ripristino interrotto a metà, lettura andata
        // storta: l'elenco delle opere conosciute è vuoto, e senza questa
        // protezione ogni cartella del deposito risulterebbe da cancellare.
        let root = std::env::temp_dir().join("glossa_verification_empty_library");
        let _ = std::fs::remove_dir_all(&root);
        let pages = root.join("providers/gallica/v1/pages/2000");
        std::fs::create_dir_all(&pages).unwrap();
        std::fs::write(pages.join("0001.jpg"), b"pagina").unwrap();

        let (count, bytes) = orphans(&root, &HashSet::new());

        assert_eq!(count, 0);
        assert_eq!(bytes, 0);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_staging_area_is_not_searched_for_orphans() {
        // Quello che sta in transito è di passaggio per definizione: contarlo
        // come orfano proporrebbe di cancellare file di un lavoro in corso.
        let root = std::env::temp_dir().join("glossa_verification_staging");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("staging/v1")).unwrap();
        std::fs::write(root.join("staging/v1/0001.jpg"), b"in transito").unwrap();
        std::fs::create_dir_all(root.join("providers")).unwrap();

        // Un'opera conosciuta, altrimenti scatta la protezione sull'elenco
        // vuoto e il test passerebbe senza aver provato niente.
        let known: HashSet<String> = ["v1".to_string()].into_iter().collect();
        let (count, _) = orphans(&root, &known);

        assert_eq!(count, 0);

        let _ = std::fs::remove_dir_all(&root);
    }
}
