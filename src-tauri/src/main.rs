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
    }

    glossa_lib::run();
}
