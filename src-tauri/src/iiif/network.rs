//! Profilo di rete dei provider.
//!
//! Ogni biblioteca dichiara **come si sta al suo tavolo**: quante richieste in
//! un minuto, quante insieme, quante pagine per volta, quanto raffreddarsi dopo
//! un rifiuto, quanti tentativi. I valori vengono dalle prove sul campo fatte in
//! Scriptoria, dove un 403 su Gallica significa "stai correndo troppo" e non
//! "vietato".
//!
//! **Non esiste una pausa fra due richieste riuscite.** È la scelta di
//! Scriptoria, verificata nel suo client HTTP: i freni sono il numero di
//! richieste insieme, il limite a raffica e il raffreddamento dopo un rifiuto.
//! Una pausa per richiesta si moltiplicava per ogni tassello del visore e
//! rendeva illeggibile una pagina che il servizio avrebbe servito in un secondo.
//!
//! Il profilo lo dichiara il provider, **i contatori si tengono per host**: un
//! provider può servire ricerca e immagini da macchine diverse, e quella che si
//! affanna è la seconda. Le fonti aggiunte per indirizzo diretto non hanno voce
//! nel registro e usano il profilo prudente: nessuna fonte resta senza politica.

use std::time::Duration;

/// Quante richieste si possono fare a un host, insieme e in una finestra.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProfile {
    /// Limite a raffica, a finestra scorrevole: `burst_requests` richieste ogni
    /// `burst_window_secs`, **indipendente** dalla concorrenza. Vale per tutto
    /// il traffico verso quell'host, visore compreso.
    pub burst_requests: u32,
    pub burst_window_secs: u64,
    /// Raffreddamento dopo un rifiuto per eccesso di richieste.
    pub cooldown_403_secs: u64,
    pub cooldown_429_secs: u64,
    /// Quante richieste insieme verso lo stesso host, **sommando** visore e
    /// scaricamenti. Un posto di questo tetto resta sempre a chi guarda.
    pub host_concurrency: usize,
    /// Quante pagine di uno stesso libro si scaricano insieme. Resta comunque
    /// sotto `host_concurrency`, che è il tetto vero.
    pub workers_per_job: usize,
    /// Tentativi del lavoro, e attesa esponenziale fra l'uno e l'altro.
    pub max_attempts: u32,
    pub backoff_base_secs: u64,
    pub backoff_cap_secs: u64,
    pub connect_timeout_secs: u64,
    pub read_timeout_secs: u64,
    /// Alcuni servizi servono le immagini solo dopo aver visitato la pagina del
    /// lettore, che apre una sessione.
    pub needs_viewer_warmup: bool,
}

/// Profilo prudente: vale per ogni fonte che non abbia una voce nel registro.
///
/// La raffica è più larga di quella di Scriptoria (100/min) perché lì il visore
/// non passa dal limitatore: qui lo stesso contatore copre tasselli, miniature e
/// pagine scaricate, e con 100/min una sola schermata a zoom pieno consumerebbe
/// il minuto intero.
pub const CAUTIOUS: NetworkProfile = NetworkProfile {
    burst_requests: 240,
    burst_window_secs: 60,
    cooldown_403_secs: 120,
    cooldown_429_secs: 120,
    host_concurrency: 4,
    workers_per_job: 2,
    max_attempts: 5,
    backoff_base_secs: 15,
    backoff_cap_secs: 300,
    connect_timeout_secs: 15,
    // Lungo di proposito. Internet Archive ricava manifesto e immagini **su
    // richiesta**: la prima volta che si apre un libro il server accetta la
    // connessione e poi tace anche per un minuto. Con trenta secondi si
    // rinunciava e si ricominciava da capo tre volte, cioè si aspettava di più.
    // Un server irraggiungibile continua a fallire subito: quello lo dice
    // `connect_timeout_secs`.
    read_timeout_secs: 120,
    needs_viewer_warmup: false,
};

/// Gallica è la più severa delle biblioteche provate: due richieste insieme, una
/// pagina alla volta, e dopo un 403 dieci minuti di silenzio. Il raffreddamento
/// lungo, non una pausa fra richieste, è quello che evita di farsi bandire.
pub const GALLICA: NetworkProfile = NetworkProfile {
    burst_requests: 120,
    cooldown_403_secs: 600,
    cooldown_429_secs: 300,
    host_concurrency: 2,
    workers_per_job: 1,
    max_attempts: 3,
    backoff_base_secs: 20,
    ..CAUTIOUS
};

pub const VATICAN: NetworkProfile = NetworkProfile {
    needs_viewer_warmup: true,
    ..CAUTIOUS
};

