//! Il lavoro su **una** pagina: salta, scarica, o dichiara che la biblioteca
//! non la serve.
//!
//! Sta fuori dal gestore perché il gestore è il ciclo, e questo è il passo. Il
//! contesto immutabile della pagina — client, profilo, configurazione,
//! manifesto, cartelle — sta in `PageFetcher`: passarlo pezzo per pezzo faceva
//! funzioni da quattordici argomenti.

use std::collections::BTreeMap;
use std::path::Path;

use crate::iiif::network::NetworkProfile;
use crate::images;
use crate::jobs::{ErrorKind, JobError};
use crate::vault::{integrity, layout};

use super::courtesy::{Courtesy, Signals};
use super::fetch::fetch;
use super::handler::DownloadConfig;
use super::manifest::{image_url, Manifest, Page};
use super::progress::{Progress, Reporter};
use super::sidecar::{self, Note, PageRecord};
use super::sizing::{self, SizeCap, SizingRule};
use super::vault_io::{now_secs, stage_and_promote};

/// Qualità JPEG della riduzione fatta in casa dopo un rifiuto della misura
/// (§5.1, regola 3). Stesso valore predefinito dell'ottimizzazione locale.
const DOWNSCALE_QUALITY: u8 = 82;

/// Intervallo minimo prima di richiedere di nuovo una pagina che la biblioteca
/// ha già dichiarato di non servire (fatto 7, §5.3).
///
/// A ogni ripresa costerebbe una richiesta buttata per pagina mancante; mai più
/// renderebbe permanente un buco che le biblioteche a volte riparano.
pub(crate) const RETRY_MISSING_AFTER_SECS: i64 = 7 * 24 * 3600;

/// Esito di una singola pagina, con quello che di **quella** pagina si sa.
///
/// I fatti stanno qui e non in una struttura a parte perché sono l'esito: il
/// pannello mostra la misura chiesta, le dimensioni arrivate e il peso della
/// pagina appena passata, e sono le tre cose che dicono *perché* un libro ci
/// mette tanto.
pub(crate) enum PageOutcome {
    /// Scritta adesso: byte aggiunti al deposito.
    Written {
        bytes: u64,
        /// La misura chiesta al servizio per questa pagina, che varia di pagina
        /// in pagina e **non** è il tetto.
        token: String,
        /// Le dimensioni davvero arrivate, lette dai byte.
        pixels: Option<(u32, u32)>,
    },
    /// File già presente: nessuna richiesta.
    Present,
    /// La biblioteca non l'ha servita (404/410), o l'aveva già dichiarata tale
    /// entro `RETRY_MISSING_AFTER_SECS`.
    NotServed,
    /// Saltata per un guasto che non è passato: si conta, non si registra.
    Faulty,
    /// Pausa o annullamento durante l'attesa del turno.
    Stopped,
}

/// Cosa ha risposto la biblioteca per questa pagina, prima che qualcosa finisca
/// sul disco.
enum Asked {
    Got {
        bytes: Vec<u8>,
        /// La misura davvero chiesta: quella calcolata, o la dimensione piena se
        /// è servito il ripiego.
        token: String,
        /// Da scrivere accanto alla pagina quando è arrivata più grande ed è
        /// stata ridotta in casa.
        note: Option<Note>,
    },
    /// La biblioteca ha **dichiarato** di non servirla: 404 o 410, o un rifiuto
    /// anche a dimensione piena. Lascia la sua riga nel file di lato.
    NotServed,
    /// Un guasto che non è passato nemmeno all'ultimo tentativo: la pagina si
    /// salta per questo giro e **non** lascia nessuna riga. Un silenzio della
    /// rete o una manutenzione non sono la biblioteca che dichiara di non avere
    /// quella pagina, e scriverlo la renderebbe irraggiungibile per una
    /// settimana (§5.3: la riga è per i rifiuti dichiarati).
    Faulty,
    /// Pausa o annullamento durante l'attesa del turno.
    Stopped,
}

