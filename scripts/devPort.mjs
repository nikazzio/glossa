// Porta dedicata dev server, condivisa da Vite e Tauri.
// Override: GLOSSA_DEV_PORT=9999 npm run tauri:dev
export function resolveDevPort() {
  return process.env.GLOSSA_DEV_PORT || '48123';
}
