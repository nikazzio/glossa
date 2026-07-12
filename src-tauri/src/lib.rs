mod db;
mod deepl;
mod documents;
mod keystore;
mod llm;
mod vector;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The updater plugin requires `plugins.updater` config which only ships in
    // tauri.release.conf.json. Skip it in debug builds so `tauri dev` doesn't
    // panic on missing plugin config.
    vector::register_vec_extension();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(llm::StreamRegistry::new())
        .manage(db::DbWriteCoordinator::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build());

    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            let vector_database = vector::VectorDatabase::initialize(app.handle());
            app.manage(vector_database);
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
            let default_level = if cfg!(debug_assertions) {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Info
            };
            // Allow RUST_LOG to override the compile-time default at runtime.
            let log_level = std::env::var("RUST_LOG")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default_level);
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .targets(log_targets)
                    .max_file_size(5 * 1024 * 1024)
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                    .build(),
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::backup_database_file,
            db::execute_transaction,
            llm::pipeline::compute_blobs,
            llm::pipeline::run_stage,
            llm::pipeline::run_stage_stream,
            llm::pipeline::cancel_stream,
            llm::pipeline::judge_translation,
            llm::pipeline::refine_prompt,
            llm::pipeline::test_provider_connection,
            llm::pipeline::preflight_pipeline,
            llm::pipeline::run_coherence_for_chunk,
            llm::pipeline::extract_phrase_memory_pairs,
            keystore::save_api_key,
            keystore::get_api_key_status,
            keystore::delete_api_key,
            llm::custom_profiles::list_custom_provider_profiles,
            llm::custom_profiles::save_custom_provider_profile,
            llm::custom_profiles::delete_custom_provider_profile,
            llm::custom_profiles::test_custom_provider_connection,
            llm::providers::ollama::list_ollama_models,
            llm::providers::ollama::check_ollama_status,
            llm::providers::ollama::check_ollama_preflight,
            documents::extract_docx_text,
            documents::extract_docx_markdown,
            documents::export_markdown_docx,
            documents::extract_pdf_text,
            vector::vec_ping,
            vector::embedding::get_embeddings,
            vector::embedding::vec_list_phrase_memory,
            vector::embedding::vec_delete_phrase_memory,
            vector::embedding::vec_update_phrase_memory,
            vector::embedding::vec_search_phrase_memory,
            vector::embedding::vec_save_locked_phrases,
            vector::embedding::vec_regenerate_all_embeddings,
            deepl::commands::run_deepl_stage,
            deepl::commands::get_deepl_languages,
            deepl::commands::list_deepl_glossaries,
            deepl::commands::create_deepl_glossary,
            deepl::commands::delete_deepl_glossary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
