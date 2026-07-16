import { parse } from "csv-parse";
import type { Readable } from "node:stream";
import { pool } from "./db";

// Columnas de la tabla que aceptamos del CSV (created_at y search_vector se generan solos).
const TEXT_COLS = [
  "caracter_procedimiento", "clave_cartera_shcp", "clave_programa_federal", "clave_uc",
  "codigo_contrato", "codigo_expediente", "compra_consolidada", "contrato_marco",
  "contrato_plurianual", "convenio_modificatorio", "credito_externo", "descripcion_contrato",
  "direccion_anuncio", "estatus_contrato", "estratificacion", "folio_rupc", "forma_participacion",
  "institucion", "moneda", "nombre_uc", "num_contrato", "numero_procedimiento", "orden_de_gobierno",
  "organismo_financiero", "proveedor_contratista", "referencia_expediente", "rfc",
  "siglas_institucion", "tipo_contratacion", "tipo_procedimiento", "titulo_contrato",
  "titulo_expediente", "anio_fuente", "moneda_norm",
];
const DATE_COLS = [
  "fecha_apertura", "fecha_fallo", "fecha_fin_contrato", "fecha_firma_contrato",
  "fecha_inicio_contrato", "fecha_publicacion",
];
const FLOAT_COLS = ["importe_contrato", "importe"];
const INT_COLS = ["anio_fundacion_empresa"];

const ALL_COLS = new Set([...TEXT_COLS, ...DATE_COLS, ...FLOAT_COLS, ...INT_COLS]);
// Índice único existente en contratos.contratos (idx_contrato_compuesto).
const CONFLICT = ["codigo_contrato", "titulo_contrato", "proveedor_contratista"];

