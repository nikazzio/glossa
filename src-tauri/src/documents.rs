use std::fs;
use std::io::{Cursor, Read, Seek, Write};
use std::collections::BTreeMap;

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
pub async fn extract_docx_markdown(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
        extract_docx_markdown_from_bytes(&bytes)
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

#[tauri::command]
pub async fn export_markdown_docx(markdown: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || export_markdown_docx_bytes(&markdown))
        .await
        .map_err(|e| format!("Document export task failed: {}", e))?
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

pub fn extract_docx_markdown_from_bytes(bytes: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|_| "Not a valid .docx file (expected a zip archive).".to_string())?;

    let document_xml = read_docx_entry(&mut archive, "word/document.xml")?
        .ok_or_else(|| "Not a valid .docx file (missing word/document.xml).".to_string())?;
    let footnotes_xml = read_docx_entry(&mut archive, "word/footnotes.xml")?;
    let footnotes = footnotes_xml
        .as_deref()
        .map(parse_footnotes_xml)
        .transpose()?
        .unwrap_or_default();

    build_markdown_from_document_xml(&document_xml, &footnotes)
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

fn read_docx_entry<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    name: &str,
) -> Result<Option<String>, String> {
    let mut entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(_) => return Ok(None),
    };
    let mut content = String::new();
    entry.read_to_string(&mut content)
        .map_err(|e| format!("Failed to read {name}: {}", e))?;
    Ok(Some(content))
}

fn build_markdown_from_document_xml(
    xml: &str,
    footnotes: &BTreeMap<String, String>,
) -> Result<String, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut paragraphs: Vec<String> = Vec::new();
    let mut current_paragraph = String::new();
    let mut current_run = String::new();
    let mut inside_text = false;
    let mut run_bold = false;
    let mut run_italic = false;
    let mut paragraph_style: Option<String> = None;
    let mut paragraph_is_list = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":p") || local == b"p" {
                    paragraph_style = None;
                    paragraph_is_list = false;
                } else if local.ends_with(b":r") || local == b"r" {
                    current_run.clear();
                    run_bold = false;
                    run_italic = false;
                } else if local.ends_with(b":t") || local == b"t" {
                    inside_text = true;
                } else if local.ends_with(b":b") || local == b"b" {
                    run_bold = true;
                } else if local.ends_with(b":i") || local == b"i" {
                    run_italic = true;
                } else if local.ends_with(b":numPr") || local == b"numPr" {
                    paragraph_is_list = true;
                } else if local.ends_with(b":pStyle") || local == b"pStyle" {
                    paragraph_style = extract_attr_value(&element, reader.decoder(), b"val")?;
                }
            }
            Ok(Event::Empty(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":br") || local == b"br" {
                    current_run.push('\n');
                } else if local.ends_with(b":tab") || local == b"tab" {
                    current_run.push('\t');
                } else if local.ends_with(b":b") || local == b"b" {
                    run_bold = true;
                } else if local.ends_with(b":i") || local == b"i" {
                    run_italic = true;
                } else if local.ends_with(b":numPr") || local == b"numPr" {
                    paragraph_is_list = true;
                } else if local.ends_with(b":pStyle") || local == b"pStyle" {
                    paragraph_style = extract_attr_value(&element, reader.decoder(), b"val")?;
                } else if local.ends_with(b":footnoteReference") || local == b"footnoteReference" {
                    if let Some(id) = element
                        .attributes()
                        .flatten()
                        .find(|attr| attr.key.as_ref().ends_with(b":id") || attr.key.as_ref() == b"id")
                    {
                        let value = id
                            .decode_and_unescape_value(reader.decoder())
                            .map_err(|e| format!("Failed to decode footnote id: {}", e))?;
                        current_paragraph.push_str(&format!("[^{value}]"));
                    }
                }
            }
            Ok(Event::End(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":t") || local == b"t" {
                    inside_text = false;
                } else if local.ends_with(b":r") || local == b"r" {
                    current_paragraph.push_str(&apply_run_style(&current_run, run_bold, run_italic));
                    current_run.clear();
                } else if local.ends_with(b":p") || local == b"p" {
                    let paragraph = current_paragraph.trim_end();
                    if !paragraph.is_empty() {
                        paragraphs.push(apply_paragraph_markdown_style(
                            paragraph,
                            paragraph_style.as_deref(),
                            paragraph_is_list,
                        ));
                    }
                    current_paragraph.clear();
                }
            }
            Ok(Event::Text(event)) => {
                if inside_text {
                    let decoded = event
                        .decode()
                        .map_err(|e| format!("Failed to decode docx text: {}", e))?;
                    let text = quick_xml::escape::unescape(&decoded)
                        .map_err(|e| format!("Failed to unescape docx text: {}", e))?;
                    current_run.push_str(&text);
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(format!("Failed to parse docx document.xml: {}", error));
            }
            _ => {}
        }
    }

    let mut blocks = paragraphs;
    if !footnotes.is_empty() {
        let footnote_block = footnotes
            .iter()
            .map(|(id, text)| format!("[^{id}]: {text}"))
            .collect::<Vec<_>>()
            .join("\n\n");
        if !footnote_block.trim().is_empty() {
            blocks.push(footnote_block);
        }
    }

    let markdown = blocks.join("\n\n").trim().to_string();
    if markdown.is_empty() {
        return Err("The .docx file did not contain any extractable text.".to_string());
    }

    Ok(markdown)
}

