import Link from "next/link";
import { Marca } from "@/app/_components/Marca";
import { fmtNum } from "@/lib/format";
import { panel, type ClaveConteo, type TerminoConteo } from "@/lib/metricas";

export const dynamic = "force-dynamic";

const VENTANAS = [
  { dias: 1, label: "24 h" },
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
  { dias: 365, label: "1 año" },
];

// Compara el token en tiempo ~constante-ish. Coherente con /api/etl (usa ===);
// aquí evitamos además distinguir por longitud con una comparación simple.
function tokenValido(token: string | undefined): boolean {
  return Boolean(process.env.ADMIN_TOKEN) && token === process.env.ADMIN_TOKEN;
}

function Login({ error }: { error?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        method="GET"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
      >
        <h1 className="text-lg font-bold tracking-tight">Panel de métricas</h1>
        <p className="mt-1 text-sm text-slate-500">Acceso restringido.</p>
        <input
          type="password"
          name="token"
          placeholder="Token de administrador"
          autoComplete="off"
          autoFocus
          className="mt-4 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        {error && <p className="mt-2 text-sm text-red-600">Token incorrecto.</p>}
        <button
          type="submit"
          className="mt-4 h-12 w-full rounded-xl bg-indigo-600 font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function ListaTerminos({
  titulo,
  items,
  vacio,
  token,
  acento = "indigo",
}: {
  titulo: string;
  items: TerminoConteo[];
  vacio: string;
  token: string;
  acento?: "indigo" | "amber";
}) {
  const max = Math.max(...items.map((i) => i.n), 1);
  const barra = acento === "amber" ? "bg-amber-500/70" : "bg-indigo-500/70";
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold">{titulo}</h2>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">{vacio}</p>
      ) : (
        <ol className="scroll-fino max-h-[26rem] divide-y divide-slate-50 overflow-y-auto dark:divide-slate-800/60">
          {items.map((t, i) => (
            <li key={t.q + i}>
              <a
                href={`/?q=${encodeURIComponent(t.q)}`}
                target="_blank"
                className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700 group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
                    {t.q}
                  </span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span className={`block h-full rounded-full ${barra}`} style={{ width: `${(t.n / max) * 100}%` }} />
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtNum(t.n)}</span>
                  <span className="block text-[11px] text-slate-400">{fmtNum(t.visitantes)} pers.</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
      {/* Mantiene el token en los enlaces del panel al recargar por otra ventana. */}
      <input type="hidden" value={token} readOnly hidden />
    </section>
  );
}

function ListaClaves({ titulo, items }: { titulo: string; items: ClaveConteo[] }) {
  const max = Math.max(...items.map((i) => i.n), 1);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold">{titulo}</h2>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">Sin datos aún.</p>
      ) : (
        <ol className="divide-y divide-slate-50 dark:divide-slate-800/60">
          {items.map((c, i) => (
            <li key={(c.clave ?? "") + i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                  {c.clave || "—"}
                </span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full bg-teal-500/70" style={{ width: `${(c.n / max) * 100}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {fmtNum(c.n)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; dias?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token;

  if (!tokenValido(token)) {
    return <Login error={token !== undefined} />;
  }

  const dias = VENTANAS.some((v) => String(v.dias) === sp.dias) ? Number(sp.dias) : 7;
  const d = await panel(dias);
  const qs = (extra: Record<string, string>) =>
    "?" + new URLSearchParams({ token: token!, dias: String(dias), ...extra }).toString();
  const maxDia = Math.max(...d.porDia.map((x) => x.n), 1);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-background/80 backdrop-blur-md dark:border-slate-800/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Marca subtitulo="Métricas de uso" />
          <Link href="/" className="text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            ← Volver al buscador
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
        {/* Selector de ventana */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Ventana</span>
          {VENTANAS.map((v) => (
            <Link
              key={v.dias}
              href={qs({ dias: String(v.dias) })}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                v.dias === dias
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                  : "border-slate-200 bg-white text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Búsquedas (total)" value={fmtNum(d.resumen.total)} />
          <Kpi label="Últimas 24 h" value={fmtNum(d.resumen.ult24h)} />
          <Kpi label="Últimos 7 días" value={fmtNum(d.resumen.ult7d)} />
          <Kpi label="Visitantes" value={fmtNum(d.resumen.visitantes)} sub="por IP (hash)" />
          <Kpi label="Sin resultados" value={`${d.resumen.ceroPct}%`} sub="de las que tienen término" />
        </div>

        {/* Actividad por día */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold">Actividad por día</h2>
          </header>
          {d.porDia.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Sin datos en esta ventana.</p>
          ) : (
            <div className="flex h-40 items-end gap-1 overflow-x-auto px-4 py-4">
              {d.porDia.map((x) => (
                <div key={x.dia} className="group flex min-w-[10px] flex-1 flex-col items-center justify-end">
                  <div
                    className="w-full rounded-t bg-indigo-500/70 transition-colors group-hover:bg-indigo-500"
                    style={{ height: `${(x.n / maxDia) * 100}%` }}
                    title={`${x.dia}: ${fmtNum(x.n)} búsquedas · ${fmtNum(x.visitantes)} visitantes`}
                  />
                  <span className="mt-1 hidden text-[9px] text-slate-400 sm:block">{x.dia.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Términos */}
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <ListaTerminos titulo="Términos más buscados" items={d.topTerminos} vacio="Aún no hay búsquedas con término." token={token!} />
          <ListaTerminos
            titulo="Buscado sin resultados (oportunidades)"
            items={d.ceroResultados}
            vacio="Ninguna búsqueda sin resultados. 🎉"
            token={token!}
            acento="amber"
          />
        </div>

        {/* Adquisición */}
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <ListaClaves titulo="Origen del tráfico (referer)" items={d.referers} />
          <ListaClaves titulo="Países" items={d.paises} />
        </div>

        {/* Recientes */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold">Búsquedas recientes</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2 font-semibold">Hora</th>
                  <th className="px-4 py-2 font-semibold">Término</th>
                  <th className="px-4 py-2 font-semibold">Ámbito</th>
                  <th className="px-4 py-2 text-right font-semibold">Filtros</th>
                  <th className="px-4 py-2 text-right font-semibold">Result.</th>
                  <th className="px-4 py-2 font-semibold">País</th>
                  <th className="px-4 py-2 font-semibold">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {d.recientes.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-400">{r.ts}</td>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200">{r.q ?? <span className="text-slate-400">(solo filtros)</span>}</td>
                    <td className="px-4 py-2 text-slate-500">{r.ambito}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.num_filtros || ""}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${r.num_resultados === 0 ? "text-amber-600" : "text-slate-500"}`}>
                      {fmtNum(r.num_resultados)}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{r.pais ?? "—"}</td>
                    <td className="max-w-[12rem] truncate px-4 py-2 text-slate-400">{r.referer ?? "(directo)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-slate-400">
          No se guarda la IP en claro (solo un hash). Búsquedas registradas de forma anónima.
        </p>
      </main>
    </div>
  );
}
