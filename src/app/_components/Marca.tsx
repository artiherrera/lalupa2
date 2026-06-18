import Link from "next/link";

/**
 * Marca institucional de La Lupa (isotipo + wordmark). Centralizada para que el
 * branding sea consistente entre el buscador y la página de carga.
 */
export function Marca({
  subtitulo = "Contratos públicos · México",
}: {
  subtitulo?: string;
}) {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="La Lupa — inicio">
      {/* Isotipo: emblema circular azul marino con lupa */}
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="m20 20-4.8-4.8" strokeLinecap="round" />
        </svg>
      </span>
      {/* Wordmark */}
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold uppercase tracking-[0.2em] text-brand dark:text-slate-100">
          La&nbsp;Lupa
        </span>
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-brand-accent">
          {subtitulo}
        </span>
      </span>
    </Link>
  );
}
