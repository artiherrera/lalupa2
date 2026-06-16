#!/usr/bin/env bash
# Helpers compartidos para la migración Postgres: Digital Ocean Managed DB -> AWS RDS.
# Se hace `source` de este archivo al inicio de cada script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Cargar configuración (.env) ---
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
else
  printf '\033[1;31mERROR:\033[0m no existe %s\n' "$SCRIPT_DIR/.env" >&2
  printf '       Copia .env.example a .env y complétalo:\n' >&2
  printf '       cp "%s/.env.example" "%s/.env"\n' "$SCRIPT_DIR" "$SCRIPT_DIR" >&2
  exit 1
fi

: "${SOURCE_URL:?Define SOURCE_URL en .env (cadena de conexión de Digital Ocean)}"
: "${TARGET_URL:?Define TARGET_URL en .env (cadena de conexión del RDS)}"
DUMP_DIR="${DUMP_DIR:-$SCRIPT_DIR/dump}"
JOBS="${JOBS:-4}"

# Cualquier conexión cuelga como máximo 15s en vez de quedarse pegada.
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

# --- Logging ---
log()  { printf '\033[1;34m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[1;32m  ✓ \033[0m%s\n' "$*"; }
warn() { printf '\033[1;33m  ! \033[0m%s\n' "$*" >&2; }
err()  { printf '\033[1;31m  ✗ \033[0m%s\n' "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Falta el comando '$1'. ${2:-}"; exit 1; }
}

# psql contra una URL arbitraria, salida cruda (tuplas, sin encabezados, sin alineación).
psql_url() { local url="$1"; shift; psql "$url" -X -q -t -A "$@"; }
psql_src() { psql_url "$SOURCE_URL" "$@"; }
psql_tgt() { psql_url "$TARGET_URL" "$@"; }

# Convierte un número de bytes a algo legible (GiB/MiB) sin depender de numfmt.
human() {
  awk -v b="$1" 'BEGIN{
    split("B KiB MiB GiB TiB PiB", u, " ");
    i=1; while (b>=1024 && i<6){ b/=1024; i++ }
    printf "%.1f %s", b, u[i]
  }'
}

# Mayor de dos enteros.
maxn() { if (( $1 >= $2 )); then echo "$1"; else echo "$2"; fi; }