fn parse_footnotes_xml(xml: &str) -> Result<BTreeMap<String, String>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut footnotes = std::collections::BTreeMap::new();
    let mut current_id: Option<String> = None;
    let mut current_paragraph = String::new();
    let mut current_run = String::new();
    let mut current_blocks: Vec<String> = Vec::new();
    let mut inside_text = false;
    let mut run_bold = false;
    let mut run_italic = false;
    let mut skip_current = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":footnote") || local == b"footnote" {
                    current_id = None;
                    current_blocks.clear();
                    skip_current = false;
                    for attr in element.attributes().flatten() {
                        if attr.key.as_ref().ends_with(b":id") || attr.key.as_ref() == b"id" {
                            current_id = Some(
                                attr.decode_and_unescape_value(reader.decoder())
                                    .map_err(|e| format!("Failed to decode footnote id: {}", e))?
                                    .to_string(),
                            );
                        }
                        if attr.key.as_ref().ends_with(b":type") || attr.key.as_ref() == b"type" {
                            let kind = attr
                                .decode_and_unescape_value(reader.decoder())
                                .map_err(|e| format!("Failed to decode footnote type: {}", e))?;
                            if kind == "separator" || kind == "continuationSeparator" {
                                skip_current = true;
                            }
                        }
                    }
                } else if local.ends_with(b":r") || local == b"r" {
                    current_run.clear();
                    run_bold = false;
                    run_italic = false;
                } else if local.ends_with(b":t") || local == b"t" {
                    inside_text = true;
                } else if local.ends_with(b":b") || local == b"b" {
                    run_bold = true;
                } else if local.ends_with(b":i") || local == b"i" {
                    run_italic = true;
                }
            }
            Ok(Event::Empty(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":br") || local == b"br" {
                    current_run.push('\n');
                } else if local.ends_with(b":tab") || local == b"tab" {
                    current_run.push('\t');
                } else if local.ends_with(b":b") || local == b"b" {
                    run_bold = true;
                } else if local.ends_with(b":i") || local == b"i" {
                    run_italic = true;
                }
            }
            Ok(Event::End(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":t") || local == b"t" {
                    inside_text = false;
                } else if local.ends_with(b":r") || local == b"r" {
                    current_paragraph.push_str(&apply_run_style(&current_run, run_bold, run_italic));
                    current_run.clear();
                } else if local.ends_with(b":p") || local == b"p" {
                    let paragraph = current_paragraph.trim_end();
                    if !paragraph.is_empty() {
                        current_blocks.push(paragraph.to_string());
                    }
                    current_paragraph.clear();
                } else if local.ends_with(b":footnote") || local == b"footnote" {
                    if !skip_current {
                        if let Some(id) = current_id.take() {
                            let block = current_blocks.join("\n\n").trim().to_string();
                            if !block.is_empty() {
                                footnotes.insert(id, block);
                            }
                        }
                    }
                    current_blocks.clear();
                }
            }
            Ok(Event::Text(event)) => {
                if inside_text {
                    let decoded = event
                        .decode()
                        .map_err(|e| format!("Failed to decode footnote text: {}", e))?;
                    let text = quick_xml::escape::unescape(&decoded)
                        .map_err(|e| format!("Failed to unescape footnote text: {}", e))?;
                    current_run.push_str(&text);
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Failed to parse docx footnotes.xml: {}", error)),
            _ => {}
        }
    }

    Ok(footnotes)
}

