-- Métricas de uso de La Lupa (registro de búsquedas).
-- La app también crea esto sola la primera vez que se registra una búsqueda
-- (ver src/lib/metricas.ts), pero puedes correrlo a mano si prefieres:
--   psql "$DATABASE_URL" -f db-migration/10_metricas.sql
--
-- Privacidad: NO se guarda la IP en claro, solo un hash truncado (ip_hash).

CREATE SCHEMA IF NOT EXISTS metricas;

CREATE TABLE IF NOT EXISTS metricas.busquedas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts             timestamptz NOT NULL DEFAULT now(),
  q              text,            -- término buscado (null si solo filtros)
  ambito         text,            -- todo | proveedor | institucion | descripcion...
  orden          text,
  pagina         int,             -- base 0
  filtros        jsonb,           -- filtros activos (años, tipos, importes, etc.)
  num_filtros    int,             -- nº de filtros activos (sin contar q)
  num_resultados int,             -- 0 = búsqueda sin resultados
  referer        text,            -- de dónde llegó
  pais           text,            -- header CF-IPCountry (si hay Cloudflare)
  ua             text,            -- user-agent
  ip_hash        text             -- sha256(salt + ip), truncado. Nunca la IP.
);

CREATE INDEX IF NOT EXISTS busquedas_ts_idx ON metricas.busquedas (ts DESC);
CREATE INDEX IF NOT EXISTS busquedas_q_idx  ON metricas.busquedas (lower(q));

-- Opcional: purga automática a los N días para minimizar datos.
-- Ejecuta desde un cron:  DELETE FROM metricas.busquedas WHERE ts < now() - interval '365 days';
