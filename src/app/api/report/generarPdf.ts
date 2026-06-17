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
const ROW = 19; // alto de fila del desglose

const limiteInf = (doc: Doc) => doc.page.height - 42;
const ancho = (doc: Doc) => doc.page.width - 2 * M;

/** Trunca un texto para que quepa en `width` con la fuente/tamaño actuales. */
function fit(doc: Doc, text: string | null | undefined, width: number): string {
  const raw = (text ?? "").trim();
  if (!raw) return "—";
  if (doc.widthOfString(raw) <= width) return raw;
  const aprox = Math.max(1, Math.floor((width / doc.widthOfString(raw)) * raw.length));
  let t = raw.slice(0, aprox);
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
}
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
  const rh = conRfc ? 18 : 13;
  const header = () => {
    const y = doc.y;
    doc.rect(M, y, W, 14).fill(COL.s100);
    doc.fillColor(COL.s500).font("Helvetica-Bold").fontSize(6.5);
    doc.text("#", cx.rank, y + 4, { width: cw.rank });
    doc.text(nombreCol.toUpperCase(), cx.nombre, y + 4, { width: nombreW });
    doc.text("CONTRATOS", cx.contratos, y + 4, { width: cw.contratos, align: "right" });
    doc.text("MONTO", cx.monto, y + 4, { width: cw.monto, align: "right" });
    doc.text("%", cx.pct, y + 4, { width: cw.pct, align: "right" });
    doc.y = y + 16;
  };
  header();
  grupos.forEach((g, i) => {
    if (doc.y + rh > limiteInf(doc)) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(M, y - 1, W, rh).fill(COL.s50);
    doc.font("Helvetica").fontSize(7).fillColor(COL.s400).text(String(i + 1), cx.rank, y + 1, { width: cw.rank });
    doc.font("Helvetica").fontSize(8).fillColor(COL.ink);
    doc.text(fit(doc, g.clave, nombreW - 4), cx.nombre, y + 1, { width: nombreW, lineBreak: false });
    if (conRfc && g.rfc) {
      doc.font("Helvetica").fontSize(6.5).fillColor(COL.s400).text(g.rfc, cx.nombre, y + 10, { width: nombreW, lineBreak: false });
    }
    doc.font("Helvetica").fontSize(8).fillColor(COL.ink).text(fmtNum(g.n), cx.contratos, y + 1, { width: cw.contratos, align: "right" });
    doc.font("Helvetica-Bold").text(fmtMXN(g.total), cx.monto, y + 1, { width: cw.monto, align: "right", lineBreak: false });
    doc.font("Helvetica").fillColor(COL.s500).text(pct(g.total, totalGeneral), cx.pct, y + 1, { width: cw.pct, align: "right" });
    doc.y = y + rh;
  });
}

function tablaContratos(doc: Doc, d: DatosInforme) {
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
  const cw = { rank: 14, contrato: 168, prov: 112, inst: 60, importe: 66, fecha: 40, estatus: 37 };
  const cx = {
    rank: M,
    contrato: M + 17,
    prov: M + 188,
    inst: M + 303,
    importe: M + 366,
    fecha: M + 435,
    estatus: M + 478,
  };
  const header = () => {
    const y = doc.y;
    doc.rect(M, y, W, 14).fill(COL.s100);
    doc.fillColor(COL.s500).font("Helvetica-Bold").fontSize(6.5);
    doc.text("#", cx.rank, y + 4, { width: cw.rank });
    doc.text("CONTRATO", cx.contrato, y + 4, { width: cw.contrato });
    doc.text("PROVEEDOR", cx.prov, y + 4, { width: cw.prov });
    doc.text("INSTITUCIÓN", cx.inst, y + 4, { width: cw.inst });
    doc.text("IMPORTE", cx.importe, y + 4, { width: cw.importe, align: "right" });
    doc.text("FECHA", cx.fecha, y + 4, { width: cw.fecha });
    doc.text("ESTATUS", cx.estatus, y + 4, { width: cw.estatus });
    doc.y = y + 16;
  };
  header();
  d.contratos.forEach((c, i) => {
    if (doc.y + ROW > limiteInf(doc)) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(M, y - 1, W, ROW).fill(COL.s50);
    doc.font("Helvetica").fontSize(7).fillColor(COL.s400).text(String(i + 1), cx.rank, y + 1, { width: cw.rank });
    doc.font("Helvetica").fontSize(8).fillColor(COL.ink);
    doc.text(fit(doc, c.titulo_contrato || c.descripcion_contrato, cw.contrato - 4), cx.contrato, y + 1, { width: cw.contrato, lineBreak: false });
    doc.text(fit(doc, c.proveedor_contratista, cw.prov - 4), cx.prov, y + 1, { width: cw.prov, lineBreak: false });
    doc.text(fit(doc, c.siglas_institucion || c.institucion, cw.inst - 2), cx.inst, y + 1, { width: cw.inst, lineBreak: false });
    doc.font("Helvetica-Bold").text(fmtMXN(c.importe), cx.importe, y + 1, { width: cw.importe, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(7).fillColor(COL.s700).text(c.fecha_publicacion ? fmtFecha(c.fecha_publicacion) : c.anio_fuente ?? "—", cx.fecha, y + 1, { width: cw.fecha, lineBreak: false });
    doc.fontSize(6).fillColor(COL.s500).text(fit(doc, c.estatus_contrato, cw.estatus), cx.estatus, y + 1, { width: cw.estatus, lineBreak: false });
    doc.font("Helvetica").fontSize(6.5);
    if (c.codigo_contrato) {
      // El código es un hipervínculo al anuncio oficial (índigo + subrayado).
      const conLink = Boolean(c.direccion_anuncio);
      doc.fillColor(conLink ? COL.indigo : COL.s400);
      doc.text(c.codigo_contrato, cx.contrato, y + 10, {
        width: cw.contrato,
        lineBreak: false,
        ...(conLink ? { link: c.direccion_anuncio as string, underline: true } : {}),
      });
    }
    if (c.rfc) doc.fillColor(COL.s400).text(c.rfc, cx.prov, y + 10, { width: cw.prov, lineBreak: false });
    doc.y = y + ROW;
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
      tablaContratos(doc, datos);
      pies(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
