import { query } from "./db";
import { type Ambito, type Orden, PROCEDIMIENTOS } from "./fields";

export const POR_PAGINA = 50;
const TOP_GRUPOS = 100; // máx. proveedores/instituciones que devolvemos por búsqueda

export interface Filtros {
  anios: string[];
  tiposContratacion: string[];
  procedimientos: string[]; // valores de PROCEDIMIENTOS.value
  estatus: string[];
  ordenesGobierno: string[];
  caracteres: string[];
  importeMin: number | null;
  importeMax: number | null;
  fundacionMin: number | null;
  fundacionMax: number | null;
}

export interface ParamsBusqueda extends Filtros {
  q: string;
  ambito: Ambito;
  orden: Orden;
  pagina: number; // base 0
}

export interface Grupo {
  clave: string | null;
  rfc?: string | null;
  n: number;
  total: number;
}

export interface PorAnio {
  anio: string | null;
  n: number;
  total: number;
}

export interface Contrato {
  codigo_contrato: string | null;
  titulo_contrato: string | null;
  descripcion_contrato: string | null;
  proveedor_contratista: string | null;
  institucion: string | null;
  siglas_institucion: string | null;
  importe: number | null;
  moneda_norm: string | null;
  anio_fuente: string | null;
  fecha_publicacion: string | null;
  estatus_contrato: string | null;
  tipo_contratacion: string | null;
  tipo_procedimiento: string | null;
  direccion_anuncio: string | null;
  anio_fundacion_empresa: number | null;
  rfc: string | null;
}

export interface Resultado {
  n: number;
  total: number;
  promedio: number;
  nProveedores: number;
  nInstituciones: number;
  porAnio: PorAnio[];
  proveedores: Grupo[];
  instituciones: Grupo[];
  resultados: Contrato[];
  pagina: number;
  porPagina: number;
  topGrupos: number;
}

const ORDEN_SQL: Record<Orden, string> = {
  importe_desc: "importe DESC NULLS LAST",
  importe_asc: "importe ASC NULLS LAST",
  fecha_desc: "fecha_publicacion DESC NULLS LAST",
  fecha_asc: "fecha_publicacion ASC NULLS LAST",
};

// Condición full-text según el ámbito. `idx` es el número de parámetro ($n) del
// término. Cada ámbito usa el índice GIN por-campo correspondiente; 'todo' usa
// la columna generada search_vector. Siempre sin acentos (immutable_unaccent) y
// con operadores booleanos (websearch_to_tsquery: AND por defecto, OR, -, "…").
function ftsCondicion(ambito: Ambito, idx: number): string {
  const tsq = `websearch_to_tsquery('simple', public.immutable_unaccent($${idx}))`;
  const campo = (col: string) =>
    `to_tsvector('simple', public.immutable_unaccent(coalesce(${col},''))) @@ ${tsq}`;
  switch (ambito) {
    case "proveedor":
      return campo("proveedor_contratista");
    case "titulo":
      return campo("titulo_contrato");
    case "descripcion":
      return campo("descripcion_contrato");
    case "institucion":
      // Una sola opción "Institución" que busca tanto el nombre completo como las
      // siglas (p. ej. "SEDENA" o "Secretaría de la Defensa" traen lo mismo).
      return `(${campo("institucion")} OR ${campo("siglas_institucion")})`;
    case "rfc":
      // RFC es un identificador exacto: igualdad sobre el índice btree idx_contratos_rfc.
      return `rfc = upper(btrim($${idx}))`;
    default:
      return `search_vector @@ ${tsq}`;
  }
}

// Construye el WHERE con condiciones parametrizadas (sin interpolar valores del
// usuario en el SQL). Devuelve el texto y el arreglo de parámetros en orden.
function construirWhere(p: ParamsBusqueda): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const termino = p.q.trim();

  if (termino) {
    params.push(termino); // $1
    conds.push(ftsCondicion(p.ambito, params.length));
  }

  const add = (sql: (i: number) => string, val: unknown) => {
    params.push(val);
    conds.push(sql(params.length));
  };

  if (p.anios.length) add((i) => `anio_fuente = ANY($${i})`, p.anios);
  if (p.tiposContratacion.length) add((i) => `tipo_contratacion = ANY($${i})`, p.tiposContratacion);
  if (p.estatus.length) add((i) => `estatus_contrato = ANY($${i})`, p.estatus);
  if (p.ordenesGobierno.length) add((i) => `orden_de_gobierno = ANY($${i})`, p.ordenesGobierno);
  if (p.caracteres.length) add((i) => `caracter_procedimiento = ANY($${i})`, p.caracteres);
  if (p.importeMin != null) add((i) => `importe >= $${i}`, p.importeMin);
  if (p.importeMax != null) add((i) => `importe <= $${i}`, p.importeMax);
  if (p.fundacionMin != null) add((i) => `anio_fundacion_empresa >= $${i}`, p.fundacionMin);
  if (p.fundacionMax != null) add((i) => `anio_fundacion_empresa <= $${i}`, p.fundacionMax);
  if (p.procedimientos.length) {
    const patrones = p.procedimientos
      .map((v) => PROCEDIMIENTOS.find((x) => x.value === v)?.patron)
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (patrones.length) add((i) => `tipo_procedimiento LIKE ANY($${i})`, patrones);
  }

  return { sql: conds.length ? conds.join("\n      AND ") : "true", params };
}

