//! Impronte e validazione dei file del deposito (D3, D16-bis).
//!
//! L'impronta serve a **una cosa sola**: verificare che un file sia arrivato
//! intero. Non si usa per riconoscere duplicati — quel caso, con la
//! disposizione per provenienza di D2, non si presenta.

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

/// Blocchi da 64 KB: un manoscritto scaricato a piena risoluzione può pesare
/// decine di megabyte a carta, e non va caricato in memoria per essere
/// verificato.
const CHUNK_BYTES: usize = 64 * 1024;

const FNV_PRIME: u64 = 0x0000_0100_0000_01B3;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;

/// Byte iniziali conservati durante la lettura: bastano per la firma più lunga
/// (PNG, 8 byte).
const HEAD_BYTES: usize = 8;
/// Byte finali conservati: bastano per `IEND` + CRC del PNG, il terminatore più
/// lungo.
const TAIL_BYTES: usize = 8;

/// Esito della validazione di un file appena scaricato, prima della promozione
/// dall'area di transito al deposito (D16-bis).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Validation {
    Valid,
    /// Il file esiste ma non è decodificabile: quasi sempre uno scaricamento
    /// interrotto. Ha la dimensione giusta nei metadati HTTP e non si apre.
    Corrupt(String),
    Missing,
}

/// Cosa il deposito si aspetta di trovare in un file, per scegliere il
/// controllo strutturale.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Image,
    Manifest,
}

/// Esito di una lettura sola: validazione e impronta insieme.
///
/// L'impronta è FNV-1a a 64 bit, come `stable_fnv1a` in
/// `llm/providers/openai.rs`: non è una funzione crittografica e non deve
/// esserlo. Serve a distinguere un file integro da uno troncato o riscritto,
/// non a resistere a una manomissione deliberata — chi può scrivere nel
/// deposito può già sostituire il database.
#[derive(Debug, Clone)]
pub struct FileScan {
    pub validation: Validation,
    /// Valorizzata solo quando il file è valido: di un file corrotto
    /// l'impronta non dice niente di utile.
    pub checksum: Option<String>,
}

/// Legge il file **una volta sola** e ne ricava insieme impronta e validità.
///
/// La verifica completa (D5) gira su gigabyte: leggere ogni carta due volte —
/// una per validarla, una per l'impronta — raddoppierebbe l'unica operazione
/// del deposito che l'utente aspetta davvero. Della struttura servono solo i
/// primi e gli ultimi byte, che si tengono da parte scorrendo.
///
/// La validazione è **per decodifica, non per dimensione** (D16-bis): un file
/// troncato ha la dimensione dichiarata dai metadati HTTP e fallisce qui.
/// È la verifica strutturale minima — firma riconosciuta e terminatore al posto
/// giusto — che coglie il troncamento, il caso reale prodotto da uno
/// scaricamento interrotto.
pub fn scan_file(path: &Path, kind: FileKind) -> FileScan {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return FileScan {
                validation: Validation::Missing,
                checksum: None,
            }
        }
        Err(error) => return corrupt(format!("non leggibile: {error}")),
    };

    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; CHUNK_BYTES];
    let mut hash = FNV_OFFSET;
    let mut head: Vec<u8> = Vec::with_capacity(HEAD_BYTES);
    let mut tail: Vec<u8> = Vec::with_capacity(TAIL_BYTES + CHUNK_BYTES);
    let mut total: u64 = 0;
    // Solo per il manifesto: il JSON si può controllare unicamente per intero.
    let mut manifest_body: Vec<u8> = Vec::new();

    loop {
        let read = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => read,
            Err(error) => return corrupt(format!("non leggibile: {error}")),
        };
        let chunk = &buffer[..read];
        total += read as u64;

        for byte in chunk {
            hash = (hash ^ u64::from(*byte)).wrapping_mul(FNV_PRIME);
        }
        if head.len() < HEAD_BYTES {
            let take = (HEAD_BYTES - head.len()).min(read);
            head.extend_from_slice(&chunk[..take]);
        }
        tail.extend_from_slice(chunk);
        if tail.len() > TAIL_BYTES {
            tail.drain(..tail.len() - TAIL_BYTES);
        }
        if kind == FileKind::Manifest {
            manifest_body.extend_from_slice(chunk);
        }
    }

    let validation = match kind {
        FileKind::Image => validate_image_shape(&head, &tail, total),
        FileKind::Manifest => match serde_json::from_slice::<serde_json::Value>(&manifest_body) {
            Ok(_) => Validation::Valid,
            Err(error) => Validation::Corrupt(format!("JSON non valido: {error}")),
        },
    };

    let checksum = matches!(validation, Validation::Valid).then(|| format!("{hash:016x}"));
    FileScan {
        validation,
        checksum,
    }
}

