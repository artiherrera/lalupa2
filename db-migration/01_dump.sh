#!/usr/bin/env bash
# Paso 1 — Volcado del ORIGEN en formato directorio (-Fd) con paralelismo.
# Operación de SOLO LECTURA sobre Digital Ocean: no modifica el origen.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_cmd pg_dump "Instala el cliente de PostgreSQL."

if [[ -e "$DUMP_DIR" ]] && [[ -n "$(ls -A "$DUMP_DIR" 2>/dev/null)" ]]; then
  err "El directorio de dump ya existe y NO está vacío: $DUMP_DIR"
  err "Bórralo o cambia DUMP_DIR en .env.   (rm -rf '$DUMP_DIR')"
  exit 1
fi
mkdir -p "$(dirname "$DUMP_DIR")"

log "pg_dump → formato directorio, $JOBS jobs paralelos"
log "Origen:  $(psql_src -c 'select current_database()') @ DO"
log "Destino del dump: $DUMP_DIR"
START="$(date +%s)"

# --no-owner / --no-privileges: los objetos quedarán neutrales para re-asignar
#   propiedad al usuario master del RDS en el restore (RDS no permite superuser).
pg_dump \
  --format=directory \
  --jobs="$JOBS" \
  --no-owner \
  --no-privileges \
  --verbose \
  --file="$DUMP_DIR" \
  "$SOURCE_URL"

END="$(date +%s)"
SIZE="$(du -sk "$DUMP_DIR" 2>/dev/null | awk '{print $1*1024}')"
ok "Dump completado en $(( END - START ))s"
ok "Tamaño del dump: $(human "${SIZE:-0}")  →  $DUMP_DIR"
echo
log "Siguiente: ./02_restore.sh"
