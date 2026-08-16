//! Profilo di rete dei provider (D18).
//!
//! Ogni biblioteca dichiara **come si sta al suo tavolo**: quanto aspettare fra
//! una richiesta e l'altra, quante richieste in un minuto, quanto raffreddarsi
//! dopo un rifiuto, quanti tentativi. I valori non sono stimati: vengono dalle
//! prove sul campo fatte in Scriptoria, dove un 403 su Gallica significa "stai
//! correndo troppo" e non "vietato".
//!
//! Il profilo lo dichiara il provider, **i contatori si tengono per host**: un
//! provider può servire ricerca e immagini da macchine diverse, e quella che si
//! affanna è la seconda. Le fonti aggiunte per indirizzo diretto non hanno voce
//! nel registro e usano il profilo prudente: nessuna fonte resta senza politica.

use std::time::Duration;

/// Quanto si aspetta fra due richieste allo stesso host, e quante se ne possono
/// fare in una finestra.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProfile {
    /// Pausa fra richieste: durata casuale nell'intervallo, per non presentarsi
    /// con un ritmo meccanico.
    pub pause_min_ms: u64,
    pub pause_max_ms: u64,
    /// Limite a raffica, a finestra scorrevole: `burst_requests` richieste ogni
    /// `burst_window_secs`, **indipendente** dalla concorrenza.
    pub burst_requests: u32,
    pub burst_window_secs: u64,
    /// Raffreddamento dopo un rifiuto per eccesso di richieste.
    pub cooldown_403_secs: u64,
    pub cooldown_429_secs: u64,
    /// Quante richieste insieme verso lo stesso host.
    pub host_concurrency: usize,
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
pub const CAUTIOUS: NetworkProfile = NetworkProfile {
    pause_min_ms: 600,
    pause_max_ms: 1_600,
    burst_requests: 100,
    burst_window_secs: 60,
    cooldown_403_secs: 120,
    cooldown_429_secs: 120,
    host_concurrency: 4,
    max_attempts: 5,
    backoff_base_secs: 15,
    backoff_cap_secs: 300,
    connect_timeout_secs: 15,
    read_timeout_secs: 30,
    needs_viewer_warmup: false,
};

/// Gallica è la più severa delle biblioteche provate: con questi valori un
/// manoscritto di 210 carte richiede almeno un quarto d'ora, ed è il motivo per
/// cui pausa, ripresa e tempo stimato non sono ornamenti (D18).
pub const GALLICA: NetworkProfile = NetworkProfile {
    pause_min_ms: 2_500,
    pause_max_ms: 6_000,
    burst_requests: 20,
    burst_window_secs: 60,
    cooldown_403_secs: 600,
    cooldown_429_secs: 300,
    host_concurrency: 2,
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

    /// Tempo medio di una richiesta, usato per la stima del tempo che manca
    /// (D17): si calcola dalla pausa dichiarata, non dalla velocità osservata
    /// negli ultimi secondi, che con pause di 2,5–6 secondi oscilla troppo.
    pub fn average_pause(&self) -> Duration {
        Duration::from_millis((self.pause_min_ms + self.pause_max_ms) / 2)
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
    fn gallica_waits_longer_than_the_cautious_default() {
        let gallica = GALLICA;
        let cautious = CAUTIOUS;
        assert!(gallica.pause_min_ms > cautious.pause_min_ms);
        assert!(gallica.burst_requests < cautious.burst_requests);
        assert!(gallica.cooldown_403_secs > cautious.cooldown_403_secs);
    }

    #[test]
    fn the_estimate_uses_the_declared_pause() {
        assert_eq!(GALLICA.average_pause(), Duration::from_millis(4_250));
    }
}
