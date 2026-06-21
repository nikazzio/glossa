use reqwest::Client;
use tauri::AppHandle;

use crate::deepl::{
    client,
    types::{
        CreateDeeplGlossaryInput, DeeplGlossaryInfo, DeeplLanguageInfo, DeeplStageInput,
        DeeplStageOutput,
    },
};
use crate::keystore;
use crate::llm::stream::shared_cloud_http_client;

fn deepl_client() -> Result<Client, String> {
    shared_cloud_http_client()
}

#[tauri::command]
pub async fn run_deepl_stage(
    app: AppHandle,
    input: DeeplStageInput,
) -> Result<DeeplStageOutput, String> {
    let api_key = keystore::get_api_key(&app, "deepl")
        .map_err(|_| "API key DeepL non configurata. Set it in Settings".to_string())?;
    let http = deepl_client()?;
    client::translate(&http, &api_key, &input).await
}

#[tauri::command]
pub async fn get_deepl_languages(
    app: AppHandle,
    lang_type: String,
) -> Result<Vec<DeeplLanguageInfo>, String> {
    let api_key = keystore::get_api_key(&app, "deepl")
        .map_err(|_| "API key DeepL non configurata. Set it in Settings".to_string())?;
    let http = deepl_client()?;
    client::get_languages(&http, &api_key, &lang_type).await
}

#[tauri::command]
pub async fn list_deepl_glossaries(app: AppHandle) -> Result<Vec<DeeplGlossaryInfo>, String> {
    let api_key = keystore::get_api_key(&app, "deepl")
        .map_err(|_| "API key DeepL non configurata. Set it in Settings".to_string())?;
    let http = deepl_client()?;
    client::list_glossaries(&http, &api_key).await
}

#[tauri::command]
pub async fn create_deepl_glossary(
    app: AppHandle,
    input: CreateDeeplGlossaryInput,
) -> Result<DeeplGlossaryInfo, String> {
    let api_key = keystore::get_api_key(&app, "deepl")
        .map_err(|_| "API key DeepL non configurata. Set it in Settings".to_string())?;
    let http = deepl_client()?;
    client::create_glossary(&http, &api_key, &input).await
}

#[tauri::command]
pub async fn delete_deepl_glossary(app: AppHandle, glossary_id: String) -> Result<(), String> {
    let api_key = keystore::get_api_key(&app, "deepl")
        .map_err(|_| "API key DeepL non configurata. Set it in Settings".to_string())?;
    let http = deepl_client()?;
    client::delete_glossary(&http, &api_key, &glossary_id).await
}
