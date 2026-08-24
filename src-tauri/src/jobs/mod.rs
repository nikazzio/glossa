//! I lavori in background (#218, parte C delle decisioni).
//!
//! Un solo orchestratore dentro l'applicazione: tiene la coda, scrive lo
//! stato sul database e affida l'esecuzione a un gestore registrato per tipo.
//! L'interfaccia non esegue mai niente di lungo — chiede la creazione di un
//! lavoro e osserva.
//!
//! Qui stanno i tipi condivisi. La persistenza è in `store`, la coda in
//! `engine`, i comandi in `commands`.

pub mod commands;
pub mod engine;
pub mod store;
#[cfg(debug_assertions)]
pub mod testing;

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Gli otto stati della baseline. `pausing` e `cancelling` esistono perché
/// pausa e annullamento sono **cooperativi**: la richiesta si segna,
/// il gestore la vede al confine dell'unità di lavoro successiva.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Queued,
    Running,
    Pausing,
    Paused,
    Cancelling,
    Cancelled,
    Completed,
    Error,
}

impl JobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            JobStatus::Queued => "queued",
            JobStatus::Running => "running",
            JobStatus::Pausing => "pausing",
            JobStatus::Paused => "paused",
            JobStatus::Cancelling => "cancelling",
            JobStatus::Cancelled => "cancelled",
            JobStatus::Completed => "completed",
            JobStatus::Error => "error",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "queued" => Ok(JobStatus::Queued),
            "running" => Ok(JobStatus::Running),
            "pausing" => Ok(JobStatus::Pausing),
            "paused" => Ok(JobStatus::Paused),
            "cancelling" => Ok(JobStatus::Cancelling),
            "cancelled" => Ok(JobStatus::Cancelled),
            "completed" => Ok(JobStatus::Completed),
            "error" => Ok(JobStatus::Error),
            other => Err(format!("unknown job status: {other}")),
        }
    }

    /// Da uno stato terminale non si esce: un aggiornamento tardivo del gestore
    /// non deve resuscitare un lavoro annullato (requisito di #218).
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            JobStatus::Cancelled | JobStatus::Completed | JobStatus::Error
        )
    }
}

/// Le cinque classi di risorsa. Hanno limiti separati perché saturano
/// cose diverse: il collo di bottiglia della rete è il server della biblioteca,
/// quello del disco è il disco.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResourceClass {
    Network,
    Cpu,
    Disk,
    LanguageService,
    Documents,
}

impl ResourceClass {
    pub const ALL: [ResourceClass; 5] = [
        ResourceClass::Network,
        ResourceClass::Cpu,
        ResourceClass::Disk,
        ResourceClass::LanguageService,
        ResourceClass::Documents,
    ];

    /// Chiave dell'impostazione che ne porta il limite.
    pub fn setting_key(self) -> &'static str {
        match self {
            ResourceClass::Network => "jobs_limit_network",
            ResourceClass::Cpu => "jobs_limit_cpu",
            ResourceClass::Disk => "jobs_limit_disk",
            ResourceClass::LanguageService => "jobs_limit_language_service",
            ResourceClass::Documents => "jobs_limit_documents",
        }
    }

    /// Limite quando l'impostazione dice `0`, cioè "automatico". Solo il
    /// processore scala con la macchina: gli altri hanno un valore giusto che
    /// non dipende da quanti core ci sono.
    pub fn automatic_limit(self) -> usize {
        match self {
            ResourceClass::Cpu => std::thread::available_parallelism()
                .map(|value| value.get().saturating_sub(1).max(1))
                .unwrap_or(1),
            ResourceClass::Network => 2,
            ResourceClass::Disk | ResourceClass::LanguageService | ResourceClass::Documents => 1,
        }
    }
}

/// Cosa sa fare un tipo di lavoro quando l'applicazione si riapre.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Recovery {
    /// Sa dire a che punto era e ripartire da lì: torna **in pausa**.
    Resumable,
    /// Non ha punti intermedi affidabili: torna **in coda**, progresso azzerato.
    Restart,
}

/// Come è finito un lavoro dal punto di vista del gestore.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Done,
    /// Il gestore ha visto la richiesta di pausa e si è fermato al confine.
    Paused,
    /// Il gestore ha visto la richiesta di annullamento e si è fermato.
    Cancelled,
}

