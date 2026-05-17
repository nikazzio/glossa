use bytes::Bytes;
use reqwest::Client;
use serde::Serialize;
use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::llm::provider::{LlmProvider, StreamFormat, UsageAccumulator};

// ── Timeout constants ────────────────────────────────────────────────

pub(crate) const HTTP_CONNECT_TIMEOUT_SECS: u64 = 10;
pub(crate) const HTTP_REQUEST_TIMEOUT_SECS: u64 = 120;
pub(crate) const OLLAMA_HTTP_REQUEST_TIMEOUT_SECS: u64 = 300;
pub(crate) const HTTP_STREAM_HEADER_TIMEOUT_SECS: u64 = 30;
pub(crate) const HTTP_STREAM_IDLE_TIMEOUT_SECS: u64 = 30;
pub(crate) const HTTP_STREAM_TOTAL_TIMEOUT_SECS: u64 = 15 * 60;
// Ollama runs locally and can be significantly slower than cloud APIs,
// especially on first inference or with large models.
pub(crate) const OLLAMA_STREAM_HEADER_TIMEOUT_SECS: u64 = 4 * 60;
pub(crate) const OLLAMA_STREAM_IDLE_TIMEOUT_SECS: u64 = 5 * 60;

// ── Stream timeout configuration ─────────────────────────────────────

#[derive(Clone, Copy)]
pub struct StreamTimeouts {
    pub header: Duration,
    pub idle: Duration,
    pub total: Duration,
}

pub fn default_stream_timeouts() -> StreamTimeouts {
    StreamTimeouts {
        header: Duration::from_secs(HTTP_STREAM_HEADER_TIMEOUT_SECS),
        idle: Duration::from_secs(HTTP_STREAM_IDLE_TIMEOUT_SECS),
        total: Duration::from_secs(HTTP_STREAM_TOTAL_TIMEOUT_SECS),
    }
}

pub fn ollama_stream_timeouts() -> StreamTimeouts {
    StreamTimeouts {
        header: Duration::from_secs(OLLAMA_STREAM_HEADER_TIMEOUT_SECS),
        idle: Duration::from_secs(OLLAMA_STREAM_IDLE_TIMEOUT_SECS),
        total: Duration::from_secs(HTTP_STREAM_TOTAL_TIMEOUT_SECS),
    }
}

// ── HTTP client builders ─────────────────────────────────────────────

pub(crate) fn build_http_client_with_timeout(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(HTTP_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

pub(crate) fn build_default_http_client() -> Result<Client, String> {
    build_http_client_with_timeout(HTTP_REQUEST_TIMEOUT_SECS)
}

// ── Stream cancellation registry ─────────────────────────────────────

/// Cancellation handle stored in `StreamRegistry`.
///
/// `flag` is the synchronous source of truth (cheap atomic load before
/// each chunk). `notify` lets a task that is currently parked on
/// `resp.chunk().await` wake up immediately when cancellation is
/// requested, instead of waiting for the next byte from the provider.
pub struct CancelToken {
    flag: AtomicBool,
    pub(crate) notify: Notify,
}

impl CancelToken {
    pub(crate) fn new() -> Self {
        Self {
            flag: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    pub(crate) fn cancel(&self) {
        self.flag.store(true, Ordering::Release);
        self.notify.notify_waiters();
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Acquire)
    }
}

/// Tracks in-flight streaming requests so the frontend can interrupt them.
///
/// When the user clicks "Stop", the frontend invokes `cancel_stream` with
/// the active stream id. The matching `CancelToken` is flipped and its
/// `Notify` fires; the SSE loop drops the response (closing the TCP
/// connection so the provider stops billing) and returns
/// `STREAM_CANCELLED_ERROR`.
#[derive(Default)]
pub struct StreamRegistry {
    cancels: Mutex<HashMap<String, Arc<CancelToken>>>,
}

impl StreamRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub(crate) fn register(&self, stream_id: &str) -> Arc<CancelToken> {
        let token = Arc::new(CancelToken::new());
        self.cancels
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(stream_id.to_string(), Arc::clone(&token));
        token
    }

    pub(crate) fn unregister(&self, stream_id: &str) {
        self.cancels
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(stream_id);
    }

    pub(crate) fn cancel(&self, stream_id: &str) {
        if let Some(token) = self
            .cancels
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(stream_id)
        {
            token.cancel();
        }
    }
}

/// RAII guard that unregisters a stream id from the registry on drop,
/// even if the surrounding future is cancelled or panics.
pub(crate) struct StreamGuard<'a> {
    pub(crate) registry: &'a StreamRegistry,
    pub(crate) stream_id: String,
}

impl Drop for StreamGuard<'_> {
    fn drop(&mut self) {
        self.registry.unregister(&self.stream_id);
    }
}

