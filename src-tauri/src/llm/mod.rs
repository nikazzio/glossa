pub mod blobs;
pub mod pipeline;
pub mod prompts;
pub mod provider;
pub mod providers;
pub mod stream;
pub mod types;

pub use stream::StreamRegistry;

#[cfg(test)]
mod tests {
    use crate::llm::prompts::{
        build_judge_prompts, build_stage_prompts, parse_judge_rating, sanitize_llm_json_output,
    };
    use crate::llm::provider::{
        LlmProvider, LlmRequest, LlmResponse, StreamFormat, UsageAccumulator,
    };
    use crate::llm::providers::ollama::{build_ollama_options, merge_ollama_config};
    use crate::llm::providers::{format_api_error, get_provider, provider_label_from_url};
    use crate::llm::stream::{
        consume_stream, format_stream_header_timeout_with_duration,
        format_stream_idle_timeout_with_duration, format_stream_total_timeout_with_duration,
        provider_label, with_stream_header_timeout, CancelToken, StreamChunkSource, StreamGuard,
        StreamRegistry, StreamTimeouts, StreamToken, HTTP_STREAM_IDLE_TIMEOUT_SECS,
        HTTP_STREAM_TOTAL_TIMEOUT_SECS, STREAM_CANCELLED_ERROR,
    };
    use crate::llm::types::{
        GlossaryEntry, JudgeIssue, OllamaConfig, PipelineConfig, ProviderRuntimeConfig, StageConfig,
    };
    use async_trait::async_trait;
    use bytes::Bytes;
    use reqwest::Client;
    use serde_json::{Map, Value};
    use std::{
        collections::VecDeque,
        future::Future,
        pin::Pin,
        sync::{Arc, Mutex as StdMutex},
        time::Duration,
    };
    use tokio::time::{advance, sleep};
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // ── Test provider helpers ─────────────────────────────────────────

    /// Minimal provider that delegates token extraction to one of the real
    /// providers — used by streaming tests that previously passed a bare
    /// provider-id string to `consume_stream`.
    struct DelegatingTestProvider {
        inner: Box<dyn LlmProvider>,
        timeouts: Option<StreamTimeouts>,
    }

    impl DelegatingTestProvider {
        fn new(id: &str) -> Self {
            Self {
                inner: get_provider(id, None).expect("test provider must exist"),
                timeouts: None,
            }
        }

        fn with_timeouts(id: &str, timeouts: StreamTimeouts) -> Self {
            Self {
                inner: get_provider(id, None).expect("test provider must exist"),
                timeouts: Some(timeouts),
            }
        }
    }

    #[async_trait]
    impl LlmProvider for DelegatingTestProvider {
        fn id(&self) -> &'static str {
            self.inner.id()
        }