/// Classificazione degli errori. Decide **da sola** se ritentare: la
/// tabella delle decisioni non sarebbe applicabile se l'errore fosse una
/// stringa.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    /// Connessione caduta, timeout, 5xx.
    Transport,
    /// 429: si rispetta `Retry-After` se il servizio lo dichiara.
    RateLimited,
    /// 403: ritentabile. Su questi servizi significa "stai correndo troppo",
    /// non "vietato per sempre", quindi si riprova dopo un'attesa lunga.
    Throttled,
    /// 404, risorsa che non esiste.
    NotFound,
    /// 400 o 501: **la misura chiesta** non si può servire. Non è un guasto e
    /// non è la pagina a mancare: è l'unico parametro che facciamo variare, e
    /// riprovare la stessa misura darebbe la stessa risposta.
    SizeRejected,
    /// Spazio esaurito, permesso negato.
    Storage,
    /// Formato non riconoscibile.
    Format,
    /// Difetto nostro: non si ritenta, si mostra.
    Internal,
}

impl ErrorKind {
    pub fn is_retryable(self) -> bool {
        matches!(
            self,
            ErrorKind::Transport | ErrorKind::RateLimited | ErrorKind::Throttled
        )
    }

    pub fn as_str(self) -> &'static str {
        match self {
            ErrorKind::Transport => "transport",
            ErrorKind::RateLimited => "rateLimited",
            ErrorKind::Throttled => "throttled",
            ErrorKind::NotFound => "notFound",
            ErrorKind::SizeRejected => "sizeRejected",
            ErrorKind::Storage => "storage",
            ErrorKind::Format => "format",
            ErrorKind::Internal => "internal",
        }
    }
}

/// Motivo per cui un lavoro è fermo pur essendo in esecuzione: sta rispettando
/// i limiti della biblioteca. L'interfaccia lo scrive in modo
/// diverso da un errore e **non anima** la barra.
pub const WAITING_LIBRARY_LIMITS: &str = "libraryLimits";

/// Un errore di lavoro porta con sé tutto quello che serve a decidere: se
/// ritentare, quanto attendere, cosa mostrare.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobError {
    pub kind: ErrorKind,
    pub message: String,
    /// Attesa dichiarata dal servizio (`Retry-After`). Quando c'è, vince sul
    /// calcolo esponenziale.
    pub retry_after: Option<Duration>,
}

impl JobError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            retry_after: None,
        }
    }
}

/// Attesa prima del tentativo successivo.
///
/// Esponenziale con base e tetto **espliciti**, perché in PR 4 arrivano dal
/// profilo del provider e non da costanti sparse nel codice. I valori qui sono
/// quelli tarati su Scriptoria: base 20 s, tetto 300 s, raffreddamento lungo
/// 600 s dopo un 403. Le attese di 2–8–30 secondi della prima stesura erano un
/// ordine di grandezza troppo brevi.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackoffProfile {
    pub base: Duration,
    pub cap: Duration,
    pub long_cooldown: Duration,
}

impl Default for BackoffProfile {
    fn default() -> Self {
        Self {
            base: Duration::from_secs(20),
            cap: Duration::from_secs(300),
            long_cooldown: Duration::from_secs(600),
        }
    }
}

impl BackoffProfile {
    /// `attempt` è il numero di tentativi già falliti, a partire da 1.
    pub fn wait_for(&self, error: &JobError, attempt: u32) -> Duration {
        if let Some(declared) = error.retry_after {
            return declared.min(self.cap.max(self.long_cooldown));
        }
        match error.kind {
            ErrorKind::Throttled => self.long_cooldown,
            _ => {
                let factor = 2u32.saturating_pow(attempt.saturating_sub(1).min(16));
                self.base.saturating_mul(factor.max(1)).min(self.cap)
            }
        }
    }
}

/// Interruttori cooperativi di un lavoro in esecuzione. Il gestore
/// li guarda al confine dell'unità di lavoro successiva: non si interrompe
/// niente a metà, e un file parziale non entra mai nel deposito.
#[derive(Debug, Default)]
pub struct JobControl {
    pause_requested: AtomicBool,
    cancel_requested: AtomicBool,
}

impl JobControl {
    pub fn request_pause(&self) {
        self.pause_requested.store(true, Ordering::SeqCst);
    }

