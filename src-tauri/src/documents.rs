use std::fs;
use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::Reader;

#[tauri::command]
pub async fn extract_docx_text(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        extract_docx_text_from_bytes(&bytes)
    })
    .await
    .map_err(|e| format!("Document extraction task failed: {}", e))?
}

#[tauri::command]
pub async fn extract_pdf_text(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        extract_pdf_text_from_bytes(&bytes)
    })
    .await
    .map_err(|e| format!("Document extraction task failed: {}", e))?
}

pub fn extract_docx_text_from_bytes(bytes: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|_| "Not a valid .docx file (expected a zip archive).".to_string())?;

    let mut document_xml = String::new();
    {
        let mut document = archive
            .by_name("word/document.xml")
            .map_err(|_| "Not a valid .docx file (missing word/document.xml).".to_string())?;
        document
            .read_to_string(&mut document_xml)
            .map_err(|e| format!("Failed to read document.xml: {}", e))?;
    }

    extract_text_from_document_xml(&document_xml)
}

fn extract_text_from_document_xml(xml: &str) -> Result<String, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut paragraphs: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut inside_text = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) => {
                let name = element.name();
                let local = name.as_ref();
                if local.ends_with(b":t") || local == b"t" {
                    inside_text = true;
                }
            }
            Ok(Event::End(element)) => {
                let name = element.name();
                let local = name.as_ref();
                if local.ends_with(b":t") || local == b"t" {
                    inside_text = false;
                } else if local.ends_with(b":p") || local == b"p" {
                    paragraphs.push(std::mem::take(&mut current));
                }
            }
            Ok(Event::Text(event)) => {
                if inside_text {
                    let decoded = event
                        .decode()
                        .map_err(|e| format!("Failed to decode docx text: {}", e))?;
                    let text = quick_xml::escape::unescape(&decoded)
                        .map_err(|e| format!("Failed to unescape docx text: {}", e))?;
                    current.push_str(&text);
                }
            }
            Ok(Event::Empty(element)) => {
                let name = element.name();
                let local = name.as_ref();
                if local.ends_with(b":br") || local == b"br" {
                    current.push('\n');
                } else if local.ends_with(b":tab") || local == b"tab" {
                    current.push('\t');
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(format!("Failed to parse docx document.xml: {}", error));
            }
            _ => {}
        }
    }

    if !current.is_empty() {
        paragraphs.push(current);
    }

    let joined = paragraphs
        .into_iter()
        .map(|paragraph| paragraph.trim_end().to_string())
        .filter(|paragraph| !paragraph.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if joined.trim().is_empty() {
        return Err("The .docx file did not contain any extractable text.".to_string());
    }

    Ok(joined)
}

pub fn extract_pdf_text_from_bytes(bytes: &[u8]) -> Result<String, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("Not a valid .pdf file (missing PDF header).".to_string());
    }

    let extracted = pdf_extract::extract_text_from_mem(bytes)
        .map_err(|e| format!("Failed to extract text from PDF: {}", e))?;

    let normalized = normalize_pdf_text(&extracted);
    if normalized.trim().is_empty() {
        return Err("The .pdf file did not contain any extractable text.".to_string());
    }

    Ok(normalized)
}

fn normalize_pdf_text(text: &str) -> String {
    text.lines()
        .map(|line| line.trim_end().to_string())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn build_docx(document_xml: &str) -> Vec<u8> {
        let mut buffer: Vec<u8> = Vec::new();
        {
            let cursor = Cursor::new(&mut buffer);
            let mut writer = zip::ZipWriter::new(cursor);
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("word/document.xml", options).unwrap();
            writer.write_all(document_xml.as_bytes()).unwrap();
            writer.finish().unwrap();
        }
        buffer
    }

    #[test]
    fn extracts_paragraph_text_from_docx() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="x">
  <w:body>
    <w:p><w:r><w:t>First paragraph.</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Second </w:t><w:t>paragraph.</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
        let bytes = build_docx(xml);

        let extracted = extract_docx_text_from_bytes(&bytes).expect("expected docx text");

        assert_eq!(extracted, "First paragraph.\n\nSecond paragraph.");
    }

    #[test]
    fn rejects_non_zip_input_for_docx() {
        let result = extract_docx_text_from_bytes(b"plain text, not a zip");
        assert!(result.is_err());
    }

    #[test]
    fn rejects_zip_without_document_xml() {
        let mut buffer: Vec<u8> = Vec::new();
        {
            let cursor = Cursor::new(&mut buffer);
            let mut writer = zip::ZipWriter::new(cursor);
            writer
                .start_file("other.txt", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"hello").unwrap();
            writer.finish().unwrap();
        }

        let result = extract_docx_text_from_bytes(&buffer);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_docx_with_only_whitespace() {
        let xml = r#"<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>   </w:t></w:r></w:p></w:body></w:document>"#;
        let bytes = build_docx(xml);
        let result = extract_docx_text_from_bytes(&bytes);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_input_without_pdf_header() {
        let result = extract_pdf_text_from_bytes(b"this is not a pdf");
        assert!(result.is_err());
    }
}
