import Form from "next/form";
import {
  AMBITOS,
  ANIOS,
  CARACTERES,
  ESTATUS,
  ORDENES_GOBIERNO,
  PROCEDIMIENTOS,
  TIPOS_CONTRATACION,
} from "@/lib/fields";
import type { ParamsBusqueda } from "@/lib/contratos";

function Facet({
  titulo,
  name,
  opciones,
  seleccion,
}: {
  titulo: string;
  name: string;
  opciones: { value: string; label: string }[];
  seleccion: string[];
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {titulo}
      </legend>
      <div className="flex flex-col gap-1">
        {opciones.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={seleccion.includes(o.value)}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
            />
            <span className="truncate" title={o.label}>
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const titulizar = (vals: string[]) =>
  vals.map((v) => ({
    value: v,
    label: v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
  }));

function Operador({ ej, desc }: { ej: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <code className="shrink-0 rounded-md bg-white px-2 py-1 font-mono text-xs text-indigo-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-indigo-300 dark:ring-slate-700">
        {ej}
      </code>
      <span className="text-sm text-slate-600 dark:text-slate-300">{desc}</span>
    </div>
  );
}

export function SearchForm({ p }: { p: ParamsBusqueda }) {
  const nFiltros =
    p.anios.length +
    p.tiposContratacion.length +
    p.procedimientos.length +
    p.estatus.length +
    p.ordenesGobierno.length +
    p.caracteres.length +
    (p.importeMin != null ? 1 : 0) +
    (p.importeMax != null ? 1 : 0) +
    (p.fundacionMin != null ? 1 : 0) +
    (p.fundacionMax != null ? 1 : 0);

  return (
    <Form
      action="/"
      className="rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
    >
      {/* Barra principal */}
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        <div className="relative md:w-48">
          <select
            name="ambito"
            defaultValue={p.ambito}
            aria-label="Buscar en"
            className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-9 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {AMBITOS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            name="q"
            defaultValue={p.q}
            autoFocus
            placeholder='Buscar…  usa  OR · -excluir · "frase exacta"'
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-base outline-none transition-colors focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          className="h-12 shrink-0 rounded-xl bg-indigo-600 px-7 font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-500"
        >
          Buscar
        </button>
      </div>

      <p className="px-2 pt-2 text-xs text-slate-400">
        Indiferente a acentos · buscando en{" "}
        <span className="font-medium text-slate-500">{AMBITOS.find((a) => a.value === p.ambito)?.hint}</span>
      </p>

      {/* Cómo buscar (operadores booleanos) */}
      <details className="group/ops mt-1">
        <summary className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>
          Cómo buscar · operadores
          <svg className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open/ops:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M5.5 7.5 10 12l4.5-4.5" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/20">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Por defecto, varias palabras se buscan <span className="font-semibold">todas juntas</span>. Puedes combinar:
          </p>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <Operador ej="vacunas jeringas" desc="contiene ambas palabras (Y)" />
            <Operador ej="vacunas OR jeringas" desc="cualquiera de las dos (O)" />
            <Operador ej="medicamentos -covid" desc="excluye lo que lleva el signo −" />
            <Operador ej={'"servicios de limpieza"'} desc="frase exacta, en ese orden" />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Se combinan entre sí, p. ej.{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-indigo-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-indigo-300 dark:ring-slate-700">
              &quot;equipo médico&quot; OR insumos -reactivos
            </code>
          </p>
        </div>
      </details>

      {/* Filtros avanzados (arranca cerrado; el badge indica cuántos están activos) */}
      <details className="group mt-1">
        <summary className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 6h18M7 12h10M11 18h2" strokeLinecap="round" />
          </svg>
          Filtros
          {nFiltros > 0 && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {nFiltros}
            </span>
          )}
          <svg className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M5.5 7.5 10 12l4.5-4.5" strokeLinecap="round" />
          </svg>
        </summary>

        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:grid-cols-3 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-800/20">
          <Facet titulo="Año" name="anio" opciones={ANIOS.map((v) => ({ value: v, label: v }))} seleccion={p.anios} />
          <Facet titulo="Tipo" name="tipo" opciones={titulizar(TIPOS_CONTRATACION)} seleccion={p.tiposContratacion} />
          <Facet
            titulo="Procedimiento"
            name="proc"
            opciones={PROCEDIMIENTOS.map((x) => ({ value: x.value, label: x.label }))}
            seleccion={p.procedimientos}
          />
          <Facet titulo="Estatus" name="estatus" opciones={titulizar(ESTATUS)} seleccion={p.estatus} />
          <Facet titulo="Orden de gobierno" name="orden_gob" opciones={ORDENES_GOBIERNO} seleccion={p.ordenesGobierno} />
          <Facet titulo="Carácter" name="caracter" opciones={titulizar(CARACTERES)} seleccion={p.caracteres} />
          <fieldset className="col-span-2 min-w-0 sm:col-span-1">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Importe (MXN)
            </legend>
            <div className="flex items-center gap-2">
              <input
                type="number"
                name="min"
                min={0}
                defaultValue={p.importeMin ?? ""}
                placeholder="mín"
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                name="max"
                min={0}
                defaultValue={p.importeMax ?? ""}
                placeholder="máx"
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </fieldset>
          <fieldset className="col-span-2 min-w-0 sm:col-span-1">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Año de fundación de la empresa
            </legend>
            <div className="flex items-center gap-2">
              <input
                type="number"
                name="fmin"
                min={1900}
                max={2100}
                defaultValue={p.fundacionMin ?? ""}
                placeholder="desde"
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                name="fmax"
                min={1900}
                max={2100}
                defaultValue={p.fundacionMax ?? ""}
                placeholder="hasta"
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </fieldset>
        </div>

        <div className="mt-3 flex items-center gap-3 px-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Aplicar filtros
          </button>
          <a href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Limpiar todo
          </a>
        </div>
      </details>
    </Form>
  );
}
