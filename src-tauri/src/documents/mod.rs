use std::fs;
use std::path::Path;

use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

const MAX_DOCX_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PDF_BYTES: u64 = 50 * 1024 * 1024;
/// Plain text and Markdown are read whole into memory, so they get the same
/// ceiling as PDF rather than the much larger DOCX one.
const MAX_TEXT_BYTES: u64 = 50 * 1024 * 1024;

fn check_file_size(path: &Path, limit: u64) -> Result<(), String> {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DocumentKind {
    Docx,
    Pdf,
    Markdown,
    PlainText,
}

impl DocumentKind {
    /// Picks a decoder from the file name. Anything unrecognised is read as
    /// plain text: the user selected the file in the native dialog, so this is
    /// only a choice of how to decode it, never a permission check.
    fn from_path(path: &Path) -> Self {
        match path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("docx") => Self::Docx,
            Some("pdf") => Self::Pdf,
            Some("md" | "markdown") => Self::Markdown,
            _ => Self::PlainText,
        }
    }

    fn size_limit(self) -> u64 {
        match self {
            Self::Docx => MAX_DOCX_BYTES,
            Self::Pdf => MAX_PDF_BYTES,
            Self::Markdown | Self::PlainText => MAX_TEXT_BYTES,
        }
    }
}

/// Result of an import. Mirrors the frontend `ImportedTextFile`, minus the
/// path: the webview never receives it and has no command that accepts one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDocument {
    pub name: String,
    pub text: String,
    /// `"markdown"` or `"plain"`, matching the frontend format union.
    pub format: String,
    /// Set only for the experimental DOCX to Markdown conversion, which the UI
    /// labels as such.
    pub experimental: Option<String>,
}

fn read_utf8(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    // Distinct marker so the UI can explain the encoding problem rather than
    // showing a raw decoding error.
    String::from_utf8(bytes).map_err(|_| "text_not_utf8".to_string())
}

/// Reads and converts a file the user has already picked. Takes a plain path
/// rather than an `AppHandle` so it stays unit-testable without a running app.
fn read_picked_document(path: &Path) -> Result<ImportedDocument, String> {
    let kind = DocumentKind::from_path(path);
    check_file_size(path, kind.size_limit())?;

    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let (text, format, experimental) = match kind {
        DocumentKind::Docx => {
            let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
            (
                extract_docx_markdown_from_bytes(&bytes)?,
                "markdown",
                Some("docx-markdown".to_string()),
            )
        }
        DocumentKind::Pdf => {
            let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
            (extract_pdf_text_from_bytes(&bytes)?, "plain", None)
        }
        DocumentKind::Markdown => (read_utf8(path)?, "markdown", None),
        DocumentKind::PlainText => (read_utf8(path)?, "plain", None),
    };

    Ok(ImportedDocument {
        name,
        text,
        format: format.to_string(),
        experimental,
    })
}

