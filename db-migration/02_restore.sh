#!/usr/bin/env bash
# Paso 2 — Restaura el dump en el RDS destino con paralelismo.
# ESCRIBE en el destino. La base de datos destino debe existir y estar vacía
# (o aceptas que se mezclen objetos). pg_restore carga datos y DESPUÉS crea
# índices y constraints, que es lo más eficiente para volúmenes grandes.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_cmd pg_restore "Instala el cliente de PostgreSQL."
[[ -d "$DUMP_DIR" ]] || { err "No existe el dump en $DUMP_DIR. Corre ./01_dump.sh primero."; exit 1; }

ERRLOG="$SCRIPT_DIR/restore_errors.log"
: > "$ERRLOG"

log "pg_restore → $JOBS jobs paralelos hacia el RDS"
log "Destino: $(psql_tgt -c 'select current_database()') @ RDS"
warn "Errores/avisos se guardan en: $ERRLOG"
START="$(date +%s)"

set +e
pg_restore \
  --jobs="$JOBS" \
  --no-owner \
  --no-privileges \
  --dbname="$TARGET_URL" \
  "$DUMP_DIR" 2>"$ERRLOG"
RC=$?
set -e
END="$(date +%s)"

ERRCOUNT="$(grep -c 'pg_restore: error:' "$ERRLOG" 2>/dev/null || true)"
log "pg_restore terminó (exit=$RC) en $(( END - START ))s — errores detectados: ${ERRCOUNT:-0}"

if [[ "${ERRCOUNT:-0}" -gt 0 ]]; then
  warn "Primeros errores (revisa $ERRLOG completo):"
  grep 'pg_restore: error:' "$ERRLOG" | head -20 | sed 's/^/       /'
  echo
  warn "Errores BENIGNOS típicos en RDS (suelen ignorarse sin problema):"
  warn "  · 'must be owner of extension ...'  /  COMMENT ON EXTENSION"
  warn "  · 'permission denied to set parameter ...' (parámetros que RDS gestiona)"
  warn "  · GRANT/REVOKE a roles que no recreaste"
  warn "Errores GRAVES a investigar: fallos creando TABLAS, copiando DATOS o creando ÍNDICES."
fi

if [[ "${SKIP_ANALYZE:-0}" != "1" ]]; then
  log "Ejecutando ANALYZE en el destino (mejora el planificador; puede tardar)…"
  psql_tgt -c "ANALYZE;" >/dev/null && ok "ANALYZE completado"
else
  warn "ANALYZE omitido (SKIP_ANALYZE=1). Recomendado ejecutarlo manualmente luego."
fi

echo
log "Siguiente: ./03_verify.sh  (compara conteos origen vs destino)"
