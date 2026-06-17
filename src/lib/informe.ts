import type { ParamsBusqueda } from "./contratos";
import {
  AMBITOS,
  ORDENES,
  ORDENES_GOBIERNO,
  PROCEDIMIENTOS,
} from "./fields";
import { fmtMXN } from "./format";

export interface FiltroDesc {
  label: string;
  value: string;
}

/** Describe en texto legible los parámetros de la consulta (para el informe). */
export function describirConsulta(p: ParamsBusqueda): FiltroDesc[] {
  const out: FiltroDesc[] = [
    { label: "Término", value: p.q?.trim() || "(todos los contratos)" },
    { label: "Buscar en", value: AMBITOS.find((a) => a.value === p.ambito)?.label ?? p.ambito },
  ];
  if (p.anios.length) out.push({ label: "Años", value: p.anios.slice().sort().join(", ") });
  if (p.tiposContratacion.length) out.push({ label: "Tipo de contratación", value: p.tiposContratacion.join(", ") });
  if (p.procedimientos.length) {
    out.push({
      label: "Procedimiento",
      value: p.procedimientos.map((v) => PROCEDIMIENTOS.find((x) => x.value === v)?.label ?? v).join(", "),
    });
  }
  if (p.estatus.length) out.push({ label: "Estatus", value: p.estatus.join(", ") });
  if (p.ordenesGobierno.length) {
    out.push({
      label: "Orden de gobierno",
      value: p.ordenesGobierno.map((v) => ORDENES_GOBIERNO.find((o) => o.value === v)?.label ?? v).join(", "),
    });
  }
  if (p.caracteres.length) out.push({ label: "Carácter", value: p.caracteres.join(", ") });
  if (p.importeMin != null || p.importeMax != null) {
    const a = p.importeMin != null ? fmtMXN(p.importeMin) : "0";
    const b = p.importeMax != null ? fmtMXN(p.importeMax) : "sin límite";
    out.push({ label: "Importe", value: `${a} – ${b}` });
  }
  if (p.fundacionMin != null || p.fundacionMax != null) {
    const a = p.fundacionMin != null ? String(p.fundacionMin) : "—";
    const b = p.fundacionMax != null ? String(p.fundacionMax) : "—";
    out.push({ label: "Año de fundación de la empresa", value: `${a} – ${b}` });
  }
  out.push({ label: "Ordenado por", value: ORDENES.find((o) => o.value === p.orden)?.label ?? p.orden });
  return out;
}

/** Fecha/hora de consulta formateada en zona horaria de México. */
export function selloConsulta(d: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(d);
}

/** Nombre de archivo del PDF, con la fecha (YYYY-MM-DD) en zona de México. */
export function nombreArchivoInforme(d: Date): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(d); // en-CA => YYYY-MM-DD
  return `lalupa-informe-${ymd}.pdf`;
}