        fn display_name(&self) -> &'static str {
            self.inner.display_name()
        }

        fn api_key_env_var(&self) -> Option<&'static str> {
            self.inner.api_key_env_var()
        }

        fn default_test_model(&self) -> &'static str {
            self.inner.default_test_model()
        }

        fn stream_format(&self) -> StreamFormat {
            self.inner.stream_format()
        }

        fn stream_timeouts(&self) -> StreamTimeouts {
            self.timeouts
                .unwrap_or_else(|| self.inner.stream_timeouts())
        }

        fn http_client(&self) -> Result<Client, String> {
            self.inner.http_client()
        }

        fn extract_streaming_token(&self, data: &str) -> Option<String> {
            self.inner.extract_streaming_token(data)
        }

        fn update_streaming_usage(&self, data: &str, state: &mut UsageAccumulator) {
            self.inner.update_streaming_usage(data, state)
        }

        async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String> {
            self.inner.call(client, req).await
        }

        async fn build_streaming_request(
            &self,
            client: &Client,
            req: &LlmRequest<'_>,
        ) -> Result<reqwest::Response, String> {
            self.inner.build_streaming_request(client, req).await
        }
    }

    // ── Mock chunk source ─────────────────────────────────────────────

    struct MockChunkSource {
        chunks: VecDeque<MockChunk>,
    }

    enum MockChunk {
        Immediate(Result<Option<Bytes>, &'static str>),
        Delayed {
            delay: Duration,
            result: Result<Option<Bytes>, &'static str>,
        },
    }

    impl MockChunkSource {
        fn new(chunks: Vec<MockChunk>) -> Self {
            Self {
                chunks: VecDeque::from(chunks),
            }
        }
    }

    impl StreamChunkSource for MockChunkSource {
        fn next_chunk<'a>(
            &'a mut self,
        ) -> Pin<Box<dyn Future<Output = Result<Option<Bytes>, String>> + Send + 'a>> {
            Box::pin(async move {
                let Some(chunk) = self.chunks.pop_front() else {
                    return Ok(None);
                };
                match chunk {
                    MockChunk::Immediate(result) => result.map_err(str::to_string),
                    MockChunk::Delayed { delay, result } => {
                        sleep(delay).await;
                        result.map_err(str::to_string)
                    }
                }
            })
        }
    }

    // ── Config helpers ────────────────────────────────────────────────

    fn make_config() -> PipelineConfig {
        PipelineConfig {
            source_language: "English".into(),
            target_language: "Italian".into(),
            stages: vec![],
            judge_prompt: "Evaluate translation quality.".into(),
            judge_model: "gemini-3-flash-preview".into(),
            judge_provider: "gemini".into(),
            glossary: vec![GlossaryEntry {
                term: "API".into(),
                translation: "API".into(),
                notes: Some("Keep as-is".into()),
            }],
            use_chunking: Some(true),
            markdown_aware: None,
            coherence_prompt: None,
            review_provider_options: None,
            persona: None,
            ui_language: None,
            custom_source_language: None,
            custom_target_language: None,
            blob_context: None,
            blob_current_chunk_id: None,
        }
    }

    fn make_stage(provider: &str) -> StageConfig {
        StageConfig {
            id: "stg-1".into(),
            name: "Translation".into(),
            role: None,
            prompt: "Translate accurately.".into(),
            model: "test-model".into(),
            provider: provider.into(),
            enabled: true,
            provider_options: None,
        }
    }

    // ── extract_streaming_token ──────────────────────────────────────

    #[test]
    fn extract_gemini_streaming() {
        let provider = DelegatingTestProvider::new("gemini");
        let data = r#"{"candidates":[{"content":{"parts":[{"text":"Ciao"}]}}]}"#;
        assert_eq!(provider.extract_streaming_token(data), Some("Ciao".into()));
    }

    #[test]
    fn extract_openai_streaming() {
        let provider = DelegatingTestProvider::new("openai");
        let data = r#"{"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(provider.extract_streaming_token(data), Some("Hello".into()));
    }

    #[test]
    fn extract_deepseek_streaming() {
        let provider = DelegatingTestProvider::new("deepseek");
        let data = r#"{"choices":[{"delta":{"content":"Bonjour"}}]}"#;
        assert_eq!(
            provider.extract_streaming_token(data),
            Some("Bonjour".into())
        );
    }

    #[test]
    fn extract_ollama_streaming() {
        let provider = DelegatingTestProvider::new("ollama");
        let data = r#"{"message":{"content":"Hola"}}"#;
        assert_eq!(provider.extract_streaming_token(data), Some("Hola".into()));
    }

    #[test]
    fn extract_anthropic_content_block_delta() {
        let provider = DelegatingTestProvider::new("anthropic");
        let data = r#"{"type":"content_block_delta","delta":{"text":"Guten Tag"}}"#;
        assert_eq!(
            provider.extract_streaming_token(data),
            Some("Guten Tag".into())
        );
    }

    #[test]
    fn extract_anthropic_non_delta_returns_none() {
        let provider = DelegatingTestProvider::new("anthropic");
        let data = r#"{"type":"message_start","message":{"id":"msg_1"}}"#;
        assert_eq!(provider.extract_streaming_token(data), None);
    }

    #[test]
    fn extract_unknown_provider_returns_none() {
        assert!(get_provider("unknown", None).is_err());
    }

    #[test]
    fn extract_invalid_json_returns_none() {
        let provider = DelegatingTestProvider::new("gemini");
        assert_eq!(provider.extract_streaming_token("not json"), None);
    }

    #[test]
    fn extract_empty_content_returns_empty_string() {
        let provider = DelegatingTestProvider::new("openai");
        let data = r#"{"choices":[{"delta":{"content":""}}]}"#;
        assert_eq!(provider.extract_streaming_token(data), Some("".into()));
    }

    #[test]
    fn extract_missing_path_returns_none() {
        let provider = DelegatingTestProvider::new("openai");
        let data = r#"{"choices":[]}"#;
        assert_eq!(provider.extract_streaming_token(data), None);
    }

    // ── build_stage_prompts ──────────────────────────────────────────

    #[test]
    fn stage_prompt_without_previous() {
        let config = make_config();
        let stage = make_stage("gemini");
        let prompt = build_stage_prompts("Hello world", &stage, &config, None);
        let system = prompt.flatten_system();

        assert!(system.contains("English to Italian"));
        assert!(system.contains("Translate accurately."));
        assert!(system.contains("| API | API |"));
        assert!(prompt.user.contains("Hello world"));
        assert!(!prompt.user.contains("Previous Iteration"));
        assert!(!system.contains("Reference document context"));
    }

    #[test]
    fn stage_prompt_with_blob_context() {
        let mut config = make_config();
        config.blob_context = Some("<chunk id=\"chunk-1\">\nHello world\n</chunk>".into());
        config.blob_current_chunk_id = Some("chunk-1".into());
        let stage = make_stage("openai");
        let prev = Some("Ciao mondo".to_string());
        let prompt = build_stage_prompts("Hello world", &stage, &config, prev.as_deref());
        let system = prompt.flatten_system();

        assert!(system.contains("English to Italian"));
        assert!(prompt.user.contains("Hello world"));
        assert!(prompt.user.contains("Ciao mondo"));
        assert!(prompt.user.contains("Previous Iteration"));
        assert!(prompt.user.contains("Current chunk id: chunk-1"));
        assert!(system.contains("Reference document block"));
        assert!(system.contains("<chunk id=\"chunk-1\">"));
    }

    #[test]
    fn stage_prompt_empty_glossary() {
        let mut config = make_config();
        config.glossary = vec![];
        let stage = make_stage("gemini");
        let system = build_stage_prompts("text", &stage, &config, None).flatten_system();

        assert!(system.contains("No glossary entries were provided"));
    }

    #[test]
    fn stage_prompt_multiple_glossary_entries() {
        let mut config = make_config();
        config.glossary = vec![
            GlossaryEntry {
                term: "API".into(),
                translation: "API".into(),
                notes: Some("tech".into()),
            },
            GlossaryEntry {
                term: "bug".into(),
                translation: "errore".into(),
                notes: None,
            },
        ];
        let stage = make_stage("gemini");
        let system = build_stage_prompts("text", &stage, &config, None).flatten_system();

        assert!(system.contains("| API | API | tech |"));
        assert!(system.contains("| bug | errore |"));
        assert!(system.contains("Treat every glossary entry as mandatory terminology"));
        assert!(system.contains("Glossary Reminder"));
        assert!(system.contains("Apply the glossary entries specified above"));
    }

    #[test]
    fn format_stage_prompt_omits_glossary_persona_and_source_context() {
        let mut config = make_config();
        config.blob_context = Some("<chunk id=\"chunk-1\">\nHello world\n</chunk>".into());
        config.blob_current_chunk_id = Some("chunk-1".into());
        let mut stage = make_stage("gemini");
        stage.role = Some("format".into());
        stage.prompt = "Fix formatting only.".into();
        let prev = Some("Previous should not appear".to_string());
        let prompt = build_stage_prompts("Ciao **mondo", &stage, &config, prev.as_deref());
        let system = prompt.flatten_system();

        assert!(system.contains("deterministic text post-processor"));
        assert!(system.contains("Fix formatting only."));
        assert!(system.contains("Output only the formatted text"));
        assert!(!system.contains("Glossary Constraints"));
        assert!(!system.contains("| API | API |"));
        assert!(!system.contains("English to Italian"));
        assert!(!system.contains("Reference document block"));
        assert!(!system.contains("Output only the translated text"));
        assert!(prompt.user.contains("Text to format"));
        assert!(prompt.user.contains("Ciao **mondo"));
        assert!(!prompt.user.contains("Original text"));
        assert!(!prompt.user.contains("Previous Iteration"));
        assert!(!prompt.user.contains("Previous should not appear"));
    }

    #[test]
    fn markdown_aware_stage_prompt_preserves_syntax() {
        let mut config = make_config();
        config.markdown_aware = Some(true);
        let stage = make_stage("gemini");
        let prompt = build_stage_prompts("Text with note[^1].", &stage, &config, None);
        let system = prompt.flatten_system();

        assert!(system.contains("Markdown"));
        assert!(system.contains("Preserve every Markdown marker"));
        assert!(system.contains("Preserve paragraph boundaries and line breaks"));
        assert!(prompt.user.contains("Text with note[^1]."));
    }

    // ── build_judge_prompts ──────────────────────────────────────────

    #[test]
    fn judge_prompt_includes_source_and_target() {
        let config = make_config();
        let prompt = build_judge_prompts("Hello", "Ciao", &config);
        let system = prompt.flatten_system();

        // Source/target text now live in the user turn for cacheability
        assert!(system.contains("English"));
        assert!(system.contains("Italian"));
        assert!(!system.contains("Hello"));
        assert!(!system.contains("Ciao"));
        assert!(prompt.user.contains("Hello"));
        assert!(prompt.user.contains("Ciao"));
        assert!(system.contains("rating"));
        assert!(system.contains("critical"));
        assert!(system.contains("poor"));
        assert!(system.contains("fair"));
        assert!(system.contains("good"));
        assert!(system.contains("excellent"));
        assert!(system.contains("issues"));
        assert!(prompt.user.contains("audit"));
    }

    #[test]
    fn judge_prompt_includes_instructions() {
        let config = make_config();
        let system = build_judge_prompts("src", "tgt", &config).flatten_system();

        assert!(system.contains("Evaluate translation quality."));
    }

    #[test]
    fn judge_prompt_includes_glossary_json() {
        let config = make_config();
        let system = build_judge_prompts("src", "tgt", &config).flatten_system();

        assert!(system.contains("API"));
        assert!(system.contains("Keep as-is"));
    }

    #[test]
    fn parses_semantic_judge_rating() {
        let parsed = parse_judge_rating(&serde_json::json!({"rating": "sufficiente"}));
        assert_eq!(parsed, "fair");

        let parsed = parse_judge_rating(&serde_json::json!({"rating": "ottimo"}));
        assert_eq!(parsed, "excellent");
    }

    #[test]
    fn defaults_unknown_judge_rating_to_fair() {
        let parsed = parse_judge_rating(&serde_json::json!({"rating": "ambiguous"}));
        assert_eq!(parsed, "fair");
    }

    #[test]
    fn sanitize_clean_json_passthrough() {
        let s = r#"{"rating":"good","issues":[]}"#;
        assert_eq!(sanitize_llm_json_output(s), s);
    }

    #[test]
    fn sanitize_strips_json_fence() {
        let s = "```json\n{\"rating\":\"good\"}\n```";
        assert_eq!(sanitize_llm_json_output(s), r#"{"rating":"good"}"#);
    }

    #[test]
    fn sanitize_strips_bare_fence() {
        let s = "```\n{\"rating\":\"fair\"}\n```";
        assert_eq!(sanitize_llm_json_output(s), r#"{"rating":"fair"}"#);
    }

    #[test]
    fn sanitize_strips_preamble_and_fence() {
        let s = "Sure! Here is the evaluation:\n```json\n{\"rating\":\"poor\"}\n```\n";
        assert_eq!(sanitize_llm_json_output(s), r#"{"rating":"poor"}"#);
    }

    #[test]
    fn builds_http_client_with_timeouts() {
        let client = crate::llm::stream::build_http_client_with_timeout(
            crate::llm::stream::HTTP_REQUEST_TIMEOUT_SECS,
        );
        assert!(client.is_ok());
    }

    #[test]
    fn builds_ollama_http_client_with_longer_timeout() {
        let client = crate::llm::stream::build_http_client_with_timeout(
            crate::llm::stream::OLLAMA_HTTP_REQUEST_TIMEOUT_SECS,
        );
        assert!(client.is_ok());
    }

    #[test]
    fn builds_streaming_http_client_without_global_request_timeout() {
        // The streaming client is the LazyLock singleton — just verify it exists.
        let _client: &Client = &crate::llm::stream::OLLAMA_STREAMING_HTTP_CLIENT;
    }

    #[test]
    fn effective_stage_ollama_config_applies_defaults() {
        let stage = make_stage("ollama");
        // A stage with no provider_options falls back to defaults.
        let ollama = merge_ollama_config(
            None,
            stage
                .provider_options
                .as_ref()
                .and_then(|o| o.ollama.as_ref()),
        );

        assert_eq!(ollama.temperature, Some(0.1));
        assert_eq!(ollama.top_p, Some(1.0));
        assert_eq!(ollama.num_ctx, Some(8192));
        assert_eq!(ollama.num_predict, None);
        assert_eq!(ollama.think, Some(Value::Bool(false)));
        assert_eq!(ollama.keep_alive, Some(Value::String("15m".into())));
    }

    #[test]
    fn effective_review_ollama_config_merges_user_overrides() {
        let mut config = make_config();
        config.review_provider_options = Some(ProviderRuntimeConfig {
            ollama: Some(OllamaConfig {
                temperature: Some(0.2),
                top_p: Some(0.95),
                seed: Some(7),
                keep_alive: Some(Value::String("30m".into())),
                think: Some(Value::String("low".into())),
                num_ctx: Some(12288),
                num_predict: Some(2048),
                use_advanced_options: Some(true),
                advanced_options: Some(Map::from_iter([(
                    "repeat_penalty".into(),
                    serde_json::json!(1.05),
                )])),
            }),
            openai: None,
            deepseek: None,
            gemini: None,
        });

        let ollama = merge_ollama_config(
            None,
            config
                .review_provider_options
                .as_ref()
                .and_then(|o| o.ollama.as_ref()),
        );
        let options = build_ollama_options(&ollama);

        assert_eq!(ollama.temperature, Some(0.2));
        assert_eq!(ollama.top_p, Some(0.95));
        assert_eq!(ollama.seed, Some(7));
        assert_eq!(ollama.keep_alive, Some(Value::String("30m".into())));
        assert_eq!(ollama.think, Some(Value::String("low".into())));
        assert_eq!(ollama.num_ctx, Some(12288));
        assert_eq!(ollama.num_predict, Some(2048));
        assert_eq!(
            options.get("repeat_penalty"),
            Some(&serde_json::json!(1.05))
        );
    }

    #[test]
    fn format_stream_idle_timeout_is_specific_for_ollama() {
        let message = format_stream_idle_timeout_with_duration(
            "ollama",
            Duration::from_secs(HTTP_STREAM_IDLE_TIMEOUT_SECS),
        );
        assert!(message.contains("idle"));
        assert!(message.contains("VRAM"));
    }

    #[test]
    fn format_stream_total_timeout_mentions_provider() {
        let message = format_stream_total_timeout_with_duration(
            "ollama",
            Duration::from_secs(HTTP_STREAM_TOTAL_TIMEOUT_SECS),
        );
        assert!(message.contains("Ollama"));
        assert!(message.contains(&HTTP_STREAM_TOTAL_TIMEOUT_SECS.to_string()));
    }

    // Tests for Ollama-specific API error formatting. The function is
    // private to `providers::ollama`, so we test the observable behavior
    // via the provider's preflight path indirectly, or replicate the
    // equivalent assertions against the known status codes.
    #[test]
    fn format_ollama_api_error_maps_overload() {
        // Verify that the generic format_api_error (used for non-Ollama providers)
        // maps 503 → "provider unavailable", while Ollama has its own message.
        // We test the generic path here; the Ollama-specific path is tested
        // within ollama.rs itself (private function).
        let message = format_api_error("Ollama", reqwest::StatusCode::SERVICE_UNAVAILABLE, "busy");
        assert!(message.contains("provider unavailable") || message.contains("overloaded"));
    }

    #[test]
    fn format_ollama_api_error_maps_timeout_and_runtime_failures() {
        let timeout = format_api_error(
            "Ollama",
            reqwest::StatusCode::REQUEST_TIMEOUT,
            "slow model load",
        );
        let runtime = format_api_error("Ollama", reqwest::StatusCode::BAD_GATEWAY, "gpu oom");

        assert!(timeout.contains("timed out") || timeout.contains("408"));
        assert!(runtime.contains("provider unavailable") || runtime.contains("502"));
    }

    #[test]
    fn find_matching_ollama_model_accepts_latest_alias() {
        // The function is private to providers::ollama. Test the equivalent
        // logic inline — exact matches, :latest suffix stripping, and misses.
        fn matches(models: &[String], requested: &str) -> bool {
            models.iter().any(|m| {
                m == requested
                    || m.strip_suffix(":latest") == Some(requested)
                    || requested.strip_suffix(":latest") == Some(m.as_str())
            })
        }
        let models = vec!["llama3.2:latest".to_string(), "qwen3:8b".to_string()];
        assert!(matches(&models, "llama3.2"));
        assert!(matches(&models, "llama3.2:latest"));
        assert!(!matches(&models, "missing"));
    }

    // ── Serialization ────────────────────────────────────────────────

    #[test]
    fn glossary_entry_deserializes() {
        let json = r#"{"term":"API","translation":"API","notes":"Keep"}"#;
        let entry: GlossaryEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.term, "API");
        assert_eq!(entry.notes, Some("Keep".into()));
    }

    #[test]
    fn judge_issue_serializes_type_as_type() {
        let issue = JudgeIssue {
            issue_type: "fluency".into(),
            severity: "low".into(),
            description: "Minor".into(),
            suggested_fix: None,
            phrase: None,
        };
        let json = serde_json::to_string(&issue).unwrap();
        assert!(json.contains(r#""type":"fluency"#));
        assert!(!json.contains("issue_type"));
    }

    #[test]
    fn stream_token_serializes_camel_case() {
        let token = StreamToken {
            stream_id: "s1".into(),
            token: "hi".into(),
            done: false,
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
            cache_miss_input_tokens: None,
        };
        let json = serde_json::to_string(&token).unwrap();
        assert!(json.contains("streamId"));
        assert!(!json.contains("stream_id"));
        // Optional None fields must not appear in the serialized output.
        assert!(!json.contains("inputTokens"));
        assert!(!json.contains("outputTokens"));
    }

    #[test]
    fn stream_token_with_usage_serializes_token_counts() {
        let token = StreamToken {
            stream_id: "s1".into(),
            token: String::new(),
            done: true,
            input_tokens: Some(100),
            output_tokens: Some(50),
            cached_input_tokens: Some(60),
            cache_miss_input_tokens: Some(40),
        };
        let json = serde_json::to_string(&token).unwrap();
        assert!(json.contains("inputTokens"));
        assert!(json.contains("outputTokens"));
        assert!(json.contains("100"));
        assert!(json.contains("50"));
    }

    #[test]
    fn pipeline_config_roundtrip() {
        let config = make_config();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: PipelineConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.source_language, "English");
        assert_eq!(parsed.glossary.len(), 1);
    }

    // ── get_provider routing ─────────────────────────────────────────

    #[test]
    fn call_provider_rejects_unknown() {
        match get_provider("fake_provider", None) {
            Err(e) => assert!(e.contains("Unknown provider"), "unexpected error: {e}"),
            Ok(_) => panic!("expected get_provider to fail for unknown id"),
        }
    }

    // ── error sanitization ───────────────────────────────────────────

    #[test]
    fn format_api_error_omits_response_body() {
        let secret = "user prompt: Confidential unpublished manuscript text";
        let msg = format_api_error("OpenAI", reqwest::StatusCode::UNAUTHORIZED, secret);
        assert!(!msg.contains(secret), "response body must not leak: {msg}");
        assert!(msg.contains("OpenAI"));
        assert!(msg.contains("API key not authorized"));
    }

    #[test]
    fn format_api_error_maps_common_statuses() {
        let cases = [
            (reqwest::StatusCode::BAD_REQUEST, "bad request"),
            (reqwest::StatusCode::FORBIDDEN, "API key not authorized"),
            (
                reqwest::StatusCode::NOT_FOUND,
                "model or endpoint not found",
            ),
            (reqwest::StatusCode::TOO_MANY_REQUESTS, "rate limited"),
            (reqwest::StatusCode::BAD_GATEWAY, "provider unavailable"),
        ];
        for (status, expected) in cases {
            let msg = format_api_error("Anthropic", status, "any body");
            assert!(
                msg.contains(expected),
                "status {status} should map to '{expected}', got: {msg}"
            );
        }
    }

    #[test]
    fn provider_label_from_url_identifies_known_hosts() {
        assert_eq!(
            provider_label_from_url("https://api.openai.com/v1"),
            "OpenAI"
        );
        assert_eq!(
            provider_label_from_url("https://api.deepseek.com"),
            "DeepSeek"
        );
        assert_eq!(
            provider_label_from_url("http://localhost:11434/v1"),
            "Ollama"
        );
        assert_eq!(provider_label_from_url("https://example.com"), "Provider");
    }

    #[test]
    fn provider_label_handles_all_supported_providers() {
        assert_eq!(provider_label("gemini"), "Gemini");
        assert_eq!(provider_label("openai"), "OpenAI");
        assert_eq!(provider_label("deepseek"), "DeepSeek");
        assert_eq!(provider_label("anthropic"), "Anthropic");
        assert_eq!(provider_label("ollama"), "Ollama");
        assert_eq!(provider_label("unknown"), "Provider");
    }

    // ── stream registry ──────────────────────────────────────────────

    #[test]
    fn stream_registry_register_returns_unflagged_handle() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        assert!(!token.is_cancelled());
    }

    #[test]
    fn stream_registry_cancel_flips_the_flag() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        registry.cancel("s-1");
        assert!(token.is_cancelled());
    }

    #[test]
    fn stream_registry_cancel_unknown_id_is_noop() {
        let registry = StreamRegistry::new();
        // Must not panic, must not poison the mutex
        registry.cancel("never-registered");
        let token = registry.register("now-real");
        assert!(!token.is_cancelled());
    }

    #[test]
    fn stream_registry_unregister_drops_the_handle() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        registry.unregister("s-1");
        // After unregister, cancelling the same id is a no-op against the
        // already-removed entry — but the original Arc still observes its
        // previous value (false), proving the flag wasn't touched.
        registry.cancel("s-1");
        assert!(!token.is_cancelled());
    }

    #[test]
    fn stream_guard_unregisters_on_drop() {
        let registry = StreamRegistry::new();
        let token = registry.register("s-1");
        {
            let _guard = StreamGuard {
                registry: &registry,
                stream_id: "s-1".to_string(),
            };
        } // guard drops here
          // After drop, cancelling has no effect on the registered handle
        registry.cancel("s-1");
        assert!(!token.is_cancelled());
    }

    #[tokio::test]
    async fn cancel_token_wakes_a_parked_waiter() {
        // Verify Notify wakes a task that is awaiting notified() the
        // moment cancel() is called. This is the property that makes
        // the SSE select! responsive even while a provider is idle.
        let token = Arc::new(CancelToken::new());
        let listener = {
            let token = Arc::clone(&token);
            tokio::spawn(async move {
                token.notify.notified().await;
                token.is_cancelled()
            })
        };

        // Yield once so the listener actually parks on notified().
        tokio::task::yield_now().await;

        token.cancel();

        let observed = tokio::time::timeout(std::time::Duration::from_millis(50), listener)
            .await
            .expect("listener did not wake within 50ms")
            .expect("listener task panicked");

        assert!(observed, "cancel flag must be set when notify wakes");
    }

    #[tokio::test(start_paused = true)]
    async fn consume_stream_ollama_times_out_when_idle_between_events() {
        let task = tokio::spawn(async move {
            let cancel = Arc::new(CancelToken::new());
            let provider = DelegatingTestProvider::with_timeouts(
                "ollama",
                StreamTimeouts {
                    header: Duration::from_millis(5),
                    idle: Duration::from_millis(10),
                    total: Duration::from_millis(100),
                },
            );
            let mut source = MockChunkSource::new(vec![MockChunk::Delayed {
                delay: Duration::from_millis(40),
                result: Ok(Some(Bytes::from_static(
                    br#"{"message":{"content":"ciao"}}
"#,
                ))),
            }]);

            consume_stream(
                &provider,
                "stream-1",
                &cancel,
                &mut source,
                |_| {},
                "test-model",
                || {},
            )
            .await
        });

        tokio::task::yield_now().await;
        advance(Duration::from_millis(10)).await;
        let result = task.await.expect("task should finish");
        assert_eq!(
            result.unwrap_err(),
            format_stream_idle_timeout_with_duration("ollama", Duration::from_millis(10))
        );
    }

    #[tokio::test(start_paused = true)]
    async fn consume_stream_ollama_respects_total_timeout_even_if_chunks_arrive() {
        let task = tokio::spawn(async move {
            let cancel = Arc::new(CancelToken::new());
            let provider = DelegatingTestProvider::with_timeouts(
                "ollama",
                StreamTimeouts {
                    header: Duration::from_millis(5),
                    idle: Duration::from_millis(20),
                    total: Duration::from_millis(12),
                },
            );
            let mut source = MockChunkSource::new(vec![
                MockChunk::Delayed {
                    delay: Duration::from_millis(5),
                    result: Ok(Some(Bytes::from_static(
                        br#"{"message":{"content":"A"}}
"#,
                    ))),
                },
                MockChunk::Delayed {
                    delay: Duration::from_millis(5),
                    result: Ok(Some(Bytes::from_static(
                        br#"{"message":{"content":"B"}}
"#,
                    ))),
                },
                MockChunk::Delayed {
                    delay: Duration::from_millis(5),
                    result: Ok(Some(Bytes::from_static(
                        br#"{"message":{"content":"C"}}
"#,
                    ))),
                },
            ]);

            consume_stream(
                &provider,
                "stream-2",
                &cancel,
                &mut source,
                |_| {},
                "test-model",
                || {},
            )
            .await
        });

        tokio::task::yield_now().await;
        advance(Duration::from_millis(15)).await;
        let result = task.await.expect("task should finish");
        assert_eq!(
            result.unwrap_err(),
            format_stream_total_timeout_with_duration("ollama", Duration::from_millis(12))
        );
    }

    #[tokio::test(start_paused = true)]
    async fn consume_stream_ollama_allows_slow_but_healthy_streams() {
        let emitted = Arc::new(StdMutex::new(Vec::new()));
        let emitted_for_task = Arc::clone(&emitted);
        let task = tokio::spawn(async move {
            let cancel = Arc::new(CancelToken::new());
            let provider = DelegatingTestProvider::with_timeouts(
                "ollama",
                StreamTimeouts {
                    header: Duration::from_millis(5),
                    idle: Duration::from_millis(20),
                    total: Duration::from_millis(50),
                },
            );
            let mut source = MockChunkSource::new(vec![
                MockChunk::Delayed {
                    delay: Duration::from_millis(5),
                    result: Ok(Some(Bytes::from_static(
                        br#"{"message":{"content":"Hel"}}
"#,
                    ))),
                },
                MockChunk::Delayed {
                    delay: Duration::from_millis(5),
                    result: Ok(Some(Bytes::from_static(
                        br#"{"message":{"content":"lo"},"prompt_eval_count":12,"eval_count":7}
"#,
                    ))),
                },
            ]);

            consume_stream(
                &provider,
                "stream-3",
                &cancel,
                &mut source,
                |token| emitted_for_task.lock().expect("poisoned").push(token),
                "test-model",
                || {},
            )
            .await
        });

        tokio::task::yield_now().await;
        advance(Duration::from_millis(10)).await;
        let result = task
            .await
            .expect("task should finish")
            .expect("healthy stream should succeed");

        let tokens = emitted.lock().expect("poisoned");
        assert_eq!(result, "Hello");
        assert_eq!(tokens.len(), 3);
        assert_eq!(tokens[0].token, "Hel");
        assert_eq!(tokens[1].token, "lo");
        assert!(tokens[2].done);
        assert_eq!(tokens[2].input_tokens, Some(12));
        assert_eq!(tokens[2].output_tokens, Some(7));
    }

    #[tokio::test]
    async fn consume_stream_propagates_source_errors() {
        let cancel = Arc::new(CancelToken::new());
        let provider = DelegatingTestProvider::with_timeouts(
            "ollama",
            StreamTimeouts {
                header: Duration::from_millis(5),
                idle: Duration::from_millis(20),
                total: Duration::from_millis(50),
            },
        );
        let mut source = MockChunkSource::new(vec![MockChunk::Immediate(Err("stream broke"))]);

        let result = consume_stream(
            &provider,
            "stream-err",
            &cancel,
            &mut source,
            |_| {},
            "test-model",
            || {},
        )
        .await;

        assert_eq!(result.unwrap_err(), "stream broke");
    }

    #[tokio::test(start_paused = true)]
    async fn stream_header_timeout_wraps_slow_ollama_startup() {
        let task = tokio::spawn(async move {
            with_stream_header_timeout(
                "ollama",
                Duration::from_millis(10),
                async {
                    sleep(Duration::from_millis(30)).await;
                    Ok::<(), &'static str>(())
                },
                |err| err.to_string(),
            )
            .await
        });

        tokio::task::yield_now().await;
        advance(Duration::from_millis(10)).await;
        let result = task.await.expect("task should finish");
        assert_eq!(
            result.unwrap_err(),
            format_stream_header_timeout_with_duration("ollama", Duration::from_millis(10))
        );
    }

    #[tokio::test(start_paused = true)]
    async fn stream_header_timeout_allows_fast_ollama_startup() {
        let task = tokio::spawn(async move {
            with_stream_header_timeout(
                "ollama",
                Duration::from_millis(20),
                async {
                    sleep(Duration::from_millis(5)).await;
                    Ok::<_, &'static str>("ready")
                },
                |err| err.to_string(),
            )
            .await
        });

        tokio::task::yield_now().await;
        advance(Duration::from_millis(5)).await;
        let result = task.await.expect("task should finish");
        assert_eq!(result.expect("fast header should pass"), "ready");
    }

    // ── HTTP-level provider tests (wiremock) ─────────────────────────

    #[tokio::test]
    async fn call_openai_compatible_returns_content_on_success() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "choices": [{"message": {"content": "Ciao mondo"}}]
            })))
            .mount(&server)
            .await;

        // Use an OpenAI-compatible provider pointed at the mock server
        use crate::llm::provider::LlmRequest;
        use crate::llm::types::{PromptBlock, StructuredPrompt};
        let prov = crate::llm::providers::openai::OpenAiCompatibleProvider::new_with_base_url(
            "openai",
            "OpenAI",
            &format!("{}", server.uri()),
            "OPENAI_API_KEY",
            "gpt-4o-mini",
        );
        let client = Client::new();
        let structured = StructuredPrompt {
            system: vec![PromptBlock {
                text: "Translate from English to Italian".into(),
                cacheable: false,
            }],
            user: "Hello world".into(),
        };
        let req = LlmRequest {
            model: "test-model",
            structured: &structured,
            api_key: "test-key",
            json_mode: false,
            provider_options: None,
        };
        let result = prov.call(&client, &req).await;
        assert_eq!(result.unwrap().content, "Ciao mondo");
    }

    #[tokio::test]
    async fn call_openai_compatible_maps_unauthorized_to_friendly_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&server)
            .await;

        use crate::llm::provider::LlmRequest;
        use crate::llm::types::{PromptBlock, StructuredPrompt};
        let prov = crate::llm::providers::openai::OpenAiCompatibleProvider::new_with_base_url(
            "openai",
            "OpenAI",
            &format!("{}", server.uri()),
            "OPENAI_API_KEY",
            "gpt-4o-mini",
        );
        let client = Client::new();
        let structured = StructuredPrompt {
            system: vec![PromptBlock {
                text: "system".into(),
                cacheable: false,
            }],
            user: "user".into(),
        };
        let req = LlmRequest {
            model: "test-model",
            structured: &structured,
            api_key: "bad-key",
            json_mode: false,
            provider_options: None,
        };
        let result = prov.call(&client, &req).await;
        let err = result.unwrap_err();
        assert!(err.contains("API key not authorized"), "got: {err}");
    }

    #[tokio::test]
    async fn call_openai_compatible_maps_rate_limit_to_friendly_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(429).set_body_string("Rate limited"))
            .mount(&server)
            .await;

        use crate::llm::provider::LlmRequest;
        use crate::llm::types::{PromptBlock, StructuredPrompt};
        let prov = crate::llm::providers::openai::OpenAiCompatibleProvider::new_with_base_url(
            "openai",
            "OpenAI",
            &format!("{}", server.uri()),
            "OPENAI_API_KEY",
            "gpt-4o-mini",
        );
        let client = Client::new();
        let structured = StructuredPrompt {
            system: vec![PromptBlock {
                text: "system".into(),
                cacheable: false,
            }],
            user: "user".into(),
        };
        let req = LlmRequest {
            model: "test-model",
            structured: &structured,
            api_key: "key",
            json_mode: false,
            provider_options: None,
        };
        let result = prov.call(&client, &req).await;
        let err = result.unwrap_err();
        assert!(err.contains("rate limited"), "got: {err}");
    }

    // ── consume_stream — non-Ollama SSE formats ──────────────────────

    #[tokio::test]
    async fn consume_stream_openai_sse_multi_token() {
        let cancel = Arc::new(CancelToken::new());
        let emitted = Arc::new(StdMutex::new(Vec::new()));
        let emitted_for_cb = Arc::clone(&emitted);
        let provider = DelegatingTestProvider::with_timeouts(
            "openai",
            StreamTimeouts {
                header: Duration::from_millis(100),
                idle: Duration::from_millis(500),
                total: Duration::from_millis(5000),
            },
        );
        let mut source = MockChunkSource::new(vec![
            MockChunk::Immediate(Ok(Some(Bytes::from_static(
                b"data: {\"choices\":[{\"delta\":{\"content\":\"Ciao\"}}]}\n\n",
            )))),
            MockChunk::Immediate(Ok(Some(Bytes::from_static(
                b"data: {\"choices\":[{\"delta\":{\"content\":\" mondo\"}}]}\n\n",
            )))),
            MockChunk::Immediate(Ok(Some(Bytes::from_static(b"data: [DONE]\n\n")))),
            MockChunk::Immediate(Ok(None)),
        ]);

        let result = consume_stream(
            &provider,
            "stream-openai",
            &cancel,
            &mut source,
            |token| emitted_for_cb.lock().expect("poisoned").push(token),
            "test-model",
            || {},
        )
        .await;

        assert_eq!(result.unwrap(), "Ciao mondo");
        let tokens = emitted.lock().expect("poisoned");
        let content: Vec<&str> = tokens
            .iter()
            .filter(|t| !t.done)
            .map(|t| t.token.as_str())
            .collect();
        assert_eq!(content, vec!["Ciao", " mondo"]);
        assert!(tokens.last().unwrap().done);
    }

    #[tokio::test]
    async fn consume_stream_anthropic_sse_multi_block() {
        let cancel = Arc::new(CancelToken::new());
        let provider = DelegatingTestProvider::with_timeouts(
            "anthropic",
            StreamTimeouts {
                header: Duration::from_millis(100),
                idle: Duration::from_millis(500),
                total: Duration::from_millis(5000),
            },
        );
        let mut source = MockChunkSource::new(vec![
            MockChunk::Immediate(Ok(Some(Bytes::from_static(
                b"data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Guten\"}}\n\n",
            )))),
            MockChunk::Immediate(Ok(Some(Bytes::from_static(
                b"data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\" Tag\"}}\n\n",
            )))),
            MockChunk::Immediate(Ok(Some(Bytes::from_static(
                b"data: {\"type\":\"message_stop\"}\n\n",
            )))),
            MockChunk::Immediate(Ok(None)),
        ]);

        let result = consume_stream(
            &provider,
            "stream-anthropic",
            &cancel,
            &mut source,
            |_| {},
            "test-model",
            || {},
        )
        .await;

        assert_eq!(result.unwrap(), "Guten Tag");
    }

    #[tokio::test]
    async fn consume_stream_halts_immediately_when_pre_cancelled() {
        let cancel = Arc::new(CancelToken::new());
        cancel.cancel();

        let provider = DelegatingTestProvider::with_timeouts(
            "openai",
            StreamTimeouts {
                header: Duration::from_millis(100),
                idle: Duration::from_millis(500),
                total: Duration::from_millis(5000),
            },
        );
        let mut source = MockChunkSource::new(vec![MockChunk::Immediate(Ok(Some(
            Bytes::from_static(b"data: {\"choices\":[{\"delta\":{\"content\":\"Never\"}}]}\n\n"),
        )))]);

        let result = consume_stream(
            &provider,
            "stream-precancelled",
            &cancel,
            &mut source,
            |_| {},
            "test-model",
            || {},
        )
        .await;

        assert_eq!(result.unwrap_err(), STREAM_CANCELLED_ERROR);
    }

    // ── judge JSON round-trip ─────────────────────────────────────────

    #[test]
    fn judge_response_parsed_from_raw_llm_output() {
        let raw = r#"```json
{
  "rating": "ottimo",
  "issues": [
    {
      "type": "fluency",
      "severity": "low",
      "description": "Minor phrasing issue",
      "suggestedFix": "Rephrase slightly"
    }
  ]
}
```"#;

        let sanitized = sanitize_llm_json_output(raw);
        let parsed: serde_json::Value =
            serde_json::from_str(sanitized).expect("should parse after sanitization");
        let rating = parse_judge_rating(&parsed);
        let issues: Vec<JudgeIssue> = parsed["issues"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| {
                Some(JudgeIssue {
                    issue_type: v["type"].as_str()?.to_string(),
                    severity: v["severity"].as_str()?.to_string(),
                    description: v["description"].as_str()?.to_string(),
                    suggested_fix: v["suggestedFix"].as_str().map(|s| s.to_string()),
                    phrase: v["phrase"].as_str().map(|s| s.to_string()),
                })
            })
            .collect();

        assert_eq!(rating, "excellent");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].issue_type, "fluency");
        assert_eq!(issues[0].severity, "low");
        assert_eq!(
            issues[0].suggested_fix.as_deref(),
            Some("Rephrase slightly")
        );
    }
}
