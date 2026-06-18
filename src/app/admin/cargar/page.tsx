"use client";

import Link from "next/link";
import { useState } from "react";
import { Marca } from "@/app/_components/Marca";

interface Resultado {
  total: number;
  lotes: number;
  omitidas: number;
  columnas: string[];
  ignoradas: string[];
}

const INPUT =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const LABEL =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400";

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function CargarPage() {
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [delimiter, setDelimiter] = useState(",");
  const [encoding, setEncoding] = useState("latin1");
  const [cargando, setCargando] = useState(false);
  const [estado, setEstado] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !token) return;
    setCargando(true);
    setError("");
    setResultado(null);
    setEstado("Subiendo y procesando… en archivos grandes puede tardar varios minutos. No cierres ni recargues esta pestaña.");
    try {
      const qs = new URLSearchParams({ delimiter, encoding });
      const r = await fetch(`/api/etl?${qs}`, {
        method: "POST",
        headers: { "x-admin-token": token, "content-type": "text/csv" },
        body: file,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setResultado(j as Resultado);
      setEstado("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEstado("");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-background/80 backdrop-blur-md dark:border-slate-800/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 md:px-6">
          <Marca subtitulo="Carga de datos" />
          <Link href="/" className="text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            ← Volver al buscador
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 md:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none md:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Cargar contratos</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">CSV de contratos adjudicados de comprasmx</p>
            </div>
          </div>

          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
            Inserta los contratos nuevos y actualiza los existentes (por código de contrato).
            Puedes resubir el mismo archivo sin duplicar. Sube el archivo{" "}
            <span className="font-semibold">contratos_…csv</span>, no el de expedientes.
          </p>

          <form onSubmit={enviar} className="mt-6 space-y-5">
            <div>
              <label htmlFor="token" className={LABEL}>Token de administrador</label>
              <input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ADMIN_TOKEN"
                autoComplete="off"
                className={INPUT}
              />
            </div>

            <div>
              <label htmlFor="file" className={LABEL}>Archivo CSV</label>
              <input
                id="file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600 transition-colors file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:border-slate-300 hover:file:bg-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:file:bg-indigo-950/60 dark:file:text-indigo-300"
              />
              {file && (
                <p className="mt-1.5 text-xs text-slate-500">
                  {file.name} · {(file.size / 1_048_576).toFixed(1)} MB
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="encoding" className={LABEL}>Codificación</label>
                <div className="relative">
                  <select
                    id="encoding"
                    value={encoding}
                    onChange={(e) => setEncoding(e.target.value)}
                    className={`${INPUT} cursor-pointer appearance-none pr-9`}
                  >
                    <option value="latin1">Latin-1 / Win-1252 (comprasmx)</option>
                    <option value="utf8">UTF-8</option>
                  </select>
                  <Chevron />
                </div>
              </div>
              <div>
                <label htmlFor="delimiter" className={LABEL}>Separador</label>
                <div className="relative">
                  <select
                    id="delimiter"
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    className={`${INPUT} cursor-pointer appearance-none pr-9`}
                  >
                    <option value=",">Coma ( , )</option>
                    <option value=";">Punto y coma ( ; )</option>
                    <option value="tab">Tabulador</option>
                    <option value="|">Pipe ( | )</option>
                  </select>
                  <Chevron />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={cargando || !file || !token}
              className="h-12 w-full rounded-xl bg-indigo-600 px-7 font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cargando ? "Procesando…" : "Cargar"}
            </button>
          </form>
        </div>

        {estado && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200">
            <svg className="mt-0.5 h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {estado}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {resultado && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p className="font-semibold">✓ Carga completa</p>
            <ul className="mt-2 space-y-1">
              <li>
                Filas escritas (insertadas o actualizadas):{" "}
                <span className="font-semibold">{resultado.total.toLocaleString("es-MX")}</span>
              </li>
              <li>Lotes: {resultado.lotes.toLocaleString("es-MX")}</li>
              {resultado.omitidas > 0 && (
                <li className="text-amber-700 dark:text-amber-300">
                  Omitidas (sin código de contrato): {resultado.omitidas.toLocaleString("es-MX")}
                </li>
              )}
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                Columnas mapeadas ({resultado.columnas.length}) · encabezados ignorados ({resultado.ignoradas.length})
              </summary>
              <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200/80">
                <span className="font-medium">Mapeadas:</span> {resultado.columnas.join(", ")}
              </p>
              {resultado.ignoradas.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">Ignoradas:</span> {resultado.ignoradas.join(", ")}
                </p>
              )}
            </details>
          </div>
        )}
      </main>
    </div>
  );
}
