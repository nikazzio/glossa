mod llm;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(
      tauri_plugin_sql::Builder::default()
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      llm::run_stage,
      llm::run_stage_stream,
      llm::judge_translation,
      llm::optimize_prompt,
      llm::save_api_key,
      llm::get_api_key_status,
      llm::delete_api_key,
      llm::test_provider_connection,
      llm::list_ollama_models,
      llm::check_ollama_status,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
