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

/// Impronta del contenuto di un file, in esadecimale.
///
/// FNV-1a a 64 bit, come `stable_fnv1a` in `llm/providers/openai.rs`: non è una
/// funzione crittografica e non deve esserlo. Serve a distinguere un file
/// integro da uno troncato o riscritto, non a resistere a una manomissione
/// deliberata — chi può scrivere nel deposito può già sostituire il database.
pub fn file_checksum(path: &Path) -> Result<String, String> {
    const FNV_PRIME: u64 = 0x0000_0100_0000_01B3;
    const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;

    let file = File::open(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; CHUNK_BYTES];
    let mut hash = FNV_OFFSET;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        if read == 0 {
            break;
        }
        for byte in &buffer[..read] {
            hash = (hash ^ u64::from(*byte)).wrapping_mul(FNV_PRIME);
        }
    }

    Ok(format!("{hash:016x}"))
}

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

/// Firme dei formati che il deposito può contenere. La validazione è **per
/// decodifica, non per dimensione** (D16-bis): un file troncato supera un
/// controllo di dimensione e fallisce qui.
///
/// Questa è la verifica strutturale minima, fatta senza decodificare l'intera
/// immagine: intestazione riconosciuta e terminatore al posto giusto. Coglie il
/// troncamento, che è il caso reale prodotto da uno scaricamento interrotto.
pub fn validate_image(path: &Path) -> Validation {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Validation::Missing,
        Err(error) => return Validation::Corrupt(format!("non leggibile: {error}")),
    };

    if bytes.len() < 12 {
        return Validation::Corrupt("file troppo corto per essere un'immagine".to_string());
    }

    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        // JPEG: deve chiudersi con End Of Image. Un troncamento lo elimina.
        return if bytes.ends_with(&[0xFF, 0xD9]) {
            Validation::Valid
        } else {
            Validation::Corrupt("JPEG troncato: manca il marcatore di fine".to_string())
        };
    }

    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        // PNG: l'ultimo chunk deve essere IEND.
        return if bytes.ends_with(b"IEND\xae\x42\x60\x82") {
            Validation::Valid
        } else {
            Validation::Corrupt("PNG troncato: manca il blocco finale".to_string())
        };
    }

    Validation::Corrupt("formato immagine non riconosciuto".to_string())
}

/// Come `validate_image`, per il manifesto: deve essere JSON leggibile.
/// Un manifesto troncato romperebbe l'intera digitalizzazione.
pub fn validate_manifest(path: &Path) -> Validation {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Validation::Missing,
        Err(error) => return Validation::Corrupt(format!("non leggibile: {error}")),
    };
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(_) => Validation::Valid,
        Err(error) => Validation::Corrupt(format!("JSON non valido: {error}")),
    }
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

    fn valid_jpeg() -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
        bytes.extend_from_slice(&[0u8; 32]);
        bytes.extend_from_slice(&[0xFF, 0xD9]);
        bytes
    }

    #[test]
    fn checksum_is_stable_for_the_same_content() {
        let a = temp_file("checksum_a.bin", b"contenuto identico");
        let b = temp_file("checksum_b.bin", b"contenuto identico");

        assert_eq!(file_checksum(&a).unwrap(), file_checksum(&b).unwrap());

        let _ = std::fs::remove_file(&a);
        let _ = std::fs::remove_file(&b);
    }

    #[test]
    fn checksum_changes_when_a_single_byte_changes() {
        let a = temp_file("checksum_c.bin", b"contenuto");
        let b = temp_file("checksum_d.bin", b"contenutp");

        assert_ne!(file_checksum(&a).unwrap(), file_checksum(&b).unwrap());

        let _ = std::fs::remove_file(&a);
        let _ = std::fs::remove_file(&b);
    }

    #[test]
    fn checksum_detects_truncation() {
        let whole = temp_file("checksum_whole.bin", &vec![7u8; 200_000]);
        let cut = temp_file("checksum_cut.bin", &vec![7u8; 199_999]);

        assert_ne!(
            file_checksum(&whole).unwrap(),
            file_checksum(&cut).unwrap(),
            "un file troncato deve avere un'impronta diversa"
        );

        let _ = std::fs::remove_file(&whole);
        let _ = std::fs::remove_file(&cut);
    }

    #[test]
    fn checksum_spans_more_than_one_chunk() {
        // Oltre i 64 KB del buffer: se l'accumulo fosse sbagliato fra un
        // blocco e l'altro, questo test lo scoprirebbe.
        let mut content = vec![1u8; CHUNK_BYTES * 2 + 13];
        content[CHUNK_BYTES + 5] = 9;
        let a = temp_file("checksum_big_a.bin", &content);
        content[CHUNK_BYTES + 5] = 8;
        let b = temp_file("checksum_big_b.bin", &content);

        assert_ne!(file_checksum(&a).unwrap(), file_checksum(&b).unwrap());

        let _ = std::fs::remove_file(&a);
        let _ = std::fs::remove_file(&b);
    }

    #[test]
    fn checksum_reports_a_missing_file() {
        let missing = std::env::temp_dir().join("glossa_vault_nope.bin");
        let _ = std::fs::remove_file(&missing);
        assert!(file_checksum(&missing).is_err());
    }

    #[test]
    fn a_whole_jpeg_is_valid() {
        let path = temp_file("valid.jpg", &valid_jpeg());
        assert_eq!(validate_image(&path), Validation::Valid);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_truncated_jpeg_is_corrupt_even_with_the_right_size() {
        // È il caso reale: lo scaricamento si interrompe, il file ha la
        // dimensione dichiarata ma manca la fine.
        let mut bytes = valid_jpeg();
        bytes.truncate(bytes.len() - 2);
        let path = temp_file("truncated.jpg", &bytes);

        match validate_image(&path) {
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

        assert_eq!(validate_image(&path), Validation::Valid);

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
        match validate_image(&path) {
            Validation::Corrupt(reason) => assert!(reason.contains("non riconosciuto")),
            other => panic!("atteso Corrupt, ottenuto {other:?}"),
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_missing_image_is_reported_as_missing_not_corrupt() {
        let missing = std::env::temp_dir().join("glossa_vault_absent.jpg");
        let _ = std::fs::remove_file(&missing);
        assert_eq!(validate_image(&missing), Validation::Missing);
    }

    #[test]
    fn manifest_validation_accepts_json_and_rejects_truncation() {
        let good = temp_file("manifest_ok.json", br#"{"items":[]}"#);
        assert_eq!(validate_manifest(&good), Validation::Valid);

        let cut = temp_file("manifest_cut.json", br#"{"items":["#);
        assert!(matches!(validate_manifest(&cut), Validation::Corrupt(_)));

        let _ = std::fs::remove_file(&good);
        let _ = std::fs::remove_file(&cut);
    }
}
