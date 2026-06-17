import Link from "next/link";
import { buscar, type Grupo, type ParamsBusqueda } from "@/lib/contratos";
import { ORDENES } from "@/lib/fields";
import { fmtFecha, fmtMXN, fmtMXNCompacto, fmtNum } from "@/lib/format";
import { hrefCon } from "@/lib/searchParams";

function Kpi({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight" title={title}>
        {value}
      </div>
    </div>
  );
}

function GrupoPanel({
  titulo,
  grupos,
  total,
  ambito,
  p,
}: {
  titulo: string;
  grupos: Grupo[];
  total: number;
  ambito: "proveedor" | "institucion";
  p: ParamsBusqueda;
}) {
  const max = Math.max(...grupos.map((g) => g.total), 1);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <span className="text-xs text-slate-400">
          {fmtNum(total)}
          {total > grupos.length ? ` · top ${grupos.length}` : ""}
        </span>
      </header>
      <ol className="scroll-fino max-h-[26rem] divide-y divide-slate-50 overflow-y-auto dark:divide-slate-800/60">
        {grupos.map((g, i) => (
          <li key={(g.clave ?? "") + i}>
            <Link
              href={hrefCon(p, { ambito, q: g.clave, pagina: null })}
              className="group relative flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-slate-400">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-700 group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
                  {g.clave || "—"}
                </span>
                {g.rfc && (
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400">{g.rfc}</span>
                )}
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full bg-indigo-500/70" style={{ width: `${(g.total / max) * 100}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{fmtMXNCompacto(g.total)}</span>
                <span className="block text-[11px] text-slate-400">{fmtNum(g.n)} contratos</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ESTATUS_COLOR: Record<string, string> = {
  ACTIVO: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  PUBLICADO: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  FORMALIZADO: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
};
const estatusClase = (s: string) =>
  ESTATUS_COLOR[s] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";

export async function Resultados({ p }: { p: ParamsBusqueda }) {
  let data;
  try {
    data = await buscar(p);
  } catch (e) {
    console.error("buscar() falló:", e);
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
        Ocurrió un error al consultar la base de datos. Vuelve a intentarlo o ajusta la búsqueda.
      </div>
    );
  }

  if (data.n === 0) {
    return (
      <div className="mt-12 flex flex-col items-center text-center text-slate-500">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800">
          <svg className="h-7 w-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
        </div>
        <p className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-200">Sin resultados</p>
        <p className="mt-1 max-w-sm text-sm">No encontramos contratos con esos criterios. Prueba con otros términos, cambia el ámbito o quita filtros.</p>
      </div>
    );
  }

  const maxAnio = Math.max(...data.porAnio.map((a) => a.total), 1);
  const desde = data.pagina * data.porPagina + 1;
  const hasta = data.pagina * data.porPagina + data.resultados.length;
  const hayMas = hasta < data.n;
  const reporteHref = `/api/report${hrefCon(p) === "/" ? "" : hrefCon(p).slice(1)}`;

  return (
    <div className="mt-6 flex flex-col gap-7">
      {/* Barra de acciones */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-500">Resultados de la consulta</h2>
        <a
          href={reporteHref}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3.5 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 21h14" strokeLinecap="round" />
          </svg>
          Exportar PDF
        </a>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Contratos" value={fmtNum(data.n)} />
        <Kpi label="Importe total" value={fmtMXNCompacto(data.total)} title={fmtMXN(data.total)} />
        <Kpi label="Promedio" value={fmtMXNCompacto(data.promedio)} title={fmtMXN(data.promedio)} />
        <Kpi label="Proveedores" value={fmtNum(data.nProveedores)} />
        <Kpi label="Instituciones" value={fmtNum(data.nInstituciones)} />
      </section>

      {/* Por año */}
      {data.porAnio.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold">Importe por año</h2>
          <div className="flex flex-col gap-2.5">
            {data.porAnio.map((a) => (
              <div key={a.anio ?? "s/a"} className="flex items-center gap-3 text-sm">
                <span className="w-10 shrink-0 font-medium tabular-nums text-slate-500">{a.anio ?? "—"}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-indigo-500 to-indigo-400 px-2"
                    style={{ width: `${Math.max((a.total / maxAnio) * 100, 4)}%` }}
                  >
                    <span className="text-[11px] font-semibold text-white/90">{fmtMXNCompacto(a.total)}</span>
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">{fmtNum(a.n)} contr.</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proveedores e instituciones */}
      <section className="grid gap-5 lg:grid-cols-2">
        <GrupoPanel titulo="Proveedores" grupos={data.proveedores} total={data.nProveedores} ambito="proveedor" p={p} />
        <GrupoPanel titulo="Instituciones" grupos={data.instituciones} total={data.nInstituciones} ambito="institucion" p={p} />
      </section>

      {/* Contratos */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Contratos <span className="font-normal text-slate-400">· {fmtNum(desde)}–{fmtNum(hasta)} de {fmtNum(data.n)}</span>
          </h2>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs dark:bg-slate-800">
            {ORDENES.map((o) => (
              <Link
                key={o.value}
                href={hrefCon(p, { orden: o.value, pagina: null })}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  p.orden === o.value
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </div>

        <ul className="flex flex-col gap-2.5">
          {data.resultados.map((c, i) => (
            <li
              key={(c.codigo_contrato ?? "") + i}
              className="group rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md hover:shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-medium leading-snug text-slate-800 dark:text-slate-100">
                    {c.titulo_contrato || c.descripcion_contrato || "(sin título)"}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    {c.proveedor_contratista || "—"}
                    {c.rfc && (
                      <span className="ml-2 font-mono text-xs font-normal text-slate-400">{c.rfc}</span>
                    )}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <span className="font-medium text-slate-500">{c.siglas_institucion || c.institucion || "—"}</span>
                    {c.tipo_contratacion && <span>· {c.tipo_contratacion.toLowerCase()}</span>}
                    {c.anio_fuente && <span>· {c.anio_fuente}</span>}
                    {c.fecha_publicacion && <span>· {fmtFecha(c.fecha_publicacion)}</span>}
                    {c.anio_fundacion_empresa ? (
                      <span className="text-slate-400">· empresa fundada en {c.anio_fundacion_empresa}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
                  <span className="text-lg font-bold tabular-nums tracking-tight">{fmtMXN(c.importe)}</span>
                  {c.estatus_contrato && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${estatusClase(c.estatus_contrato)}`}>
                      {c.estatus_contrato}
                    </span>
                  )}
                </div>
              </div>
              {c.descripcion_contrato && c.descripcion_contrato !== c.titulo_contrato && (
                <p className="mt-3 border-l-2 border-slate-100 pl-3 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {c.descripcion_contrato}
                </p>
              )}
              {c.direccion_anuncio && (
                <a
                  href={c.direccion_anuncio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Ver anuncio oficial
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              )}
            </li>
          ))}
        </ul>

        {/* Paginación */}
        <nav className="mt-6 flex items-center justify-between">
          {data.pagina > 0 ? (
            <Link
              href={hrefCon(p, { pagina: data.pagina - 1 || null })}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-400">Página {data.pagina + 1}</span>
          {hayMas ? (
            <Link
              href={hrefCon(p, { pagina: data.pagina + 1 })}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </section>
    </div>
  );
}
