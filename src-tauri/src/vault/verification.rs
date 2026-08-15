//! La verifica del deposito come lavoro (D5, D5-bis).
//!
//! **Il database è la verità** (D5): non si scandisce il deposito per scoprire
//! cosa c'è, si prende quello che il database dichiara e si guarda se è ancora
//! lì. Gli orfani — file sul disco che nessuna riga reclama — sono l'unica cosa
//! che si trova camminando le cartelle, e si contano solo qui: nell'uso normale
//! si ignorano, ma occupano spazio e nessuno li reclamerà mai (D5-bis).
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

use super::{absolute_path, integrity};

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
        let known = registered_paths(&ctx).await?;
        let total = known.len() as u32;
        log::info!(
            "job verification starting id={} files={total} full={}",
            ctx.id,
            config.full
        );

        let mut report = Report::default();
        let mut checked: HashSet<PathBuf> = HashSet::with_capacity(known.len());

        for (done, relative) in known.iter().enumerate() {
            if stop() {
                return Ok(stopped(&ctx));
            }
            let Ok(absolute) = absolute_path(&root, relative) else {
                // Percorso che il layout non produce mai: la riga è storta, non
                // il file. Si conta come mancante e si va avanti, come fa la
                // verifica rapida dei comandi.
                report.missing += 1;
                continue;
            };
            checked.insert(absolute.clone());

            if config.full {
                match integrity::scan_file(&absolute, kind_of(&absolute)).validation {
                    integrity::Validation::Valid => report.intact += 1,
                    integrity::Validation::Missing => report.missing += 1,
                    integrity::Validation::Corrupt(reason) => {
                        log::warn!("vault corrupt path={relative} reason={reason}");
                        report.corrupt += 1;
                    }
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
        let (orphans, orphan_bytes) = orphans(&root, &checked);
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

/// I percorsi che il database dichiara di avere nel deposito.
async fn registered_paths(ctx: &JobContext) -> Result<Vec<String>, JobError> {
    ctx.with_database(|conn| {
        let mut statement = conn
            .prepare(
                "SELECT vault_path FROM assets \
                 WHERE vault_path IS NOT NULL AND locality = 'local' ORDER BY vault_path",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| JobError::new(ErrorKind::Storage, error))
}

/// I file che stanno nel deposito e che nessuna riga reclama.
///
/// Si guarda solo sotto `providers/`: l'area di transito è di passaggio per
/// definizione, e `derived/` appartiene a chi l'ha prodotta.
fn orphans(root: &Path, known: &HashSet<PathBuf>) -> (u32, u64) {
    let mut count = 0;
    let mut bytes = 0;
    let mut stack = vec![root.join("providers")];

    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if known.contains(&path) {
                continue;
            }
            count += 1;
            bytes += entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        }
    }
    (count, bytes)
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
    fn a_file_nobody_claims_is_an_orphan() {
        let root = std::env::temp_dir().join("glossa_verification_orphans");
        let _ = std::fs::remove_dir_all(&root);
        let pages = root.join("providers/gallica/v1/pages/2000");
        std::fs::create_dir_all(&pages).unwrap();
        std::fs::write(pages.join("0001.jpg"), b"conosciuto").unwrap();
        std::fs::write(pages.join("0002.jpg"), b"orfano").unwrap();

        let known: HashSet<PathBuf> = [pages.join("0001.jpg")].into_iter().collect();
        let (count, bytes) = orphans(&root, &known);

        assert_eq!(count, 1);
        assert_eq!(bytes, "orfano".len() as u64);

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

        let (count, _) = orphans(&root, &HashSet::new());

        assert_eq!(count, 0);

        let _ = std::fs::remove_dir_all(&root);
    }
}