/// Quello che serve a scaricare una pagina e non cambia da una pagina all'altra.
pub(crate) struct PageFetcher<'a> {
    pub courtesy: &'a Courtesy,
    pub client: &'a reqwest::Client,
    pub profile: &'a NetworkProfile,
    pub config: &'a DownloadConfig,
    pub manifest: &'a Manifest,
    pub cap: SizeCap,
    /// `pages/<misura>/` della digitalizzazione.
    pub size_dir: &'a Path,
    /// Area di transito del lavoro.
    pub staging: &'a Path,
    /// Radice del deposito, per le miniature.
    pub root: &'a Path,
    /// Tentativo del **lavoro**: serve al calcolo dell'attesa (D16) e a sapere
    /// se dopo questo ce ne sarà un altro.
    pub attempt: u32,
    pub max_attempts: u32,
}

impl PageFetcher<'_> {
    pub(crate) async fn one(
        &self,
        rule: &mut SizingRule,
        page: &Page,
        known: &BTreeMap<u32, PageRecord>,
        signals: &Signals<'_>,
    ) -> Result<PageOutcome, JobError> {
        let target = self.size_dir.join(layout::page_file_name(page.index));
        // Presenza del file = pagina valida: nel deposito entra solo ciò che ha
        // superato la validazione in transito (D16-bis).
        if target.is_file() {
            return Ok(PageOutcome::Present);
        }
        if let Some(last_try) = known.get(&page.index).and_then(PageRecord::last_try) {
            if now_secs() - last_try < RETRY_MISSING_AFTER_SECS {
                return Ok(PageOutcome::NotServed);
            }
        }

        let (bytes, token, note) = match self.ask(rule, page, signals).await? {
            Asked::Got { bytes, token, note } => (bytes, token, note),
            Asked::NotServed => return self.not_served(page),
            Asked::Faulty => return Ok(PageOutcome::Faulty),
            Asked::Stopped => return Ok(PageOutcome::Stopped),
        };

        let staged = self.staging.join(page_staging_name(page.index));
        let checksum = stage_and_promote(&staged, &target, &bytes, integrity::FileKind::Image)?;
        let got = image_dimensions(&bytes);
        sidecar::append(
            self.size_dir,
            &PageRecord {
                index: page.index,
                label: page.label.clone(),
                got,
                bytes: Some(bytes.len() as u64),
                checksum: Some(checksum),
                at: now_secs(),
                note,
            },
        )
        .unwrap_or_else(|error| {
            // Riga non scritta: la pagina resta presente e conta
            // nell'inventario, ma non se ne conosce l'impronta (§5.4).
            log::warn!("job sidecar not written page={} error={error}", page.index);
        });

        self.store_thumbnail(page.index, &bytes);
        Ok(PageOutcome::Written {
            bytes: bytes.len() as u64,
            token,
            pixels: got,
        })
    }

    /// Chiede la pagina alla biblioteca, con i due ripieghi del §5.1: la misura
    /// rifiutata e il guasto che non passa. Non scrive niente sul disco.
    async fn ask(
        &self,
        rule: &mut SizingRule,
        page: &Page,
        signals: &Signals<'_>,
    ) -> Result<Asked, JobError> {
        let mut token = sizing::token_for(rule, page, self.cap, self.manifest.presentation2);
        let url = image_url(&page.image_service, &token);
        // Vero quando vale la pena chiedere la stessa pagina a dimensione piena.
        let mut try_full = false;
        // Vero quando il motivo è un guasto e non un rifiuto dichiarato: cambia
        // cosa si scrive nel file di lato, cioè niente.
        let mut faulty = false;
        let first = match self.get(&url, signals).await {
            Ok(Some(fetched)) => Some(fetched),
            Ok(None) => return Ok(Asked::Stopped),
            Err(error) => match error.kind {
                // 404/410: la pagina non c'è (fatto 7).
                ErrorKind::NotFound => None,
                // 400/501: rifiutata **la misura**. Si smette di calcolare per
                // il resto del libro (§5.1, regola 3).
                ErrorKind::SizeRejected => {
                    log::warn!(
                        "job size refused page={} token={token} — passaggio a max",
                        page.index
                    );
                    *rule = SizingRule::Full;
                    try_full = true;
                    None
                }
                // Un 5xx che insiste sulla stessa pagina fino all'ultimo
                // tentativo è ambiguo: potrebbe essere la misura, perché ci sono
                // servizi che rispondono 500 dove altri rispondono 400. Si prova
                // la dimensione piena per **questa pagina sola**, e il libro non
                // si declassa (§5.1).
                //
                // Solo all'ultimo tentativo: prima ci sono le attese del profilo,
                // che sono la cura giusta per un guasto passeggero. Dopo, salire
                // con l'errore lascerebbe il libro troncato — nessuna ripresa
                // arriverebbe mai alle pagine successive a questa.
                ErrorKind::Transport if self.last_attempt() => {
                    log::warn!(
                        "job page keeps failing page={} token={token} — prova a piena risoluzione",
                        page.index
                    );
                    try_full = true;
                    faulty = true;
                    None
                }
                // 403/429 e i guasti prima dell'ultimo tentativo salgono al
                // motore, che decide attesa e tentativi dal profilo (D16, D18).
                _ => return Err(error),
            },
        };

        // Quando la regola è già la dimensione piena, il token appena chiesto
        // **è** la dimensione piena: ripeterla sarebbe la stessa richiesta due
        // volte, e con il tetto a «massima» sarebbe una richiesta buttata per
        // ogni pagina che la biblioteca non serve, verso biblioteche che
        // bandiscono.
        let full_token = sizing::full_size(self.manifest.presentation2);
        let already_asked_full = token == full_token;

        let (bytes, note) = match first {
            Some(fetched) => (fetched.bytes, None),
            None if try_full && !already_asked_full => {
                let asked_full = self
                    .get(&image_url(&page.image_service, &full_token), signals)
                    .await;
                // La misura riportata è quella davvero chiesta: la dimensione
                // piena, non quella calcolata che il servizio ha rifiutato.
                token = full_token.clone();
                match asked_full {
                    Ok(Some(fetched)) => self.reduce_to_cap(fetched.bytes),
                    Ok(None) => return Ok(Asked::Stopped),
                    // Rifiutata anche a dimensione piena: la biblioteca ha detto
                    // di non averla, e lascia la sua riga.
                    Err(error) if !error.kind.is_retryable() => return Ok(Asked::NotServed),
                    // Guasta anche a dimensione piena: si salta senza riga.
                    // «Stai correndo troppo» invece sale sempre, perché non è la
                    // pagina a mancare (fatto 1).
                    Err(error) if error.kind == ErrorKind::Transport && self.last_attempt() => {
                        return Ok(Asked::Faulty)
                    }
                    Err(error) => return Err(error),
                }
            }
            None if faulty => return Ok(Asked::Faulty),
            None => return Ok(Asked::NotServed),
        };
        Ok(Asked::Got { bytes, token, note })
    }

    async fn get(
        &self,
        url: &str,
        signals: &Signals<'_>,
    ) -> Result<Option<super::fetch::Fetched>, JobError> {
        fetch(
            self.client,
            self.courtesy,
            self.profile,
            url,
            self.attempt,
            signals,
        )
        .await
    }

    /// Vero quando questo è l'ultimo tentativo del lavoro: da qui in poi salire
    /// con l'errore non porta a nessuna ripresa, e le pagine dopo questa non
    /// verrebbero mai richieste.
    fn last_attempt(&self) -> bool {
        self.attempt >= self.max_attempts
    }

    /// Registra la pagina come non servita e la conta.
    fn not_served(&self, page: &Page) -> Result<PageOutcome, JobError> {
        let _ = sidecar::append(
            self.size_dir,
            &PageRecord::not_served(page.index, page.label.clone(), now_secs()),
        );
        Ok(PageOutcome::NotServed)
    }

    /// Riduce al tetto i byte arrivati a dimensione piena e **tiene solo il
    /// risultato** (decisione 2 del piano): i byte in più sono già stati spesi
    /// in rete, ma non devono occupare disco, e il deposito resta coerente col
    /// tetto.
    ///
    /// È una ricompressione, quindi va segnata: senza la nota, la pagina è
    /// indistinguibile da una arrivata già a quella misura.
    fn reduce_to_cap(&self, bytes: Vec<u8>) -> (Vec<u8>, Option<Note>) {
        let SizeCap::LongEdge(long_edge) = self.cap else {
            return (bytes, None);
        };
        let from = image_dimensions(&bytes);
        match images::resize_jpeg(&bytes, long_edge, DOWNSCALE_QUALITY) {
            Ok(reduced) => (reduced, from.map(|from| Note::Downscaled { from })),
            Err(error) => {
                // Riduzione fallita: si conserva l'originale invece di perdere
                // la pagina. Occupa più del tetto, e l'ottimizzazione locale
                // sa rimediare.
                log::warn!("job downscale failed error={error}");
                (bytes, None)
            }
        }
    }

    /// Miniatura ricavata dai byte già in memoria (D6). Un fallimento non fa
    /// fallire il libro.
    fn store_thumbnail(&self, index: u32, bytes: &[u8]) {
        let Ok(relative) =
            layout::thumbnail_path(&self.config.provider_key, &self.config.version_id, index)
        else {
            return;
        };
        let target = self.root.join(relative);
        if target.is_file() {
            return;
        }
        match images::thumbnail(bytes, self.config.thumbnail_edge) {
            Ok(thumbnail) => {
                if let Err(error) = stage_and_promote(
                    &self.staging.join(thumbnail_staging_name(index)),
                    &target,
                    &thumbnail,
                    integrity::FileKind::Image,
                ) {
                    log::warn!(
                        "job thumbnail not stored page={index} error={}",
                        error.message
                    );
                }
            }
            Err(error) => log::warn!("job thumbnail not derived page={index} error={error}"),
        }
    }
}

