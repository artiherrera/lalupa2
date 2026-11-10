// Constantes de dominio del buscador (derivadas de los datos reales de la tabla
// contratos.contratos). Centralizadas aquí para que la UI y las consultas usen
// los mismos valores.

export type Ambito =
  | "todo"
  | "proveedor"
  | "titulo"
  | "descripcion"
  | "institucion"
  | "rfc"
  | "numero";

export const AMBITOS: { value: Ambito; label: string; hint: string }[] = [
  { value: "todo", label: "Todo", hint: "proveedor, institución, título y descripción" },
  { value: "proveedor", label: "Proveedor", hint: "el nombre de la empresa contratista" },
  { value: "titulo", label: "Título", hint: "el título del contrato" },
  { value: "descripcion", label: "Descripción", hint: "la descripción / objeto del contrato" },
  {
    value: "institucion",
    label: "Institución",
    hint: "el nombre o las siglas de la dependencia (p. ej. SEDENA o Secretaría de la Defensa)",
  },
  { value: "rfc", label: "RFC", hint: "el RFC exacto del proveedor" },
  {
    value: "numero",
    label: "Núm. de contrato",
    hint: "el número del contrato o del procedimiento (p. ej. FTM/PTM/LP/005/2024); da igual si lleva guiones o diagonales",
  },
];

export const ORDENES = [
  { value: "importe_desc", label: "Mayor importe" },
  { value: "importe_asc", label: "Menor importe" },
  { value: "fecha_desc", label: "Más reciente" },
  { value: "fecha_asc", label: "Más antiguo" },
  { value: "agregado_desc", label: "Agregado recientemente" },
  { value: "agregado_asc", label: "Agregado hace más" },
] as const;
export type Orden = (typeof ORDENES)[number]["value"];

// Meses en español para etiquetar "2026-07" -> "jul 2026" (mes de alta).
export const MESES_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES_ES[i]} ${y}` : mes;
}

// 2019–2026: datos abiertos de CompraNet/ComprasMX. 2006–2018: archivos históricos
// de CompraNet, cargados con etl/convertir_historicos.py.
export const ANIOS = Array.from({ length: 2026 - 2006 + 1 }, (_, i) => String(2026 - i));

// Años en que la base solo tiene contrataciones por EXCEPCIÓN a la licitación
// (adjudicaciones directas e invitaciones a 3): los reportes "EX" de CompraNet. Las
// licitaciones de esos años no están, así que el desglose por procedimiento se sesga.
export const ANIOS_SOLO_EXCEPCION = ["2006", "2007", "2008", "2009", "2010"];
export const AVISO_EXCEPCION =
  "De 2006 a 2010 CompraNet solo publicó las contrataciones por excepción a la licitación (adjudicaciones directas e invitaciones a 3 personas). Las licitaciones públicas de esos años no están en la base, así que en esos años la adjudicación directa aparece sobrerrepresentada.";

export const TIPOS_CONTRATACION = [
  "ADQUISICIONES",
  "SERVICIOS",
  "OBRA PÚBLICA",
  "SERVICIOS RELACIONADOS CON LA OP",
  "ARRENDAMIENTOS",
  "SERVICIOS RELACIONADOS CON LA OBRA",
];

// Las 69 variantes reales de tipo_procedimiento se agrupan en familias mediante
// prefijos LIKE (la distinción que importa: adjudicación directa vs licitación).
export const PROCEDIMIENTOS = [
  { value: "adjudicacion", label: "Adjudicación directa", patron: "ADJUDICACIÓN DIRECTA%" },
  { value: "licitacion", label: "Licitación pública", patron: "LICITACIÓN PÚBLICA%" },
  { value: "invitacion", label: "Invitación a 3 personas", patron: "INVITACIÓN%" },
  { value: "entes", label: "Entre entes públicos", patron: "%ENTES P%" },
] as const;

/** Familia de procedimiento de un contrato: una de PROCEDIMIENTOS, "otros" o "sin_dato". */
export type FamiliaProcedimiento = (typeof PROCEDIMIENTOS)[number]["value"] | "otros" | "sin_dato";

// Etiqueta y color de cada familia (los mismos en la página y en el PDF).
// Adjudicación directa va en ámbar porque es la que se suele vigilar.
export const FAMILIAS_PROCEDIMIENTO: Record<FamiliaProcedimiento, { label: string; color: string }> = {
  adjudicacion: { label: "Adjudicación directa", color: "#f59e0b" },
  licitacion: { label: "Licitación pública", color: "#6366f1" },
  invitacion: { label: "Invitación a 3 personas", color: "#14b8a6" },
  entes: { label: "Entre entes públicos", color: "#8b5cf6" },
  otros: { label: "Otros", color: "#94a3b8" },
  sin_dato: { label: "Sin dato", color: "#cbd5e1" },
};

export const ESTATUS = [
  "EXPIRADO",
  "PUBLICADO",
  "FORMALIZADO",
  "ACTIVO",
  "TERMINADO",
  "NO FORMALIZADO",
  "RESCINDIDO",
];

export const ORDENES_GOBIERNO = [
  { value: "APF", label: "Federal (APF)" },
  { value: "GE", label: "Estatal (GE)" },
  { value: "GEM", label: "Estatal (GEM)" },
  { value: "GM", label: "Municipal (GM)" },
  { value: "GF", label: "GF" },
];

export const CARACTERES = [
  "NACIONAL",
  "INTERNACIONAL BAJO TLC",
  "INTERNACIONAL",
  "INTERNACIONAL ABIERTO",
  "INTERNACIONAL BAJO LA COBERTURA DE TRATADOS",
  "OTRO",
];