fn extract_attr_value(
    element: &quick_xml::events::BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    attr_name: &[u8],
) -> Result<Option<String>, String> {
    for attr in element.attributes().flatten() {
        if attr.key.as_ref().ends_with(attr_name) || attr.key.as_ref() == attr_name {
            return Ok(Some(
                attr.decode_and_unescape_value(decoder)
                    .map_err(|e| format!("Failed to decode attribute value: {}", e))?
                    .to_string(),
            ));
        }
    }
    Ok(None)
}

fn apply_paragraph_markdown_style(
    paragraph: &str,
    style: Option<&str>,
    is_list: bool,
) -> String {
    if let Some(level) = heading_level_from_style(style) {
        return format!("{} {}", "#".repeat(level as usize), paragraph.trim());
    }
    if is_list {
        return format!("- {}", paragraph.trim());
    }
    paragraph.to_string()
}

fn heading_level_from_style(style: Option<&str>) -> Option<u8> {
    let normalized = style?.to_ascii_lowercase().replace(' ', "");
    if normalized.contains("heading1") {
        return Some(1);
    }
    if normalized.contains("heading2") {
        return Some(2);
    }
    if normalized.contains("heading3") {
        return Some(3);
    }
    None
}

#[derive(Debug, Clone)]
enum MarkdownInline {
    Text(String),
    Strong(String),
    Emphasis(String),
    FootnoteRef(String),
}

#[derive(Debug, Clone)]
enum MarkdownBlock {
    Heading { level: u8, inlines: Vec<MarkdownInline> },
    Paragraph { inlines: Vec<MarkdownInline> },
    List { ordered: bool, items: Vec<Vec<MarkdownInline>> },
}

#[derive(Debug, Clone)]
struct MarkdownDocument {
    blocks: Vec<MarkdownBlock>,
    footnotes: BTreeMap<String, Vec<MarkdownInline>>,
}

fn export_markdown_docx_bytes(markdown: &str) -> Result<Vec<u8>, String> {
    let document = parse_markdown_document(markdown);
    let mut buffer = Vec::new();

    {
        let cursor = Cursor::new(&mut buffer);
        let mut writer = zip::ZipWriter::new(cursor);
        let options =
            zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        writer
            .start_file("[Content_Types].xml", options)
            .map_err(|e| format!("Failed to write content types: {}", e))?;
        writer
            .write_all(content_types_xml(!document.footnotes.is_empty()).as_bytes())
            .map_err(|e| format!("Failed to write content types: {}", e))?;

        writer
            .add_directory("_rels/", options)
            .map_err(|e| format!("Failed to create rels directory: {}", e))?;
        writer
            .start_file("_rels/.rels", options)
            .map_err(|e| format!("Failed to write rels: {}", e))?;
        writer
            .write_all(root_relationships_xml().as_bytes())
            .map_err(|e| format!("Failed to write rels: {}", e))?;

        writer
            .add_directory("word/_rels/", options)
            .map_err(|e| format!("Failed to create word rels directory: {}", e))?;
        writer
            .start_file("word/document.xml", options)
            .map_err(|e| format!("Failed to write document.xml: {}", e))?;
        writer
            .write_all(build_docx_document_xml(&document).as_bytes())
            .map_err(|e| format!("Failed to write document.xml: {}", e))?;

        writer
            .start_file("word/styles.xml", options)
            .map_err(|e| format!("Failed to write styles.xml: {}", e))?;
        writer
            .write_all(styles_xml().as_bytes())
            .map_err(|e| format!("Failed to write styles.xml: {}", e))?;

        writer
            .start_file("word/numbering.xml", options)
            .map_err(|e| format!("Failed to write numbering.xml: {}", e))?;
        writer
            .write_all(numbering_xml().as_bytes())
            .map_err(|e| format!("Failed to write numbering.xml: {}", e))?;

        writer
            .start_file("word/_rels/document.xml.rels", options)
            .map_err(|e| format!("Failed to write document relationships: {}", e))?;
        writer
            .write_all(document_relationships_xml(!document.footnotes.is_empty()).as_bytes())
            .map_err(|e| format!("Failed to write document relationships: {}", e))?;

        if !document.footnotes.is_empty() {
            writer
                .start_file("word/footnotes.xml", options)
                .map_err(|e| format!("Failed to write footnotes.xml: {}", e))?;
            writer
                .write_all(build_footnotes_xml(&document).as_bytes())
                .map_err(|e| format!("Failed to write footnotes.xml: {}", e))?;
        }

        writer.finish().map_err(|e| format!("Failed to finalize docx: {}", e))?;
    }

    Ok(buffer)
}