/// Oltre questa attesa si dichiara che è la **nostra** cortesia a tenere fermo
/// il lavoro (D17). Più lunga della pausa massima fra due richieste (6 s su
/// Gallica) e molto più corta del raffreddamento più breve (120 s).
const DECLARE_WAIT_AFTER: std::time::Duration = std::time::Duration::from_secs(15);

/// Come `PageFetcher::one`, ma se l'attesa si allunga dice **perché**: con i
/// raffreddamenti di D18 un lavoro può restare fermo minuti, e fermo per
/// cortesia e fermo per errore sono la stessa immobilità con significati
/// opposti.
pub(crate) async fn one_declaring_long_waits(
    fetcher: &PageFetcher<'_>,
    rule: &mut SizingRule,
    page: &Page,
    known: &BTreeMap<u32, PageRecord>,
    progress: &Progress,
    reporter: &Reporter<'_>,
    signals: &Signals<'_>,
) -> Result<PageOutcome, JobError> {
    let work = fetcher.one(rule, page, known, signals);
    tokio::pin!(work);

    tokio::select! {
        outcome = &mut work => outcome,
        _ = tokio::time::sleep(DECLARE_WAIT_AFTER) => {
            // Solo se l'attesa è la nostra: un server lento non è un limite che
            // stiamo rispettando.
            if signals.courtesy_wait.load(std::sync::atomic::Ordering::SeqCst) {
                reporter.waiting(progress, page).await;
            }
            work.await
        }
    }
}

/// Dimensioni dell'immagine senza decodificarla per intero.
fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()
}

/// Nomi distinti nell'area di transito: pagina e miniatura ci passano insieme,
/// e due nomi uguali significherebbero che una porta via l'altra.
fn page_staging_name(page_index: u32) -> String {
    format!("{page_index:04}.jpg")
}

fn thumbnail_staging_name(page_index: u32) -> String {
    format!("{page_index:04}-thumb.jpg")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_and_thumbnail_do_not_share_a_name_in_the_staging_area() {
        assert_ne!(page_staging_name(12), thumbnail_staging_name(12));
    }
}
