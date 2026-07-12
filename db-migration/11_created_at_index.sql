-- Índice para el filtro "mes de alta" y el orden "agregado recientemente".
-- created_at es la fecha en que un contrato entró a la plataforma (se llena solo
-- al insertar y NO se toca en las actualizaciones del upsert, ver src/lib/etl.ts).
--
-- CONCURRENTLY: no bloquea escrituras (no puede correr dentro de una transacción).
--   psql "$DATABASE_URL" -f db-migration/11_created_at_index.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contratos_created_at
  ON contratos.contratos (created_at DESC);
