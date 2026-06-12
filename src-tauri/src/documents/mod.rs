use std::fs;

const MAX_DOCX_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PDF_BYTES: u64 = 50 * 1024 * 1024;

fn check_file_size(path: &str, limit: u64) -> Result<(), String> {
    let size = fs::metadata(path)
        .map_err(|e| format!("Failed to read file metadata: {e}"))?
        .len();
    if size > limit {
        return Err(format!(
            "File too large: {} bytes (limit {} MB)",
            size,
            limit / 1024 / 1024
        ));
    }
    Ok(())
}

pub mod docx_export;
pub mod docx_extract;
pub mod pdf_extract;

pub use docx_extract::{extract_docx_markdown_from_bytes, extract_docx_text_from_bytes};
pub use pdf_extract::extract_pdf_text_from_bytes;
pub(crate) use docx_export::export_markdown_docx_bytes;

// exposed for integration tests in mod.rs — not public API
#[cfg(test)]
pub(crate) use docx_extract::read_docx_entry;
#[cfg(test)]
pub(crate) use pdf_extract::normalize_pdf_text;

#[tauri::command]
pub async fn extract_docx_text(path: String) -> Result<String, String> {
    check_file_size(&path, MAX_DOCX_BYTES)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        extract_docx_text_from_bytes(&bytes)
    })
    .await
    .map_err(|e| format!("Document extraction task failed: {}", e))?
}

#[tauri::command]
pub async fn extract_docx_markdown(path: String) -> Result<String, String> {
    check_file_size(&path, MAX_DOCX_BYTES)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        extract_docx_markdown_from_bytes(&bytes)
    })
    .await
    .map_err(|e| format!("Document extraction task failed: {}", e))?
}

#[tauri::command]
pub async fn extract_pdf_text(path: String) -> Result<String, String> {
    check_file_size(&path, MAX_PDF_BYTES)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        extract_pdf_text_from_bytes(&bytes)
    })
    .await
    .map_err(|e| format!("Document extraction task failed: {}", e))?
}

