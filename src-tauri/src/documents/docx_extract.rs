use std::collections::{BTreeMap, HashMap};
use std::io::{Cursor, Read, Seek};

use quick_xml::events::Event;
use quick_xml::{Reader, XmlVersion};

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
    let rels_xml = read_docx_entry(&mut archive, "word/_rels/document.xml.rels")?;
    let relationships = rels_xml
        .as_deref()
        .map(parse_relationships_xml)
        .unwrap_or_default();

    build_markdown_from_document_xml(&document_xml, &footnotes, &relationships)
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
            Ok(Event::Text(event)) if inside_text => {
                let decoded = event
                    .decode()
                    .map_err(|e| format!("Failed to decode docx text: {}", e))?;
                let text = quick_xml::escape::unescape(&decoded)
                    .map_err(|e| format!("Failed to unescape docx text: {}", e))?;
                current.push_str(&text);
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

pub(crate) fn read_docx_entry<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    name: &str,
) -> Result<Option<String>, String> {
    let mut entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(_) => return Ok(None),
    };
    let mut content = String::new();
    entry
        .read_to_string(&mut content)
        .map_err(|e| format!("Failed to read {name}: {}", e))?;
    Ok(Some(content))
}

fn build_markdown_from_document_xml(
    xml: &str,
    footnotes: &BTreeMap<String, String>,
    relationships: &HashMap<String, String>,
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
    let mut paragraph_list_level: Option<u8> = None;
    let mut footnote_number_by_id: BTreeMap<String, usize> = BTreeMap::new();
    let mut referenced_footnotes: Vec<String> = Vec::new();

    let mut in_table_cell = false;
    let mut current_table_rows: Vec<Vec<String>> = Vec::new();
    let mut current_table_row: Vec<String> = Vec::new();
    let mut current_table_cell = String::new();

    let mut hyperlink_url: Option<String> = None;
    let mut hyperlink_start: usize = 0;

    let mut in_drawing = false;
    let mut drawing_alt: Option<String> = None;

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":tbl") || local == b"tbl" {
                    current_table_rows.clear();
                } else if local.ends_with(b":tc") || local == b"tc" {
                    in_table_cell = true;
                    current_table_cell.clear();
                } else if local.ends_with(b":drawing") || local == b"drawing" {
                    in_drawing = true;
                    drawing_alt = None;
                } else if local.ends_with(b":hyperlink") || local == b"hyperlink" {
                    hyperlink_start = current_paragraph.len();
                    hyperlink_url = extract_attr_value(&element, reader.decoder(), b"id")?
                        .and_then(|rid| relationships.get(&rid).cloned());
                } else if local.ends_with(b":p") || local == b"p" {
                    paragraph_style = None;
                    paragraph_list_level = None;
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
                    paragraph_list_level = Some(0);
                } else if local.ends_with(b":ilvl") || local == b"ilvl" {
                    if let Some(val) = extract_attr_value(&element, reader.decoder(), b"val")? {
                        if let Ok(level) = val.parse::<u8>() {
                            paragraph_list_level = Some(level);
                        }
                    }
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
                    paragraph_list_level = Some(0);
                } else if local.ends_with(b":ilvl") || local == b"ilvl" {
                    if let Some(val) = extract_attr_value(&element, reader.decoder(), b"val")? {
                        if let Ok(level) = val.parse::<u8>() {
                            paragraph_list_level = Some(level);
                        }
                    }
                } else if local.ends_with(b":pStyle") || local == b"pStyle" {
                    paragraph_style = extract_attr_value(&element, reader.decoder(), b"val")?;
                } else if local.ends_with(b":footnoteReference") || local == b"footnoteReference" {
                    if let Some(old_id) = extract_attr_value(&element, reader.decoder(), b"id")? {
                        let number = match footnote_number_by_id.get(&old_id) {
                            Some(existing) => *existing,
                            None => {
                                referenced_footnotes.push(old_id.clone());
                                let next = referenced_footnotes.len();
                                footnote_number_by_id.insert(old_id, next);
                                next
                            }
                        };
                        current_paragraph.push_str(&format!("[^{number}]"));
                    }
                } else if (local.ends_with(b":docPr") || local == b"docPr") && in_drawing {
                    let descr = extract_attr_value(&element, reader.decoder(), b"descr")?;
                    let name = extract_attr_value(&element, reader.decoder(), b"name")?;
                    drawing_alt = descr
                        .filter(|s| !s.is_empty())
                        .or_else(|| name.filter(|s| !s.is_empty()));
                }
            }
            Ok(Event::End(element)) => {
                let local = element.name().as_ref().to_vec();
                if local.ends_with(b":t") || local == b"t" {
                    inside_text = false;
                } else if local.ends_with(b":r") || local == b"r" {
                    current_paragraph.push_str(&apply_run_style(
                        &current_run,
                        run_bold,
                        run_italic,
                    ));
                    current_run.clear();
                } else if local.ends_with(b":drawing") || local == b"drawing" {
                    if let Some(alt) = drawing_alt.take() {
                        let safe_alt = alt.replace('[', "(").replace(']', ")");
                        current_paragraph.push_str(&format!("[Image: {safe_alt}]"));
                    }
                    in_drawing = false;
                } else if local.ends_with(b":hyperlink") || local == b"hyperlink" {
                    if let Some(url) = hyperlink_url.take() {
                        let link_text = current_paragraph[hyperlink_start..].to_string();
                        current_paragraph.truncate(hyperlink_start);
                        current_paragraph.push_str(&format!("[{link_text}]({url})"));
                    }
                } else if local.ends_with(b":tc") || local == b"tc" {
                    current_table_row.push(current_table_cell.trim().to_string());
                    current_table_cell.clear();
                    in_table_cell = false;
                } else if local.ends_with(b":tr") || local == b"tr" {
                    if !current_table_row.is_empty() {
                        current_table_rows.push(std::mem::take(&mut current_table_row));
                    }
                } else if local.ends_with(b":tbl") || local == b"tbl" {
                    if let Some(table_md) = format_markdown_table(&current_table_rows) {
                        paragraphs.push(table_md);
                    }
                    current_table_rows.clear();
                } else if local.ends_with(b":p") || local == b"p" {
                    let paragraph = current_paragraph.trim_end();
                    if in_table_cell {
                        if !paragraph.is_empty() {
                            if !current_table_cell.is_empty() {
                                current_table_cell.push(' ');
                            }
                            current_table_cell.push_str(paragraph);
                        }
                    } else if !paragraph.is_empty() {
                        paragraphs.push(apply_paragraph_markdown_style(
                            paragraph,
                            paragraph_style.as_deref(),
                            paragraph_list_level,
                        ));
                    }
                    current_paragraph.clear();
                }
            }
            Ok(Event::Text(event)) if inside_text => {
                let decoded = event
                    .decode()
                    .map_err(|e| format!("Failed to decode docx text: {}", e))?;
                let text = quick_xml::escape::unescape(&decoded)
                    .map_err(|e| format!("Failed to unescape docx text: {}", e))?;
                current_run.push_str(&text);
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(format!("Failed to parse docx document.xml: {}", error));
            }
            _ => {}
        }
    }

    let mut blocks = paragraphs;
    if !referenced_footnotes.is_empty() {
        let footnote_block = referenced_footnotes
            .iter()
            .enumerate()
            .filter_map(|(index, original_id)| {
                footnotes
                    .get(original_id)
                    .map(|text| format!("[^{}]: {text}", index + 1))
            })
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
                                attr.decoded_and_normalized_value(
                                    XmlVersion::Implicit1_0,
                                    reader.decoder(),
                                )
                                .map_err(|e| format!("Failed to decode footnote id: {}", e))?
                                .to_string(),
                            );
                        }
                        if attr.key.as_ref().ends_with(b":type") || attr.key.as_ref() == b"type" {
                            let kind = attr
                                .decoded_and_normalized_value(
                                    XmlVersion::Implicit1_0,
                                    reader.decoder(),
                                )
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
                    current_paragraph.push_str(&apply_run_style(
                        &current_run,
                        run_bold,
                        run_italic,
                    ));
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
            Ok(Event::Text(event)) if inside_text => {
                let decoded = event
                    .decode()
                    .map_err(|e| format!("Failed to decode footnote text: {}", e))?;
                let text = quick_xml::escape::unescape(&decoded)
                    .map_err(|e| format!("Failed to unescape footnote text: {}", e))?;
                current_run.push_str(&text);
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Failed to parse docx footnotes.xml: {}", error)),
            _ => {}
        }
    }

    Ok(footnotes)
}