/// Sentinel string used to identify a user-cancelled stream in error
/// flows; the frontend checks for this prefix to suppress the toast.
pub const STREAM_CANCELLED_ERROR: &str = "Stream cancelled";

pub(crate) struct StreamResult {
    pub(crate) content: String,
}

impl PartialEq<&str> for StreamResult {
    fn eq(&self, other: &&str) -> bool {
        self.content == *other
    }
}

impl PartialEq<StreamResult> for &str {
    fn eq(&self, other: &StreamResult) -> bool {
        *self == other.content
    }
}

// ── Internal stream token type ────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StreamToken {
    pub(crate) stream_id: String,
    pub(crate) token: String,
    pub(crate) done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) cached_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) cache_miss_input_tokens: Option<u32>,
}

// ── Stream chunk abstraction ──────────────────────────────────────────

pub(crate) trait StreamChunkSource {
    fn next_chunk<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<Option<Bytes>, String>> + Send + 'a>>;
}

pub(crate) struct ReqwestChunkSource<'a> {
    pub(crate) resp: &'a mut reqwest::Response,
    pub(crate) provider_id: &'a str,
}

impl StreamChunkSource for ReqwestChunkSource<'_> {
    fn next_chunk<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<Option<Bytes>, String>> + Send + 'a>> {
        Box::pin(async move {
            self.resp
                .chunk()
                .await
                .map_err(|e| format_transport_error(self.provider_id, "stream read", e))
        })
    }
}

// ── Stream accumulator ────────────────────────────────────────────────

struct StreamAccumulator {
    full_text: String,
    buffer: String,
    usage: UsageAccumulator,
}

impl StreamAccumulator {
    fn new() -> Self {
        Self {
            full_text: String::new(),
            buffer: String::new(),
            usage: UsageAccumulator::default(),
        }
    }

    fn emit_token<E>(&mut self, stream_id: &str, token: String, emit: &mut E)
    where
        E: FnMut(StreamToken),
    {
        emit(StreamToken {
            stream_id: stream_id.to_string(),
            token,
            done: false,
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
            cache_miss_input_tokens: None,
        });
    }

    fn process_json_payload<E>(
        &mut self,
        provider: &dyn LlmProvider,
        stream_id: &str,
        data: &str,
        emit: &mut E,
    ) -> Result<(), String>
    where
        E: FnMut(StreamToken),
    {
        if let Some(text) = provider.extract_streaming_token(data) {
            if !text.is_empty() {
                self.full_text.push_str(&text);
                self.emit_token(stream_id, text, emit);
            }
        }
        provider.update_streaming_usage(data, &mut self.usage);
        Ok(())
    }

    fn process_bytes<E>(
        &mut self,
        provider: &dyn LlmProvider,
        stream_id: &str,
        bytes: &[u8],
        emit: &mut E,
    ) -> Result<(), String>
    where
        E: FnMut(StreamToken),
    {
        self.buffer.push_str(&String::from_utf8_lossy(bytes));

        // Process all complete lines without reallocating the buffer tail on each
        // iteration. Each line is copied once (O(line_length)); the remaining prefix
        // is drained in a single call at the end instead of reassigning the whole
        // buffer on every newline (which was O(n²) for n lines).
        let mut start = 0;
        while let Some(rel_pos) = self.buffer[start..].find('\n') {
            let abs_pos = start + rel_pos;
            let line = self.buffer[start..abs_pos].trim_end().to_string();

            if provider.stream_format() == StreamFormat::NewlineJson {
                if !line.is_empty() {
                    self.process_json_payload(provider, stream_id, &line, emit)?;
                }
            } else if let Some(data) = line.strip_prefix("data: ") {
                if data != "[DONE]" {
                    self.process_json_payload(provider, stream_id, data, emit)?;
                }
            }

            start = abs_pos + 1;
        }
        self.buffer.drain(..start);

        Ok(())
    }

