//! Cosa il pannello legge mentre il lavoro gira: avanzamento, stima, dettaglio.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

use crate::iiif::network::NetworkProfile;
use crate::jobs::engine::JobContext;

use super::manifest::Page;
use super::pages::PageOutcome;

/// Pagine da campionare prima di fidarsi del ritmo osservato: con una o due la
/// media è quella di un campione, non di un andamento.
const PACE_SAMPLE: usize = 3;

/// Quante pagine guarda il ritmo. Una media da inizio lavoro veniva falsata due
/// volte: dalle pagine ritrovate sul disco, che non costano nessuna richiesta, e
/// da un raffreddamento, che restava nel conto per tutto il resto del libro.
const PACE_WINDOW: usize = 10;

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
    /// storico lo dà la differenza fra cartella e conteggio atteso.
    pub unavailable: u32,
    /// Vero se almeno una pagina è stata saltata per un **guasto** e non per un
    /// rifiuto: cambia come si dichiara un lavoro che non ha portato niente.
    pub faulty: bool,
    /// Quando sono arrivate le ultime pagine scaricate e quanto pesavano: è la
    /// base della stima e della velocità mostrata a chi guarda.
    pub recent: VecDeque<(Instant, u64)>,
}

impl Progress {
    pub(crate) fn done(&self) -> u32 {
        self.present + self.unavailable
    }

    pub(crate) fn ratio(&self) -> f64 {
        f64::from(self.done()) / f64::from(self.total.max(1))
    }

    /// Registra l'arrivo di una pagina, tenendo solo le ultime `PACE_WINDOW`.
    pub(crate) fn fetched(&mut self, at: Instant, bytes: u64) {
        self.recent.push_back((at, bytes));
        while self.recent.len() > PACE_WINDOW + 1 {
            self.recent.pop_front();
        }
    }

    /// Stima del tempo restante dal ritmo delle **ultime** pagine.
    ///
    /// Non esiste più una pausa dichiarata da cui partire: finché il ritmo non è
    /// misurato si usa il tempo di risposta osservato sul campo, diviso per
    /// quante pagine il profilo chiede insieme. È una stima di partenza, e dopo
    /// tre pagine viene sostituita da quella vera.
    pub(crate) fn eta(&self, profile: &NetworkProfile) -> i64 {
        let remaining = self.total.saturating_sub(self.done());
        let per_page = self
            .pace()
            .unwrap_or(TYPICAL_SERVER_TIME / profile.bulk_workers().max(1) as u32);
        (u64::from(remaining) * per_page.as_millis() as u64 / 1000) as i64
    }

    /// Quello che il pannello deve sapere di questo istante.
    ///
    /// Si legge sotto il turno e poi si lascia andare: tenere aperta la lettura
    /// mentre si riferisce fermerebbe le altre pagine in corso.
    pub(crate) fn snapshot(&self, profile: &NetworkProfile) -> Snapshot {
        Snapshot {
            ratio: self.ratio(),
            eta: self.eta(profile),
        }
    }

    /// Il tempo per pagina osservato nella finestra, se la finestra è abbastanza
    /// piena da essere un andamento e non un campione.
    fn pace(&self) -> Option<Duration> {
        if self.recent.len() < PACE_SAMPLE {
            return None;
        }
        let (first, _) = *self.recent.front()?;
        let (last, _) = *self.recent.back()?;
        let intervals = (self.recent.len() - 1) as u32;
        Some((last - first) / intervals)
    }

    /// Byte al secondo osservati nella finestra, `0` finché non c'è abbastanza
    /// per dirlo. È la risposta a «sta scaricando o è piantato?».
    pub(crate) fn speed_bytes_per_sec(&self) -> u64 {
        if self.recent.len() < 2 {
            return 0;
        }
        let (first, _) = self.recent[0];
        let (last, _) = self.recent[self.recent.len() - 1];
        let elapsed = (last - first).as_millis() as u64;
        if elapsed == 0 {
            return 0;
        }
        // Il primo arrivo segna l'inizio della finestra, non un carico dentro:
        // contarlo gonfierebbe la velocità di una pagina intera.
        let bytes: u64 = self.recent.iter().skip(1).map(|(_, bytes)| bytes).sum();
        bytes * 1_000 / elapsed
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
                PageOutcome::NotServed | PageOutcome::Faulty | PageOutcome::Stopped => {}
            }
        }
        serde_json::json!({
            "units": { "done": self.present, "total": self.total, "label": "items" },
            "unavailable": self.unavailable,
            "bytes": { "downloaded": self.bytes, "estimated": estimated },
            "speed": self.speed_bytes_per_sec(),
            "cap": cap,
            "provider": provider,
            "host": host,
            "last": last,
        })
        .to_string()
    }
}

/// Avanzamento e stima in un istante preciso, staccati dal conteggio vivo.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Snapshot {
    pub ratio: f64,
    pub eta: i64,
}

