//! Cosa il pannello legge mentre il lavoro gira: avanzamento, stima, dettaglio.

use std::time::{Duration, Instant};

use crate::iiif::network::NetworkProfile;
use crate::jobs::engine::JobContext;

use super::manifest::Page;
use super::pages::PageOutcome;

/// Pagine da campionare prima di fidarsi del ritmo osservato: con una o due la
/// media è quella di un campione, non di un andamento.
const PACE_SAMPLE: u32 = 3;

/// Quanto ci mette un server a servire una pagina, prima di averlo misurato su
/// questo lavoro. **Misurato** il 2026-08-18: 2,6 s su archive.org e 1,5 s su
/// Gallica per una pagina ridotta, con la spaziatura tipica fra due pagine fra i
/// 2 e gli 8 s, dominata dalla risposta del server.
const TYPICAL_SERVER_TIME: Duration = Duration::from_millis(2_500);

/// Stato del lavoro in questo istante, nei termini in cui il pannello lo mostra.
pub(crate) struct Progress {
    /// Pagine presenti nella cartella di misura, comprese quelle di prima.
    pub present: u32,
    /// Pagine dichiarate dal manifesto.
    pub total: u32,
    /// Byte nella cartella di misura.
    pub bytes: u64,
    /// Pagine che la biblioteca non ha servito **in questo avvio**: il totale
    /// storico lo dà la differenza fra cartella e conteggio atteso (§5.2).
    pub unavailable: u32,
    /// Pagine davvero scaricate in questo avvio: è la base della stima.
    pub fetched_now: u32,
}

impl Progress {
    pub(crate) fn done(&self) -> u32 {
        self.present + self.unavailable
    }

    pub(crate) fn ratio(&self) -> f64 {
        f64::from(self.done()) / f64::from(self.total.max(1))
    }

    /// Stima del tempo restante dal ritmo misurato in questo avvio (D17).
    ///
    /// Sotto `PACE_SAMPLE` pagine si somma la pausa dichiarata dal profilo al
    /// tempo di risposta misurato sul campo: la pausa da sola è il minimo che
    /// aspettiamo noi, non quanto ci mette la biblioteca, e su archive.org
    /// dichiara 1,6 s dove il tempo per pagina misurato va da 1 a 19 s.
    pub(crate) fn eta(&self, elapsed: Duration, profile: &NetworkProfile) -> i64 {
        let remaining = self.total.saturating_sub(self.done());
        let per_page = if self.fetched_now >= PACE_SAMPLE {
            elapsed / self.fetched_now
        } else {
            profile.average_pause() + TYPICAL_SERVER_TIME
        };
        (u64::from(remaining) * per_page.as_millis() as u64 / 1000) as i64
    }

    /// Dettaglio JSON letto dal pannello.
    ///
    /// Due gruppi, e vanno tenuti distinti: quello che vale per **tutto il
    /// lavoro** e quello che vale per l'**ultima pagina passata**. Il peso di una
    /// pagina letto come se fosse quello del libro non dice niente.
    pub(crate) fn detail(
        &self,
        cap: &str,
        provider: &str,
        host: &str,
        page: &Page,
        outcome: &PageOutcome,
    ) -> String {
        let estimated = if self.present > 0 {
            self.bytes / u64::from(self.present) * u64::from(self.total)
        } else {
            0
        };
        let mut last = serde_json::json!({ "index": page.index, "label": page.label });
        if let Some(map) = last.as_object_mut() {
            match outcome {
                PageOutcome::Written {
                    bytes,
                    token,
                    pixels,
                } => {
                    map.insert("bytes".into(), (*bytes).into());
                    map.insert("size".into(), token.clone().into());
                    // «Scaricata adesso» e «già sul disco» sono la differenza fra
                    // una richiesta fatta e una risparmiata: il pannello la dice.
                    map.insert("recovered".into(), false.into());
                    if let Some((width, height)) = pixels {
                        map.insert("pixels".into(), format!("{width}×{height}").into());
                    }
                }
                // Ritrovata sul disco: nessuna richiesta, quindi nessuna misura
                // chiesta da mostrare. Inventarla — ripiegando sul tetto — faceva
                // sembrare un'impostazione il risultato di un calcolo.
                PageOutcome::Present => {
                    map.insert("recovered".into(), true.into());
                }
                PageOutcome::NotServed | PageOutcome::Stopped => {}
            }
        }
        serde_json::json!({
            "units": { "done": self.present, "total": self.total, "label": "items" },
            "unavailable": self.unavailable,
            "bytes": { "downloaded": self.bytes, "estimated": estimated },
            "cap": cap,
            "provider": provider,
            "host": host,
            "last": last,
        })
        .to_string()
    }
}

/// Chi riferisce al pannello. Tiene insieme le quattro cose che servono a
/// dichiarare un'attesa, che altrimenti viaggiano una per una.
pub(crate) struct Reporter<'a> {
    pub ctx: &'a JobContext,
    pub title: &'a str,
    pub started_at: Instant,
    pub profile: &'a NetworkProfile,
}