    fn finish<E>(&mut self, provider: &dyn LlmProvider, stream_id: &str, emit: &mut E)
    where
        E: FnMut(StreamToken),
    {
        if let Some(extra) = provider.finalize_buffer(&self.buffer) {
            if !extra.is_empty() && !self.full_text.ends_with(&extra) {
                self.full_text.push_str(&extra);
                self.emit_token(stream_id, extra, emit);
            }
        }

        // For newline-JSON providers (Ollama): parse buffer for usage if any remains
        if provider.stream_format() == StreamFormat::NewlineJson {
            let trimmed = self.buffer.trim();
            if !trimmed.is_empty() {
                provider.update_streaming_usage(trimmed, &mut self.usage);
            }
        }

        let final_usage = self.usage.final_usage();
        if let Some(usage) = final_usage.as_ref() {
            log::info!(
                "LLM stream completed provider={} stream_id={} input_tokens={} output_tokens={} cached_input_tokens={} cache_miss_input_tokens={}",
                provider.id(),
                stream_id,
                usage.input,
                usage.output,
                usage.cached_input.unwrap_or(0),
                usage.cache_miss_input.unwrap_or(0),
            );
        }
        emit(StreamToken {
            stream_id: stream_id.to_string(),
            token: String::new(),
            done: true,
            input_tokens: final_usage.as_ref().map(|u| u.input),
            output_tokens: final_usage.as_ref().map(|u| u.output),
            cached_input_tokens: final_usage.as_ref().and_then(|u| u.cached_input),
            cache_miss_input_tokens: final_usage.as_ref().and_then(|u| u.cache_miss_input),
        });
    }
}

// ── Core streaming functions ──────────────────────────────────────────

pub(crate) async fn consume_stream<S, E, G>(
    provider: &dyn LlmProvider,
    stream_id: &str,
    cancel: &Arc<CancelToken>,
    source: &mut S,
    mut emit: E,
    model: &str,
    mut on_idle_grace: G,
) -> Result<StreamResult, String>
where
    S: StreamChunkSource,
    E: FnMut(StreamToken),
    G: FnMut(),
{
    let timeouts = provider.stream_timeouts();
    let mut acc = StreamAccumulator::new();
    let started_at = tokio::time::Instant::now();

    loop {
        if started_at.elapsed() >= timeouts.total {
            return Err(format_stream_total_timeout_with_duration(
                provider.id(),
                timeouts.total,
            ));
        }
        if cancel.is_cancelled() {
            return Err(STREAM_CANCELLED_ERROR.to_string());
        }
        let chunk_result = tokio::select! {
            biased;
            _ = cancel.notify.notified() => {
                return Err(STREAM_CANCELLED_ERROR.to_string());
            }
            chunk = tokio::time::timeout(timeouts.idle, source.next_chunk()) => chunk,
        };
        match chunk_result {
            Ok(Ok(Some(bytes))) => acc.process_bytes(provider, stream_id, &bytes, &mut emit)?,
            Ok(Ok(None)) => break,
            Ok(Err(err)) => return Err(err),
            Err(_) => {
                // Before giving up, ask the provider if it is still alive.
                // Ollama checks /api/ps; cloud providers return false immediately.
                if provider.on_idle_timeout(model).await {
                    on_idle_grace();
                    continue;
                }
                return Err(format_stream_idle_timeout_with_duration(
                    provider.id(),
                    timeouts.idle,
                ));
            }
        }
    }

    acc.finish(provider, stream_id, &mut emit);
    Ok(StreamResult { content: acc.full_text })
}