/** ¿Hay algo que buscar? (término o al menos un filtro) */
export function hayBusqueda(p: ParamsBusqueda): boolean {
  return Boolean(
    p.q.trim() ||
      p.anios.length ||
      p.tiposContratacion.length ||
      p.procedimientos.length ||
      p.estatus.length ||
      p.ordenesGobierno.length ||
      p.caracteres.length ||
      p.importeMin != null ||
      p.importeMax != null ||
      p.fundacionMin != null ||
      p.fundacionMax != null,
  );
}

interface FilaBundle {
  n: number;
  total: number;
  promedio: number;
  n_proveedores: number;
  n_instituciones: number;
  por_anio: PorAnio[] | null;
  proveedores: Grupo[] | null;
  instituciones: Grupo[] | null;
  resultados: Contrato[] | null;
}

/**
 * Una sola consulta: materializa el conjunto que coincide y, en esa misma
 * pasada, calcula KPIs + desglose por año + todos los proveedores e
 * instituciones (top por importe) + la página de resultados.
 */
export async function buscar(p: ParamsBusqueda): Promise<Resultado> {
  const { sql: where, params } = construirWhere(p);
  const orden = ORDEN_SQL[p.orden] ?? ORDEN_SQL.importe_desc;
  const offset = Math.max(0, p.pagina) * POR_PAGINA;

  const sql = `
    WITH m AS MATERIALIZED (
      SELECT codigo_contrato, titulo_contrato, descripcion_contrato, proveedor_contratista,
             institucion, siglas_institucion, importe, moneda_norm, anio_fuente,
             fecha_publicacion, estatus_contrato, tipo_contratacion, tipo_procedimiento,
             direccion_anuncio, rfc, anio_fundacion_empresa
        FROM contratos.contratos
       WHERE ${where}
    )
    SELECT
      (SELECT count(*)::int FROM m) AS n,
      (SELECT coalesce(sum(importe), 0)::float8 FROM m) AS total,
      (SELECT coalesce(avg(importe), 0)::float8 FROM m) AS promedio,
      (SELECT count(DISTINCT proveedor_contratista)::int FROM m) AS n_proveedores,
      (SELECT count(DISTINCT coalesce(siglas_institucion, institucion))::int FROM m) AS n_instituciones,
      (SELECT json_agg(x) FROM (
         SELECT anio_fuente AS anio, count(*)::int AS n, coalesce(sum(importe), 0)::float8 AS total
           FROM m GROUP BY anio_fuente ORDER BY anio_fuente
       ) x) AS por_anio,
      (SELECT json_agg(x) FROM (
         SELECT proveedor_contratista AS clave,
                min(rfc) FILTER (WHERE rfc IS NOT NULL AND btrim(rfc) <> '') AS rfc,
                count(*)::int AS n, coalesce(sum(importe), 0)::float8 AS total
           FROM m WHERE proveedor_contratista IS NOT NULL
          GROUP BY proveedor_contratista ORDER BY coalesce(sum(importe), 0) DESC, count(*) DESC
          LIMIT ${TOP_GRUPOS}
       ) x) AS proveedores,
      (SELECT json_agg(x) FROM (
         SELECT coalesce(siglas_institucion, institucion) AS clave, count(*)::int AS n, coalesce(sum(importe), 0)::float8 AS total
           FROM m WHERE coalesce(siglas_institucion, institucion) IS NOT NULL
          GROUP BY coalesce(siglas_institucion, institucion) ORDER BY coalesce(sum(importe), 0) DESC, count(*) DESC
          LIMIT ${TOP_GRUPOS}
       ) x) AS instituciones,
      (SELECT json_agg(x) FROM (
         SELECT codigo_contrato, titulo_contrato, descripcion_contrato, proveedor_contratista,
                institucion, siglas_institucion, importe, moneda_norm, anio_fuente,
                fecha_publicacion, estatus_contrato, tipo_contratacion, tipo_procedimiento,
                direccion_anuncio, anio_fundacion_empresa, rfc
           FROM m ORDER BY ${orden} LIMIT ${POR_PAGINA} OFFSET ${offset}
       ) x) AS resultados
  `;

  const rows = await query<FilaBundle>(sql, params);
  const r = rows[0];

  return {
    n: r.n,
    total: r.total,
    promedio: r.promedio,
    nProveedores: r.n_proveedores,
    nInstituciones: r.n_instituciones,
    porAnio: r.por_anio ?? [],
    proveedores: r.proveedores ?? [],
    instituciones: r.instituciones ?? [],
    resultados: r.resultados ?? [],
    pagina: p.pagina,
    porPagina: POR_PAGINA,
    topGrupos: TOP_GRUPOS,
  };
}