/// Chi riferisce al pannello.
pub(crate) struct Reporter<'a> {
    pub ctx: &'a JobContext,
    pub title: &'a str,
}

impl Reporter<'_> {
    /// Dichiara che il lavoro è fermo per i limiti della biblioteca.
    pub(crate) async fn waiting(&self, at: Snapshot, page: &Page) {
        log::info!(
            "job waiting id={} reason={} page={}",
            self.ctx.id,
            crate::jobs::WAITING_LIBRARY_LIMITS,
            page.index
        );
        self.ctx
            .report_waiting(at.ratio, Some(self.title), Some(at.eta))
            .await;
    }

    /// Avanzamento normale, una volta per pagina.
    pub(crate) async fn advanced(&self, at: Snapshot, detail: &str) {
        self.ctx
            .report(at.ratio, Some(self.title), Some(at.eta), Some(detail))
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iiif::network::{CAUTIOUS, GALLICA};

    /// Un avanzamento con `fetched` arrivi finti, distanti `every` l'uno
    /// dall'altro: è la finestra su cui si misura il ritmo.
    fn progress(present: u32, fetched: usize, every: Duration) -> Progress {
        let start = Instant::now();
        let mut recent = VecDeque::new();
        for index in 0..fetched {
            recent.push_back((start + every * index as u32, 500_000));
        }
        Progress {
            present,
            total: 100,
            bytes: 2_000_000,
            unavailable: 0,
            faulty: false,
            recent,
        }
    }

    #[test]
    fn before_having_measured_anything_the_estimate_comes_from_how_many_pages_go_together() {
        let book = Progress {
            total: 210,
            ..progress(0, 0, Duration::ZERO)
        };

        // Gallica chiede una pagina alla volta, le altre due: a parità di libro
        // la stima di partenza è il doppio, a meno dell'arrotondamento.
        assert!(book.eta(&CAUTIOUS) > 0);
        assert!((book.eta(&GALLICA) - 2 * book.eta(&CAUTIOUS)).abs() <= 1);
    }

    #[test]
    fn once_it_has_measured_the_estimate_follows_the_real_pace() {
        // Undici arrivi distanti 12 s: 12 s a pagina, per le 90 che restano.
        let measured = progress(10, 11, Duration::from_secs(12)).eta(&CAUTIOUS);

        assert_eq!(measured, 1_080);
        assert!(measured > progress(10, 0, Duration::ZERO).eta(&CAUTIOUS));
    }

    #[test]
    fn two_pages_are_not_a_pace() {
        let barely_started = progress(2, 2, Duration::from_secs(30)).eta(&CAUTIOUS);

        assert_eq!(
            barely_started,
            progress(2, 0, Duration::ZERO).eta(&CAUTIOUS)
        );
    }

    #[test]
    fn the_estimate_looks_at_the_last_pages_and_not_at_the_whole_job() {
        // Due pagine veloci, poi un raffreddamento di dieci minuti: la stima
        // schizza, ed è giusto. Ma da lì in poi il ritmo torna quello di prima, e
        // una media da inizio lavoro resterebbe pessimista per tutto il resto del
        // libro. La finestra si dimentica dell'attesa dopo `PACE_WINDOW` pagine.
        let start = Instant::now();
        let mut progress = progress(10, 2, Duration::from_secs(1));
        let after_the_cooldown = start + Duration::from_secs(601);
        progress.fetched(after_the_cooldown, 500_000);
        let pessimistic = progress.eta(&CAUTIOUS);

        for index in 1..=PACE_WINDOW {
            progress.fetched(
                after_the_cooldown + Duration::from_secs(index as u64),
                500_000,
            );
        }

        assert!(
            progress.eta(&CAUTIOUS) < pessimistic / 10,
            "il raffreddamento è uscito dalla finestra: {} contro {pessimistic}",
            progress.eta(&CAUTIOUS)
        );
    }

    #[test]
    fn the_window_forgets_what_is_older_than_its_size() {
        let mut progress = progress(0, 0, Duration::ZERO);
        let start = Instant::now();
        for index in 0..=(PACE_WINDOW * 3) {
            progress.fetched(start + Duration::from_secs(index as u64), 500_000);
        }

        assert_eq!(progress.recent.len(), PACE_WINDOW + 1);
    }

    #[test]
    fn the_detail_counts_the_pages_present_and_the_ones_not_served() {
        let page = Page {
            index: 2,
            label: Some("2r".into()),
            image_service: "https://img/1".into(),
            size: Some((2646, 4112)),
            canvas_id: None,
        };
        let progress = Progress {
            total: 10,
            unavailable: 1,
            ..progress(4, 4, Duration::from_secs(3))
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
            canvas_id: None,
        };
        let parsed: serde_json::Value =
            serde_json::from_str(&progress(4, 4, Duration::from_secs(3)).detail(
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
            canvas_id: None,
        };
        let parsed: serde_json::Value =
            serde_json::from_str(&progress(4, 0, Duration::ZERO).detail(
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
