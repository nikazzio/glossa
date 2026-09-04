mod backup;
mod db;
mod deepl;
mod documents;
mod download;
mod httpcache;
mod iiif;
mod images;
mod jobs;
mod keystore;
mod llm;
mod optimize;
mod provenance;
mod storage_config;
mod vault;
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
            // Schema ownership lives in Rust now (#211): run before the
            // native vector connection opens and before the frontend's
            // `Database.load()` can race it.
            tauri::async_runtime::block_on(db::run_startup_migrations(app.handle()))?;

            // GTK_OVERLAY_SCROLLING è disattivato (vedi main.rs) per evitare che le
            // scrollbar sfondino lo z-index della pagina. Contropartita: WebKitGTK
            // passa alla scrollbar "classica", che disegna anche la rotaia (trough)
            // dietro al cursore — la CSS ::-webkit-scrollbar della pagina non la
            // tocca perché è un widget GTK nativo, non contenuto web. La nascondiamo
            // via CSS provider GTK, lasciando visibile solo il cursore.
            #[cfg(target_os = "linux")]
            {
                use gtk::prelude::*;
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(gtk_window) = window.gtk_window() {
                        if let Some(screen) = gtk::prelude::WidgetExt::screen(&gtk_window) {
                            let provider = gtk::CssProvider::new();
                            let css = "scrollbar trough { background-color: transparent; border-style: none; box-shadow: none; }";
                            if provider.load_from_data(css.as_bytes()).is_ok() {
                                gtk::StyleContext::add_provider_for_screen(
                                    &screen,
                                    &provider,
                                    gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
                                );
                            }
                        }
                    }
                }
            }

            let vector_database = vector::VectorDatabase::initialize(app.handle());
            app.manage(vector_database);

            // Il deposito predefinito esiste dal primo avvio: altrimenti la
            // sua cartella risulterebbe "non raggiungibile" solo perché non è
            // ancora stata creata.
            if let Err(error) = vault::commands::ensure_default_root(app.handle()) {
                log::error!("default vault not created: {error}");
            }

            // I ritmi di rete che nascono con l'applicazione, presi dal
            // registro dei provider. Senza, la prima apertura non
            // avrebbe nessun profilo da applicare.
            if let Err(error) = crate::storage_config::db_path(app.handle())
                .and_then(|path| db::open_connection(&path))
                .and_then(|conn| iiif::settings::ensure_builtin_profiles(&conn))
            {
                log::error!("network profiles not seeded: {error}");
            }

            // La cortesia verso le biblioteche nasce **prima** della coda e
            // sta fuori da lei: i contatori valgono per host, e devono essere
            // gli stessi per uno scaricamento e per una copertina chiesta dalla
            // finestra. Altrimenti quaranta risultati di ricerca sono quaranta
            // richieste senza pause verso una biblioteca che bandisce.
            app.manage(std::sync::Arc::new(download::courtesy::Courtesy::new()));

            // La cache di ciò che viene dalla rete: cartella a sé nella cartella
            // dati, mai nel deposito. Il deposito conserva ciò che è stato
            // scaricato di proposito; questa si può cancellare in qualsiasi
            // momento senza conseguenze.
            match crate::storage_config::resolve_data_dir(app.handle()) {
                Ok(data_dir) => {
                    app.manage(std::sync::Arc::new(httpcache::HttpCache::new(
                        data_dir.join("cache"),
                    )));
                }
                Err(error) => log::error!("cache not available: {error}"),
            }

            // L'orchestratore dei lavori parte con l'applicazione e per
            // prima cosa rimette in ordine ciò che una chiusura brusca ha
            // lasciato a metà. Un errore qui non deve impedire l'avvio:
            // senza coda l'app resta usabile, senza finestra no.
            if let Err(error) = jobs::commands::start(app.handle()) {
                log::error!("jobs engine did not start: {error}");
            }
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
            backup::write_backup,
            backup::read_backup,
            db::execute_transaction,
            storage_config::get_data_dir,
            storage_config::choose_data_dir_folder,
            llm::pipeline::compute_blobs,
            llm::pipeline::run_stage,
            llm::pipeline::run_stage_stream,
            llm::pipeline::preview_stage_prompt,
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
            vault::commands::get_vault_status,
            vault::commands::initialize_vault,
            vault::commands::free_version_pages,
            vault::commands::free_version_size,
            vault::commands::delete_version_files,
            vault::commands::choose_vault_folder,
            vault::commands::use_default_vault_folder,
            vault::commands::enqueue_vault_verification,
            vault::commands::delete_vault_orphans,
            jobs::commands::create_job,
            jobs::commands::list_active_jobs,
            jobs::commands::get_job,
            jobs::commands::pause_job,
            jobs::commands::resume_job,
            jobs::commands::cancel_job,
            jobs::commands::retry_job,
            jobs::commands::clear_finished_jobs,
            download::enqueue_source_download,
            download::inventory::version_inventory,
            download::inventory::library_inventory,
            optimize::commands::enqueue_optimization,
            documents::import_document,
            documents::export_markdown_docx,
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
            iiif::list_iiif_providers,
            iiif::discovery::discover_iiif,
            iiif::commands::list_network_settings,
            httpcache::commands::network_probe,
            iiif::commands::save_network_profile,
            iiif::commands::delete_network_profile,
            iiif::commands::set_library_network_profile,
            iiif::commands::get_version_size_cap,
            iiif::commands::set_version_size_cap,
            iiif::viewer::iiif_viewer_manifest,
            httpcache::commands::cached_image,
            httpcache::commands::cache_usage,
            httpcache::commands::apply_cache_cap,
            httpcache::commands::clear_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
