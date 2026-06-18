// El build "standalone" de pdfkit trae las fuentes embebidas: no lee archivos
// .afm por fs (que el bundle standalone de Next podría no incluir).
// @ts-expect-error -- subimport sin declaración propia; los tipos vienen de @types/pdfkit
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import type { DatosInforme, Grupo } from "@/lib/contratos";
import type { FiltroDesc } from "@/lib/informe";
import { fmtFecha, fmtMXN, fmtMXNCompacto, fmtNum } from "@/lib/format";

type Doc = PDFKit.PDFDocument;

const COL = {
  indigo: "#4f46e5",
  ink: "#0f172a",
  s700: "#334155",
  s500: "#64748b",
  s400: "#94a3b8",
  s200: "#e2e8f0",
  s100: "#f1f5f9",
  s50: "#f8fafc",
  white: "#ffffff",
};
const M = 40; // margen

const limiteInf = (doc: Doc) => doc.page.height - 42;
const ancho = (doc: Doc) => doc.page.width - 2 * M;

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

function seccion(doc: Doc, txt: string) {
  doc.moveDown(0.8);
  if (doc.y + 28 > limiteInf(doc)) doc.addPage();
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COL.ink).text(txt, M, y);
  const ly = doc.y + 2;
  doc.moveTo(M, ly).lineTo(doc.page.width - M, ly).lineWidth(1).strokeColor(COL.s200).stroke();
  doc.y = ly + 7;
}

function cabecera(doc: Doc, sello: string) {
  const y = doc.y;
  doc.roundedRect(M, y, 16, 16, 4).fill(COL.indigo);
  doc.fillColor(COL.white).font("Helvetica-Bold").fontSize(11).text("L", M, y + 3.5, { width: 16, align: "center" });
  doc.fillColor(COL.ink).fontSize(13).text("La Lupa", M + 22, y + 3);
  doc.y = y + 24;
  doc.font("Helvetica-Bold").fontSize(17).fillColor(COL.ink).text("Informe de contratos públicos", M, doc.y);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COL.s500)
    .text(`Consulta generada el ${sello} · Fuente: CompraNet (Hacienda)`, M, doc.y + 2);
}

function parametros(doc: Doc, filtros: FiltroDesc[]) {
  seccion(doc, "Parámetros de la consulta");
  for (const f of filtros) {
    if (doc.y + 14 > limiteInf(doc)) doc.addPage();
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(COL.s500).text(f.label, M, y, { width: 145 });
    const yLabel = doc.y;
    doc.font("Helvetica-Bold").fillColor(COL.ink).text(f.value, M + 150, y, { width: ancho(doc) - 150 });
    doc.y = Math.max(yLabel, doc.y) + 2;
  }
}

function resumen(doc: Doc, d: DatosInforme) {
  seccion(doc, "Resumen");
  const W = ancho(doc);
  const gap = 7;
  const bw = (W - gap * 4) / 5;
  const bh = 34;
  if (doc.y + bh > limiteInf(doc)) doc.addPage();
  const y = doc.y;
  const kpis: [string, string][] = [
    ["CONTRATOS", fmtNum(d.n)],
    ["IMPORTE TOTAL", fmtMXNCompacto(d.total)],
    ["PROMEDIO", fmtMXNCompacto(d.promedio)],
    ["PROVEEDORES", fmtNum(d.nProveedores)],
    ["INSTITUCIONES", fmtNum(d.nInstituciones)],
  ];
  kpis.forEach(([label, value], i) => {
    const x = M + i * (bw + gap);
    doc.roundedRect(x, y, bw, bh, 5).fill(COL.s50);
    doc.fillColor(COL.s500).font("Helvetica").fontSize(6.5).text(label, x + 7, y + 7, { width: bw - 14 });
    doc.fillColor(COL.ink).font("Helvetica-Bold").fontSize(12).text(value, x + 7, y + 17, { width: bw - 14, lineBreak: false });
  });
  doc.y = y + bh + 4;
  doc.font("Helvetica").fontSize(9).fillColor(COL.s500).text(`Importe total exacto: ${fmtMXN(d.total)}`, M, doc.y);
}

function barrasPorAnio(doc: Doc, d: DatosInforme) {
  if (!d.porAnio.length) return;
  seccion(doc, "Importe por año");
  const W = ancho(doc);
  const max = Math.max(...d.porAnio.map((a) => a.total), 1);
  const trackX = M + 38;
  const trackW = W - 38 - 150;
  for (const a of d.porAnio) {
    if (doc.y + 16 > limiteInf(doc)) doc.addPage();
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COL.s500).text(a.anio ?? "—", M, y + 2, { width: 34 });
    doc.roundedRect(trackX, y, trackW, 12, 3).fill(COL.s100);
    const fw = Math.max((a.total / max) * trackW, 2);
    doc.roundedRect(trackX, y, fw, 12, 3).fill(COL.indigo);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COL.s700)
      .text(`${fmtMXNCompacto(a.total)} · ${fmtNum(a.n)} contr.`, trackX + trackW + 6, y + 2, { width: 150 - 6, lineBreak: false });
    doc.y = y + 16;
  }
}