    pub fn request_cancel(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    pub fn pause_requested(&self) -> bool {
        self.pause_requested.load(Ordering::SeqCst)
    }

    pub fn cancel_requested(&self) -> bool {
        self.cancel_requested.load(Ordering::SeqCst)
    }
}

/// Una riga di `jobs`, come la vede il runtime e come arriva all'interfaccia.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String,
    pub job_type: String,
    pub status: JobStatus,
    pub priority: i64,
    pub progress: f64,
    pub message: Option<String>,
    pub config: String,
    pub checkpoint: Option<String>,
    pub attempt_count: u32,
    pub max_attempts: u32,
    pub error: Option<String>,
    pub error_kind: Option<String>,
    pub eta_seconds: Option<i64>,
    /// Perché è fermo pur essendo in esecuzione: attesa per rispettare i limiti
    /// della biblioteca, non un errore.
    pub waiting_reason: Option<String>,
    /// Cosa sta facendo adesso, dentro lo stato: chiave breve decisa dal tipo
    /// di lavoro e tradotta dall'interfaccia (`manifest`, `downloading`, …).
    pub phase: Option<String>,
    /// Dettagli strutturati, in JSON: le chiavi le decide il tipo di lavoro.
    pub detail: Option<String>,
    pub depends_on_job_id: Option<String>,
    pub next_attempt_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    /// Il workspace da cui il lavoro è nato, quando ne ha uno: il registro dei
    /// fatti ci raggruppa sopra e la cancellazione per workspace lo usa
    /// per sapere cosa portare via.
    pub workspace_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_states_are_the_three_that_end_a_job() {
        for status in [JobStatus::Completed, JobStatus::Cancelled, JobStatus::Error] {
            assert!(status.is_terminal(), "{status:?} è terminale");
        }
        for status in [
            JobStatus::Queued,
            JobStatus::Running,
            JobStatus::Pausing,
            JobStatus::Paused,
            JobStatus::Cancelling,
        ] {
            assert!(!status.is_terminal(), "{status:?} non è terminale");
        }
    }

    #[test]
    fn every_status_survives_a_round_trip_through_the_database() {
        for status in [
            JobStatus::Queued,
            JobStatus::Running,
            JobStatus::Pausing,
            JobStatus::Paused,
            JobStatus::Cancelling,
            JobStatus::Cancelled,
            JobStatus::Completed,
            JobStatus::Error,
        ] {
            assert_eq!(JobStatus::parse(status.as_str()).unwrap(), status);
        }
    }

    #[test]
    fn a_403_is_retryable_with_a_long_cooldown() {
        assert!(ErrorKind::Throttled.is_retryable());
        let profile = BackoffProfile::default();
        let wait = profile.wait_for(&JobError::new(ErrorKind::Throttled, "403"), 1);
        assert_eq!(wait, Duration::from_secs(600));
    }

    #[test]
    fn what_is_not_our_fault_and_not_temporary_is_not_retried() {
        for kind in [
            ErrorKind::NotFound,
            ErrorKind::Storage,
            ErrorKind::Format,
            ErrorKind::Internal,
        ] {
            assert!(!kind.is_retryable(), "{kind:?} non si ritenta");
        }
    }

    #[test]
    fn the_wait_grows_and_then_stops_at_the_cap() {
        let profile = BackoffProfile::default();
        let error = JobError::new(ErrorKind::Transport, "connessione caduta");

        assert_eq!(profile.wait_for(&error, 1), Duration::from_secs(20));
        assert_eq!(profile.wait_for(&error, 2), Duration::from_secs(40));
        assert_eq!(profile.wait_for(&error, 3), Duration::from_secs(80));
        assert_eq!(
            profile.wait_for(&error, 12),
            Duration::from_secs(300),
            "il tetto non si supera mai"
        );
    }

    #[test]
    fn a_declared_retry_after_wins_over_the_calculation() {
        // 429 con Retry-After: il servizio sa meglio di noi quando riprovare.
        let profile = BackoffProfile::default();
        let error = JobError {
            retry_after: Some(Duration::from_secs(45)),
            ..JobError::new(ErrorKind::RateLimited, "429")
        };

        assert_eq!(profile.wait_for(&error, 4), Duration::from_secs(45));
    }

    #[test]
    fn the_cpu_limit_leaves_one_core_free() {
        let limit = ResourceClass::Cpu.automatic_limit();
        assert!(limit >= 1);
        assert!(
            limit
                < std::thread::available_parallelism()
                    .map_or(2, |v| v.get())
                    .max(2)
        );
    }

    #[test]
    fn the_disk_runs_one_job_at_a_time() {
        // Due lavori che scrivono gigabyte insieme sono più lenti di due in
        // fila.
        assert_eq!(ResourceClass::Disk.automatic_limit(), 1);
    }
}
