//! Il tipo di lavoro finto della PR 2.
//!
//! Serve a provare il motore — coda, limiti, pausa, annullamento, tentativi,
//! ripresa — **senza** che esista ancora un lavoro vero: il primo gestore reale
//! è lo scaricamento, che arriva con la PR 4.
//!
//! Compilato solo nelle build di sviluppo: in quelle installate non esiste.

use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;

use super::engine::{JobContext, JobHandler};
use super::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct CounterConfig {
    /// Quante unità di lavoro. Ognuna è un confine: è lì che si guardano pausa
    /// e annullamento, come farà lo scaricamento con la singola pagina.
    steps: u32,
    step_ms: u64,
    /// Fa fallire il lavoro con un errore di quella classe, per provare
    /// tentativi e attese.
    fail_with: Option<String>,
}

impl Default for CounterConfig {
    fn default() -> Self {
        Self {
            steps: 5,
            step_ms: 1,
            fail_with: None,
        }
    }
}

#[derive(Debug, Deserialize, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct CounterCheckpoint {
    done: u32,
}

pub struct CounterJob;

#[async_trait]
impl JobHandler for CounterJob {
    fn resource_class(&self) -> ResourceClass {
        ResourceClass::Disk
    }

    fn recovery(&self) -> Recovery {
        Recovery::Resumable
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        let config: CounterConfig = serde_json::from_str(&ctx.config)
            .map_err(|error| JobError::new(ErrorKind::Internal, format!("config: {error}")))?;

        if let Some(kind) = config.fail_with.as_deref() {
            return Err(match kind {
                "transport" => JobError::new(ErrorKind::Transport, "connessione caduta"),
                "throttled" => JobError::new(ErrorKind::Throttled, "403 dalla biblioteca"),
                "notFound" => JobError::new(ErrorKind::NotFound, "risorsa inesistente"),
                other => JobError::new(ErrorKind::Internal, format!("errore finto: {other}")),
            });
        }

        let start = ctx
            .checkpoint
            .as_deref()
            .and_then(|saved| serde_json::from_str::<CounterCheckpoint>(saved).ok())
            .map(|saved| saved.done)
            .unwrap_or(0);

        for done in start..config.steps {
            // Il confine dell'unità di lavoro: qui, e solo qui, ci si ferma.
            if ctx.cancel_requested() {
                return Ok(Outcome::Cancelled);
            }
            if ctx.pause_requested() {
                return Ok(Outcome::Paused);
            }

            tokio::time::sleep(Duration::from_millis(config.step_ms)).await;

            let completed = done + 1;
            let _ = ctx
                .save_checkpoint(
                    &serde_json::to_string(&CounterCheckpoint { done: completed })
                        .unwrap_or_else(|_| "{}".to_string()),
                )
                .await;
            let remaining = config.steps.saturating_sub(completed);
            ctx.report_progress(
                f64::from(completed) / f64::from(config.steps.max(1)),
                Some("conteggio"),
                Some((u64::from(remaining) * config.step_ms / 1000) as i64),
            )
            .await;
        }

        Ok(Outcome::Done)
    }
}

/// Un tipo di lavoro **senza punti intermedi affidabili**: alla riapertura
/// torna in coda da capo, non in pausa (D13). Serve a provare l'altro ramo del
/// recupero, che lo scaricamento non userà ma la generazione di documenti sì.
pub struct RestartOnlyJob;

#[async_trait]
impl JobHandler for RestartOnlyJob {
    fn resource_class(&self) -> ResourceClass {
        ResourceClass::Documents
    }

    fn recovery(&self) -> Recovery {
        Recovery::Restart
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        if ctx.cancel_requested() {
            return Ok(Outcome::Cancelled);
        }
        ctx.report_progress(1.0, Some("fatto"), Some(0)).await;
        Ok(Outcome::Done)
    }
}
