-- Índices para buscar por número de contrato o de procedimiento (ámbito "numero"
-- del buscador, ver src/lib/contratos.ts). El número se compara sin guiones,
-- diagonales ni espacios, porque cada quien lo escribe distinto:
--   "FTM-SEN/PTM/LP/010/2023"  →  FTMSENPTMLP0102023
--
-- text_pattern_ops permite usar el índice tanto para el número completo como
-- para su principio (LIKE 'FTMPTMLP%').
--
-- CONCURRENTLY: no bloquea escrituras ni búsquedas, pero no puede correr dentro de
-- una transacción. Si uno falla queda INVALID; se borra con DROP INDEX y se repite.
--   psql "$DATABASE_URL" -f db-migration/12_numero_contrato_index.sql
-- Reversa:
--   DROP INDEX CONCURRENTLY IF EXISTS contratos.idx_contratos_num_contrato_norm;
--   DROP INDEX CONCURRENTLY IF EXISTS contratos.idx_contratos_numero_procedimiento_norm;
--   DROP INDEX CONCURRENTLY IF EXISTS contratos.idx_contratos_referencia_expediente_norm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contratos_num_contrato_norm
  ON contratos.contratos (regexp_replace(upper(num_contrato), '[^A-Z0-9]', '', 'g') text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contratos_numero_procedimiento_norm
  ON contratos.contratos (regexp_replace(upper(numero_procedimiento), '[^A-Z0-9]', '', 'g') text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contratos_referencia_expediente_norm
  ON contratos.contratos (regexp_replace(upper(referencia_expediente), '[^A-Z0-9]', '', 'g') text_pattern_ops);
