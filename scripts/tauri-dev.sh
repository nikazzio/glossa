#!/usr/bin/env bash
set -euo pipefail

# Porta dedicata al server di sviluppo Vite/Tauri.
# Override: GLOSSA_DEV_PORT=1234 npm run tauri:dev
PORT="${GLOSSA_DEV_PORT:-48123}"
export GLOSSA_DEV_PORT="$PORT"

exec tauri dev --config "{\"build\":{\"devUrl\":\"http://localhost:${PORT}\"}}"
