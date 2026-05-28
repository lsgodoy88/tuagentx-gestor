"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Skeleton con efecto shimmer (onda de luz que recorre)
 * Reemplaza el clásico animate-pulse.
 *
 * Uso:
 *   <Skeleton className="h-4 w-3/4" />
 *   <Skeleton className="h-20 rounded-2xl" />
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded ${className}`} />;
}

/**
 * Bloque skeleton tipo card — para listas de clientes, rutas, etc.
 *
 * Uso:
 *   {cargando && Array.from({length: 6}).map((_,i) => <SkeletonCard key={i} />)}
 */
export function SkeletonCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}

/**
 * Punto pulsante para estados live (sincronización activa, conexión OK, etc.)
 *
 * Uso:
 *   <LiveDot /> Sincronizando…
 *   <LiveDot color="emerald" /> En vivo
 */
export function LiveDot({ color = "blue" }: { color?: "blue" | "emerald" | "amber" | "red" }) {
  const colors = {
    blue: { ping: "bg-blue-400", core: "bg-blue-500" },
    emerald: { ping: "bg-emerald-400", core: "bg-emerald-500" },
    amber: { ping: "bg-amber-400", core: "bg-amber-500" },
    red: { ping: "bg-red-400", core: "bg-red-500" },
  };
  const c = colors[color];
  return (
    <span className="relative inline-flex h-2 w-2 align-middle">
      <span className={`absolute inline-flex h-full w-full rounded-full ${c.ping} opacity-75 live-ping`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${c.core}`} />
    </span>
  );
}

/**
 * Anima un número subiendo desde 0 hasta el valor target (ease-out cubic).
 *
 * Uso:
 *   <CountUp end={1248} />
 *   <CountUp end={45200} duration={1000} prefix="$" />
 *   <CountUp end={cliente.saldo} formatter={(n) => n.toLocaleString('es-CO')} />
 */
export function CountUp({
  end,
  duration = 250,
  prefix = "",
  suffix = "",
  formatter,
}: {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  formatter?: (n: number) => string;
}) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setVal(Math.floor(end * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setVal(end);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [end, duration]);

  const display = formatter ? formatter(val) : val.toLocaleString("es-CO");
  return <>{prefix}{display}{suffix}</>;
}

/**
 * Wrapper que aplica fade-up + stagger a sus hijos.
 *
 * Uso:
 *   <StaggerList>
 *     {clientes.map(c => <ClienteCard key={c.id} cliente={c} />)}
 *   </StaggerList>
 *
 * Cada hijo aparece con 50ms de delay incremental hasta el item 8.
 */
export function StaggerList({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className={className}>
      {items.map((child, i) => (
        <div key={i} className={`fade-up stagger-${Math.min(i + 1, 8)}`}>
          {child}
        </div>
      ))}
    </div>
  );
}

/**
 * Check animado para feedback de éxito.
 *
 * Uso:
 *   {ok && <SuccessCheck label="Guardado" />}
 */
export function SuccessCheck({ label = "Listo" }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 fade-up">
      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
        <svg className="w-4 h-4 text-white scale-in" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l5 5L20 7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="text-emerald-400 text-sm font-semibold">{label}</span>
    </div>
  );
}


/**
 * Envuelve cualquier card y le agrega un borde brillante mientras está cargando.
 *
 * Uso:
 *   <LoadingBorder loading={cargando}>
 *     <div className="bg-zinc-900 rounded-2xl p-4">contenido</div>
 *   </LoadingBorder>
 *
 *   <LoadingBorder loading={loading} color="emerald" variant="rotate">
 *     <div>...</div>
 *   </LoadingBorder>
 */
export function LoadingBorder({
  loading,
  children,
  color = "blue",
  variant = "rotate",
  className = "",
}: {
  loading: boolean;
  children: React.ReactNode;
  color?: "blue" | "emerald" | "amber" | "red";
  variant?: "rotate" | "pulse";
  className?: string;
}) {
  if (!loading) return <div className={className}>{children}</div>;
  
  const cls =
    variant === "rotate"
      ? `loading-border${color !== "blue" ? ` loading-border-${color}` : ""}`
      : `glow-pulse${color !== "blue" ? `-${color}` : ""}`;
  
  return <div className={`rounded-2xl ${cls} ${className}`}>{children}</div>;
}
