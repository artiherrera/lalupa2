import {
  AMBITOS,
  ANIOS,
  CARACTERES,
  ESTATUS,
  ORDENES,
  ORDENES_GOBIERNO,
  PROCEDIMIENTOS,
  TIPOS_CONTRATACION,
  type Ambito,
  type Orden,
} from "./fields";
import type { ParamsBusqueda } from "./contratos";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
const toNum = (v: string | string[] | undefined): number | null => {
  const s = one(v);
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Lee los query params y los valida contra los dominios conocidos. El término
// `q` se pasa siempre como parámetro a SQL, así que no necesita sanitización,
// pero los filtros sí se restringen a valores válidos.
export function parseParams(sp: SearchParams): ParamsBusqueda {
  const ambito = one(sp.ambito);
  const orden = one(sp.orden);
  const pagina = parseInt(one(sp.pagina) ?? "0", 10);
  return {
    q: (one(sp.q) ?? "").slice(0, 200),
    ambito: (AMBITOS.some((a) => a.value === ambito) ? ambito : "todo") as Ambito,
    orden: (ORDENES.some((o) => o.value === orden) ? orden : "importe_desc") as Orden,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 0,
    anios: many(sp.anio).filter((v) => ANIOS.includes(v)),
    tiposContratacion: many(sp.tipo).filter((v) => TIPOS_CONTRATACION.includes(v)),
    procedimientos: many(sp.proc).filter((v) => PROCEDIMIENTOS.some((p) => p.value === v)),
    estatus: many(sp.estatus).filter((v) => ESTATUS.includes(v)),
    ordenesGobierno: many(sp.orden_gob).filter((v) => ORDENES_GOBIERNO.some((o) => o.value === v)),
    caracteres: many(sp.caracter).filter((v) => CARACTERES.includes(v)),
    importeMin: toNum(sp.min),
    importeMax: toNum(sp.max),
    fundacionMin: toNum(sp.fmin),
    fundacionMax: toNum(sp.fmax),
  };
}

type Override = Record<string, string | number | string[] | null | undefined>;

// Construye una URL "/?…" partiendo de los params actuales y aplicando
// sobreescrituras (por nombre de query param). Útil para paginación, orden,
// drill-in en un proveedor/institución y quitar filtros.
export function hrefCon(p: ParamsBusqueda, overrides: Override = {}): string {
  const usp = new URLSearchParams();
  const set = (k: string, vals: string[]) => vals.forEach((v) => usp.append(k, v));
  if (p.q) usp.set("q", p.q);
  if (p.ambito !== "todo") usp.set("ambito", p.ambito);
  if (p.orden !== "importe_desc") usp.set("orden", p.orden);
  if (p.pagina > 0) usp.set("pagina", String(p.pagina));
  set("anio", p.anios);
  set("tipo", p.tiposContratacion);
  set("proc", p.procedimientos);
  set("estatus", p.estatus);
  set("orden_gob", p.ordenesGobierno);
  set("caracter", p.caracteres);
  if (p.importeMin != null) usp.set("min", String(p.importeMin));
  if (p.importeMax != null) usp.set("max", String(p.importeMax));
  if (p.fundacionMin != null) usp.set("fmin", String(p.fundacionMin));
  if (p.fundacionMax != null) usp.set("fmax", String(p.fundacionMax));

  for (const [k, v] of Object.entries(overrides)) {
    usp.delete(k);
    if (v == null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, x));
    else usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `/?${s}` : "/";
}