// Columnas que la app usa pero que el CSV no trae directo: se calculan por fila.
const DERIVADAS = ["anio_fuente", "moneda_norm", "importe_contrato"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normHeader = (h: string) =>
  sinAcentos(h.trim().toLowerCase()).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Encabezados del export de comprasmx (contratos adjudicados) cuyo nombre no calza
// con la columna de la tabla. Clave = encabezado NORMALIZADO (sin acentos, minúsculas,
// guiones bajos); valor = columna destino. Robusto a acentos/codificación/mayúsculas.
const ALIAS: Record<string, string> = {
  siglas_de_la_institucion: "siglas_institucion",
  clave_de_la_uc: "clave_uc",
  nombre_de_la_uc: "nombre_uc",
  codigo_del_expediente: "codigo_expediente",
  referencia_del_expediente: "referencia_expediente",
  titulo_del_expediente: "titulo_expediente",
  numero_de_procedimiento: "numero_procedimiento",
  tipo_de_contratacion: "tipo_contratacion",
  caracter_del_procedimiento: "caracter_procedimiento",
  forma_de_participacion: "forma_participacion",
  clave_del_programa_federal: "clave_programa_federal",
  clave_de_cartera_shcp: "clave_cartera_shcp",
  fecha_de_publicacion: "fecha_publicacion",
  fecha_de_apertura: "fecha_apertura",
  fecha_de_fallo: "fecha_fallo",
  codigo_del_contrato: "codigo_contrato",
  num_del_contrato: "num_contrato",
  titulo_del_contrato: "titulo_contrato",
  descripcion_del_contrato: "descripcion_contrato",
  fecha_de_inicio_del_contrato: "fecha_inicio_contrato",
  fecha_de_fin_del_contrato: "fecha_fin_contrato",
  fecha_de_firma_del_contrato: "fecha_firma_contrato",
  importe_drc: "importe",
  proveedor_o_contratista: "proveedor_contratista",
  folio_en_el_rupc: "folio_rupc",
  direccion_del_anuncio: "direccion_anuncio",
};

const LOTE = 1000; // filas por upsert (≈40k parámetros, bajo el límite de Postgres)

const cleanText = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const cleanFloat = (v: unknown): number | null => {
  const s = cleanText(v);
  if (s == null) return null;
  const n = Number(s.replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const cleanInt = (v: unknown): number | null => {
  const n = cleanFloat(v);
  return n == null ? null : Math.trunc(n);
};
// Devuelve un timestamp NAÏVE 'YYYY-MM-DD HH:MM:SS' (texto) para que Postgres lo
// guarde literal en la columna `timestamp without time zone`, sin corrimiento de
// zona horaria. Acepta ISO ('2026-05-21 15:49:07') y DD/MM/YYYY ('24/03/2026').
const cleanDate = (v: unknown): string | null => {
  const s = cleanText(v);
  if (s == null) return null;
  let y: string, mo: string, d: string, h = "0", mi = "0", se = "0";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
  } else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null; // formato desconocido -> NULL
    [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
  }
  return `${y}-${pad2(+mo)}-${pad2(+d)} ${pad2(+h)}:${pad2(+mi)}:${pad2(+se)}`;
};

function cleanerFor(col: string): (v: unknown) => unknown {
  if (DATE_COLS.includes(col)) return cleanDate;
  if (FLOAT_COLS.includes(col)) return cleanFloat;
  if (INT_COLS.includes(col)) return cleanInt;
  return cleanText;
}

// El export trae encabezados repetidos ("Moneda", "Convenio modificatorio": uno a
// nivel contrato y otro a nivel convenio). Renombramos las repeticiones para que
// csv-parse no las colapse (last-wins); así conservamos la PRIMERA (la del contrato).
export function columnasUnicas(primera: string[]): string[] {
  const vistas = new Map<string, number>();
  return primera.map((h) => {
    const n = vistas.get(h) ?? 0;
    vistas.set(h, n + 1);
    return n === 0 ? h : `${h}__dup${n}`;
  });
}

// Año fiscal del contrato: del código C-2026-… (o E-2025-…), o del año de una fecha.
function anioDe(row: Record<string, unknown>): string | null {
  for (const k of ["codigo_contrato", "codigo_expediente"]) {
    const v = row[k];
    if (typeof v === "string") {
      const m = v.match(/-((?:19|20)\d{2})-/);
      if (m) return m[1];
    }
  }
  for (const k of ["fecha_firma_contrato", "fecha_publicacion", "fecha_inicio_contrato"]) {
    const v = row[k];
    if (typeof v === "string") {
      const m = v.match(/^(\d{4})-/);
      if (m) return m[1];
    }
  }
  return null;
}

function derivar(row: Record<string, unknown>): void {
  if (row.importe_contrato == null && row.importe != null) row.importe_contrato = row.importe;
  if (row.importe == null && row.importe_contrato != null) row.importe = row.importe_contrato;
  if (row.moneda_norm == null && typeof row.moneda === "string") {
    row.moneda_norm = row.moneda.toUpperCase();
  }
  if (row.anio_fuente == null) row.anio_fuente = anioDe(row);
}

export interface ResultadoEtl {
  total: number; // filas insertadas/actualizadas
  nuevos: number; // contratos que NO existían en la base (insertados)
  actualizados: number; // contratos que ya existían y se actualizaron
  lotes: number;
  omitidas: number; // filas sin codigo_contrato (no deduplicables) que se saltaron
  duplicadas: number; // filas con clave repetida dentro del archivo, colapsadas (last-wins)
  columnas: string[]; // columnas escritas (mapeadas + derivadas)
  ignoradas: string[]; // encabezados del CSV sin columna destino
}

export interface Mapeo {
  csvKey: Record<string, string>; // columna tabla -> encabezado csv
  aux: Record<string, string>; // fuentes auxiliares (solo para derivar), p. ej. estatus_drc
  cols: string[]; // columnas mapeadas desde el CSV
  finalCols: string[]; // cols + derivadas (lo que se inserta)
  cleaners: Record<string, (v: unknown) => unknown>;
  ignoradas: string[];
}

/** Construye el mapeo encabezado→columna a partir de la fila de encabezados. */
export function construirMapeo(headers: string[]): Mapeo {
  const csvKey: Record<string, string> = {};
  const aux: Record<string, string> = {};
  const ignoradas: string[] = [];
  for (const h of headers) {
    const nh = normHeader(h);
    const dst = ALIAS[nh] ?? (ALL_COLS.has(nh) ? nh : null);
    if (dst && !csvKey[dst]) csvKey[dst] = h;
    // "Estatus DRC" no es columna pero sirve de respaldo de estatus_contrato.
    else if (nh === "estatus_drc" && !aux.estatus_drc) aux.estatus_drc = h;
    else ignoradas.push(h);
  }
  const cols = Object.keys(csvKey);
  const faltan = CONFLICT.filter((c) => !cols.includes(c));
  if (cols.length === 0 || faltan.length) {
    throw new Error(
      `El CSV no trae las columnas clave (${faltan.join(", ") || "ninguna columna calzó"}). ` +
        `¿Es el export de contratos adjudicados? Encabezados: ${headers.join(", ")}`,
    );
  }
  const cleaners = Object.fromEntries(cols.map((c) => [c, cleanerFor(c)]));
  const finalCols = [...cols, ...DERIVADAS.filter((d) => !cols.includes(d))];
  return { csvKey, aux, cols, finalCols, cleaners, ignoradas };
}

/** Transforma un registro del CSV en una fila lista para upsert; null si se omite. */
export function transformarFila(rec: Record<string, string>, m: Mapeo): unknown[] | null {
  const row: Record<string, unknown> = {};
  for (const c of m.cols) row[c] = m.cleaners[c](rec[m.csvKey[c]]);
  // Sin codigo_contrato la llave única quedaría toda en NULL y cada recarga
  // insertaría duplicados: se omite la fila.
  if (row.codigo_contrato == null) return null;
  // Respaldo de estatus: si "Estatus Contrato" viene vacío, usa "Estatus DRC".
  if (row.estatus_contrato == null && m.aux.estatus_drc) {
    row.estatus_contrato = cleanText(rec[m.aux.estatus_drc]);
  }
  derivar(row);
  return m.finalCols.map((c) => (row[c] ?? null));
}

// Deduplica el lote por la clave de conflicto (codigo+titulo+proveedor). Dos filas
// con la misma clave en un mismo INSERT ... ON CONFLICT provocan el error de Postgres
// "cannot affect row a second time". El export de comprasmx trae repetidos, así que
// nos quedamos con la ÚLTIMA ocurrencia (last-wins, igual que el propio upsert). Los
// duplicados entre lotes distintos no dan problema: son comandos separados y el lote
// posterior vuelve a actualizar la misma fila.
function dedupePorClave(cols: string[], filas: unknown[][]): unknown[][] {
  const idx = CONFLICT.map((c) => cols.indexOf(c));
  const porClave = new Map<string, unknown[]>();
  for (const fila of filas) {
    // Centinela \u0000 para nulos y separador \u0001: no aparecen en los datos,
    // así claves distintas nunca colisionan al concatenar.
    const clave = idx.map((i) => (fila[i] == null ? "\u0000" : String(fila[i]))).join("\u0001");
    porClave.set(clave, fila);
  }
  return porClave.size === filas.length ? filas : [...porClave.values()];
}

/**
 * Hace el upsert del lote (deduplicado). Devuelve cuántas filas únicas escribió y
 * cuántas de ellas eran NUEVAS (no existían en la base). El truco `xmax = 0`:
 * en una fila recién insertada xmax vale 0; en una actualizada por ON CONFLICT es
 * el xid de la transacción (≠ 0). Como una clave solo puede insertarse una vez,
 * la suma de `nuevos` cuenta cada contrato nuevo exactamente una vez.
 */
async function upsert(
  cols: string[],
  filas: unknown[][],
): Promise<{ escritas: number; nuevos: number }> {
  const unicas = dedupePorClave(cols, filas);
  const noClave = cols.filter((c) => !CONFLICT.includes(c));
  const params: unknown[] = [];
  let p = 1;
  const tuplas = unicas.map((fila) => `(${fila.map(() => `$${p++}`).join(",")})`);
  unicas.forEach((fila) => params.push(...fila));
  const onConflict = noClave.length
    ? `DO UPDATE SET ${noClave.map((c) => `${c}=EXCLUDED.${c}`).join(", ")}`
    : "DO NOTHING";
  const sql =
    `INSERT INTO contratos.contratos (${cols.join(",")}) VALUES ${tuplas.join(",")} ` +
    `ON CONFLICT (${CONFLICT.join(",")}) ${onConflict} RETURNING (xmax = 0) AS inserted`;
  const res = await pool.query<{ inserted: boolean }>(sql, params);
  const nuevos = res.rows.reduce((n, r) => n + (r.inserted ? 1 : 0), 0);
  return { escritas: unicas.length, nuevos };
}

/**
 * Lee un CSV de comprasmx (contratos adjudicados), limpia/transforma y hace upsert
 * por lotes en contratos.contratos (inserta nuevos, actualiza existentes por el
 * índice único codigo_contrato+titulo_contrato+proveedor_contratista).
 */
export async function cargarCsv(
  input: Readable,
  opts: {
    delimiter?: string;
    encoding?: BufferEncoding;
    // Se llama tras cada lote con el total de filas escritas hasta el momento.
    // Sirve para emitir progreso en streaming y que el cliente no se rinda.
    onProgress?: (procesados: number) => void;
  } = {},
): Promise<ResultadoEtl> {
  const parser = input.pipe(
    parse({
      columns: columnasUnicas,
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      delimiter: opts.delimiter || ",",
      // comprasmx exporta en Latin-1 / Windows-1252 (no UTF-8).
      encoding: opts.encoding || "latin1",
    }),
  );

  let m: Mapeo | null = null;
  let lote: unknown[][] = [];
  let total = 0;
  let lotes = 0;
  let omitidas = 0;
  let duplicadas = 0;
  let nuevos = 0;

  const escribirLote = async (mapeo: Mapeo) => {
    const { escritas, nuevos: n } = await upsert(mapeo.finalCols, lote);
    total += escritas;
    nuevos += n;
    duplicadas += lote.length - escritas; // filas colapsadas por clave repetida
    lotes++;
    lote = [];
    opts.onProgress?.(total);
  };

  for await (const rec of parser as AsyncIterable<Record<string, string>>) {
    if (!m) m = construirMapeo(Object.keys(rec));
    const fila = transformarFila(rec, m);
    if (fila == null) {
      omitidas++;
      continue;
    }
    lote.push(fila);
    if (lote.length >= LOTE) await escribirLote(m);
  }
  if (m && lote.length) await escribirLote(m);
  if (!m) throw new Error("El CSV está vacío (sin encabezados).");

  return {
    total,
    nuevos,
    actualizados: total - nuevos,
    lotes,
    omitidas,
    duplicadas,
    columnas: m.finalCols,
    ignoradas: m.ignoradas,
  };
}
