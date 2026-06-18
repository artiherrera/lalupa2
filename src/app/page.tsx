import { Suspense } from "react";
import Link from "next/link";
import { hayBusqueda } from "@/lib/contratos";
import { parseParams, type SearchParams } from "@/lib/searchParams";
import { SearchForm } from "./_components/SearchForm";
import { Resultados } from "./_components/Resultados";
import { Marca } from "./_components/Marca";

const EJEMPLOS: { label: string; href: string }[] = [
  { label: "medicamentos", href: "/?q=medicamentos" },
  { label: "vacunas OR jeringas", href: "/?q=vacunas+OR+jeringas" },
  { label: "obra pública 2024", href: "/?q=obra&tipo=OBRA+P%C3%9ABLICA&anio=2024&ambito=descripcion" },
  { label: "PEMEX", href: "/?q=pemex&ambito=institucion" },
  { label: "difusión de información", href: "/?q=difusi%C3%B3n+de+informaci%C3%B3n&ambito=proveedor" },
];

function Cargando() {
  return (
    <div className="mt-6 flex animate-pulse flex-col gap-7">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
      <div className="h-44 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
      </div>
      <p className="text-center text-sm text-slate-400">Buscando… los términos muy comunes pueden tardar unos segundos.</p>
    </div>
  );
}

function Ejemplos() {
  return (
    <div className="mt-8 flex flex-col items-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Prueba con</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {EJEMPLOS.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
          >
            {e.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const p = parseParams(sp);
  const activo = hayBusqueda(p);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-background/80 backdrop-blur-md dark:border-slate-800/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Marca />
          <span className="hidden text-sm text-slate-400 sm:block">1,045,445 contratos · CompraNet</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
        {!activo && (
          <div className="mb-7 text-center">
            <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
              Busca en el gasto público
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-slate-500">
              Explora más de un millón de contratos del gobierno mexicano. Por proveedor,
              institución, concepto, RFC y más — con totales en tiempo real.
            </p>
          </div>
        )}

        <SearchForm p={p} />

        {activo ? (
          <Suspense key={JSON.stringify(p)} fallback={<Cargando />}>
            <Resultados p={p} />
          </Suspense>
        ) : (
          <Ejemplos />
        )}
      </main>

      <footer className="border-t border-slate-200/70 py-6 text-center text-xs text-slate-400 dark:border-slate-800/70">
        Datos públicos de CompraNet (Hacienda) · La Lupa
      </footer>
    </div>
  );
}