fn parse_markdown_document(markdown: &str) -> MarkdownDocument {
    let normalized = markdown.replace("\r\n", "\n").trim().to_string();
    let lines: Vec<&str> = normalized.lines().collect();
    let mut body_lines: Vec<String> = Vec::new();
    let mut footnotes = BTreeMap::new();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        if let Some((id, value)) = parse_footnote_definition(line) {
            let mut chunks = vec![value.to_string()];
            while index + 1 < lines.len() && !lines[index + 1].trim().is_empty() {
                chunks.push(lines[index + 1].trim().to_string());
                index += 1;
            }
            footnotes.insert(id.to_string(), parse_markdown_inlines(chunks.join(" ").trim()));
            index += 1;
            continue;
        }

        body_lines.push(line.to_string());
        index += 1;
    }

    let mut blocks = Vec::new();
    let mut cursor = 0;
    while cursor < body_lines.len() {
        let line = body_lines[cursor].trim();
        if line.is_empty() {
            cursor += 1;
            continue;
        }

        if let Some((level, content)) = parse_heading(line) {
            blocks.push(MarkdownBlock::Heading {
                level,
                inlines: parse_markdown_inlines(content),
            });
            cursor += 1;
            continue;
        }

        if let Some((ordered, first_item)) = parse_list_item(line) {
            let mut items = vec![parse_markdown_inlines(first_item)];
            cursor += 1;
            while cursor < body_lines.len() {
                let next = body_lines[cursor].trim();
                if next.is_empty() {
                    break;
                }
                if let Some((next_ordered, content)) = parse_list_item(next) {
                    if next_ordered != ordered {
                        break;
                    }
                    items.push(parse_markdown_inlines(content));
                    cursor += 1;
                    continue;
                }
                break;
            }
            blocks.push(MarkdownBlock::List { ordered, items });
            continue;
        }

        let mut paragraph_lines = vec![line.to_string()];
        cursor += 1;
        while cursor < body_lines.len() {
            let next = body_lines[cursor].trim();
            if next.is_empty() || parse_heading(next).is_some() || parse_list_item(next).is_some() {
                break;
            }
            paragraph_lines.push(next.to_string());
            cursor += 1;
        }
        blocks.push(MarkdownBlock::Paragraph {
            inlines: parse_markdown_inlines(paragraph_lines.join(" ").trim()),
        });
    }

    MarkdownDocument { blocks, footnotes }
}

fn parse_heading(line: &str) -> Option<(u8, &str)> {
    for level in 1..=3 {
        let prefix = format!("{} ", "#".repeat(level as usize));
        if line.starts_with(&prefix) {
            return Some((level, line[prefix.len()..].trim()));
        }
    }
    None
}

fn parse_list_item(line: &str) -> Option<(bool, &str)> {
    for marker in ["- ", "* ", "+ "] {
        if line.starts_with(marker) {
            return Some((false, line[marker.len()..].trim()));
        }
    }
    let mut chars = line.chars().peekable();
    let mut digit_count = 0;
    while matches!(chars.peek(), Some(c) if c.is_ascii_digit()) {
        chars.next();
        digit_count += 1;
    }
    if digit_count > 0 && chars.next() == Some('.') && chars.next() == Some(' ') {
        let index = digit_count + 2;
        return Some((true, line[index..].trim()));
    }
    None
}

fn parse_footnote_definition(line: &str) -> Option<(&str, &str)> {
    if !line.starts_with("[^") {
        return None;
    }
    let end = line.find("]:")?;
    let id = &line[2..end];
    let value = line[end + 2..].trim();
    Some((id, value))
}

