//! Il registro dei fatti (#378, decisioni D23-D29).
//!
//! Tre registri con tre nature diverse, e la regola per smistarli:
//!
//! | Se… | Va in |
//! |---|---|
//! | lo raggrupperesti in un grafico | `provenance_events` |
//! | serve solo a un umano che legge la console | `operation_logs` |
//! | è un valore calcolato dopo, ricalcolabile | `derived_metrics` |
//!
//! Qui si scrive il primo: **append-only, mai cancellato automaticamente**
//! (D28). Un fatto non si modifica — è successo.
//!
//! **Niente lascia la macchina** (D26): nessuna telemetria esterna, nemmeno
//! anonima, nemmeno facoltativa.

use rusqlite::{params, Connection};

/// Chi ha fatto la cosa. `user` e `model` esistono nella tabella e li scrive
/// l'interfaccia, che è dove quelle decisioni accadono.
pub const ACTOR_SYSTEM: &str = "system";

/// I tipi di evento scritti da qui. Il vocabolario cresce con i lavori: ogni
/// tipo di lavoro dichiara i suoi, come per le fasi.
pub mod event_type {
    /// Un lavoro è partito.
    pub const JOB_STARTED: &str = "job.started";
    /// Un lavoro è arrivato a un esito, buono o cattivo.
    pub const JOB_FINISHED: &str = "job.finished";
}

/// Un fatto da registrare.
///
/// I campi che l'area Analisi raggrupperà — momento, tipo, entità, esito,
/// durata, modello, token, costo — sono colonne e non JSON (D24): dentro un
/// campo JSON quelle interrogazioni funzionano ma non si indicizzano, e un
/// pannello che legge decine di migliaia di righe diventa lento proprio quando
/// finalmente ci sono abbastanza dati per essere interessante.
#[derive(Debug, Clone)]
pub struct Event {
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub workspace_id: Option<String>,
    pub actor: &'static str,
    pub job_id: Option<String>,
    /// Come è andata: `completed`, `error`, `cancelled`, `paused`.
    pub outcome: Option<String>,
    /// Quanto è durata l'esecuzione che ha portato a questo esito. Per un lavoro
    /// ripreso più volte è l'ultima, non la somma: gli orari della tabella dei
    /// lavori non la saprebbero dire — `started_at` segna il primo avvio e non
    /// si azzera più, quindi comprenderebbe anche il tempo in cui il lavoro era
    /// in pausa.
    pub duration_ms: Option<i64>,
    pub error_kind: Option<String>,
    /// Impronta di ciò che l'evento ha visto e di ciò che ha prodotto (D25):
    /// il riferimento dice cosa c'è **adesso**, l'impronta cosa c'era
    /// **allora**.
    pub input_hash: Option<String>,
    pub output_hash: Option<String>,
    /// Il resto, in JSON: i dettagli propri di quel tipo di evento.
    pub config: Option<String>,
    /// Che cosa rende **distinto** questo fatto dagli altri dello stesso tipo
    /// sulla stessa entità, quando il tipo da solo non basta: la revisione
    /// approvata, per esempio. Vuoto per i fatti dei lavori, dove il tipo è
    /// già l'unica cosa che li distingue (D27).
    pub key_ref: Option<String>,
}

impl Event {
    /// Un fatto del ciclo di vita di un lavoro. È il caso che riguarda tutti i
    /// gestori, e per questo non lo scrive nessuno di loro: lo scrive il
    /// motore (D29).
    ///
    /// Il workspace viene dal lavoro: senza, D24 non potrebbe raggruppare per
    /// workspace e D28 non potrebbe cancellare quello che gli appartiene.
    pub fn for_job(
        event_type: &str,
        job_id: &str,
        job_type: &str,
        workspace_id: Option<&str>,
    ) -> Self {
        Self {
            event_type: event_type.to_string(),
            entity_type: "job".to_string(),
            entity_id: job_id.to_string(),
            workspace_id: workspace_id.map(str::to_string),
            actor: ACTOR_SYSTEM,
            job_id: Some(job_id.to_string()),
            outcome: None,
            duration_ms: None,
            error_kind: None,
            input_hash: None,
            output_hash: None,
            config: Some(serde_json::json!({ "jobType": job_type }).to_string()),
            key_ref: None,
        }
    }
}

/// L'identificativo di un evento, **derivato in modo deterministico** da
/// lavoro, entità e tipo (D27).
///
/// Serve perché un lavoro ritentato riesegue lo stesso passo: senza, un
/// manoscritto scaricato dopo tre tentativi risulterebbe scaricato tre volte e
/// ogni conteggio sarebbe sbagliato.
///
/// **Il numero del tentativo non entra nella chiave.** Se ci entrasse, ogni
/// tentativo produrrebbe una chiave diversa, cioè esattamente la duplicazione
/// che questa regola vuole impedire. Quante volte si è ritentato è già in
/// `jobs.attempt_count`.
pub fn event_id(event: &Event) -> String {
    let key = format!(
        "{}|{}|{}|{}|{}",
        event.job_id.as_deref().unwrap_or(""),
        event.entity_type,
        event.entity_id,
        event.event_type,
        event.key_ref.as_deref().unwrap_or("")
    );
    format!("pev:{}", fnv1a_hex(&key))
}

