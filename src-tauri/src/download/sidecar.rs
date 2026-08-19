//! Quel poco che di una pagina non si legge guardando il file: l'impronta con
//! cui è arrivata, quanto pesava, quando, e i due casi che vanno raccontati.
//!
//! Sta in un **file di lato per cartella di misura** — dentro `pages/2000/`,
//! insieme alle pagine che descrive — e non in una riga per pagina nel
//! database. È il sostituto di 328 righe, ma in un posto solo e **appoggiato ai
//! file stessi**: cancelli la cartella e se ne va con loro, copi la cartella e
//! viene dietro (§5.4).
//!
//! **Si scrive una riga in coda, dopo lo spostamento atomico della pagina.** Mai
//! riscrivere tutto il file per una pagina: un'interruzione a metà scrittura
//! perderebbe trecento checksum invece di uno. In coda, il caso peggiore è una
//! riga troncata: il lettore la scarta e le altre restano.
//!
//! **Può divergere, e va detto come.** Una pagina promossa nel deposito e
//! un'interruzione prima di scrivere la sua riga lasciano un file senza riga:
//! è una pagina presente di cui non si conosce l'impronta. Si conta
//! nell'inventario, la verifica rapida la vede, la verifica completa la **salta**
//! e non la dichiara corrotta. Vale identico per i depositi riempiti prima che
//! questo file esistesse: nessuna migrazione, e chi vuole l'impronta riscarica.

use std::collections::BTreeMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Il nome del file dentro la cartella di misura.
pub const SIDECAR_FILE: &str = "pages.jsonl";

/// Cosa è successo a questa pagina, quando non è la cosa normale.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Note {
    /// **Ridotta dall'ottimizzazione locale** (§5.7), con le dimensioni che aveva
    /// prima. È una ricompressione, quindi quella pagina non è più come è
    /// arrivata, e senza scriverlo sarebbe indistinguibile da una arrivata già a
    /// quella misura.
    ///
    /// Lo scaricamento non la scrive mai: non ricomprime niente, nemmeno quando
    /// la biblioteca rifiuta la misura e la pagina arriva a dimensione piena.
    /// Ridurre è una scelta che si fa a freddo (decisione del 2026-08-19).
    #[serde(rename_all = "camelCase")]
    Downscaled { from: (u32, u32) },
    /// La biblioteca non l'ha servita. Esiste per due ragioni: l'inventario può
    /// dire «completo per quanto la biblioteca serve» invece di un «incompleto»
    /// che sembra un lavoro a metà, e la ripresa può riprovarla **a scadenza**
    /// invece che a ogni avvio.
    #[serde(rename_all = "camelCase")]
    NotServed { last_try: i64 },
}

/// Una riga del file di lato.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRecord {
    pub index: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// I pixel davvero ottenuti. Assente per una pagina non servita.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub got: Option<(u32, u32)>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    /// L'impronta registrata all'arrivo: è l'unica cosa che una cartella non sa
    /// dire, e serve alla verifica completa (D5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
    pub at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<Note>,
}

impl PageRecord {
    pub fn not_served(index: u32, label: Option<String>, at: i64) -> Self {
        Self {
            index,
            label,
            got: None,
            bytes: None,
            checksum: None,
            at,
            note: Some(Note::NotServed { last_try: at }),
        }
    }

    /// Vero per una pagina che la biblioteca non ha servito.
    pub fn is_missing(&self) -> bool {
        matches!(self.note, Some(Note::NotServed { .. }))
    }

    /// Quando è stata provata l'ultima volta, per una pagina non servita.
    pub fn last_try(&self) -> Option<i64> {
        match self.note {
            Some(Note::NotServed { last_try }) => Some(last_try),
            _ => None,
        }
    }
}

pub fn path_in(size_dir: &Path) -> PathBuf {
    size_dir.join(SIDECAR_FILE)
}

/// Aggiunge una riga in coda. Da chiamare **dopo** che il file della pagina è al
/// suo posto: prima si mette al sicuro la pagina, poi si racconta.
pub fn append(size_dir: &Path, record: &PageRecord) -> std::io::Result<()> {
    std::fs::create_dir_all(size_dir)?;
    let mut line = serde_json::to_vec(record)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    line.push(b'\n');
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path_in(size_dir))?;
    file.write_all(&line)
}