impl Reporter<'_> {
    /// Dichiara che il lavoro è fermo per i limiti della biblioteca (D17).
    pub(crate) async fn waiting(&self, progress: &Progress, page: &Page) {
        log::info!(
            "job waiting id={} reason={} page={}",
            self.ctx.id,
            crate::jobs::WAITING_LIBRARY_LIMITS,
            page.index
        );
        self.ctx
            .report_waiting(
                progress.ratio(),
                Some(self.title),
                Some(progress.eta(self.started_at.elapsed(), self.profile)),
            )
            .await;
    }

    /// Avanzamento normale, una volta per pagina.
    pub(crate) async fn advanced(&self, progress: &Progress, detail: &str) {
        self.ctx
            .report(
                progress.ratio(),
                Some(self.title),
                Some(progress.eta(self.started_at.elapsed(), self.profile)),
                Some(detail),
            )
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iiif::network::{CAUTIOUS, GALLICA};

    fn progress(present: u32, fetched_now: u32) -> Progress {
        Progress {
            present,
            total: 100,
            bytes: 2_000_000,
            unavailable: 0,
            fetched_now,
        }
    }

    #[test]
    fn before_having_measured_anything_the_estimate_comes_from_the_declared_pause() {
        let quick = Progress {
            total: 10,
            ..progress(0, 0)
        }
        .eta(Duration::ZERO, &CAUTIOUS);
        let long = Progress {
            total: 210,
            ..progress(0, 0)
        }
        .eta(Duration::ZERO, &GALLICA);

        assert!(long > quick);
        // Con i valori di Gallica 210 pagine non scendono sotto il quarto d'ora.
        assert!(long >= 900, "stimati {long} secondi");
    }

    #[test]
    fn once_it_has_measured_the_estimate_follows_the_real_pace() {
        // 10 pagine in 120 s = 12 s a pagina, per le 90 che restano.
        let measured = progress(10, 10).eta(Duration::from_secs(120), &CAUTIOUS);

        assert_eq!(measured, 1_080);
        assert!(measured > progress(10, 0).eta(Duration::ZERO, &CAUTIOUS));
    }

    #[test]
    fn two_pages_are_not_a_pace() {
        let barely_started = progress(2, 2).eta(Duration::from_secs(60), &CAUTIOUS);

        assert_eq!(
            barely_started,
            progress(2, 0).eta(Duration::ZERO, &CAUTIOUS)
        );
    }

    #[test]
    fn the_detail_counts_the_pages_present_and_the_ones_not_served() {
        let page = Page {
            index: 2,
            label: Some("2r".into()),
            image_service: "https://img/1".into(),
            size: Some((2646, 4112)),
        };
        let progress = Progress {
            present: 4,
            total: 10,
            bytes: 2_000_000,
            unavailable: 1,
            fetched_now: 4,
        };

        let parsed: serde_json::Value = serde_json::from_str(&progress.detail(
            "2000",
            "archive_org",
            "iiif.archive.org",
            &page,
            &PageOutcome::Written {
                bytes: 540_000,
                token: "1323,".into(),
                pixels: Some((1323, 2056)),
            },
        ))
        .unwrap();

        assert_eq!(parsed["units"]["done"], 4);
        assert_eq!(parsed["unavailable"], 1);
        // La stima del totale si ricava dalle pagine già arrivate.
        assert_eq!(parsed["bytes"]["estimated"], 5_000_000);
    }

    #[test]
    fn the_detail_says_of_the_last_page_what_that_page_cost() {
        // Il tetto è «2000» ma a questa pagina è stata chiesta la misura
        // calcolata per lei: leggerle sotto la stessa etichetta faceva sembrare
        // un'impostazione il risultato di un calcolo.
        let page = Page {
            index: 34,
            label: Some("17r".into()),
            image_service: "https://img/34".into(),
            size: Some((2646, 4112)),
        };
        let parsed: serde_json::Value = serde_json::from_str(&progress(4, 4).detail(
            "2000",
            "archive_org",
            "iiif.archive.org",
            &page,
            &PageOutcome::Written {
                bytes: 540_000,
                token: "1323,".into(),
                pixels: Some((1323, 2056)),
            },
        ))
        .unwrap();

        assert_eq!(parsed["last"]["index"], 34);
        assert_eq!(parsed["last"]["size"], "1323,");
        assert_eq!(parsed["last"]["pixels"], "1323×2056");
        assert_eq!(parsed["last"]["bytes"], 540_000);
        assert_eq!(parsed["last"]["recovered"], false);
    }

    #[test]
    fn a_page_found_on_disk_has_no_size_to_show() {
        // Nessuna richiesta è stata fatta: la misura chiesta non esiste, e
        // ripiegare sul tetto sarebbe inventarla.
        let page = Page {
            index: 7,
            label: None,
            image_service: "https://img/7".into(),
            size: Some((2646, 4112)),
        };
        let parsed: serde_json::Value = serde_json::from_str(&progress(4, 0).detail(
            "2000",
            "archive_org",
            "iiif.archive.org",
            &page,
            &PageOutcome::Present,
        ))
        .unwrap();

        assert_eq!(parsed["last"]["recovered"], true);
        assert!(parsed["last"]["size"].is_null());
        assert!(parsed["last"]["bytes"].is_null());
    }
}
