//! OCR/HTR nello Studio di trascrizione (#220): un provider LLM già
//! configurato per la traduzione legge l'immagine di una pagina e propone un
//! testo, che entra come revisione modificabile — mai come verità finale.
//! Vedi `docs-dev/PLAN_OCR_HTR.md` per l'analisi completa.

pub mod handler;
pub mod log;
pub mod revisions;
