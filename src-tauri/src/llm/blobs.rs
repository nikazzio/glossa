use std::sync::Arc;

use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkForBlob {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobAssignment {
    pub chunk_id: String,
    pub blob_id: String,
    pub position: usize,
    pub reference_chunk_ids: Arc<[String]>,
}

/// Rough token estimate. Word-based (~1.33 tokens/word) approximates common
/// Latin-script text well, but undercounts dense/inflected languages (German
/// compounds, Latin) where a single whitespace-separated "word" is unusually
/// long — those need more subword tokens than the word count alone implies.
/// A character-based floor (~4 chars/token) catches that case without
/// changing the estimate for ordinary text.
pub fn estimate_tokens(text: &str) -> usize {
    let words = text.split_whitespace().count();
    let word_based = words + words / 3;
    let char_based = text.chars().count() / 4;
    word_based.max(char_based)
}

/// Groups chunks into static reference blobs for prompt caching.
///
/// Strategy:
/// - If the whole document fits comfortably within the budget, emit a single blob.
/// - Otherwise emit local macro-blobs with overlap between adjacent reference windows.
/// - Every chunk assigned to the same blob sees the exact same `reference_chunk_ids`,
///   so the prompt prefix remains stable across that blob's requests.
pub fn compute_blob_assignments(
    chunks: &[ChunkForBlob],
    budget_tokens: usize,
    overlap: usize,
) -> Vec<BlobAssignment> {
    if chunks.is_empty() {
        return vec![];
    }

    let effective_budget = budget_tokens.max(1);
    let chunk_tokens: Vec<usize> = chunks
        .iter()
        .map(|chunk| estimate_tokens(&chunk.text))
        .collect();
    let total_tokens: usize = chunk_tokens.iter().sum();

    // If the full document sits comfortably within the context budget, a single
    // shared blob maximizes cache hits and gives the model global coherence.
    if total_tokens * 10 <= effective_budget * 7 {
        let blob_id = format!(
            "{:016x}{:016x}",
            rand::thread_rng().gen::<u64>(),
            rand::thread_rng().gen::<u64>()
        );
        let reference_chunk_ids: Arc<[String]> =
            chunks.iter().map(|chunk| chunk.id.clone()).collect();
        return chunks
            .iter()
            .enumerate()
            .map(|(position, chunk)| BlobAssignment {
                chunk_id: chunk.id.clone(),
                blob_id: blob_id.clone(),
                position,
                reference_chunk_ids: Arc::clone(&reference_chunk_ids),
            })
            .collect();
    }

    let local_budget = ((effective_budget * 3) / 5).max(1);
    let mut assignments: Vec<BlobAssignment> = Vec::with_capacity(chunks.len());
    let mut primary_start = 0usize;

    while primary_start < chunks.len() {
        let reference_start = primary_start.saturating_sub(overlap);
        let blob_id = format!(
            "{:016x}{:016x}",
            rand::thread_rng().gen::<u64>(),
            rand::thread_rng().gen::<u64>()
        );

        let mut reference_end = reference_start;
        let mut reference_tokens = 0usize;
        while reference_end < chunks.len() {
            let next_tokens = chunk_tokens[reference_end];
            let must_include_current = reference_end <= primary_start;
            if !must_include_current
                && reference_end > reference_start
                && reference_tokens + next_tokens > local_budget
            {
                break;
            }
            reference_tokens += next_tokens;
            reference_end += 1;
        }

        let window_len = reference_end - reference_start;
        let reserve_overlap = overlap.min(window_len.saturating_sub(1));
        let has_more_chunks = reference_end < chunks.len();
        let mut primary_end = reference_end;

        if has_more_chunks && reserve_overlap > 0 && primary_start + 1 < reference_end {
            primary_end = primary_end.saturating_sub(reserve_overlap);
        }

        if primary_end <= primary_start {
            primary_end = (primary_start + 1).min(chunks.len());
        }

        let reference_chunk_ids: Arc<[String]> = chunks[reference_start..reference_end]
            .iter()
            .map(|chunk| chunk.id.clone())
            .collect();

        for (position, chunk) in chunks[primary_start..primary_end].iter().enumerate() {
            assignments.push(BlobAssignment {
                chunk_id: chunk.id.clone(),
                blob_id: blob_id.clone(),
                position,
                reference_chunk_ids: Arc::clone(&reference_chunk_ids),
            });
        }

        primary_start = primary_end;
    }

    assignments
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(id: &str, text: &str) -> ChunkForBlob {
        ChunkForBlob {
            id: id.into(),
            text: text.into(),
        }
    }

    fn words(n: usize) -> String {
        vec!["word"; n].join(" ")
    }

    #[test]
    fn empty_input_produces_no_assignments() {
        assert!(compute_blob_assignments(&[], 1000, 0).is_empty());
    }

    #[test]
    fn single_chunk_forms_one_blob() {
        let chunks = vec![chunk("c1", "hello world")];
        let result = compute_blob_assignments(&chunks, 1000, 0);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].chunk_id, "c1");
        assert_eq!(result[0].position, 0);
        assert_eq!(
            result[0].reference_chunk_ids.as_ref(),
            &["c1".to_string()] as &[String]
        );
    }

    #[test]
    fn chunks_within_budget_form_one_blob() {
        let chunks = vec![chunk("c1", "hello"), chunk("c2", "world")];
        let result = compute_blob_assignments(&chunks, 1000, 0);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].blob_id, result[1].blob_id);
    }

    #[test]
    fn chunks_exceeding_budget_split_into_multiple_blobs() {
        let big = words(300);
        let chunks = vec![chunk("c1", &big), chunk("c2", &big), chunk("c3", &big)];
        let result = compute_blob_assignments(&chunks, 200, 0);
        assert_ne!(result[0].blob_id, result[1].blob_id);
        assert_ne!(result[1].blob_id, result[2].blob_id);
    }

    #[test]
    fn oversized_single_chunk_gets_its_own_blob() {
        let big = words(1000);
        let chunks = vec![chunk("c1", &big), chunk("c2", "tiny")];
        let result = compute_blob_assignments(&chunks, 100, 0);
        assert_ne!(result[0].blob_id, result[1].blob_id);
    }

    #[test]
    fn positions_are_zero_indexed_within_blob() {
        let chunks = vec![chunk("c1", "a"), chunk("c2", "b"), chunk("c3", "c")];
        let result = compute_blob_assignments(&chunks, 1000, 0);
        assert_eq!(result[0].position, 0);
        assert_eq!(result[1].position, 1);
        assert_eq!(result[2].position, 2);
    }

    #[test]
    fn small_document_uses_single_shared_blob() {
        let chunks = vec![
            chunk("c1", &words(80)),
            chunk("c2", &words(80)),
            chunk("c3", &words(80)),
        ];
        let result = compute_blob_assignments(&chunks, 1000, 2);
        assert_eq!(result.len(), 3);
        assert!(result
            .iter()
            .all(|entry| entry.blob_id == result[0].blob_id));
        let expected_refs: &[String] = &["c1".to_string(), "c2".to_string(), "c3".to_string()];
        assert!(result
            .iter()
            .all(|entry| entry.reference_chunk_ids.as_ref() == expected_refs));
    }

    #[test]
    fn large_document_uses_overlapping_reference_windows() {
        let big = words(220);
        let chunks = vec![
            chunk("c1", &big),
            chunk("c2", &big),
            chunk("c3", &big),
            chunk("c4", &big),
            chunk("c5", &big),
            chunk("c6", &big),
        ];
        let result = compute_blob_assignments(&chunks, 1000, 2);
        assert_eq!(result.len(), 6);
        assert_eq!(result[0].reference_chunk_ids, result[1].reference_chunk_ids);
        assert_ne!(result[1].blob_id, result[2].blob_id);
        assert_ne!(result[1].reference_chunk_ids, result[2].reference_chunk_ids);
        assert!(result[2].reference_chunk_ids.contains(&"c3".to_string()));
        assert!(
            result[2].reference_chunk_ids.contains(&"c1".to_string())
                || result[2].reference_chunk_ids.contains(&"c2".to_string())
        );
    }

    #[test]
    fn estimate_tokens_scales_with_word_count() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("one"), 1);
        assert_eq!(estimate_tokens("one two three"), 4);
        let text = words(30);
        assert_eq!(estimate_tokens(&text), 40);
    }

    #[test]
    fn estimate_tokens_uses_char_floor_for_long_compound_words() {
        // A single very long compound word (German-style) has a tiny word count,
        // so the word-based formula alone would badly undercount it.
        let compound = "Rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz";
        let word_based_only = 1 + 1 / 3;
        assert_eq!(word_based_only, 1);
        assert!(estimate_tokens(compound) > word_based_only);
        assert_eq!(estimate_tokens(compound), compound.chars().count() / 4);
    }
}
