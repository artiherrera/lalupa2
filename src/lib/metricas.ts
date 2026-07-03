import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { pool, query } from "./db";
import { hayBusqueda, type ParamsBusqueda } from "./contratos";

// Sal para hashear la IP: nunca guardamos la IP en claro. Configúrala en
// prod (env METRICAS_SALT) para que el hash no sea reversible por diccionario.
const SALT = process.env.METRICAS_SALT ?? "lalupa-metricas-dev";

// DDL idempotente: se ejecuta una sola vez por proceso (promesa cacheada). El
// usuario de DATABASE_URL crea la tabla la primera vez que se registra una
// búsqueda; también existe db-migration/10_metricas.sql para correrlo a mano.
const DDL = `
  CREATE SCHEMA IF NOT EXISTS metricas;
  CREATE TABLE IF NOT EXISTS metricas.busquedas (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts             timestamptz NOT NULL DEFAULT now(),
    q              text,
    ambito         text,
    orden          text,
    pagina         int,
    filtros        jsonb,
    num_filtros    int,
    num_resultados int,
    referer        text,
    pais           text,
    ua             text,
    ip_hash        text
  );
  CREATE INDEX IF NOT EXISTS busquedas_ts_idx ON metricas.busquedas (ts DESC);
  CREATE INDEX IF NOT EXISTS busquedas_q_idx ON metricas.busquedas (lower(q));
`;

let tablaLista: Promise<void> | null = null;
function asegurarTabla(): Promise<void> {
  tablaLista ??= pool
    .query(DDL)
    .then(() => undefined)
    .catch((e) => {
      tablaLista = null; // deja reintentar en la próxima búsqueda
      throw e;
    });
  return tablaLista;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(SALT + ip).digest("hex").slice(0, 16);
}

// Cuenta cuántos grupos de filtro están activos (sin contar el término q).
function contarFiltros(p: ParamsBusqueda): number {
  return (
    p.anios.length +
    p.tiposContratacion.length +
    p.procedimientos.length +
    p.estatus.length +
    p.ordenesGobierno.length +
    p.caracteres.length +
    (p.importeMin != null ? 1 : 0) +
    (p.importeMax != null ? 1 : 0) +
    (p.fundacionMin != null ? 1 : 0) +
    (p.fundacionMax != null ? 1 : 0)
  );
}