function tablaGrupos(doc: Doc, titulo: string, nombreCol: string, grupos: Grupo[], totalGeneral: number, conRfc: boolean) {
  if (!grupos.length) return;
  seccion(doc, titulo);
  const W = ancho(doc);
  const cw = { rank: 16, contratos: 50, monto: 85, pct: 45 };
  const nombreW = W - cw.rank - cw.contratos - cw.monto - cw.pct;
  const cx = {
    rank: M,
    nombre: M + cw.rank,
    contratos: M + cw.rank + nombreW,
    monto: M + cw.rank + nombreW + cw.contratos,
    pct: M + cw.rank + nombreW + cw.contratos + cw.monto,
  };
  const header = () => {
    const y = doc.y;
    doc.rect(M, y, W, 14).fill(COL.s100);
    doc.fillColor(COL.s500).font("Helvetica-Bold").fontSize(6.5);
    doc.text("#", cx.rank, y + 4, { width: cw.rank });
    doc.text(nombreCol.toUpperCase(), cx.nombre, y + 4, { width: nombreW - 4 });
    doc.text("CONTRATOS", cx.contratos, y + 4, { width: cw.contratos, align: "right" });
    doc.text("MONTO", cx.monto, y + 4, { width: cw.monto, align: "right" });
    doc.text("%", cx.pct, y + 4, { width: cw.pct, align: "right" });
    doc.y = y + 16;
  };
  header();
  grupos.forEach((g, i) => {
    const nombre = g.clave ?? "—";
    // El nombre completo se ajusta en varias líneas; la fila crece con él.
    doc.font("Helvetica").fontSize(8);
    const hNombre = doc.heightOfString(nombre, { width: nombreW - 4 });
    const rh = Math.max(13, hNombre + 4) + (conRfc && g.rfc ? 8 : 0);
    if (doc.y + rh > limiteInf(doc)) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(M, y - 1, W, rh).fill(COL.s50);
    doc.font("Helvetica").fontSize(7).fillColor(COL.s400).text(String(i + 1), cx.rank, y + 1, { width: cw.rank });
    doc.font("Helvetica").fontSize(8).fillColor(COL.ink).text(nombre, cx.nombre, y + 1, { width: nombreW - 4 });
    if (conRfc && g.rfc) {
      doc.font("Helvetica").fontSize(6.5).fillColor(COL.s400).text(g.rfc, cx.nombre, y + hNombre + 3, { width: nombreW - 4, lineBreak: false });
    }
    doc.font("Helvetica").fontSize(8).fillColor(COL.ink).text(fmtNum(g.n), cx.contratos, y + 1, { width: cw.contratos, align: "right" });
    doc.font("Helvetica-Bold").text(fmtMXN(g.total), cx.monto, y + 1, { width: cw.monto, align: "right", lineBreak: false });
    doc.font("Helvetica").fillColor(COL.s500).text(pct(g.total, totalGeneral), cx.pct, y + 1, { width: cw.pct, align: "right" });
    doc.y = y + rh;
  });
}

function campo(doc: Doc, label: string, value: string, x: number, w: number) {
  doc.font("Helvetica").fontSize(8);
  doc.fillColor(COL.s500).text(label, x, doc.y, { continued: true, width: w });
  doc.fillColor(COL.ink).text(value);
}

