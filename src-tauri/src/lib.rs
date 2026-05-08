mod db;
mod documents;
mod llm;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The updater plugin requires `plugins.updater` config which only ships in
    // tauri.release.conf.json. Skip it in debug builds so `tauri dev` doesn't
    // panic on missing plugin config.
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(llm::StreamRegistry::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build());

    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            #[allow(unused_mut)]
            let mut log_targets: Vec<tauri_plugin_log::Target> =
                vec![tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("glossa".to_string()),
                    },
                )];
            #[cfg(debug_assertions)]
            {
                log_targets.push(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ));
                log_targets.push(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ));
            }
            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Info
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .targets(log_targets)
                    .build(),
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::execute_transaction,
            llm::run_stage,
            llm::run_stage_stream,
            llm::cancel_stream,
            llm::judge_translation,
            llm::refine_prompt,
            llm::save_api_key,
            llm::get_api_key_status,
            llm::delete_api_key,
            llm::test_provider_connection,
            llm::list_ollama_models,
            llm::check_ollama_status,
            llm::check_ollama_preflight,
            llm::run_coherence_for_chunk,
            documents::extract_docx_text,
            documents::extract_docx_markdown,
            documents::export_markdown_docx,
            documents::extract_pdf_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
