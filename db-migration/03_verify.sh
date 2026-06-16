#!/usr/bin/env bash
# Paso 3 — Verificación. Compara, tabla por tabla, el conteo de filas entre
# origen y destino, y revisa el last_value de las secuencias. SOLO LECTURA.
#
#   FAST=1  -> usa estimaciones (pg_stat_user_tables, requiere ANALYZE reciente)
#              en vez de count(*) exacto. Mucho más rápido pero aproximado.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

REPORT_DIR="$SCRIPT_DIR/verify"
mkdir -p "$REPORT_DIR"
SRC_TSV="$REPORT_DIR/counts_source.tsv"
TGT_TSV="$REPORT_DIR/counts_target.tsv"
MERGED="$REPORT_DIR/comparison.tsv"

# Genera "schema.tabla<TAB>conteo" para todas las tablas de usuario de una URL.
counts_for() {
  local url="$1"
  if [[ "${FAST:-0}" == "1" ]]; then
    psql_url "$url" -F$'\t' -c \
      "select format('%I.%I', schemaname, relname) as tbl, n_live_tup as n
         from pg_stat_user_tables order by 1"
    return
  fi
  local tbls; tbls="$(psql_url "$url" -c \
    "select format('%I.%I', schemaname, tablename)
       from pg_tables
      where schemaname not in ('pg_catalog','information_schema')
      order by 1")"
  [[ -z "$tbls" ]] && return 0
  local sql="" first=1 t
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ "$first" -eq 1 ]]; then first=0; else sql+=" UNION ALL "; fi
    sql+="select '$t' as tbl, count(*)::bigint as n from $t"
  done <<< "$tbls"
  psql_url "$url" -F$'\t' -c "$sql"
}

if [[ "${FAST:-0}" == "1" ]]; then
  warn "Modo FAST: conteos ESTIMADOS (requieren ANALYZE reciente en ambos lados)."
else
  log "Contando filas exactas en ambos lados (puede tardar en bases grandes)…"
fi

log "1/3  Conteos del ORIGEN"
counts_for "$SOURCE_URL" | sort > "$SRC_TSV"
ok "$(wc -l < "$SRC_TSV" | tr -d ' ') tablas en el origen"

log "2/3  Conteos del DESTINO"
counts_for "$TARGET_URL" | sort > "$TGT_TSV"
ok "$(wc -l < "$TGT_TSV" | tr -d ' ') tablas en el destino"

log "3/3  Comparación"
# join por nombre de tabla; faltantes se marcan como MISSING.
join -t$'\t' -a1 -a2 -e 'MISSING' -o '0,1.2,2.2' "$SRC_TSV" "$TGT_TSV" \
  | awk -F'\t' 'BEGIN{OFS="\t"}
      { st = ($2==$3) ? "OK" : "DIFF"; print $1,$2,$3,st }' > "$MERGED"

DIFFS="$(awk -F'\t' '$4=="DIFF"' "$MERGED" | wc -l | tr -d ' ')"
TOTAL="$(wc -l < "$MERGED" | tr -d ' ')"

echo
printf '%-45s %15s %15s  %s\n' "TABLA" "ORIGEN" "DESTINO" "ESTADO"
printf '%-45s %15s %15s  %s\n' "-----" "------" "-------" "------"
awk -F'\t' '{ printf "%-45s %15s %15s  %s\n", $1, $2, $3, $4 }' "$MERGED"

echo
log "Secuencias (last_value) — origen vs destino"
SEQ_SQL="select format('%I.%I', schemaname, sequencename) as seq, last_value
           from pg_sequences
          where schemaname not in ('pg_catalog','information_schema')
          order by 1"
join -t$'\t' -a1 -a2 -e 'MISSING' -o '0,1.2,2.2' \
  <(psql_src -F$'\t' -c "$SEQ_SQL" | sort) \
  <(psql_tgt -F$'\t' -c "$SEQ_SQL" | sort) \
  | awk -F'\t' '{ s=($2==$3)?"OK":"DIFF"; printf "  %-40s %15s %15s  %s\n", $1,$2,$3,s }' || true

echo
if [[ "$DIFFS" -eq 0 ]]; then
  ok "VERIFICACIÓN OK — $TOTAL tablas coinciden en conteo. Reporte: $MERGED"
else
  err "VERIFICACIÓN: $DIFFS de $TOTAL tablas con DIFERENCIAS. Revisa $MERGED"
  err "En modo exacto, cualquier DIFF es una alerta real. En FAST puede ser ruido de estimación."
  exit 1
fi