function bloquesContratos(doc: Doc, d: DatosInforme) {
  seccion(doc, "Desglose de contratos");
  const W = ancho(doc);
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COL.s500)
    .text("El código de cada contrato enlaza a su anuncio oficial en comprasmx.", M, doc.y, { width: W });
  doc.y += 5;
  if (d.n > d.contratos.length) {
    const txt = `Mostrando los ${fmtNum(d.contratos.length)} contratos de mayor monto, de ${fmtNum(d.n)} que coinciden. Para el detalle completo usa la exportación a CSV, o afina los filtros (año, institución, importe…).`;
    doc.font("Helvetica").fontSize(8).fillColor(COL.s500);
    const h = doc.heightOfString(txt, { width: W - 14 });
    doc.roundedRect(M, doc.y, W, h + 10, 5).fill(COL.s50);
    doc.fillColor(COL.s500).text(txt, M + 7, doc.y + 5, { width: W - 14 });
    doc.y += 8;
  }

  const sx = M + 12; // sangría del cuerpo de la ficha
  const sw = W - 12;
  d.contratos.forEach((c, i) => {
    // Reserva mínima para no dejar el título huérfano al pie de página.
    if (doc.y + 58 > limiteInf(doc)) doc.addPage();

    // Título completo (negrita)
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(COL.ink)
      .text(`${i + 1}.  ${c.titulo_contrato || c.descripcion_contrato || "(sin título)"}`, M, doc.y, { width: W });
    doc.moveDown(0.15);

    // Importe (negrita) · fecha · estatus · tipo
    const fecha = c.fecha_publicacion ? fmtFecha(c.fecha_publicacion) : c.anio_fuente ?? "—";
    const tipo = c.tipo_contratacion
      ? c.tipo_contratacion.charAt(0) + c.tipo_contratacion.slice(1).toLowerCase()
      : "";
    const suf = [fecha, c.estatus_contrato, tipo].filter(Boolean).join("      ");
    doc.fontSize(8);
    doc.font("Helvetica-Bold").fillColor(COL.ink).text(fmtMXN(c.importe), sx, doc.y, { continued: true, width: sw });
    doc.font("Helvetica").fillColor(COL.s700).text(suf ? `      ${suf}` : "");

    // Proveedor (nombre completo) + RFC
    campo(doc, "Proveedor:  ", `${c.proveedor_contratista ?? "—"}${c.rfc ? "      " + c.rfc : ""}`, sx, sw);

    // Institución (nombre completo + siglas)
    const inst =
      c.institucion && c.siglas_institucion && c.siglas_institucion !== c.institucion
        ? `${c.institucion} (${c.siglas_institucion})`
        : c.institucion || c.siglas_institucion || "—";
    campo(doc, "Institución:  ", inst, sx, sw);

    // Código con hipervínculo al anuncio oficial
    if (c.codigo_contrato) {
      doc.font("Helvetica").fontSize(8).fillColor(COL.s500).text("Código:  ", sx, doc.y, { continued: true, width: sw });
      if (c.direccion_anuncio) {
        doc.fillColor(COL.indigo).text(c.codigo_contrato, { link: c.direccion_anuncio, underline: true });
      } else {
        doc.fillColor(COL.ink).text(c.codigo_contrato);
      }
    }

    // Descripción completa
    if (c.descripcion_contrato && c.descripcion_contrato.trim() && c.descripcion_contrato !== c.titulo_contrato) {
      doc.moveDown(0.15);
      doc.font("Helvetica").fontSize(8).fillColor(COL.s500).text(c.descripcion_contrato.trim(), sx, doc.y, { width: sw });
    }

    // Separador
    doc.moveDown(0.45);
    const sy = doc.y;
    doc.moveTo(M, sy).lineTo(M + W, sy).lineWidth(0.5).strokeColor(COL.s100).stroke();
    doc.moveDown(0.45);
  });
}

function pies(doc: Doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Escribir en la zona del margen inferior hace que pdfkit agregue una página
    // de más por cada pie; con bottom=0 se desactiva ese auto-salto.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 30;
    doc.moveTo(M, y).lineTo(doc.page.width - M, y).lineWidth(1).strokeColor(COL.s200).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(COL.s400);
    doc.text("La Lupa · Contratos públicos de México · Datos de CompraNet", M, y + 5, { width: 320, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, doc.page.width - M - 140, y + 5, { width: 140, align: "right", lineBreak: false });
  }
}

/** Genera el informe PDF (pdfkit) y lo devuelve como Buffer. */
export function generarInforme(datos: DatosInforme, filtros: FiltroDesc[], sello: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: M,
        bufferPages: true,
        info: { Title: "La Lupa — Informe de contratos públicos", Author: "La Lupa" },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      cabecera(doc, sello);
      parametros(doc, filtros);
      resumen(doc, datos);
      barrasPorAnio(doc, datos);
      tablaGrupos(
        doc,
        `Instituciones${datos.nInstituciones > datos.instituciones.length ? ` (top ${datos.instituciones.length} de ${fmtNum(datos.nInstituciones)})` : ""}`,
        "Institución",
        datos.instituciones,
        datos.total,
        false,
      );
      tablaGrupos(
        doc,
        `Proveedores${datos.nProveedores > datos.proveedores.length ? ` (top ${datos.proveedores.length} de ${fmtNum(datos.nProveedores)})` : ""}`,
        "Proveedor",
        datos.proveedores,
        datos.total,
        true,
      );
      bloquesContratos(doc, datos);
      pies(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
