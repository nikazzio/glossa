// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Su Linux/WebKitGTK le scrollbar "overlay" del tema GTK vengono disegnate
    // dal toolkit sopra l'intera finestra della webview, fuori dal normale
    // ordinamento z-index della pagina — appaiono quindi sopra qualunque cosa
    // web (modali, popup, tooltip). Va disattivato prima che GTK si inizializzi.
    #[cfg(target_os = "linux")]
    // SAFETY: siamo nella prima riga di main(), prima che qualunque altro
    // thread parta o che GTK legga le variabili d'ambiente.
    unsafe {
        std::env::set_var("GTK_OVERLAY_SCROLLING", "0");
        // WebKitGTK tiene disattivato di default il set di istruzioni WASM
        // "relaxed SIMD": il decoder OpenJPEG di pdf.js lo richiede per la
        // pagina scannerizzata, e senza cade su un ripiego in puro
        // JavaScript, molto più lento. JSC legge le sue opzioni dall'ambiente,
        // e il processo web di WebKitGTK (avviato per fork) eredita il
        // nostro se impostato prima.
        std::env::set_var("JSC_useWasmRelaxedSIMD", "1");
    }

    glossa_lib::run();
}