/// Le righe del file di lato, per numero di pagina.
///
/// **L'ultima riga per un indice vince**: è così che l'ottimizzazione locale può
/// riscrivere l'impronta di una pagina senza riscrivere il file, e che una
/// pagina prima non servita e poi arrivata smette di risultare mancante.
///
/// Le righe illeggibili si scartano in silenzio: una riga troncata da
/// un'interruzione è il caso normale, non un guasto da riferire.
pub fn read(size_dir: &Path) -> BTreeMap<u32, PageRecord> {
    let mut records = BTreeMap::new();
    let Ok(file) = std::fs::File::open(path_in(size_dir)) else {
        return records;
    };
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(record) = serde_json::from_str::<PageRecord>(trimmed) {
            records.insert(record.index, record);
        }
    }
    records
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("glossa-sidecar-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("cartella");
        dir
    }

    fn arrived(index: u32) -> PageRecord {
        PageRecord {
            index,
            label: Some(format!("{index}r")),
            got: Some((1323, 2056)),
            bytes: Some(542_000),
            checksum: Some("abc123".into()),
            at: 1_700_000_000,
            note: None,
        }
    }

    #[test]
    fn what_is_written_comes_back() {
        let dir = temp_dir("round-trip");
        append(&dir, &arrived(1)).expect("scrittura");
        append(&dir, &arrived(2)).expect("scrittura");

        let records = read(&dir);

        assert_eq!(records.len(), 2);
        assert_eq!(records[&1].checksum.as_deref(), Some("abc123"));
        assert_eq!(records[&2].got, Some((1323, 2056)));
    }

    #[test]
    fn the_last_line_for_a_page_wins() {
        let dir = temp_dir("last-wins");
        append(&dir, &arrived(1)).expect("scrittura");
        let optimised = PageRecord {
            checksum: Some("dopo l'ottimizzazione".into()),
            note: Some(Note::Downscaled { from: (2646, 4112) }),
            ..arrived(1)
        };
        append(&dir, &optimised).expect("scrittura");

        let records = read(&dir);

        // Una sola pagina, con l'impronta nuova: è così che l'ottimizzazione
        // riscrive senza riscrivere il file.
        assert_eq!(records.len(), 1);
        assert_eq!(
            records[&1].checksum.as_deref(),
            Some("dopo l'ottimizzazione")
        );
        assert_eq!(
            records[&1].note,
            Some(Note::Downscaled { from: (2646, 4112) })
        );
    }

    #[test]
    fn a_truncated_line_does_not_take_the_earlier_ones_away() {
        let dir = temp_dir("truncated");
        append(&dir, &arrived(1)).expect("scrittura");
        // Un'interruzione a metà riga: è il caso peggiore della scrittura in
        // coda, ed è per questo che si scrive in coda.
        let mut file = OpenOptions::new()
            .append(true)
            .open(path_in(&dir))
            .expect("apertura");
        file.write_all(b"{\"index\": 2, \"at\": 17000")
            .expect("mezza riga");
        drop(file);
        append(&dir, &arrived(3)).expect("scrittura");

        let records = read(&dir);

        // La riga troncata si porta via quella che le viene scritta dietro, e
        // niente di più: le pagine restano presenti e contate, di due non si
        // conosce il checksum, e la verifica completa le salta (§5.4).
        assert_eq!(records.keys().copied().collect::<Vec<_>>(), vec![1]);
    }

    #[test]
    fn a_folder_without_the_side_file_simply_says_nothing() {
        // È il caso dei depositi riempiti prima che questo file esistesse:
        // pagine presenti di cui non si conosce l'impronta, non un guasto.
        assert!(read(&temp_dir("empty")).is_empty());
    }

    #[test]
    fn a_page_the_library_does_not_serve_leaves_its_line() {
        let dir = temp_dir("not-served");
        append(
            &dir,
            &PageRecord::not_served(7, Some("7r".into()), 1_700_000_000),
        )
        .expect("scrittura");

        let records = read(&dir);

        assert!(records[&7].is_missing());
        assert_eq!(records[&7].last_try(), Some(1_700_000_000));
        assert!(records[&7].checksum.is_none());
    }

    #[test]
    fn a_page_that_arrives_later_stops_being_missing() {
        let dir = temp_dir("recovered");
        append(&dir, &PageRecord::not_served(7, None, 1_700_000_000)).expect("scrittura");
        append(&dir, &arrived(7)).expect("scrittura");

        assert!(!read(&dir)[&7].is_missing());
    }
}
