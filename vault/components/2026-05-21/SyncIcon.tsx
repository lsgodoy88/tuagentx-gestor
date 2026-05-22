"use client";

/**
 * Icono SVG moderno de sincronización (estilo Lucide).
 * Cuando spinning=true, gira con animación CSS.
 *
 * Uso:
 *   <SyncIcon spinning={sincronizando} />
 *   <SyncIcon spinning={sincronizando} className="w-5 h-5 text-emerald-400" />
 */
export function SyncIcon({
  spinning = false,
  className = "w-4 h-4",
}: {
  spinning?: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${spinning ? "sync-icon-spinning" : ""}`}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}
