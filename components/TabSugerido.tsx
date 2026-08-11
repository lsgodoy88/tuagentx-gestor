'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'

const numFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const fmt = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(Math.round(n))
const fmtNum = (n: number) => numFmt.format(n)

const tdBase: React.CSSProperties = { padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #131c2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const thBase: React.CSSProperties = { padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'white', textAlign: 'center', userSelect: 'none', whiteSpace: 'nowrap', borderRight: '1px solid #1e2a3d', background: '#0d1220' }

export default function TabSugerido({ empresaId }: { empresaId: string }) {
  const [productos, setProductos] = useState<any[]>([])
  const [promedios, setPromedios] = useState<Record<string, { promedio: number; total_guardados: number }>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [resStock, resProm] = await Promise.all([
        fetch(`/api/stock?limit=500&page=1${empresaId && empresaId !== 'propia' ? '&origenId=' + empresaId : ''}`),
        fetch('/api/stock/sugerido'),
      ])
      const dataStock = await resStock.json()
      const dataProm = await resProm.json()
      const conSugerido = (dataStock.productos ?? []).filter((p: any) => p.stockSugerido != null)
      setProductos(conSugerido)
      setPromedios(dataProm.promedios ?? {})
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const totalAcumulado = useMemo(() => productos.reduce((acc, p) => {
    const diferencia = Math.max(0, (p.stockSugerido ?? 0) - p.inventory)
    return acc + diferencia * (p.costo ?? 0)
  }, 0), [productos])

  const guardar = async () => {
    if (productos.length === 0) return
    setGuardando(true); setMsg('')
    const items = productos.map(p => ({
      productoId: p.id, nombre: p.nombre,
      costo: p.costo ?? null,
      sugerido: p.stockSugerido,
      diferencia: Math.max(0, (p.stockMinimo ?? 0) - p.inventory),
    }))
    try {
      const res = await fetch('/api/stock/sugerido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      const d = await res.json()
      if (d.ok) { setMsg(`✅ ${d.guardados} guardados`); await cargar() }
      else setMsg('❌ ' + (d.error || 'Error'))
    } catch { setMsg('❌ Error de red') }
    finally { setGuardando(false); setTimeout(() => setMsg(''), 4000) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )

  if (productos.length === 0) return (
    <div className="rounded-xl border border-[#1e2a3d] bg-[#0a0f1a] p-10 text-center text-zinc-500 text-sm">
      <p className="text-4xl mb-3">💡</p>
      <p>Ningún producto con sugerido aún.</p>
      <p className="text-xs mt-1">Edita la columna 💡 Sugerir en la tab Inventario.</p>
    </div>
  )

  return (
    <div className="rounded-xl border border-yellow-500/30 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ background: '#0a0f1a' }}>
          <thead>
            <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
              {['Producto', 'Diferencia', 'Costo', 'Sugerido', 'Promedio', 'Total'].map(label => (
                <th key={label} style={thBase}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productos.map((p, i) => {
              const diferencia = Math.max(0, (p.stockMinimo ?? 0) - p.inventory)
              const total = diferencia * (p.costo ?? 0)
              const prom = promedios[p.id]
              return (
                <tr key={p.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{ ...tdBase, color: 'white', fontWeight: 500 }} title={p.nombre}>{p.nombre}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#f87171' }}>{fmtNum(diferencia)}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#67e8f9' }}>{p.costo != null ? fmt(p.costo) : '—'}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#fde047' }}>{fmtNum(p.stockSugerido)}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#a78bfa' }}>
                    {prom
                      ? <span title={`${prom.total_guardados} guardado${prom.total_guardados !== 1 ? 's' : ''}`}>{fmtNum(prom.promedio)}</span>
                      : <span className="text-zinc-600">—</span>}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>
                    {p.costo != null ? fmt(total) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>

        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e2a3d] bg-[#0d1220]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Total acumulado</span>
          <span className="text-sm font-bold text-emerald-400">{fmt(totalAcumulado)}</span>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-zinc-300">{msg}</span>}
          <button onClick={guardar} disabled={guardando}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-50 transition">
            {guardando ? '⏳…' : '💾 Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