/// Read an SSE stream, emit tokens via Tauri events, return the full text.
///
/// On every iteration `tokio::select!` races the next chunk read against
/// the cancellation `Notify`. If cancel fires while the task is parked
/// on a slow/idle provider, the response is dropped (closing the TCP
/// connection so the provider stops billing) and `STREAM_CANCELLED_ERROR`
/// is returned without waiting for the next byte.
pub(crate) async fn stream_response(
    app: &AppHandle,
    mut resp: reqwest::Response,
    provider: &dyn LlmProvider,
    stream_id: &str,
    cancel: &Arc<CancelToken>,
    model: &str,
) -> Result<StreamResult, String> {
    let mut source = ReqwestChunkSource {
        resp: &mut resp,
        provider_id: provider.id(),
    };
    let alive_app = app.clone();
    let alive_sid = stream_id.to_string();
    consume_stream(
        provider,
        stream_id,
        cancel,
        &mut source,
        |token| {
            let _ = app.emit("stream-token", token);
        },
        model,
        move || {
            let _ = alive_app.emit("stream-alive", serde_json::json!({ "streamId": alive_sid }));
        },
    )
    .await
}

pub(crate) async fn with_stream_header_timeout<T, E, F, M>(
    provider: &str,
    timeout: Duration,
    future: F,
    map_error: M,
) -> Result<T, String>
where
    F: Future<Output = Result<T, E>>,
    M: FnOnce(E) -> String,
{
    tokio::time::timeout(timeout, future)
        .await
        .map_err(|_| format_stream_header_timeout_with_duration(provider, timeout))?
        .map_err(map_error)
}

// ── Error formatting ──────────────────────────────────────────────────

pub(crate) fn format_transport_error(
    provider: &str,
    operation: &str,
    error: reqwest::Error,
) -> String {
    if provider == "ollama" {
        if error.is_timeout() {
            return format!(
                "Ollama timed out during {operation}. The model may be too large for the available VRAM/CPU budget, Ollama may have crashed, or the server may be unreachable."
            );
        }

        if error.is_connect() {
            return "Ollama is not reachable on localhost:11434. Start it with 'ollama serve' and verify the local server is up.".to_string();
        }

        return format!(
            "Ollama request failed during {operation}. The local server may be offline, overloaded, or unstable."
        );
    }

    if error.is_timeout() {
        return format!(
            "{} request timed out during {operation}",
            provider_label(provider)
        );
    }

    format!(
        "{} request failed during {operation}: {error}",
        provider_label(provider)
    )
}

pub(crate) fn format_stream_idle_timeout_with_duration(
    provider: &str,
    timeout: Duration,
) -> String {
    let label = provider_label(provider);
    if provider == "ollama" {
        return format!(
            "{label} stream became idle after {} without new output. The model may be too large, out of VRAM, crashed, or the local server may be unreachable.",
            format_timeout_duration(timeout)
        );
    }

    format!(
        "{label} stream became idle after {} without new output.",
        format_timeout_duration(timeout)
    )
}

pub(crate) fn format_stream_header_timeout_with_duration(
    provider: &str,
    timeout: Duration,
) -> String {
    let label = provider_label(provider);
    if provider == "ollama" {
        return format!(
            "{label} did not send response headers within {}. The local server may be hung, overloaded, or still loading the model.",
            format_timeout_duration(timeout)
        );
    }

    format!(
        "{label} did not send response headers within {}.",
        format_timeout_duration(timeout)
    )
}

pub(crate) fn format_stream_total_timeout_with_duration(
    provider: &str,
    timeout: Duration,
) -> String {
    format!(
        "{} stream exceeded the total timeout of {}.",
        provider_label(provider),
        format_timeout_duration(timeout)
    )
}

fn format_timeout_duration(duration: Duration) -> String {
    if duration.subsec_nanos() == 0 {
        return format!("{}s", duration.as_secs());
    }

    format!("{}ms", duration.as_millis())
}

pub(crate) fn provider_label(provider: &str) -> &'static str {
    match provider {
        "gemini" => "Gemini",
        "openai" => "OpenAI",
        "deepseek" => "DeepSeek",
        "anthropic" => "Anthropic",
        "ollama" => "Ollama",
        _ => "Provider",
    }
}

// ── Lazy HTTP client singletons (shared with providers) ───────────────

pub(crate) static OLLAMA_HTTP_CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
pub(crate) static OLLAMA_STREAMING_HTTP_CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
