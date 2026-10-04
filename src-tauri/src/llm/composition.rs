//! Named pieces of a prompt. Every LLM request is composed from these parts and
//! the preview shows the same parts, so what the user inspects is exactly what
//! is sent: joining the parts of a block reproduces the block byte for byte.

use crate::llm::types::{PromptBlock, StructuredPrompt};

/// One named piece of a prompt. `text` keeps its own separators, so blocks are
/// plain concatenations of their parts.
#[derive(Debug, Clone)]
pub(crate) struct PromptPart {
    pub id: &'static str,
    pub text: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ComposedBlock {
    pub cacheable: bool,
    pub parts: Vec<PromptPart>,
}

#[derive(Debug, Clone)]
pub(crate) struct ComposedPrompt {
    pub system: Vec<ComposedBlock>,
    pub user: Vec<PromptPart>,
}

/// A part as the preview receives it: which message it belongs to and whether
/// that system block is cached by providers.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPart {
    pub id: &'static str,
    pub message: &'static str,
    pub cacheable: bool,
    pub text: String,
}

/// Collects the parts of one block or message, skipping empty ones: an absent
/// optional piece (no glossary, no examples) simply contributes nothing.
#[derive(Default)]
pub(crate) struct Parts(Vec<PromptPart>);

impl Parts {
    pub fn push(mut self, id: &'static str, text: impl Into<String>) -> Self {
        let text = text.into();
        if !text.is_empty() {
            self.0.push(PromptPart { id, text });
        }
        self
    }

    pub fn block(self, cacheable: bool) -> ComposedBlock {
        ComposedBlock {
            cacheable,
            parts: self.0,
        }
    }

    pub fn into_vec(self) -> Vec<PromptPart> {
        self.0
    }
}

fn join(parts: &[PromptPart]) -> String {
    parts.iter().map(|part| part.text.as_str()).collect()
}

impl ComposedPrompt {
    pub fn into_structured(self) -> StructuredPrompt {
        let system = self
            .system
            .iter()
            .map(|block| PromptBlock {
                text: join(&block.parts),
                cacheable: block.cacheable,
            })
            .collect();
        StructuredPrompt::new(system, join(&self.user))
    }

    pub fn preview_parts(&self) -> Vec<PreviewPart> {
        let system = self.system.iter().flat_map(|block| {
            block.parts.iter().map(|part| PreviewPart {
                id: part.id,
                message: "system",
                cacheable: block.cacheable,
                text: part.text.clone(),
            })
        });
        let user = self.user.iter().map(|part| PreviewPart {
            id: part.id,
            message: "user",
            cacheable: false,
            text: part.text.clone(),
        });
        system.chain(user).collect()
    }
}
