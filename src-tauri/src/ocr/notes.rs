//! Note a piè di pagina della lettura automatica → note della pagina.
//!
//! Con le note separate attive il modello risponde in Markdown e scrive ogni
//! nota come nota a piè di pagina: il segno `[^n]` dopo il passaggio, la
//! definizione `[^n]: Tipo «passaggio» — testo` in fondo. Qui si tolgono segni
//! e definizioni dal testo e si ricavano tipo, passaggio e quale ripetizione
//! del passaggio è.
//!
//! Il confronto del passaggio tollera maiuscole, spazi e punteggiatura. La
//! stessa regola vive nell'interfaccia (`src/utils/noteAnchors.ts`): le due
//! copie si provano sugli stessi casi (`note_anchor_cases.json`).

use rusqlite::{params, Connection};

/// Tipi riconosciuti, inglese e italiano, con il valore salvato. Il più
/// lungo prima: «resa grafica» va provato prima di nomi più corti.
const TYPE_NAMES: &[(&str, &str)] = &[
    ("abbreviation", "abbreviation"),
    ("abbreviazione", "abbreviation"),
    ("resa grafica", "typography"),
    ("typography", "typography"),
    ("intervento", "emendation"),
    ("emendation", "emendation"),
    ("correction", "correction"),
    ("correzione", "correction"),
    ("addition", "addition"),
    ("aggiunta", "addition"),
    ("dubbio", "doubt"),
    ("doubt", "doubt"),
    ("note", "note"),
    ("nota", "note"),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedNote {
    pub note_type: &'static str,
    pub content: String,
    pub passage: Option<String>,
    /// Quale ripetizione del passaggio (da 1); `None` se il passaggio c'è ma
    /// non si trova («da riagganciare») o se la nota è della pagina intera.
    pub occurrence: Option<i64>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct NoteStats {
    pub total: usize,
    pub unanchored: usize,
    pub unknown_type: usize,
}

impl NoteStats {
    /// «5 note, 1 non agganciata, 1 tipo non riconosciuto»; voci a zero omesse.
    pub fn summary(&self) -> Option<String> {
        if self.total == 0 {
            return None;
        }
        let mut parts = vec![if self.total == 1 {
            "1 nota".to_string()
        } else {
            format!("{} note", self.total)
        }];
        if self.unanchored > 0 {
            parts.push(if self.unanchored == 1 {
                "1 non agganciata".to_string()
            } else {
                format!("{} non agganciate", self.unanchored)
            });
        }
        if self.unknown_type > 0 {
            parts.push(if self.unknown_type == 1 {
                "1 con tipo non riconosciuto".to_string()
            } else {
                format!("{} con tipo non riconosciuto", self.unknown_type)
            });
        }
        Some(parts.join(", "))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedNotes {
    pub clean_text: String,
    pub notes: Vec<ExtractedNote>,
    pub stats: NoteStats,
}

struct Definition {
    id: String,
    content: String,
}

struct Marker {
    id: String,
    /// Posizione (in byte) nel testo pulito, dove stava il segno.
    position: usize,
}

pub fn extract_notes(text: &str) -> ExtractedNotes {
    let (body, definitions) = split_definitions(text);
    let (clean_text, markers) = strip_markers(&body);

    if definitions.is_empty() && markers.is_empty() {
        return ExtractedNotes {
            clean_text: text.to_string(),
            notes: Vec::new(),
            stats: NoteStats::default(),
        };
    }

    // Prima le note con il segno, in ordine di lettura; poi quelle senza.
    let mut placed: Vec<(Option<usize>, &Definition)> = definitions
        .iter()
        .map(|definition| {
            let position = markers
                .iter()
                .find(|marker| marker.id == definition.id)
                .map(|marker| marker.position);
            (position, definition)
        })
        .collect();
    placed.sort_by_key(|(position, _)| position.unwrap_or(usize::MAX));

    let mut stats = NoteStats::default();
    let notes = placed
        .into_iter()
        .map(|(position, definition)| {
            let parsed = parse_content(&definition.content);
            if !parsed.known_type {
                stats.unknown_type += 1;
            }
            let occurrence = parsed.passage.as_deref().and_then(|passage| {
                let ranges = find_passage_occurrences(&clean_text, passage);
                match position {
                    Some(position) => ranges
                        .iter()
                        .rposition(|range| range.1 <= position)
                        .map(|index| index as i64 + 1),
                    None => (!ranges.is_empty()).then_some(1),
                }
            });
            if parsed.passage.is_some() && occurrence.is_none() {
                stats.unanchored += 1;
            }
            ExtractedNote {
                note_type: parsed.note_type,
                content: parsed.text,
                passage: parsed.passage,
                occurrence,
            }
        })
        .collect::<Vec<_>>();
    stats.total = notes.len();

    ExtractedNotes {
        clean_text,
        notes,
        stats,
    }
}

/// Toglie le definizioni `[^id]: ...` (con le righe rientrate che le
/// proseguono) e restituisce il resto del testo.
fn split_definitions(text: &str) -> (String, Vec<Definition>) {
    let mut body: Vec<&str> = Vec::new();
    let mut definitions: Vec<Definition> = Vec::new();
    let mut in_definition = false;

    for line in text.lines() {
        if let Some((id, content)) = definition_start(line) {
            definitions.push(Definition {
                id,
                content: content.trim().to_string(),
            });
            in_definition = true;
            continue;
        }
        let continues = line.starts_with("  ") || line.starts_with('\t');
        if in_definition && continues && !line.trim().is_empty() {
            if let Some(last) = definitions.last_mut() {
                last.content.push(' ');
                last.content.push_str(line.trim());
            }
            continue;
        }
        in_definition = false;
        body.push(line);
    }

    if definitions.is_empty() {
        return (text.to_string(), definitions);
    }
    (body.join("\n").trim_end().to_string(), definitions)
}

fn definition_start(line: &str) -> Option<(String, &str)> {
    let trimmed = line.trim_start();
    if line.len() - trimmed.len() > 3 {
        return None;
    }
    let rest = trimmed.strip_prefix("[^")?;
    let close = rest.find(']')?;
    let id = &rest[..close];
    if id.is_empty() || id.chars().any(char::is_whitespace) {
        return None;
    }
    let content = rest[close + 1..].strip_prefix(':')?;
    Some((id.to_string(), content))
}

/// Toglie i segni `[^id]` dal testo e ricorda dove stavano.
fn strip_markers(body: &str) -> (String, Vec<Marker>) {
    let mut clean = String::with_capacity(body.len());
    let mut markers = Vec::new();
    let mut rest = body;
    while let Some(start) = rest.find("[^") {
        let after = &rest[start + 2..];
        let id_end = after.find(']');
        match id_end {
            Some(end)
                if end > 0 && !after[..end].chars().any(|c| c.is_whitespace() || c == '[') =>
            {
                clean.push_str(&rest[..start]);
                markers.push(Marker {
                    id: after[..end].to_string(),
                    position: clean.len(),
                });
                rest = &after[end + 1..];
            }
            _ => {
                clean.push_str(&rest[..start + 2]);
                rest = after;
            }
        }
    }
    clean.push_str(rest);
    (clean, markers)
}

struct ParsedContent {
    note_type: &'static str,
    known_type: bool,
    passage: Option<String>,
    text: String,
}

/// `Tipo «passaggio» — testo`: tipo, passaggio e separatore sono facoltativi.
fn parse_content(content: &str) -> ParsedContent {
    let matched = TYPE_NAMES.iter().find_map(|(name, value)| {
        let prefix = content.get(..name.len())?;
        let rest = &content[name.len()..];
        let whole_word = rest
            .chars()
            .next()
            .is_none_or(|next| !next.is_alphanumeric());
        (prefix.eq_ignore_ascii_case(name) && whole_word).then_some((*value, rest))
    });
    let (note_type, known_type, rest) = match matched {
        Some((value, rest)) => (value, true, rest.trim_start()),
        // Tipo sconosciuto: la prima parola è comunque un tipo se dopo viene
        // il passaggio citato («Glossa «et» — ...»).
        None => {
            let after_word = content
                .split_once(char::is_whitespace)
                .map(|(_, after)| after.trim_start())
                .filter(|after| quoted(content).is_none() && quoted(after).is_some());
            ("note", false, after_word.unwrap_or(content))
        }
    };
    let rest = rest.trim_start_matches(':').trim_start();

    let (passage, rest) = match quoted(rest) {
        Some((passage, after)) => (Some(passage), after),
        None => (None, rest),
    };
    let text = rest
        .trim_start()
        .trim_start_matches(['—', '–', '-', ':'])
        .trim()
        .to_string();
    ParsedContent {
        note_type,
        known_type,
        passage: passage.filter(|passage| !normalize(passage).chars.is_empty()),
        text,
    }
}

fn quoted(text: &str) -> Option<(String, &str)> {
    let (open, close) = match text.chars().next()? {
        '«' => ('«', '»'),
        '“' => ('“', '”'),
        '"' => ('"', '"'),
        _ => return None,
    };
    let inner = &text[open.len_utf8()..];
    let end = inner.find(close)?;
    Some((
        inner[..end].trim().to_string(),
        &inner[end + close.len_utf8()..],
    ))
}

struct Normalized {
    chars: Vec<char>,
    /// Per ogni carattere ridotto, inizio e fine (byte) nel testo originale.
    starts: Vec<usize>,
    ends: Vec<usize>,
}

fn normalize(source: &str) -> Normalized {
    let mut normalized = Normalized {
        chars: Vec::new(),
        starts: Vec::new(),
        ends: Vec::new(),
    };
    let mut pending_space = false;
    for (index, char) in source.char_indices() {
        let end = index + char.len_utf8();
        if char.is_whitespace() {
            pending_space = !normalized.chars.is_empty();
        } else if char.is_alphabetic() || char.is_numeric() {
            if pending_space {
                normalized.chars.push(' ');
                normalized.starts.push(index);
                normalized.ends.push(index);
                pending_space = false;
            }
            for lower in char.to_lowercase() {
                normalized.chars.push(lower);
                normalized.starts.push(index);
                normalized.ends.push(end);
            }
        }
    }
    normalized
}

/// Tutte le ripetizioni del passaggio nel testo, come intervalli in byte.
pub fn find_passage_occurrences(text: &str, passage: &str) -> Vec<(usize, usize)> {
    let needle = normalize(passage).chars;
    if needle.is_empty() {
        return Vec::new();
    }
    let haystack = normalize(text);
    if needle.len() > haystack.chars.len() {
        return Vec::new();
    }
    (0..=haystack.chars.len() - needle.len())
        .filter(|&from| haystack.chars[from..from + needle.len()] == needle[..])
        .map(|from| {
            (
                haystack.starts[from],
                haystack.ends[from + needle.len() - 1],
            )
        })
        .collect()
}

/// La rilettura rifà le note del modello: quelle della lettura precedente
/// spariscono, quelle scritte o corrette a mano (`origin = 'user'`) restano.
/// Va chiamata nella stessa transazione che scrive la revisione.
pub fn replace_model_notes(
    conn: &Connection,
    segment_id: &str,
    notes: &[ExtractedNote],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM transcription_notes WHERE segment_id = ?1 AND origin = 'model'",
        params![segment_id],
    )
    .map_err(|error| format!("note del modello di {segment_id}: {error}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default();
    for (index, note) in notes.iter().enumerate() {
        conn.execute(
            "INSERT INTO transcription_notes
               (id, segment_id, type, content, passage, occurrence, origin, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'model', ?7)",
            params![
                format!("{segment_id}:m{stamp}-{index}"),
                segment_id,
                note.note_type,
                note.content,
                note.passage,
                note.occurrence,
                index as i64,
            ],
        )
        .map_err(|error| format!("nota del modello di {segment_id}: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    struct AnchorCase {
        name: String,
        text: String,
        passage: String,
        occurrence: usize,
        count: usize,
        expected: Option<String>,
    }

    #[test]
    fn shared_anchor_cases_match_the_interface() {
        let cases: Vec<AnchorCase> =
            serde_json::from_str(include_str!("note_anchor_cases.json")).expect("casi validi");
        for case in cases {
            let ranges = find_passage_occurrences(&case.text, &case.passage);
            assert_eq!(ranges.len(), case.count, "{}", case.name);
            let found = ranges
                .get(case.occurrence - 1)
                .map(|(start, end)| case.text[*start..*end].to_string());
            assert_eq!(found, case.expected, "{}", case.name);
        }
    }

    #[test]
    fn note_markers_and_definitions_leave_the_text_clean() {
        let result =
            extract_notes("Et dixit[^1] dominus\n\n[^1]: Doubt «et dixit» — lettura incerta");
        assert_eq!(result.clean_text, "Et dixit dominus");
        assert_eq!(
            result.notes,
            vec![ExtractedNote {
                note_type: "doubt",
                content: "lettura incerta".to_string(),
                passage: Some("et dixit".to_string()),
                occurrence: Some(1),
            }]
        );
        assert_eq!(result.stats.summary().as_deref(), Some("1 nota"));
    }

    #[test]
    fn a_text_without_notes_is_left_as_it_is() {
        let text = "Et dixit dominus\n\n";
        let result = extract_notes(text);
        assert_eq!(result.clean_text, text);
        assert!(result.notes.is_empty());
        assert_eq!(result.stats.summary(), None);
    }

    #[test]
    fn a_note_without_marker_and_passage_belongs_to_the_whole_page() {
        let result = extract_notes("Et dixit\n\n[^p1]: Note — inchiostro sbiadito");
        assert_eq!(result.clean_text, "Et dixit");
        assert_eq!(result.notes[0].note_type, "note");
        assert_eq!(result.notes[0].passage, None);
        assert_eq!(result.notes[0].occurrence, None);
        assert_eq!(result.notes[0].content, "inchiostro sbiadito");
        assert_eq!(result.stats.unanchored, 0);
    }

    #[test]
    fn the_marker_picks_which_repetition_of_the_passage() {
        let result = extract_notes(
            "dominus et dominus[^1] meus\n\n[^1]: Abbreviation «dominus» — sciolto da dns",
        );
        assert_eq!(result.notes[0].note_type, "abbreviation");
        assert_eq!(result.notes[0].occurrence, Some(2));
    }

    #[test]
    fn italian_type_names_are_recognised_regardless_of_case() {
        let result = extract_notes(
            "et[^1] dixit[^2]\n\n[^1]: dubbio «et» — incerto\n[^2]: Resa grafica «dixit» — maiuscoletto",
        );
        assert_eq!(result.notes[0].note_type, "doubt");
        assert_eq!(result.notes[1].note_type, "typography");
        assert_eq!(result.notes[1].content, "maiuscoletto");
    }

    #[test]
    fn an_unknown_type_becomes_a_generic_note_and_is_counted() {
        let result = extract_notes("et[^1] dixit\n\n[^1]: Glossa «et» — mano tarda");
        assert_eq!(result.notes[0].note_type, "note");
        assert_eq!(result.notes[0].passage.as_deref(), Some("et"));
        assert_eq!(result.notes[0].content, "mano tarda");
        assert_eq!(
            result.stats.summary().as_deref(),
            Some("1 nota, 1 con tipo non riconosciuto")
        );
    }

    #[test]
    fn a_passage_not_found_before_the_marker_stays_to_reattach() {
        let result =
            extract_notes("Et dixit[^1] dominus\n\n[^1]: Emendation «sanctis» — integrato");
        assert_eq!(result.notes[0].passage.as_deref(), Some("sanctis"));
        assert_eq!(result.notes[0].occurrence, None);
        assert_eq!(
            result.stats.summary().as_deref(),
            Some("1 nota, 1 non agganciata")
        );
    }

    #[test]
    fn a_passage_after_the_marker_does_not_count() {
        let result = extract_notes("et[^1] dominus\n\n[^1]: Doubt «dominus» — incerto");
        assert_eq!(result.notes[0].occurrence, None);
    }

    #[test]
    fn a_definition_continues_on_indented_lines() {
        let result = extract_notes(
            "et[^1]\n\n[^1]: Addition «et» — a margine,\n    mano B\nSecondo paragrafo",
        );
        assert_eq!(result.notes[0].content, "a margine, mano B");
        assert_eq!(result.clean_text, "et\n\nSecondo paragrafo");
    }

    #[test]
    fn straight_quotes_and_colon_separator_are_accepted() {
        let result = extract_notes(
            "in principio[^a]\n\n[^a]: Correction \"in principio\": corretto su erasione",
        );
        assert_eq!(result.notes[0].note_type, "correction");
        assert_eq!(result.notes[0].passage.as_deref(), Some("in principio"));
        assert_eq!(result.notes[0].content, "corretto su erasione");
    }

    #[test]
    fn square_brackets_that_are_not_markers_stay_in_the_text() {
        let result = extract_notes("dominus [sic] et [^ x] meus");
        assert_eq!(result.clean_text, "dominus [sic] et [^ x] meus");
        assert!(result.notes.is_empty());
    }

    fn database() -> Connection {
        let conn = Connection::open_in_memory().expect("database in memoria");
        conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))
            .expect("baseline");
        conn.execute_batch(include_str!(
            "../../migrations/0002_transcription_notes.sql"
        ))
        .expect("note della pagina");
        conn.execute_batch(
            "INSERT INTO workspaces (id, name, created_at) VALUES ('ws1', 'W', 'x');
             INSERT INTO transcription_documents (id, workspace_id, title) VALUES ('doc1', 'ws1', 'D');
             INSERT INTO transcription_segments (id, document_id, position) VALUES ('seg1', 'doc1', 0);
             INSERT INTO transcription_notes (id, segment_id, type, content, origin)
               VALUES ('old-model', 'seg1', 'doubt', 'vecchia', 'model'),
                      ('mine', 'seg1', 'note', 'mia', 'user');",
        )
        .expect("dati di partenza");
        conn
    }

    #[test]
    fn rereading_replaces_model_notes_and_keeps_the_user_ones() {
        let conn = database();
        let extracted = extract_notes("et[^1] dixit\n\n[^1]: Addition «et» — a margine");

        replace_model_notes(&conn, "seg1", &extracted.notes).expect("scrittura");

        let rows: Vec<(String, String, Option<i64>)> = conn
            .prepare("SELECT content, origin, occurrence FROM transcription_notes ORDER BY origin, content")
            .expect("query")
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .expect("righe")
            .collect::<Result<_, _>>()
            .expect("lettura");
        assert_eq!(
            rows,
            vec![
                ("a margine".to_string(), "model".to_string(), Some(1)),
                ("mia".to_string(), "user".to_string(), None),
            ]
        );
    }
}
