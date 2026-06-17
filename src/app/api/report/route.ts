import type { NextRequest } from "next/server";
import { datosInforme, hayBusqueda } from "@/lib/contratos";
import { describirConsulta, nombreArchivoInforme, selloConsulta } from "@/lib/informe";
import { parseParams, type SearchParams } from "@/lib/searchParams";
import { generarInforme } from "./generarPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // URLSearchParams -> objeto SearchParams (respetando claves repetidas)
  const sp: SearchParams = {};
  for (const k of new Set(req.nextUrl.searchParams.keys())) {
    const all = req.nextUrl.searchParams.getAll(k);
    sp[k] = all.length > 1 ? all : all[0];
  }

  const p = parseParams(sp);
  if (!hayBusqueda(p)) {
    return Response.json(
      { error: "Especifica un término o al menos un filtro para generar el informe." },
      { status: 400 },
    );
  }

  try {
    const datos = await datosInforme(p);
    if (datos.n === 0) {
      return Response.json({ error: "La consulta no devolvió contratos." }, { status: 404 });
    }
    const ahora = new Date();
    const pdf = await generarInforme(datos, describirConsulta(p), selloConsulta(ahora));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${nombreArchivoInforme(ahora)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("Informe PDF error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