/// Impronta stabile fra un'esecuzione e l'altra: FNV-1a a 64 bit, non
/// crittografica (D3). Serve a dire «era questo» e a riconoscere che qualcosa
/// è cambiato, non a resistere a una manomissione.
pub fn fnv1a_hex(text: &str) -> String {
    const FNV_PRIME: u64 = 0x0000_0100_0000_01B3;
    const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    let hash = text.as_bytes().iter().fold(FNV_OFFSET, |hash, &byte| {
        (hash ^ byte as u64).wrapping_mul(FNV_PRIME)
    });
    format!("{hash:016x}")
}

/// Scrive un fatto. Riscrivere lo stesso evento **non duplica: sostituisce**
/// (D27).
///
/// Un errore qui non deve fermare il lavoro che stava registrando: la
/// registrazione serve a sapere cosa è successo, non a decidere cosa succede.
/// Chi chiama lo tratta come tale.
pub fn record(conn: &Connection, event: &Event) -> Result<(), String> {
    conn.execute(
        "INSERT INTO provenance_events (id, event_type, entity_type, entity_id, workspace_id, \
             actor, job_id, outcome, duration_ms, error_kind, input_hash, output_hash, config) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) \
         ON CONFLICT(id) DO UPDATE SET occurred_at = CURRENT_TIMESTAMP, \
           outcome = excluded.outcome, duration_ms = excluded.duration_ms, \
           error_kind = excluded.error_kind, input_hash = excluded.input_hash, \
           output_hash = excluded.output_hash, config = excluded.config",
        params![
            event_id(event),
            event.event_type,
            event.entity_type,
            event.entity_id,
            event.workspace_id,
            event.actor,
            event.job_id,
            event.outcome,
            event.duration_ms,
            event.error_kind,
            event.input_hash,
            event.output_hash,
            event.config,
        ],
    )
    .map_err(|error| format!("registro dei fatti: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE provenance_events (
                 id TEXT PRIMARY KEY,
                 occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 event_type TEXT NOT NULL,
                 entity_type TEXT NOT NULL,
                 entity_id TEXT NOT NULL,
                 workspace_id TEXT,
                 actor TEXT NOT NULL DEFAULT 'user',
                 job_id TEXT,
                 input_ref TEXT,
                 output_ref TEXT,
                 config TEXT,
                 outcome TEXT,
                 duration_ms INTEGER,
                 error_kind TEXT,
                 input_hash TEXT,
                 output_hash TEXT
             );",
        )
        .unwrap();
        conn
    }

    fn count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM provenance_events", [], |row| {
            row.get(0)
        })
        .unwrap()
    }

    #[test]
    fn the_same_fact_written_twice_stays_one_row() {
        // Un lavoro ritentato riesegue lo stesso passo: senza questa regola un
        // manoscritto scaricato dopo tre tentativi risulterebbe scaricato tre
        // volte (D27).
        let conn = database();
        let mut event = Event::for_job(
            event_type::JOB_FINISHED,
            "download:v1",
            "source_download",
            Some("ws1"),
        );
        event.outcome = Some("error".to_string());
        record(&conn, &event).unwrap();

        event.outcome = Some("completed".to_string());
        record(&conn, &event).unwrap();

        assert_eq!(count(&conn), 1);
        let outcome: String = conn
            .query_row("SELECT outcome FROM provenance_events", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(outcome, "completed", "vince l'esito più recente");
    }

    #[test]
    fn the_attempt_number_does_not_change_the_identity_of_a_fact() {
        // La chiave si costruisce da lavoro, entità e tipo. Quante volte si è
        // ritentato è un dato del lavoro, non un fatto separato.
        let first = Event::for_job(
            event_type::JOB_FINISHED,
            "download:v1",
            "source_download",
            Some("ws1"),
        );
        let second = Event::for_job(
            event_type::JOB_FINISHED,
            "download:v1",
            "source_download",
            Some("ws1"),
        );

        assert_eq!(event_id(&first), event_id(&second));
    }

    #[test]
    fn different_facts_about_the_same_job_are_different_rows() {
        let conn = database();
        record(
            &conn,
            &Event::for_job(
                event_type::JOB_STARTED,
                "download:v1",
                "source_download",
                Some("ws1"),
            ),
        )
        .unwrap();
        record(
            &conn,
            &Event::for_job(
                event_type::JOB_FINISHED,
                "download:v1",
                "source_download",
                Some("ws1"),
            ),
        )
        .unwrap();

        assert_eq!(count(&conn), 2);
    }

    #[test]
    fn the_fingerprint_is_stable_between_runs() {
        // Se cambiasse fra un'esecuzione e l'altra, «era questo» non
        // significherebbe niente (D25).
        assert_eq!(fnv1a_hex("Beatus vir"), fnv1a_hex("Beatus vir"));
        assert_ne!(fnv1a_hex("Beatus vir"), fnv1a_hex("Beatus vir."));
        assert_eq!(fnv1a_hex("").len(), 16);
    }
}