fn corrupt(reason: String) -> FileScan {
    FileScan {
        validation: Validation::Corrupt(reason),
        checksum: None,
    }
}

/// Firma iniziale e terminatore dei formati che il deposito può contenere.
fn validate_image_shape(head: &[u8], tail: &[u8], total: u64) -> Validation {
    if total < 12 {
        return Validation::Corrupt("file troppo corto per essere un'immagine".to_string());
    }

    if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
        // JPEG: deve chiudersi con End Of Image. Un troncamento lo elimina.
        return if tail.ends_with(&[0xFF, 0xD9]) {
            Validation::Valid
        } else {
            Validation::Corrupt("JPEG troncato: manca il marcatore di fine".to_string())
        };
    }

    if head.starts_with(b"\x89PNG\r\n\x1a\n") {
        // PNG: l'ultimo chunk deve essere IEND.
        return if tail.ends_with(b"IEND\xae\x42\x60\x82") {
            Validation::Valid
        } else {
            Validation::Corrupt("PNG troncato: manca il blocco finale".to_string())
        };
    }

    Validation::Corrupt("formato immagine non riconosciuto".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("glossa_vault_{name}"));
        let mut file = File::create(&path).unwrap();
        file.write_all(bytes).unwrap();
        path
    }

    /// JPEG integro con un contenuto scelto: la firma e il terminatore stanno
    /// al posto giusto, in mezzo c'è quello che serve al test.
    fn jpeg_around(payload: &[u8]) -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
        bytes.extend_from_slice(payload);
        bytes.extend_from_slice(&[0xFF, 0xD9]);
        bytes
    }

    fn valid_jpeg() -> Vec<u8> {
        jpeg_around(&[0u8; 32])
    }

    fn checksum_of(path: &Path) -> String {
        scan_file(path, FileKind::Image)
            .checksum
            .expect("un file valido ha sempre un'impronta")
    }

    #[test]
    fn checksum_is_stable_for_the_same_content() {
        let a = temp_file("checksum_a.jpg", &jpeg_around(b"contenuto identico"));
        let b = temp_file("checksum_b.jpg", &jpeg_around(b"contenuto identico"));

        assert_eq!(checksum_of(&a), checksum_of(&b));

        let _ = std::fs::remove_file(&a);
        let _ = std::fs::remove_file(&b);
    }

    #[test]
    fn checksum_changes_when_a_single_byte_changes() {
        let a = temp_file("checksum_c.jpg", &jpeg_around(b"contenuto"));
        let b = temp_file("checksum_d.jpg", &jpeg_around(b"contenutp"));

        assert_ne!(checksum_of(&a), checksum_of(&b));

        let _ = std::fs::remove_file(&a);
        let _ = std::fs::remove_file(&b);
    }

    #[test]
    fn checksum_spans_more_than_one_chunk() {
        // Oltre i 64 KB del buffer: se l'accumulo fosse sbagliato fra un
        // blocco e l'altro, questo test lo scoprirebbe.
        let mut payload = vec![1u8; CHUNK_BYTES * 2 + 13];
        payload[CHUNK_BYTES + 5] = 9;
        let a = temp_file("checksum_big_a.jpg", &jpeg_around(&payload));
        payload[CHUNK_BYTES + 5] = 8;
        let b = temp_file("checksum_big_b.jpg", &jpeg_around(&payload));

        assert_ne!(checksum_of(&a), checksum_of(&b));

        let _ = std::fs::remove_file(&a);
        let _ = std::fs::remove_file(&b);
    }

    #[test]
    fn a_whole_jpeg_is_valid() {
        let path = temp_file("valid.jpg", &valid_jpeg());
        assert_eq!(
            scan_file(&path, FileKind::Image).validation,
            Validation::Valid
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_truncated_jpeg_is_corrupt_even_with_the_right_size() {
        // È il caso reale: lo scaricamento si interrompe, il file ha la
        // dimensione dichiarata ma manca la fine.
        let mut bytes = valid_jpeg();
        bytes.truncate(bytes.len() - 2);
        let path = temp_file("truncated.jpg", &bytes);

        match scan_file(&path, FileKind::Image).validation {
            Validation::Corrupt(reason) => assert!(reason.contains("troncato")),
            other => panic!("atteso Corrupt, ottenuto {other:?}"),
        }

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_whole_png_is_valid() {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend_from_slice(&[0u8; 32]);
        bytes.extend_from_slice(b"IEND\xae\x42\x60\x82");
        let path = temp_file("valid.png", &bytes);

        assert_eq!(
            scan_file(&path, FileKind::Image).validation,
            Validation::Valid
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn html_served_instead_of_an_image_is_corrupt() {
        // Alcune biblioteche rispondono con una pagina di errore mantenendo
        // stato 200: senza validazione finirebbe nel deposito come immagine.
        let path = temp_file(
            "error_page.jpg",
            b"<!DOCTYPE html><html>429 Too Many</html>",
        );
        match scan_file(&path, FileKind::Image).validation {
            Validation::Corrupt(reason) => assert!(reason.contains("non riconosciuto")),
            other => panic!("atteso Corrupt, ottenuto {other:?}"),
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_missing_image_is_reported_as_missing_not_corrupt() {
        let missing = std::env::temp_dir().join("glossa_vault_absent.jpg");
        let _ = std::fs::remove_file(&missing);
        assert_eq!(
            scan_file(&missing, FileKind::Image).validation,
            Validation::Missing
        );
    }

    #[test]
    fn one_pass_returns_both_the_verdict_and_the_checksum() {
        // La verifica completa gira su gigabyte: validare e calcolare
        // l'impronta devono costare una lettura sola, non due.
        let path = temp_file("scan_valid.jpg", &valid_jpeg());

        let scan = scan_file(&path, FileKind::Image);

        assert_eq!(scan.validation, Validation::Valid);
        assert_eq!(scan.checksum, Some(checksum_of(&path)));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_corrupt_file_has_no_checksum() {
        let mut bytes = valid_jpeg();
        bytes.truncate(bytes.len() - 2);
        let path = temp_file("scan_corrupt.jpg", &bytes);

        let scan = scan_file(&path, FileKind::Image);

        assert!(matches!(scan.validation, Validation::Corrupt(_)));
        assert_eq!(scan.checksum, None, "di un file rotto l'impronta non serve");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn the_trailer_is_found_on_a_file_larger_than_one_chunk() {
        // La coda si tiene da parte scorrendo: se lo scorrimento fosse
        // sbagliato, un'immagine grande e integra risulterebbe troncata.
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
        bytes.extend_from_slice(&vec![0u8; CHUNK_BYTES * 2 + 7]);
        bytes.extend_from_slice(&[0xFF, 0xD9]);
        let path = temp_file("scan_big.jpg", &bytes);

        assert_eq!(
            scan_file(&path, FileKind::Image).validation,
            Validation::Valid
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_missing_file_has_no_checksum_and_is_not_corrupt() {
        let missing = std::env::temp_dir().join("glossa_vault_scan_absent.jpg");
        let _ = std::fs::remove_file(&missing);

        let scan = scan_file(&missing, FileKind::Image);

        assert_eq!(scan.validation, Validation::Missing);
        assert_eq!(scan.checksum, None);
    }

    #[test]
    fn manifest_validation_accepts_json_and_rejects_truncation() {
        let good = temp_file("manifest_ok.json", br#"{"items":[]}"#);
        assert_eq!(
            scan_file(&good, FileKind::Manifest).validation,
            Validation::Valid
        );

        let cut = temp_file("manifest_cut.json", br#"{"items":["#);
        assert!(matches!(
            scan_file(&cut, FileKind::Manifest).validation,
            Validation::Corrupt(_)
        ));

        let _ = std::fs::remove_file(&good);
        let _ = std::fs::remove_file(&cut);
    }
}
