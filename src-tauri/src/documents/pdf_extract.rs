pub fn extract_pdf_text_from_bytes(bytes: &[u8]) -> Result<String, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("Not a valid .pdf file (missing PDF header).".to_string());
    }

    let extracted = pdf_extract::extract_text_from_mem(bytes)
        .map_err(|e| format!("Failed to extract text from PDF: {}", e))?;

    let normalized = normalize_pdf_text(&extracted);
    if normalized.trim().is_empty() {
        return Err("pdf_no_text_layer".to_string());
    }

    Ok(normalized)
}

#[allow(clippy::collapsible_str_replace)]
pub(crate) fn normalize_pdf_text(text: &str) -> String {
    let text = text
        .replace('\u{FB00}', "ff")
        .replace('\u{FB01}', "fi")
        .replace('\u{FB02}', "fl")
        .replace('\u{FB03}', "ffi")
        .replace('\u{FB04}', "ffl")
        .replace('\u{FB05}', "st")
        .replace('\u{FB06}', "st")
        .replace('\u{000C}', "\n\n---\n\n");

    let mut result = String::with_capacity(text.len());
    let mut consecutive_blank: u32 = 0;

    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            consecutive_blank += 1;
            if consecutive_blank <= 1 {
                result.push('\n');
            }
        } else {
            consecutive_blank = 0;
            result.push_str(trimmed);
            result.push('\n');
        }
    }

    result.trim().to_string()
}
