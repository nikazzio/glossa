//! Le tre operazioni che portano un file dentro il deposito, e nient'altro.
//!
//! Transito → validazione → spostamento atomico: un file parziale non
//! entra mai nel deposito, quindi l'annullamento non deve ripulire niente e una
//! ripresa può fidarsi della sola presenza del file senza rileggerlo.

use std::path::Path;

use crate::jobs::{ErrorKind, JobError, Outcome};
use crate::vault::integrity;

/// Scrive in transito, valida, promuove. Ritorna l'impronta calcolata durante
/// la validazione, che finisce nel file di lato.
pub(crate) fn stage_and_promote(
    staged: &Path,
    target: &Path,
    bytes: &[u8],
    kind: integrity::FileKind,
) -> Result<String, JobError> {
    // Si valida quello che è già in memoria: scriverlo per poterlo rileggere
    // sarebbe una lettura in più per ogni pagina.
    let scan = integrity::scan_bytes(bytes, kind);
    match scan.validation {
        integrity::Validation::Valid => {}
        // Un file troncato ha la dimensione dichiarata dai metadati HTTP: un
        // controllo di dimensione non lo vedrebbe.
        integrity::Validation::Corrupt(reason) => {
            return Err(JobError::new(ErrorKind::Transport, reason))
        }
        integrity::Validation::Missing => {
            return Err(JobError::new(
                ErrorKind::Storage,
                "risposta vuota".to_string(),
            ))
        }
    }

    if let Some(parent) = staged.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    }
    std::fs::write(staged, bytes)
        .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    }
    std::fs::rename(staged, target)
        .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    scan.checksum
        .ok_or_else(|| JobError::new(ErrorKind::Internal, "impronta non calcolata".to_string()))
}

/// Butta l'area di transito. Si chiama su **ogni** uscita, non solo a lavoro
/// finito: lì dentro c'è solo roba mai promossa.
pub(crate) fn discard(staging: &Path) {
    if let Err(error) = std::fs::remove_dir_all(staging) {
        if error.kind() != std::io::ErrorKind::NotFound {
            log::warn!(
                "job staging not cleaned path={} error={error}",
                staging.display()
            );
        }
    }
}

pub(crate) fn stopped_outcome(cancelled: bool, staging: &Path) -> Outcome {
    discard(staging);
    if cancelled {
        Outcome::Cancelled
    } else {
        Outcome::Paused
    }
}

pub(crate) fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0)
}
