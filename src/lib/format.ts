const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const mxnCompacto = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});
const numero = new Intl.NumberFormat("es-MX");
const fecha = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export const fmtMXN = (n: number | null | undefined) =>
  n == null ? "—" : mxn.format(n);
export const fmtMXNCompacto = (n: number | null | undefined) =>
  n == null ? "—" : mxnCompacto.format(n);
export const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : numero.format(n);
export const fmtFecha = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : fecha.format(date);
};
