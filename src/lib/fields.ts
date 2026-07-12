// Constantes de dominio del buscador (derivadas de los datos reales de la tabla
// contratos.contratos). Centralizadas aquí para que la UI y las consultas usen
// los mismos valores.

export type Ambito =
  | "todo"
  | "proveedor"
  | "titulo"
  | "descripcion"
  | "institucion"
  | "rfc";

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

export const ANIOS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019"];

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