impl NetworkProfile {
    /// Attesa prima del tentativo successivo, in secondi.
    ///
    /// `retry_after` è quello dichiarato dal servizio: quando c'è, vince — il
    /// server sa meglio di noi quando è pronto. Non lo si accorcia mai: chiedere
    /// prima del tempo dichiarato è il modo più diretto di farsi bandire.
    pub fn wait_after(&self, status: Option<u16>, attempt: u32, retry_after: Option<u64>) -> u64 {
        if let Some(declared) = retry_after {
            return declared;
        }
        match status {
            Some(403) => self.cooldown_403_secs,
            Some(429) => self.cooldown_429_secs,
            _ => {
                let factor = 2u64.saturating_pow(attempt.saturating_sub(1).min(16));
                self.backoff_base_secs
                    .saturating_mul(factor.max(1))
                    .min(self.backoff_cap_secs)
            }
        }
    }

    pub fn connect_timeout(&self) -> Duration {
        Duration::from_secs(self.connect_timeout_secs)
    }

    pub fn read_timeout(&self) -> Duration {
        Duration::from_secs(self.read_timeout_secs)
    }

    /// Quante pagine si chiedono davvero insieme.
    ///
    /// Un posto del tetto per host resta sempre libero per il visore: senza,
    /// uno scaricamento in corso riempirebbe la corsia e cambiare pagina
    /// significherebbe aspettare la fine del libro.
    pub fn bulk_workers(&self) -> usize {
        let reserved_for_the_viewer = self.host_concurrency.max(2) - 1;
        self.workers_per_job.clamp(1, reserved_for_the_viewer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_403_on_gallica_means_slow_down_not_forbidden() {
        assert_eq!(GALLICA.wait_after(Some(403), 1, None), 600);
    }

    #[test]
    fn a_declared_retry_after_wins_over_our_calculation() {
        assert_eq!(GALLICA.wait_after(Some(429), 1, Some(45)), 45);
    }

    #[test]
    fn a_long_declared_wait_is_never_shortened() {
        // Un'ora dichiarata è un'ora: accorciarla a quello che avremmo scelto
        // noi significa ribussare mentre il servizio ha detto di non farlo.
        assert_eq!(CAUTIOUS.wait_after(Some(429), 1, Some(3_600)), 3_600);
    }

    #[test]
    fn a_transport_failure_backs_off_and_stops_at_the_cap() {
        assert_eq!(GALLICA.wait_after(None, 1, None), 20);
        assert_eq!(GALLICA.wait_after(None, 2, None), 40);
        assert_eq!(GALLICA.wait_after(None, 9, None), 300);
    }

    #[test]
    fn the_cautious_profile_is_the_one_without_a_registry_entry() {
        // Nessuna fonte resta senza politica: chi arriva per indirizzo diretto
        // usa questo.
        assert_eq!(CAUTIOUS.host_concurrency, 4);
        assert_eq!(CAUTIOUS.max_attempts, 5);
    }

    #[test]
    fn every_provider_in_the_registry_declares_a_profile() {
        // "Aggiungere una biblioteca deve significare compilare un record": se
        // il profilo mancasse, quella biblioteca scaricherebbe senza freni.
        for provider in crate::iiif::PROVIDERS {
            assert!(
                provider.network.burst_requests > 0 && provider.network.max_attempts > 0,
                "{} senza profilo",
                provider.key
            );
        }
    }

    #[test]
    fn gallica_is_more_careful_than_the_cautious_default() {
        // Confronto fatto su copie: i profili sono costanti, e paragonare due
        // costanti è una domanda a cui il compilatore risponde da solo.
        let gallica = GALLICA;
        let cautious = CAUTIOUS;
        assert!(gallica.burst_requests < cautious.burst_requests);
        assert!(gallica.host_concurrency < cautious.host_concurrency);
        assert!(gallica.workers_per_job < cautious.workers_per_job);
        assert!(gallica.cooldown_403_secs > cautious.cooldown_403_secs);
    }

    #[test]
    fn a_download_never_takes_the_last_seat_of_a_host() {
        // Il visore deve poter cambiare pagina mentre il libro si scarica: se lo
        // scaricamento potesse occupare tutti i posti, non ci riuscirebbe.
        for profile in [CAUTIOUS, GALLICA] {
            assert!(
                profile.bulk_workers() < profile.host_concurrency,
                "un posto resta al visore"
            );
        }
    }

    #[test]
    fn a_single_seat_host_still_downloads_one_page_at_a_time() {
        // Con un solo posto dichiarato non si può riservare niente: meglio una
        // pagina alla volta che nessuna.
        let single = NetworkProfile {
            host_concurrency: 1,
            workers_per_job: 4,
            ..CAUTIOUS
        };

        assert_eq!(single.bulk_workers(), 1);
    }
}
