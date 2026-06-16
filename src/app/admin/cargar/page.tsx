"use client";

import { useState } from "react";

interface Resultado {
  total: number;
  lotes: number;
  omitidas: number;
  columnas: string[];
  ignoradas: string[];
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
    setEstado("Subiendo y procesando… en archivos grandes puede tardar varios minutos.");
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
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Cargar contratos
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Sube el CSV de <span className="font-medium">contratos adjudicados</span> de
        comprasmx. Inserta los nuevos y actualiza los existentes (por código de
        contrato); puedes resubir el mismo archivo sin duplicar.
      </p>

      <form onSubmit={enviar} className="mt-8 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Token de administrador
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Archivo CSV
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {file && (
            <p className="mt-1 text-xs text-slate-500">
              {file.name} · {(file.size / 1_048_576).toFixed(1)} MB
            </p>
          )}
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">
              Codificación
            </label>
            <select
              value={encoding}
              onChange={(e) => setEncoding(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="latin1">Latin-1 / Windows-1252 (comprasmx)</option>
              <option value="utf8">UTF-8</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">
              Separador
            </label>
            <select
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value=",">Coma ( , )</option>
              <option value=";">Punto y coma ( ; )</option>
              <option value="tab">Tabulador</option>
              <option value="|">Pipe ( | )</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={cargando || !file || !token}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {cargando ? "Procesando…" : "Cargar"}
        </button>
      </form>

      {estado && (
        <div className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          {estado}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {resultado && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <p className="font-medium">Carga completa.</p>
          <ul className="mt-2 space-y-1">
            <li>
              Filas escritas (insertadas o actualizadas):{" "}
              <span className="font-semibold">{resultado.total.toLocaleString("es-MX")}</span>
            </li>
            <li>Lotes: {resultado.lotes.toLocaleString("es-MX")}</li>
            {resultado.omitidas > 0 && (
              <li className="text-amber-700">
                Omitidas (sin código de contrato):{" "}
                {resultado.omitidas.toLocaleString("es-MX")}
              </li>
            )}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-emerald-700 hover:underline">
              Columnas mapeadas ({resultado.columnas.length}) y encabezados ignorados (
              {resultado.ignoradas.length})
            </summary>
            <p className="mt-2 text-xs text-emerald-800">
              <span className="font-medium">Mapeadas:</span> {resultado.columnas.join(", ")}
            </p>
            {resultado.ignoradas.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-medium">Ignoradas:</span>{" "}
                {resultado.ignoradas.join(", ")}
              </p>
            )}
          </details>
        </div>
      )}
    </main>
  );
}