/// Opens the native file picker from the backend and returns the converted
/// document. Supersedes the #367 folder allowlist: no command accepts a
/// caller-supplied path any more and the chosen path never reaches the
/// webview, so a compromised frontend cannot ask for a file the user did not
/// select. Imports are therefore unrestricted by folder.
#[tauri::command]
pub async fn import_document(app: tauri::AppHandle) -> Result<Option<ImportedDocument>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Import source text")
        .add_filter("Documents", &["txt", "md", "text", "docx", "pdf"])
        .add_filter("Plain text", &["txt", "md", "text"])
        .add_filter("Word document", &["docx"])
        .add_filter("PDF document", &["pdf"])
        .pick_file(move |picked| {
            let _ = sender.send(picked);
        });

    let Some(picked) = receiver
        .await
        .map_err(|_| "File selection was interrupted".to_string())?
    else {
        return Ok(None);
    };

    let path = picked
        .into_path()
        .map_err(|e| format!("Failed to resolve the selected file: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || read_picked_document(&path))
        .await
        .map_err(|e| format!("Document import task failed: {e}"))?
        .map(Some)
}

pub mod docx_export;
pub mod docx_extract;
pub mod pdf_extract;

pub(crate) use docx_export::export_markdown_docx_bytes;
pub use docx_extract::extract_docx_markdown_from_bytes;
pub use pdf_extract::extract_pdf_text_from_bytes;

// exposed for integration tests in mod.rs — not public API
#[cfg(test)]
pub(crate) use docx_extract::read_docx_entry;
#[cfg(test)]
pub(crate) use pdf_extract::normalize_pdf_text;

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
            writer
                .start_file("word/_rels/document.xml.rels", options)
                .unwrap();
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
        assert!(check_file_size(&path, MAX_DOCX_BYTES).is_ok());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn check_file_size_rejects_file_over_limit() {
        let path = std::env::temp_dir().join("glossa_test_size_over.bin");
        std::fs::write(&path, b"data").unwrap();
        let result = check_file_size(&path, 1);
        let _ = std::fs::remove_file(&path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File too large"));
    }

    #[test]
    fn check_file_size_rejects_missing_file() {
        let result = check_file_size(
            std::path::Path::new("/nonexistent_glossa_test_path_xyz.docx"),
            MAX_DOCX_BYTES,
        );
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
    fn text_limit_is_50mb() {
        assert_eq!(MAX_TEXT_BYTES, 50 * 1024 * 1024);
    }

    #[test]
    fn document_kind_is_chosen_from_the_extension_case_insensitively() {
        assert_eq!(
            DocumentKind::from_path(Path::new("/tmp/Report.DOCX")),
            DocumentKind::Docx
        );
        assert_eq!(
            DocumentKind::from_path(Path::new("/tmp/scan.pdf")),
            DocumentKind::Pdf
        );
        assert_eq!(
            DocumentKind::from_path(Path::new("/tmp/notes.md")),
            DocumentKind::Markdown
        );
        assert_eq!(
            DocumentKind::from_path(Path::new("/tmp/notes.markdown")),
            DocumentKind::Markdown
        );
        assert_eq!(
            DocumentKind::from_path(Path::new("/tmp/notes.txt")),
            DocumentKind::PlainText
        );
    }

    #[test]
    fn unknown_and_missing_extensions_are_read_as_plain_text() {
        assert_eq!(
            DocumentKind::from_path(Path::new("/tmp/manuscript.rtf")),
            DocumentKind::PlainText
        );
        assert_eq!(
            DocumentKind::from_path(Path::new("/tmp/README")),
            DocumentKind::PlainText
        );
    }

    #[test]
    fn size_limit_follows_the_document_kind() {
        assert_eq!(DocumentKind::Docx.size_limit(), MAX_DOCX_BYTES);
        assert_eq!(DocumentKind::Pdf.size_limit(), MAX_PDF_BYTES);
        assert_eq!(DocumentKind::Markdown.size_limit(), MAX_TEXT_BYTES);
        assert_eq!(DocumentKind::PlainText.size_limit(), MAX_TEXT_BYTES);
    }

    fn temp_file(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(name);
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn reads_plain_text_as_plain_format() {
        let path = temp_file("glossa_read_plain.txt", "Primo capoverso.".as_bytes());

        let imported = read_picked_document(&path).unwrap();

        assert_eq!(imported.name, "glossa_read_plain.txt");
        assert_eq!(imported.text, "Primo capoverso.");
        assert_eq!(imported.format, "plain");
        assert_eq!(imported.experimental, None);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn reads_markdown_files_as_markdown_format() {
        let path = temp_file("glossa_read_notes.md", "# Titolo".as_bytes());

        let imported = read_picked_document(&path).unwrap();

        assert_eq!(imported.format, "markdown");
        assert_eq!(imported.experimental, None);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn reads_an_unknown_extension_as_plain_text() {
        let path = temp_file("glossa_read_manuscript.rtf", "Testo semplice".as_bytes());

        let imported = read_picked_document(&path).unwrap();

        assert_eq!(imported.text, "Testo semplice");
        assert_eq!(imported.format, "plain");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn converts_docx_to_markdown_and_flags_it_as_experimental() {
        let docx = build_docx(
            r#"<?xml version="1.0"?>
<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Paragrafo.</w:t></w:r></w:p></w:body></w:document>"#,
        );
        let path = temp_file("glossa_read_source.docx", &docx);

        let imported = read_picked_document(&path).unwrap();

        assert!(imported.text.contains("Paragrafo."));
        assert_eq!(imported.format, "markdown");
        assert_eq!(imported.experimental.as_deref(), Some("docx-markdown"));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn reports_a_dedicated_marker_for_non_utf8_text() {
        // 0xFF is never valid UTF-8; stands in for a legacy-encoded file.
        let path = temp_file("glossa_read_latin1.txt", &[b'a', 0xFF, b'b']);

        let error = read_picked_document(&path).unwrap_err();

        assert_eq!(error, "text_not_utf8");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn reports_a_read_failure_for_a_missing_file() {
        let path = std::env::temp_dir().join("glossa_read_missing_xyz.txt");
        let _ = std::fs::remove_file(&path);

        let error = read_picked_document(&path).unwrap_err();

        assert!(error.contains("Failed to read file metadata"));
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

        let extracted = extract_docx_markdown_from_bytes(&bytes).expect("expected docx text");

        assert_eq!(extracted, "First paragraph.\n\nSecond paragraph.");
    }

    #[test]
    fn rejects_non_zip_input_for_docx() {
        let result = extract_docx_markdown_from_bytes(b"plain text, not a zip");
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

        let result = extract_docx_markdown_from_bytes(&buffer);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_docx_with_only_whitespace() {
        let xml = r#"<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>   </w:t></w:r></w:p></w:body></w:document>"#;
        let bytes = build_docx(xml);
        let result = extract_docx_markdown_from_bytes(&bytes);
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
        assert!(
            extracted.contains("- Top level"),
            "top-level list item missing"
        );
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
        assert!(
            normalized.contains("---"),
            "page break marker expected between pages"
        );
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
