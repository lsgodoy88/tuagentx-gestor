'use client'
import { useEffect, useState } from 'react'
import { CountUp, LiveDot } from '@/components/FX'
import SaludoBlock from '@/components/SaludoBlock'

type Producto = { nombre: string; inventory: number; stockMinimo?: number }
type EmpresaStats = {
  id: string
  nombre: string
  slug: string
  pendientes: number
  alistados: number
  entregados: number
  agotados: Producto[]
  stockBajo: Producto[]
}

export default function DashboardBodega({ user }: { user: any }) {
  const [empresas, setEmpresas] = useState<EmpresaStats[]>([])

  useEffect(() => {
    fetch('/api/bodega/contadores')
      .then(r => r.json())
      .then(d => setEmpresas(d.empresas || []))
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-4 pb-20 md:max-w-2xl md:mx-auto">
      <SaludoBlock nombre={user?.name} />

      {empresas.length === 0 ? (
        // Skeleton
        <div className="space-y-3">
          {[0,1].map(i => (
            <div key={i} className="rounded-2xl p-4" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)'}}>
              <div className="h-4 w-24 rounded shimmer mb-3" />
              <div className="grid grid-cols-3 gap-2">
                {[0,1,2].map(j => (
                  <div key={j} className="text-center">
                    <div className="h-8 w-12 mx-auto rounded shimmer mb-1" />
                    <div className="h-3 w-16 mx-auto rounded shimmer" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {empresas.map(e => (
            <div key={e.id} className="rounded-2xl p-4"
              style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)'}}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">📦 {e.nombre}</h3>
                <a href={`/bodega/${e.slug}`} className="text-emerald-400 text-xs font-medium">
                  Ver órdenes →
                </a>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400 flex items-center justify-center gap-1.5">
                    <CountUp end={e.pendientes} />
                    {e.pendientes > 0 && <LiveDot color="amber" />}
                  </p>
                  <p className="text-zinc-200 text-xs">🟡 Pendientes</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400"><CountUp end={e.alistados} /></p>
                  <p className="text-zinc-200 text-xs">🟢 Alistados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400"><CountUp end={e.entregados} /></p>
                  <p className="text-zinc-200 text-xs">✅ Entregados</p>
                </div>
              </div>

              {/* Alertas stock */}
              {(e.agotados?.length > 0 || e.stockBajo?.length > 0) && (
                <a href={`/bodega/${e.slug}?tab=inventario`}
                  className="block mt-3 pt-3 border-t border-white/10 no-underline">
                  <div className="space-y-2">
                    {e.agotados?.length > 0 && (
                      <div>
                        <p className="text-red-400 text-xs font-semibold mb-1">🔴 Agotados ({e.agotados.length})</p>
                        {e.agotados.map((p: Producto) => (
                          <div key={p.nombre} className="flex gap-1 text-xs text-zinc-100">
                            <span className="flex-shrink-0">·</span>
                            <span>{p.nombre}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {e.stockBajo?.length > 0 && (
                      <div>
                        <p className="text-amber-400 text-xs font-semibold mb-1">🟠 Por agotarse</p>
                        {e.stockBajo.map((p: Producto) => (
                          <div key={p.nombre} className="flex gap-1 text-xs text-zinc-100">
                            <span className="flex-shrink-0">·</span>
                            <span>{p.nombre} <span className="text-amber-400">({p.inventory} unid)</span></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
