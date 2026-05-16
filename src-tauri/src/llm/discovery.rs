use crate::keystore::get_api_key;
use crate::llm::providers::get_provider;
use crate::llm::types::DiscoveredModel;
use tauri::AppHandle;

#[tauri::command]
pub async fn discover_provider_models(
    app: AppHandle,
    provider: String,
    ollama_base_url: Option<String>,
) -> Result<Vec<DiscoveredModel>, String> {
    let provider_impl = get_provider(&provider, ollama_base_url)?;
    let api_key = get_api_key(&app, &provider)?;
    let client = provider_impl.http_client()?;
    provider_impl.discover_models(&client, &api_key).await
}
