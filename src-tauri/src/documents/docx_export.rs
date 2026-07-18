use std::collections::BTreeMap;
use std::io::{Cursor, Write};

#[derive(Debug, Clone)]
enum MarkdownInline {
    Text(String),
    Strong(String),
    Emphasis(String),
    FootnoteRef(String),
}

#[derive(Debug, Clone)]
enum MarkdownBlock {
    Heading {
        level: u8,
        inlines: Vec<MarkdownInline>,
    },
    Paragraph {
        inlines: Vec<MarkdownInline>,
    },
    List {
        ordered: bool,
        items: Vec<Vec<MarkdownInline>>,
    },
}

#[derive(Debug, Clone)]
struct MarkdownDocument {
    blocks: Vec<MarkdownBlock>,
    footnotes: BTreeMap<String, Vec<MarkdownInline>>,
}

pub(crate) fn export_markdown_docx_bytes(markdown: &str) -> Result<Vec<u8>, String> {
    let document = parse_markdown_document(markdown);
    let mut buffer = Vec::new();

    {
        let cursor = Cursor::new(&mut buffer);
        let mut writer = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

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

        writer
            .finish()
            .map_err(|e| format!("Failed to finalize docx: {}", e))?;
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
            footnotes.insert(
                id.to_string(),
                parse_markdown_inlines(chunks.join(" ").trim()),
            );
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
        if let Some(rest) = line.strip_prefix(marker) {
            return Some((false, rest.trim()));
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

        if let Some(after_open) = remaining.strip_prefix("**") {
            if let Some(end) = after_open.find("**") {
                nodes.push(MarkdownInline::Strong(after_open[..end].to_string()));
                index += end + 4;
                continue;
            }
        }

        if let Some(after_open) = remaining.strip_prefix('*') {
            if let Some(end) = after_open.find('*') {
                nodes.push(MarkdownInline::Emphasis(after_open[..end].to_string()));
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
        // Lossy invece di unwrap_or_default: un confine byte sbagliato qui deve produrre
        // un carattere di rimpiazzo visibile, non far sparire silenziosamente il testo.
        let content = String::from_utf8_lossy(&bytes[index..next]).into_owned();
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
