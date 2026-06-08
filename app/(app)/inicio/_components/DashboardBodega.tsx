'use client'
import { useEffect, useState } from 'react'
import { CountUp, LiveDot } from '@/components/FX'

export default function DashboardBodega({ user }: { user: any }) {
  const [stats, setStats] = useState<{ pendientes: number; alistados: number; entregados: number } | null>(null)

  useEffect(() => {
    fetch('/api/bodega/contadores')
      .then(r => r.json())
      .then(d => setStats({
        pendientes: d.pendientes ?? 0,
        alistados:  d.alistados  ?? 0,
        entregados: d.entregados ?? 0,
      }))
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-4 pb-20">
      <h1 className="text-2xl font-bold text-white px-1">Bienvenido, {user?.name?.split(' ')[0]}</h1>

      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-sm">📦 Órdenes bodega hoy</h3>
          <a href="/ordenes" className="text-emerald-400 text-xs">Ver órdenes →</a>
        </div>
        {stats ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400 flex items-center justify-center gap-1.5">
                <CountUp end={stats.pendientes} />
                {stats.pendientes > 0 && <LiveDot color="amber" />}
              </p>
              <p className="text-zinc-500 text-xs">🟡 Pendientes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400"><CountUp end={stats.alistados} /></p>
              <p className="text-zinc-500 text-xs">🟢 Alistados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400"><CountUp end={stats.entregados} /></p>
              <p className="text-zinc-500 text-xs">✅ Entregados</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[0,1,2].map(i => (
              <div key={i} className="text-center">
                <div className="h-8 w-12 mx-auto rounded shimmer mb-1" />
                <div className="h-3 w-16 mx-auto rounded shimmer" />
              </div>
            ))}
          </div>
        )}
      </div>

      <a href="/ordenes"
        className="block w-full text-center py-3 rounded-xl text-white font-semibold text-sm"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
        📋 Ver todas las órdenes
      </a>
    </div>
  )
}