fn parse_markdown_inlines(text: &str) -> Vec<MarkdownInline> {
    let mut nodes = Vec::new();
    let mut index = 0;
    let bytes = text.as_bytes();

    while index < text.len() {
        let remaining = &text[index..];

        if remaining.starts_with("[^") {
            if let Some(end) = remaining.find(']') {
                let id = &remaining[2..end];
                nodes.push(MarkdownInline::FootnoteRef(id.to_string()));
                index += end + 1;
                continue;
            }
        }

        if remaining.starts_with("**") {
            if let Some(end) = remaining[2..].find("**") {
                let content = &remaining[2..2 + end];
                nodes.push(MarkdownInline::Strong(content.to_string()));
                index += end + 4;
                continue;
            }
        }

        if remaining.starts_with('*') {
            if let Some(end) = remaining[1..].find('*') {
                let content = &remaining[1..1 + end];
                nodes.push(MarkdownInline::Emphasis(content.to_string()));
                index += end + 2;
                continue;
            }
        }

        let mut next = text.len();
        for marker in ["[^", "**", "*"] {
            if let Some(position) = remaining.find(marker) {
                next = next.min(index + position);
            }
        }
        if next == index {
            next += 1;
        }
        let content = String::from_utf8(bytes[index..next].to_vec()).unwrap_or_default();
        nodes.push(MarkdownInline::Text(content));
        index = next;
    }

    nodes
}

fn build_docx_document_xml(document: &MarkdownDocument) -> String {
    let mut body = String::new();
    for block in &document.blocks {
        match block {
            MarkdownBlock::Heading { level, inlines } => {
                body.push_str(&build_docx_paragraph(inlines, Some(*level), None));
            }
            MarkdownBlock::Paragraph { inlines } => {
                body.push_str(&build_docx_paragraph(inlines, None, None));
            }
            MarkdownBlock::List { ordered, items } => {
                let num_id = if *ordered { 1 } else { 2 };
                for item in items {
                    body.push_str(&build_docx_paragraph(item, None, Some(num_id)));
                }
            }
        }
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"#
    )
}

