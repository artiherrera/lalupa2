import { Suspense } from "react";
import Link from "next/link";
import { mesesDeAlta } from "@/lib/contratos";
import { etiquetaMes } from "@/lib/fields";
import { parseParams, type SearchParams } from "@/lib/searchParams";
import { fmtNum } from "@/lib/format";
import { SearchForm } from "../_components/SearchForm";
import { Resultados } from "../_components/Resultados";
import { Marca } from "../_components/Marca";

function Cargando() {
  return (
    <div className="mt-6 flex animate-pulse flex-col gap-7">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
    </div>
  );
}

export default async function Nuevos({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const meses = await mesesDeAlta();
  const p = parseParams(sp);

  // Valores por defecto propios de esta vista: el mes más reciente con altas y
  // orden por "agregado recientemente" (salvo que el usuario elija otra cosa).
  if (!p.mesAlta && meses.length) p.mesAlta = meses[0].mes;
  if (!sp.orden) p.orden = "agregado_desc";

  const mesActual = meses.find((m) => m.mes === p.mesAlta);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-background/80 backdrop-blur-md dark:border-slate-800/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Marca subtitulo="Nuevos contratos" />
          <Link
            href="/"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            ← Buscador general
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
        <div className="mb-7">
          <h1 className="flex items-center gap-2.5 text-balance text-2xl font-bold tracking-tight md:text-3xl">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
            </span>
            Contratos nuevos en la plataforma
          </h1>
          <p className="mt-2 max-w-2xl text-pretty text-slate-500">
            Contratos agregados a La Lupa por mes. Elige un mes para ver qué se
            incorporó y, si quieres, busca dentro de esa alta por proveedor,
            institución o palabra clave.
          </p>
          {mesActual && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-teal-700 dark:text-teal-400">
                {etiquetaMes(mesActual.mes)}
              </span>{" "}
              · {fmtNum(mesActual.n)} contratos agregados
            </p>
          )}
        </div>

        <SearchForm p={p} action="/nuevos" meses={meses} />

        <Suspense key={JSON.stringify(p)} fallback={<Cargando />}>
          <Resultados p={p} />
        </Suspense>
      </main>

      <footer className="border-t border-slate-200/70 py-6 text-center text-xs text-slate-400 dark:border-slate-800/70">
        Datos públicos de CompraNet (Hacienda) · La Lupa
      </footer>
    </div>
  );
}
