import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
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
  // CSV comprimido: el navegador sube un .csv.gz (mucho más chico) y aquí lo
  // descomprimimos en streaming antes de parsear.
  const esGzip =
    req.nextUrl.searchParams.get("gzip") === "1" ||
    req.headers.get("content-encoding") === "gzip";

  // request.body (web stream) -> Node stream para csv-parse
  let stream: Readable = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
  // Si el cliente corta la conexión (recarga/cierra), el stream emite 'aborted'/
  // ECONNRESET. Sin este listener se vuelve un uncaughtException que puede tumbar
  // el server standalone en prod. Lo absorbemos: el error en curso ya lo captura
  // el try/catch vía el rechazo del async-iterator.
  stream.on("error", () => {});
  if (esGzip) {
    const gunzip = createGunzip();
    gunzip.on("error", () => {}); // .gz corrupto: lo captura el try/catch al iterar
    stream = stream.pipe(gunzip);
  }

  // Respuesta en streaming (NDJSON): una línea {progreso} por lote y una final
  // {ok,...} o {error}. Mantiene la conexión viva mientras el ETL procesa
  // (que puede tardar minutos), así ni nginx ni el navegador se rinden.
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emitir = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const res = await cargarCsv(stream, {
          delimiter,
          encoding,
          onProgress: (procesados) => emitir({ progreso: procesados }),
        });
        emitir({ ok: true, ...res });
      } catch (e) {
        console.error("ETL error:", e);
        emitir({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      // Le dice a nginx que NO bufferee esta respuesta (progreso en vivo).
      "x-accel-buffering": "no",
      "cache-control": "no-cache, no-transform",
    },
  });
}