fn build_docx_paragraph(
    inlines: &[MarkdownInline],
    heading_level: Option<u8>,
    list_num_id: Option<u8>,
) -> String {
    let mut props = String::new();
    if let Some(level) = heading_level {
        props.push_str(&format!(r#"<w:pStyle w:val="Heading{}"/>"#, level));
    }
    if let Some(num_id) = list_num_id {
        props.push_str(&format!(
            r#"<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{}"/></w:numPr>"#,
            num_id
        ));
    }
    let prop_xml = if props.is_empty() {
        String::new()
    } else {
        format!("<w:pPr>{}</w:pPr>", props)
    };
    format!(r#"<w:p>{}{}</w:p>"#, prop_xml, build_docx_runs(inlines))
}

fn build_docx_runs(inlines: &[MarkdownInline]) -> String {
    inlines
        .iter()
        .map(|inline| match inline {
            MarkdownInline::Text(text) => build_text_run(text, false, false),
            MarkdownInline::Strong(text) => build_text_run(text, true, false),
            MarkdownInline::Emphasis(text) => build_text_run(text, false, true),
            MarkdownInline::FootnoteRef(id) => format!(
                r#"<w:r><w:footnoteReference w:id="{}"/></w:r>"#,
                escape_xml_attr(id)
            ),
        })
        .collect::<Vec<_>>()
        .join("")
}

fn build_text_run(text: &str, bold: bool, italic: bool) -> String {
    let mut props = String::new();
    if bold {
        props.push_str("<w:b/>");
    }
    if italic {
        props.push_str("<w:i/>");
    }
    let prop_xml = if props.is_empty() {
        String::new()
    } else {
        format!("<w:rPr>{}</w:rPr>", props)
    };
    let preserve = if text.starts_with(' ') || text.ends_with(' ') {
        r#" xml:space="preserve""#
    } else {
        ""
    };
    format!(
        r#"<w:r>{}<w:t{}>{}</w:t></w:r>"#,
        prop_xml,
        preserve,
        escape_xml_text(text)
    )
}

fn build_footnotes_xml(document: &MarkdownDocument) -> String {
    let mut notes = vec![
        r#"<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>"#.to_string(),
        r#"<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>"#.to_string(),
    ];

    for (id, inlines) in &document.footnotes {
        notes.push(format!(
            r#"<w:footnote w:id="{}"><w:p>{}</w:p></w:footnote>"#,
            escape_xml_attr(id),
            build_docx_runs(inlines)
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  {}
</w:footnotes>"#,
        notes.join("")
    )
}

fn content_types_xml(has_footnotes: bool) -> String {
    let footnotes = if has_footnotes {
        r#"<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>"#
    } else {
        ""
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  {footnotes}
</Types>"#
    )
}

fn root_relationships_xml() -> &'static str {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#
}

fn document_relationships_xml(has_footnotes: bool) -> String {
    let footnotes = if has_footnotes {
        r#"<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>"#
    } else {
        ""
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  {footnotes}
</Relationships>"#
    )
}

fn numbering_xml() -> &'static str {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>"#
}

fn styles_xml() -> &'static str {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>"#
}

fn escape_xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_xml_attr(value: &str) -> String {
    escape_xml_text(value).replace('"', "&quot;")
}

fn apply_run_style(text: &str, bold: bool, italic: bool) -> String {
    if text.is_empty() {
        return String::new();
    }
    let text = escape_markdown_text(text);
    if bold && italic {
        return format!("***{text}***");
    }
    if bold {
        return format!("**{text}**");
    }
    if italic {
        return format!("*{text}*");
    }
    text.to_string()
}

fn escape_markdown_text(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' | '`' | '*' | '_' | '[' | ']' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            _ => escaped.push(ch),
        }
    }

    let mut lines = Vec::new();
    for line in escaped.split('\n') {
        let trimmed = line.trim_start();
        let indent_len = line.len() - trimmed.len();
        let indent = &line[..indent_len];

        let escaped_line = if trimmed.starts_with('#')
            || trimmed.starts_with("- ")
            || trimmed.starts_with("+ ")
            || trimmed.starts_with("* ")
            || trimmed.starts_with("[^")
            || starts_with_ordered_marker(trimmed)
        {
            format!("{indent}\\{trimmed}")
        } else {
            line.to_string()
        };

        lines.push(escaped_line);
    }

    lines.join("\n")
}

fn starts_with_ordered_marker(value: &str) -> bool {
    let mut chars = value.chars().peekable();
    let mut saw_digit = false;
    while let Some(ch) = chars.peek().copied() {
        if ch.is_ascii_digit() {
            saw_digit = true;
            chars.next();
            continue;
        }
        break;
    }

    saw_digit && matches!(chars.next(), Some('.')) && matches!(chars.next(), Some(' '))
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
        let footnotes = r#"<?xml version="1.0"?>
<w:footnotes xmlns:w="x">
  <w:footnote w:id="2">
    <w:p><w:r><w:t>Footnote text</w:t></w:r></w:p>
  </w:footnote>
</w:footnotes>"#;

        let mut buffer: Vec<u8> = Vec::new();
        {
            let cursor = Cursor::new(&mut buffer);
            let mut writer = zip::ZipWriter::new(cursor);
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("word/document.xml", options).unwrap();
            writer.write_all(xml.as_bytes()).unwrap();
            writer.start_file("word/footnotes.xml", options).unwrap();
            writer.write_all(footnotes.as_bytes()).unwrap();
            writer.finish().unwrap();
        }

        let extracted = extract_docx_markdown_from_bytes(&buffer).expect("expected markdown");

        assert_eq!(extracted, "Alpha *beta* gamma[^2]\n\n[^2]: Footnote text");
    }

    #[test]
    fn escapes_literal_markdown_syntax_in_plain_docx_runs() {
        let xml = r#"<?xml version="1.0"?>
<w:document xmlns:w="x">
  <w:body>
    <w:p>
      <w:r><w:t># Heading literal</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t xml:space="preserve">List marker * item and [link](url) plus _emphasis_ and [^1]</w:t></w:r>
    </w:p>
  </w:body>
</w:document>"#;

        let buffer = build_docx(xml);
        let extracted = extract_docx_markdown_from_bytes(&buffer).expect("expected markdown");

        assert_eq!(
            extracted,
            r#"\# Heading literal

List marker \* item and \[link\](url) plus \_emphasis\_ and \[^1\]"#
        );
    }

    #[test]
    fn exports_docx_with_headings_and_footnotes() {
        let bytes = export_markdown_docx_bytes("# Title\n\nBody with note[^1].\n\n[^1]: Footnote text")
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