fn parse_relationships_xml(xml: &str) -> HashMap<String, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut result = HashMap::new();

    loop {
        match reader.read_event() {
            Ok(Event::Empty(element)) | Ok(Event::Start(element)) => {
                let local = element.name().as_ref().to_vec();
                if local == b"Relationship" || local.ends_with(b":Relationship") {
                    let mut id: Option<String> = None;
                    let mut target: Option<String> = None;
                    let mut is_hyperlink = false;
                    for attr in element.attributes().flatten() {
                        let key = attr.key.as_ref();
                        if key == b"Id" {
                            id = attr
                                .decoded_and_normalized_value(
                                    XmlVersion::Implicit1_0,
                                    reader.decoder(),
                                )
                                .ok()
                                .map(|v| v.to_string());
                        } else if key == b"Target" {
                            target = attr
                                .decoded_and_normalized_value(
                                    XmlVersion::Implicit1_0,
                                    reader.decoder(),
                                )
                                .ok()
                                .map(|v| v.to_string());
                        } else if key == b"Type" {
                            if let Ok(t) = attr.decoded_and_normalized_value(
                                XmlVersion::Implicit1_0,
                                reader.decoder(),
                            ) {
                                if t.contains("hyperlink") {
                                    is_hyperlink = true;
                                }
                            }
                        }
                    }
                    if is_hyperlink {
                        if let (Some(id), Some(target)) = (id, target) {
                            result.insert(id, target);
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            _ => {}
        }
    }

    result
}

fn format_markdown_table(rows: &[Vec<String>]) -> Option<String> {
    if rows.is_empty() {
        return None;
    }
    let col_count = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if col_count == 0 {
        return None;
    }

    let escape_cell = |s: &str| s.replace('|', "\\|");

    let header_cells: Vec<String> = rows[0].iter().map(|c| escape_cell(c)).collect();
    let separator = vec!["---"; col_count].join(" | ");

    let mut lines = vec![
        format!("| {} |", header_cells.join(" | ")),
        format!("| {} |", separator),
    ];

    for row in rows.iter().skip(1) {
        let cells: Vec<String> = row.iter().map(|c| escape_cell(c)).collect();
        lines.push(format!("| {} |", cells.join(" | ")));
    }

    Some(lines.join("\n"))
}

fn extract_attr_value(
    element: &quick_xml::events::BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    attr_name: &[u8],
) -> Result<Option<String>, String> {
    for attr in element.attributes().flatten() {
        if attr.key.as_ref().ends_with(attr_name) || attr.key.as_ref() == attr_name {
            return Ok(Some(
                attr.decoded_and_normalized_value(XmlVersion::Implicit1_0, decoder)
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
    list_level: Option<u8>,
) -> String {
    if let Some(level) = heading_level_from_style(style) {
        return format!("{} {}", "#".repeat(level as usize), paragraph.trim());
    }
    if list_level.is_some() {
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
