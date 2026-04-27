'use client'
import { useState } from 'react'

export default function ImpulsosPage() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">⚡ Impulsos</h1>
          <p className="text-zinc-400 text-sm mt-1">Metas y ventas de todas las impulsadoras</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => window.open('/pdf-impulso?fecha=' + mes + '-01', '_blank')}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            📄 Descargar PDF
          </button>
        </div>
      </div>

      <ImpulsosTabla mes={mes} />
    </div>
  )
}

function ImpulsosTabla({ mes }: { mes: string }) {
  const [datos, setDatos] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const { useEffect } = require('react')
  useEffect(() => {
    setLoading(true)
    fetch('/api/impulso/pdf?fecha=' + mes + '-01')
      .then(r => r.json())
      .then(d => { setDatos(d); setLoading(false) })
  }, [mes])

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
  const color = (pct: number | null) => pct === null ? 'text-zinc-500' : pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  if (loading) return <div className="text-zinc-400 text-sm text-center py-12">Cargando...</div>
  if (!datos) return null

  return (
    <div className="space-y-6">
      {datos.impulsadoras?.map((imp: any) => (
        <div key={imp.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-white font-bold">{imp.nombre}</span>
            <span className={['text-sm font-bold', color(imp.pctTotal)].join(' ')}>
              {fmt(imp.totalMes)} / {fmt(imp.totalMeta)}
              {imp.pctTotal !== null && <span className="ml-2">{imp.pctTotal}%</span>}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-400 font-medium px-4 py-2">Cliente</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-2 w-24">Meta</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-2 w-24">Ventas</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-2 w-14">%</th>
              </tr>
            </thead>
            <tbody>
              {imp.semana?.map((dia: any) => (
                <>
                  <tr key={'dia-' + dia.dia} className="border-b border-zinc-800 bg-zinc-800/50">
                    <td className="px-4 py-2 text-zinc-300 font-semibold">{dia.nombre}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 text-xs">{dia.totalMeta > 0 ? fmt(dia.totalMeta) : ''}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 text-xs">{dia.totalMes > 0 ? fmt(dia.totalMes) : ''}</td>
                    <td className={'px-4 py-2 text-right text-xs font-bold ' + color(dia.pctTotal)}>
                      {dia.pctTotal !== null ? dia.pctTotal + '%' : ''}
                    </td>
                  </tr>
                  {dia.puntos?.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                      <td className="px-4 py-2">
                        <span className="text-white">{p.nombre}</span>
                        {p.nombreComercial && <span className="text-zinc-500 text-xs ml-1">— {p.nombreComercial}</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-amber-500 font-medium">{p.meta > 0 ? fmt(p.meta) : '—'}</td>
                      <td className="px-4 py-2 text-right text-blue-400 font-medium">{p.montoMes > 0 ? fmt(p.montoMes) : '—'}</td>
                      <td className={'px-4 py-2 text-right font-bold ' + color(p.pct)}>{p.pct !== null ? p.pct + '%' : '—'}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
