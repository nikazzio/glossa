use reqwest::Client;

use crate::deepl::types::{
    CreateDeeplGlossaryInput, DeeplCreateGlossaryBody, DeeplGlossaryDictionary, DeeplGlossaryInfo,
    DeeplLanguageInfo, DeeplLanguageRaw, DeeplStageInput, DeeplStageOutput, DeeplTranslateRequest,
    DeeplTranslateResponse,
};

fn deepl_host(api_key: &str) -> &'static str {
    if api_key.ends_with(":fx") {
        "api-free.deepl.com"
    } else {
        "api.deepl.com"
    }
}

fn translate_endpoint(api_key: &str) -> String {
    format!("https://{}/v2/translate", deepl_host(api_key))
}

fn languages_endpoint(api_key: &str) -> String {
    format!("https://{}/v2/languages", deepl_host(api_key))
}

fn glossaries_endpoint(api_key: &str) -> String {
    format!("https://{}/v3/glossaries", deepl_host(api_key))
}

pub async fn translate(
    client: &Client,
    api_key: &str,
    input: &DeeplStageInput,
) -> Result<DeeplStageOutput, String> {
    let cfg = input.deepl_config.as_ref();
    let body = DeeplTranslateRequest {
        text: vec![input.text.clone()],
        source_lang: input.source_lang.clone(),
        target_lang: input.target_lang.clone(),
        model_type: cfg.and_then(|c| c.model_type.clone()),
        formality: cfg.and_then(|c| c.formality.clone()),
        context: cfg.and_then(|c| c.context.clone()),
        preserve_formatting: cfg.and_then(|c| c.preserve_formatting),
        glossary_id: cfg.and_then(|c| c.glossary_id.clone()),
        show_billed_characters: cfg.and_then(|c| c.show_billed_characters).unwrap_or(true),
    };

    let url = translate_endpoint(api_key);
    let resp = client
        .post(&url)
        .header("Authorization", format!("DeepL-Auth-Key {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DeepL request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format_deepl_error(status, &body_text));
    }

    let parsed: DeeplTranslateResponse = resp
        .json()
        .await
        .map_err(|e| format!("DeepL response parse error: {e}"))?;

    let translation = parsed
        .translations
        .into_iter()
        .next()
        .ok_or_else(|| "DeepL returned empty translations array".to_string())?;

    // billed_characters: preferisce il campo top-level (sommato), altrimenti quello nella translation
    let billed = parsed.billed_characters.or(translation.billed_characters);

    Ok(DeeplStageOutput {
        content: translation.text,
        billed_characters: billed,
        detected_source_language: translation.detected_source_language,
    })
}

pub async fn get_languages(
    client: &Client,
    api_key: &str,
    lang_type: &str,
) -> Result<Vec<DeeplLanguageInfo>, String> {
    let url = languages_endpoint(api_key);
    let resp = client
        .get(&url)
        .header("Authorization", format!("DeepL-Auth-Key {api_key}"))
        .query(&[("type", lang_type)])
        .send()
        .await
        .map_err(|e| format!("DeepL languages request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format_deepl_error(status, &body_text));
    }

    let raw: Vec<DeeplLanguageRaw> = resp
        .json()
        .await
        .map_err(|e| format!("DeepL languages parse error: {e}"))?;

    Ok(raw
        .into_iter()
        .map(|l| DeeplLanguageInfo {
            language: l.language,
            name: l.name,
            supports_formality: l.supports_formality,
        })
        .collect())
}

pub async fn list_glossaries(
    client: &Client,
    api_key: &str,
) -> Result<Vec<DeeplGlossaryInfo>, String> {
    let url = glossaries_endpoint(api_key);
    let resp = client
        .get(&url)
        .header("Authorization", format!("DeepL-Auth-Key {api_key}"))
        .send()
        .await
        .map_err(|e| format!("DeepL glossaries request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format_deepl_error(status, &body));
    }

    #[derive(serde::Deserialize)]
    struct GlossariesResponse {
        glossaries: Vec<DeeplGlossaryInfo>,
    }
    let parsed: GlossariesResponse = resp
        .json()
        .await
        .map_err(|e| format!("DeepL glossaries parse error: {e}"))?;
    Ok(parsed.glossaries)
}

pub async fn create_glossary(
    client: &Client,
    api_key: &str,
    input: &CreateDeeplGlossaryInput,
) -> Result<DeeplGlossaryInfo, String> {
    let tsv = input
        .entries
        .iter()
        .map(|e| {
            let src = e.source.replace(['\t', '\r', '\n'], " ");
            let tgt = e.target.replace(['\t', '\r', '\n'], " ");
            format!("{src}\t{tgt}")
        })
        .collect::<Vec<_>>()
        .join("\n");

    let body = DeeplCreateGlossaryBody {
        name: input.name.clone(),
        dictionaries: vec![DeeplGlossaryDictionary {
            source_lang: input.source_lang.clone(),
            target_lang: input.target_lang.clone(),
            entries: tsv,
            entries_format: "tsv",
        }],
    };

    let url = glossaries_endpoint(api_key);
    let resp = client
        .post(&url)
        .header("Authorization", format!("DeepL-Auth-Key {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DeepL create glossary failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format_deepl_error(status, &body_text));
    }

    resp.json::<DeeplGlossaryInfo>()
        .await
        .map_err(|e| format!("DeepL create glossary parse error: {e}"))
}

pub async fn delete_glossary(
    client: &Client,
    api_key: &str,
    glossary_id: &str,
) -> Result<(), String> {
    let url = format!("{}/{glossary_id}", glossaries_endpoint(api_key));
    let resp = client
        .delete(&url)
        .header("Authorization", format!("DeepL-Auth-Key {api_key}"))
        .send()
        .await
        .map_err(|e| format!("DeepL delete glossary failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format_deepl_error(status, &body));
    }
    Ok(())
}

fn format_deepl_error(status: reqwest::StatusCode, body: &str) -> String {
    match status.as_u16() {
        401 | 403 => "DeepL: API key non valida o non autorizzata".to_string(),
        413 => "DeepL: testo troppo lungo (max 128 KiB per richiesta)".to_string(),
        429 => "DeepL: troppe richieste — riprova tra poco".to_string(),
        456 => "DeepL: quota caratteri esaurita".to_string(),
        _ => format!("DeepL HTTP {status}: {body}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_key_uses_api_free_endpoint() {
        let url = translate_endpoint("testkey:fx");
        assert!(url.contains("api-free.deepl.com"), "got: {url}");
    }

    #[test]
    fn pro_key_uses_api_endpoint() {
        let url = translate_endpoint("testkey-pro-key");
        assert!(url.contains("api.deepl.com"), "got: {url}");
        assert!(
            !url.contains("api-free.deepl.com"),
            "should not be free: {url}"
        );
    }

    #[test]
    fn languages_endpoint_detects_free_key() {
        let url = languages_endpoint("somekey:fx");
        assert!(url.contains("api-free.deepl.com"), "got: {url}");
    }

    #[test]
    fn format_deepl_error_401() {
        let msg = format_deepl_error(reqwest::StatusCode::UNAUTHORIZED, "");
        assert!(msg.contains("API key"), "got: {msg}");
    }

    #[test]
    fn format_deepl_error_429() {
        let msg = format_deepl_error(reqwest::StatusCode::TOO_MANY_REQUESTS, "");
        assert!(msg.contains("riprova"), "got: {msg}");
    }

    #[test]
    fn format_deepl_error_456() {
        let msg = format_deepl_error(reqwest::StatusCode::from_u16(456).unwrap(), "");
        assert!(msg.contains("quota"), "got: {msg}");
    }

    #[test]
    fn glossaries_endpoint_free_key() {
        let url = glossaries_endpoint("mykey:fx");
        assert!(url.contains("api-free.deepl.com"), "got: {url}");
        assert!(url.ends_with("/v3/glossaries"), "got: {url}");
    }

    #[test]
    fn glossaries_endpoint_pro_key() {
        let url = glossaries_endpoint("myprokey");
        assert!(url.contains("api.deepl.com"), "got: {url}");
        assert!(!url.contains("api-free"), "got: {url}");
    }
}
