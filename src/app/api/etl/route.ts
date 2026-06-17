import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { cargarCsv } from "@/lib/etl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth: token de admin (env ADMIN_TOKEN)
  const token = req.headers.get("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!req.body) {
    return Response.json({ error: "No se recibió archivo" }, { status: 400 });
  }

  const delimParam = req.nextUrl.searchParams.get("delimiter") || ",";
  const delimiter = delimParam === "tab" ? "\t" : delimParam;
  const encoding = (req.nextUrl.searchParams.get("encoding") || "latin1") as BufferEncoding;
  try {
    // request.body (web stream) -> Node stream para csv-parse
    const stream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
    // Si el cliente corta la conexión (recarga/cierra), el stream emite 'aborted'/
    // ECONNRESET. Sin este listener se vuelve un uncaughtException que puede tumbar
    // el server standalone en prod. Lo absorbemos: el error en curso ya lo captura
    // el try/catch vía el rechazo del async-iterator.
    stream.on("error", () => {});
    const res = await cargarCsv(stream, { delimiter, encoding });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("ETL error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
