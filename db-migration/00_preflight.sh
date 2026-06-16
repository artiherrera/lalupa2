#!/usr/bin/env bash
# Paso 0 — Chequeos previos. NO modifica nada. Solo lee origen y destino y avisa
# de cualquier problema que haría fallar la migración (versiones, extensiones,
# roles, conectividad, espacio en disco).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

FAIL=0

log "1/7  Herramientas locales"
require_cmd psql       "Instala el cliente: brew install postgresql@16"
require_cmd pg_dump    "Instala el cliente: brew install postgresql@16"
require_cmd pg_restore "Instala el cliente: brew install postgresql@16"
CLIENT_VER="$(pg_dump --version | awk '{print $3}')"      # p.ej. 16.3
CLIENT_MAJOR="${CLIENT_VER%%.*}"
ok "cliente pg_dump/pg_restore = $CLIENT_VER (major $CLIENT_MAJOR)"

log "2/7  Conectividad"
if SRC_NUM="$(psql_src -c 'show server_version_num' 2>/dev/null)"; then
  ok "ORIGEN (DO) accesible"
else
  err "No me puedo conectar al ORIGEN. Revisa SOURCE_URL y que tu IP esté en 'Trusted Sources' de DO."
  FAIL=1
fi
if TGT_NUM="$(psql_tgt -c 'show server_version_num' 2>/dev/null)"; then
  ok "DESTINO (RDS) accesible"
else
  err "No me puedo conectar al DESTINO. Revisa TARGET_URL, el Security Group del RDS y la conectividad de red."
  FAIL=1
fi
[[ "$FAIL" -eq 1 ]] && { err "Corrige la conectividad antes de seguir."; exit 1; }

log "3/7  Versiones de servidor"
SRC_MAJOR=$(( SRC_NUM / 10000 ))
TGT_MAJOR=$(( TGT_NUM / 10000 ))
ok "ORIGEN  Postgres major $SRC_MAJOR  ($(psql_src -c 'show server_version'))"
ok "DESTINO Postgres major $TGT_MAJOR  ($(psql_tgt -c 'show server_version'))"
NEED_MAJOR=$(maxn "$SRC_MAJOR" "$TGT_MAJOR")
if (( CLIENT_MAJOR < NEED_MAJOR )); then
  err "Tu cliente es major $CLIENT_MAJOR pero necesitas >= $NEED_MAJOR (el mayor entre origen y destino)."
  err "En macOS:  brew install postgresql@${NEED_MAJOR} && brew link --overwrite postgresql@${NEED_MAJOR}"
  err "En el EC2 (Ubuntu/Debian): usa el repo PGDG para instalar postgresql-client-${NEED_MAJOR}."
  FAIL=1
else
  ok "Cliente $CLIENT_MAJOR >= requerido $NEED_MAJOR"
fi
if (( TGT_MAJOR < SRC_MAJOR )); then
  warn "El DESTINO ($TGT_MAJOR) es MENOR que el ORIGEN ($SRC_MAJOR). Migrar a una versión inferior puede fallar."
  warn "Recomendado: crea el RDS en una versión >= $SRC_MAJOR."
fi

log "4/7  Tamaño de datos y disco del runner"
SRC_BYTES="$(psql_src -c 'select pg_database_size(current_database())')"
ok "Tamaño lógico del ORIGEN: $(human "$SRC_BYTES")"
DUMP_PARENT="$(dirname "$DUMP_DIR")"; mkdir -p "$DUMP_PARENT"
FREE_KB="$(df -Pk "$DUMP_PARENT" | awk 'NR==2{print $4}')"
FREE_BYTES=$(( FREE_KB * 1024 ))
ok "Espacio libre en $DUMP_PARENT: $(human "$FREE_BYTES")"
# El dump en formato directorio va comprimido; pedimos >= 50% del tamaño lógico por seguridad.
MIN_BYTES=$(( SRC_BYTES / 2 ))
if (( FREE_BYTES < MIN_BYTES )); then
  err "Espacio insuficiente. Recomendado >= $(human "$MIN_BYTES") libres para el dump."
  err "Usa un volumen/EC2 con más espacio o exporta FORCE=1 para ignorar este aviso."
  [[ "${FORCE:-0}" != "1" ]] && FAIL=1
fi

log "5/7  Extensiones del ORIGEN vs disponibles en el DESTINO"
SRC_EXT="$(psql_src -c "select extname from pg_extension where extname <> 'plpgsql' order by 1")"
if [[ -z "$SRC_EXT" ]]; then
  ok "Sin extensiones adicionales (solo plpgsql)."
else
  while IFS= read -r ext; do
    [[ -z "$ext" ]] && continue
    if [[ -n "$(psql_tgt -c "select 1 from pg_available_extensions where name = '$ext'")" ]]; then
      ok "extensión '$ext' disponible en RDS"
    else
      err "extensión '$ext' NO está disponible en este RDS. Revisa si RDS la soporta o si la app la necesita."
      FAIL=1
    fi
  done <<< "$SRC_EXT"
  warn "Nota: extensiones como pg_stat_statements requieren añadirse a 'shared_preload_libraries'"
  warn "      en el Parameter Group del RDS y reiniciar la instancia ANTES del restore."
fi

log "6/7  Roles del ORIGEN (no-sistema)"
SRC_ROLES="$(psql_src -c "select rolname from pg_roles where rolname not like 'pg_%' and rolname <> current_user order by 1")"
if [[ -z "$SRC_ROLES" ]]; then
  ok "No hay roles personalizados además del usuario actual."
else
  warn "Roles definidos en el origen (recréalos en RDS si tu app los usa; con --no-owner el restore NO los necesita):"
  while IFS= read -r r; do [[ -n "$r" ]] && printf '       - %s\n' "$r"; done <<< "$SRC_ROLES"
fi

log "7/7  Top 10 tablas más grandes del ORIGEN"
psql "$SOURCE_URL" -X -q -c "
  select schemaname||'.'||relname as tabla,
         pg_size_pretty(pg_total_relation_size(relid)) as tamano
  from pg_catalog.pg_statio_user_tables
  order by pg_total_relation_size(relid) desc
  limit 10;"

echo
if [[ "$FAIL" -eq 0 ]]; then
  ok "PREFLIGHT OK — listo para 01_dump.sh"
else
  err "PREFLIGHT con problemas — resuélvelos antes de continuar (o usa FORCE=1 donde aplique)."
  exit 1
fi