#[tauri::command]
pub async fn export_markdown_docx(markdown: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || export_markdown_docx_bytes(&markdown))
        .await
        .map_err(|e| format!("Document export task failed: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    fn build_docx_with_rels(document_xml: &str, rels_xml: &str) -> Vec<u8> {
        let mut buffer: Vec<u8> = Vec::new();
        {
            let cursor = Cursor::new(&mut buffer);
            let mut writer = zip::ZipWriter::new(cursor);
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("word/document.xml", options).unwrap();
            writer.write_all(document_xml.as_bytes()).unwrap();
            writer.start_file("word/_rels/document.xml.rels", options).unwrap();
            writer.write_all(rels_xml.as_bytes()).unwrap();
            writer.finish().unwrap();
        }
        buffer
    }

    fn build_docx(document_xml: &str) -> Vec<u8> {
        let mut buffer: Vec<u8> = Vec::new();
        {
            let cursor = Cursor::new(&mut buffer);
            let mut writer = zip::ZipWriter::new(cursor);
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("word/document.xml", options).unwrap();
            writer.write_all(document_xml.as_bytes()).unwrap();
            writer.finish().unwrap();
        }
        buffer
    }

    #[test]
    fn check_file_size_accepts_file_within_limit() {
        let path = std::env::temp_dir().join("glossa_test_size_ok.bin");
        std::fs::write(&path, b"small content").unwrap();
        assert!(check_file_size(path.to_str().unwrap(), MAX_DOCX_BYTES).is_ok());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn check_file_size_rejects_file_over_limit() {
        let path = std::env::temp_dir().join("glossa_test_size_over.bin");
        std::fs::write(&path, b"data").unwrap();
        let result = check_file_size(path.to_str().unwrap(), 1);
        let _ = std::fs::remove_file(&path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File too large"));
    }

    #[test]
    fn check_file_size_rejects_missing_file() {
        let result = check_file_size("/nonexistent_glossa_test_path_xyz.docx", MAX_DOCX_BYTES);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to read file metadata"));
    }

    #[test]
    fn docx_limit_is_100mb() {
        assert_eq!(MAX_DOCX_BYTES, 100 * 1024 * 1024);
    }

    #[test]
    fn pdf_limit_is_50mb() {
        assert_eq!(MAX_PDF_BYTES, 50 * 1024 * 1024);
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

    #[test]
    fn extracts_markdown_with_emphasis_and_footnotes_from_docx() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="x">
  <w:body>
    <w:p>
      <w:r><w:t>Alpha </w:t></w:r>
      <w:r><w:rPr><w:i/></w:rPr><w:t>beta</w:t></w:r>
      <w:r><w:t> gamma</w:t></w:r>
      <w:r><w:footnoteReference w:id="2"/></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let bytes = build_docx(xml);
        let extracted = extract_docx_markdown_from_bytes(&bytes).expect("expected markdown");
        assert!(extracted.contains("Alpha"));
        assert!(extracted.contains("*beta*"));
        assert!(extracted.contains("[^1]"));
    }

    #[test]
    fn extracts_docx_table_as_markdown() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="x">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Age</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Alice</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>30</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>"#;
        let buffer = build_docx(xml);
        let extracted = extract_docx_markdown_from_bytes(&buffer).expect("expected markdown");
        assert!(extracted.contains("| Name | Age |"), "header row missing");
        assert!(extracted.contains("| --- | --- |"), "separator row missing");
        assert!(extracted.contains("| Alice | 30 |"), "data row missing");
    }

    #[test]
    fn extracts_docx_nested_list() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="x">
  <w:body>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>
      <w:r><w:t>Top level</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Nested</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let buffer = build_docx(xml);
        let extracted = extract_docx_markdown_from_bytes(&buffer).expect("expected markdown");
        assert!(extracted.contains("- Top level"), "top-level list item missing");
        assert!(extracted.contains("- Nested"), "nested list item missing");
    }

    #[test]
    fn extracts_docx_image_alt_text() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="x" xmlns:wp="wp">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline><wp:docPr id="1" name="Fig1" descr="A diagram of the system"/></wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>"#;
        let buffer = build_docx(xml);
        let extracted = extract_docx_markdown_from_bytes(&buffer).expect("expected markdown");
        assert!(
            extracted.contains("[Image: A diagram of the system]"),
            "image alt text missing: {extracted}"
        );
    }

    #[test]
    fn normalizes_pdf_ligatures() {
        let text = "The \u{FB01}nal re\u{FB02}ection of the e\u{FB03}cient plan.";
        let normalized = normalize_pdf_text(text);
        assert_eq!(normalized, "The final reflection of the efficient plan.");
    }

    #[test]
    fn preserves_pdf_paragraph_breaks() {
        let text = "First paragraph.\n\nSecond paragraph.";
        let normalized = normalize_pdf_text(text);
        assert!(
            normalized.contains("First paragraph.\n\nSecond paragraph."),
            "paragraph break not preserved: {normalized:?}"
        );
    }

    #[test]
    fn collapses_pdf_excess_blank_lines() {
        let text = "A\n\n\n\nB";
        let normalized = normalize_pdf_text(text);
        assert_eq!(normalized, "A\n\nB");
    }

    #[test]
    fn replaces_pdf_form_feed_with_page_break_marker() {
        let text = "Page one.\x0CPage two.";
        let normalized = normalize_pdf_text(text);
        assert!(normalized.contains("Page one."), "page one missing");
        assert!(normalized.contains("Page two."), "page two missing");
        assert!(normalized.contains("---"), "page break marker expected between pages");
    }

    #[test]
    fn extracts_docx_hyperlink_via_relationships() {
        let document_xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="x" xmlns:r="r">
  <w:body>
    <w:p>
      <w:hyperlink r:id="rId1">
        <w:r><w:t>Anthropic</w:t></w:r>
      </w:hyperlink>
    </w:p>
  </w:body>
</w:document>"#;
        let rels_xml = r#"<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://anthropic.com" TargetMode="External"/>
</Relationships>"#;
        let buffer = build_docx_with_rels(document_xml, rels_xml);
        let extracted = extract_docx_markdown_from_bytes(&buffer).expect("expected markdown");
        assert!(
            extracted.contains("[Anthropic](https://anthropic.com)"),
            "hyperlink not resolved: {extracted}"
        );
    }

    #[test]
    fn exports_docx_with_headings_and_footnotes() {
        let bytes =
            export_markdown_docx_bytes("# Title\n\nBody with note[^1].\n\n[^1]: Footnote text")
                .expect("expected docx bytes");

        let cursor = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).expect("expected zip archive");
        let document = read_docx_entry(&mut archive, "word/document.xml")
            .expect("expected entry read")
            .expect("expected document.xml");
        let footnotes = read_docx_entry(&mut archive, "word/footnotes.xml")
            .expect("expected footnotes read")
            .expect("expected footnotes.xml");

        assert!(document.contains(r#"<w:pStyle w:val="Heading1"/>"#));
        assert!(document.contains(r#"<w:footnoteReference w:id="1"/>"#));
        assert!(footnotes.contains(r#"<w:footnote w:id="1">"#));
        assert!(footnotes.contains("Footnote text"));
    }
}
