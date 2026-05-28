// loading.tsx — se muestra INSTANTÁNEAMENTE mientras el chunk de la página carga
// Next.js App Router lo envuelve en Suspense automáticamente
// Sin JS, sin fetch — aparece en 0ms y desaparece cuando la página está lista
export default function Loading() {
  return (
    <div className="space-y-3 pb-20 max-w-5xl mx-auto px-1 pt-1">
      {/* Barra superior skeleton */}
      <div
        className="animate-pulse rounded-2xl"
        style={{
          height: 44,
          background: 'rgba(148,160,185,0.15)',
          border: '1px solid rgba(148,180,255,0.12)',
        }}
      />
      {/* Cards skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map(i => (
          <div
            key={i}
            className="animate-pulse rounded-2xl"
            style={{
              height: 96,
              background: 'rgba(148,160,185,0.12)',
              border: '1px solid rgba(148,180,255,0.10)',
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>
      {/* Bloque ancho skeleton */}
      <div
        className="animate-pulse rounded-2xl"
        style={{
          height: 80,
          background: 'rgba(148,160,185,0.12)',
          border: '1px solid rgba(148,180,255,0.10)',
          animationDelay: '160ms',
        }}
      />
      <div
        className="animate-pulse rounded-2xl"
        style={{
          height: 80,
          background: 'rgba(148,160,185,0.12)',
          border: '1px solid rgba(148,180,255,0.10)',
          animationDelay: '240ms',
        }}
      />
      {/* Lista skeleton */}
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="animate-pulse rounded-xl"
          style={{
            height: 56,
            background: 'rgba(148,160,185,0.09)',
            border: '1px solid rgba(148,180,255,0.08)',
            animationDelay: `${300 + i * 60}ms`,
          }}
        />
      ))}
    </div>
  )
}
