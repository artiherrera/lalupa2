import { Pool, type QueryResultRow } from "pg";

// Pool único reutilizado entre recargas de HMR en dev (evita agotar conexiones
// del RDS t4g.micro). En prod cada instancia crea el suyo.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool: Pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // RDS exige SSL. En dev no verificamos la CA; para prod conviene cargar el
    // bundle de RDS (rds-combined-ca-bundle) y usar rejectUnauthorized: true.
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    // Sube work_mem para que el CTE materializado de la búsqueda (agrega todos
    // los contratos que coinciden en una sola pasada) no se desborde a disco.
    options: "-c work_mem=80MB",
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

// Errores de red transitorios (cambios de red/DNS, conexión reiniciada) ante los
// que reintentamos. Todas nuestras consultas son SELECT (sólo lectura), así que
// reintentar es seguro.
const REINTENTABLES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
]);

/** Ejecuta una consulta parametrizada y devuelve solo las filas (con reintentos). */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  let ultimoError: unknown;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await pool.query<T>(text, params);
      return res.rows;
    } catch (e) {
      ultimoError = e;
      const code = (e as { code?: string }).code;
      if (!code || !REINTENTABLES.has(code) || intento === 2) throw e;
      await new Promise((r) => setTimeout(r, 300 * (intento + 1)));
    }
  }
  throw ultimoError;
}
