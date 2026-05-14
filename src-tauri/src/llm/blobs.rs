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
}

/// Rough token estimate: ~1.33 tokens per word (works for Latin-script languages).
pub fn estimate_tokens(text: &str) -> usize {
    let words = text.split_whitespace().count();
    words + words / 3
}

/// Groups chunks into blobs such that no blob exceeds `budget_tokens`.
///
/// `overlap` trailing chunks from the previous blob are prepended to the next
/// blob so the LLM has continuity at blob boundaries. A single chunk that
/// exceeds `budget_tokens` always forms its own blob.
pub fn compute_blob_assignments(
    chunks: &[ChunkForBlob],
    budget_tokens: usize,
    overlap: usize,
) -> Vec<BlobAssignment> {
    if chunks.is_empty() {
        return vec![];
    }

    let effective_budget = budget_tokens.max(1);
    let mut assignments: Vec<BlobAssignment> = Vec::with_capacity(chunks.len());
    let mut blob_start = 0usize;

    while blob_start < chunks.len() {
        let blob_id = format!("{:016x}{:016x}", rand::thread_rng().gen::<u64>(), rand::thread_rng().gen::<u64>());
        let mut blob_tokens = 0usize;
        let mut blob_end = blob_start;

        while blob_end < chunks.len() {
            let chunk_tokens = estimate_tokens(&chunks[blob_end].text);
            if blob_end > blob_start && blob_tokens + chunk_tokens > effective_budget {
                break;
            }
            blob_tokens += chunk_tokens;
            blob_end += 1;
        }

        for (pos, chunk) in chunks[blob_start..blob_end].iter().enumerate() {
            assignments.push(BlobAssignment {
                chunk_id: chunk.id.clone(),
                blob_id: blob_id.clone(),
                position: pos,
            });
        }

        let next_start = blob_end;
        blob_start = if overlap > 0 && next_start < chunks.len() {
            next_start.saturating_sub(overlap)
        } else {
            next_start
        };
    }

    assignments
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(id: &str, text: &str) -> ChunkForBlob {
        ChunkForBlob { id: id.into(), text: text.into() }
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
    fn estimate_tokens_scales_with_word_count() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("one"), 1);
        assert_eq!(estimate_tokens("one two three"), 4);
        let text = words(30);
        assert_eq!(estimate_tokens(&text), 40);
    }
}