// Registra una búsqueda. Lee las cabeceras de la petición (rápido) y dispara el
// INSERT sin esperarlo ("fire-and-forget") para no añadir latencia al render.
// Nunca lanza: una métrica perdida es aceptable, tumbar la búsqueda no.
export async function registrarBusqueda(
  p: ParamsBusqueda,
  numResultados: number,
): Promise<void> {
  try {
    const h = await headers();
    // Detrás de Cloudflare la IP real viene en cf-connecting-ip y el país en
    // cf-ipcountry; detrás de solo nginx, en x-forwarded-for.
    const ip =
      h.get("cf-connecting-ip") ||
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      null;
    const referer = h.get("referer");
    const ua = h.get("user-agent");
    const pais = h.get("cf-ipcountry");

    const filtros = {
      anios: p.anios,
      tipos: p.tiposContratacion,
      procedimientos: p.procedimientos,
      estatus: p.estatus,
      ordenesGobierno: p.ordenesGobierno,
      caracteres: p.caracteres,
      importeMin: p.importeMin,
      importeMax: p.importeMax,
      fundacionMin: p.fundacionMin,
      fundacionMax: p.fundacionMax,
    };

    void (async () => {
      try {
        await asegurarTabla();
        await pool.query(
          `INSERT INTO metricas.busquedas
             (q, ambito, orden, pagina, filtros, num_filtros, num_resultados, referer, pais, ua, ip_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            p.q.trim() || null,
            p.ambito,
            p.orden,
            p.pagina,
            JSON.stringify(filtros),
            contarFiltros(p),
            numResultados,
            referer,
            pais,
            ua,
            hashIp(ip),
          ],
        );
      } catch (e) {
        console.error("metricas: no se pudo registrar la búsqueda:", e);
      }
    })();
  } catch {
    // headers() fuera de contexto de petición u otro fallo: ignorar.
  }
}

// ————————————————————————————————————————————————————————————————
// Consultas para el panel /admin/stats
// ————————————————————————————————————————————————————————————————

export interface Resumen {
  total: number;
  ult24h: number;
  ult7d: number;
  visitantes: number;
  ceroPct: number;
}

export interface TerminoConteo {
  q: string;
  n: number;
  visitantes: number;
  cero: number;
}

export interface DiaConteo {
  dia: string;
  n: number;
  visitantes: number;
}

export interface ClaveConteo {
  clave: string | null;
  n: number;
}

export interface BusquedaReciente {
  ts: string;
  q: string | null;
  ambito: string | null;
  num_filtros: number | null;
  num_resultados: number | null;
  pais: string | null;
  referer: string | null;
}

// Une todas las consultas del panel. `dias` acota la ventana (top términos,
// referers, países, actividad); el resumen incluye siempre el total histórico.
export async function panel(dias: number): Promise<{
  resumen: Resumen;
  topTerminos: TerminoConteo[];
  ceroResultados: TerminoConteo[];
  porDia: DiaConteo[];
  paises: ClaveConteo[];
  referers: ClaveConteo[];
  recientes: BusquedaReciente[];
}> {
  await asegurarTabla();

  const [resumenRows, topTerminos, ceroResultados, porDia, paises, referers, recientes] =
    await Promise.all([
      query<Resumen>(`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE ts > now() - interval '24 hours')::int AS ult24h,
          count(*) FILTER (WHERE ts > now() - interval '7 days')::int AS ult7d,
          count(DISTINCT ip_hash)::int AS visitantes,
          round(100.0 * count(*) FILTER (WHERE num_resultados = 0 AND q IS NOT NULL)
                / greatest(count(*) FILTER (WHERE q IS NOT NULL), 1), 1)::float8 AS "ceroPct"
        FROM metricas.busquedas
      `),
      query<TerminoConteo>(
        `SELECT lower(q) AS q, count(*)::int AS n,
                count(DISTINCT ip_hash)::int AS visitantes,
                count(*) FILTER (WHERE num_resultados = 0)::int AS cero
           FROM metricas.busquedas
          WHERE q IS NOT NULL AND ts > now() - ($1 || ' days')::interval
          GROUP BY lower(q) ORDER BY count(*) DESC, visitantes DESC LIMIT 40`,
        [dias],
      ),
      query<TerminoConteo>(
        `SELECT lower(q) AS q, count(*)::int AS n,
                count(DISTINCT ip_hash)::int AS visitantes,
                count(*)::int AS cero
           FROM metricas.busquedas
          WHERE q IS NOT NULL AND num_resultados = 0
            AND ts > now() - ($1 || ' days')::interval
          GROUP BY lower(q) ORDER BY count(*) DESC LIMIT 30`,
        [dias],
      ),
      query<DiaConteo>(
        `SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS dia,
                count(*)::int AS n, count(DISTINCT ip_hash)::int AS visitantes
           FROM metricas.busquedas
          WHERE ts > now() - ($1 || ' days')::interval
          GROUP BY 1 ORDER BY 1`,
        [dias],
      ),
      query<ClaveConteo>(
        `SELECT coalesce(pais, '—') AS clave, count(*)::int AS n
           FROM metricas.busquedas
          WHERE ts > now() - ($1 || ' days')::interval
          GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
        [dias],
      ),
      query<ClaveConteo>(
        // Agrupa por host del referer (sin esquema ni ruta). Nulo = tráfico directo.
        `SELECT coalesce(nullif(substring(referer from '^[a-z]+://([^/]+)'), ''), '(directo)') AS clave,
                count(*)::int AS n
           FROM metricas.busquedas
          WHERE ts > now() - ($1 || ' days')::interval
          GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
        [dias],
      ),
      query<BusquedaReciente>(
        `SELECT to_char(ts, 'YYYY-MM-DD HH24:MI') AS ts, q, ambito,
                num_filtros, num_resultados, pais,
                substring(referer from '^[a-z]+://([^/]+)') AS referer
           FROM metricas.busquedas
          ORDER BY ts DESC LIMIT 60`,
      ),
    ]);

  return {
    resumen: resumenRows[0] ?? { total: 0, ult24h: 0, ult7d: 0, visitantes: 0, ceroPct: 0 },
    topTerminos,
    ceroResultados,
    porDia,
    paises,
    referers,
    recientes,
  };
}

// Reexport útil para que el llamador decida si registrar.
export { hayBusqueda };
