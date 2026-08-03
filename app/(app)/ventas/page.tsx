'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

type Vendedor = { nombre: string; ventas: number; recaudo: number; ordenes: number; cobros: number; meta?: number }
type Mes = { mes: string; totalVentas: number; totalRecaudo: number; vendedores: Record<string, Vendedor> }

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const fmtShort = (n: number) => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return fmt(n)
}
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const fmtMes = (k: string) => {
  const [y, m] = k.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

function TablaVentas({ meses, esAdmin }: { meses: Mes[], esAdmin: boolean }) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const total = meses.reduce((a, m) => a + m.totalVentas, 0)
  const metaGlobal = meses.reduce((a, m) => a + Object.values(m.vendedores).reduce((s, v: any) => s + (v.meta || 0), 0), 0)
  const pctGlobal = metaGlobal > 0 ? Math.round((total / metaGlobal) * 100) : null

  return (
    <div className="rounded-2xl border" style={{ borderColor: '#1a3557', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ minWidth: 340, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f1e35' }}>
            <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'left', borderBottom: '1px solid #1a3557', borderRight: '1px solid #1a3557', width: '35%' }}>Mes</th>
            <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #1a3557', borderRight: '1px solid #1a3557', width: '25%' }}>Ventas</th>
            {esAdmin && <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #1a3557', borderRight: '1px solid #1a3557', width: '25%' }}>Meta</th>}
            {esAdmin && <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #1a3557' }}>%</th>}
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => {
            const abierto = expandidos.has(m.mes)
            const vendedores = Object.values(m.vendedores as Record<string, Vendedor>)
              .filter(v => v.ventas > 0)
              .sort((a, b) => b.ventas - a.ventas)
            const clickable = esAdmin && vendedores.length > 0
            return (
              <>
                <tr key={m.mes}
                  onClick={() => { if (!clickable) return; setExpandidos(prev => { const s = new Set(prev); abierto ? s.delete(m.mes) : s.add(m.mes); return s }) }}
                  style={{ background: i % 2 === 0 ? '#0d1b2e' : '#0a1628', cursor: clickable ? 'pointer' : 'default' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#e2e8f0', whiteSpace: 'nowrap', borderBottom: abierto ? 'none' : '1px solid #1e2a3d', borderRight: '1px solid #1a3557', textTransform: 'capitalize' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {clickable && <span style={{ fontSize: 10, color: '#475569', transition: 'transform 0.2s', display: 'inline-block', transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>}
                      {fmtMes(m.mes)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#34d399', textAlign: 'right', borderBottom: abierto ? 'none' : '1px solid #1e2a3d', borderRight: esAdmin ? '1px solid #1a3557' : undefined }}>
                    {fmt(m.totalVentas)}
                  </td>
                  {esAdmin && (() => {
                    const metaTotal = vendedores.reduce((a, v) => a + ((v as any).meta || 0), 0)
                    const pct = metaTotal > 0 ? Math.round((m.totalVentas / metaTotal) * 100) : null
                    return (<>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#fff', textAlign: 'right', borderBottom: abierto ? 'none' : '1px solid #1e2a3d', borderRight: '1px solid #1a3557' }}>{metaTotal > 0 ? fmt(metaTotal) : '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: pct === null ? '#4b5563' : pct >= 100 ? '#34d399' : '#fbbf24', textAlign: 'right', borderBottom: abierto ? 'none' : '1px solid #1e2a3d' }}>{pct !== null ? pct + '%' : '—'}</td>
                    </>)
                  })()}
                </tr>
                {abierto && (() => {
                  const asignados = vendedores.filter(v => v.nombre !== 'Sin asignar')
                  const otros = vendedores.filter(v => v.nombre === 'Sin asignar')
                  const otrosTotal = otros.reduce((a, v) => a + v.ventas, 0)
                  const filas = otrosTotal > 0
                    ? [...asignados, { nombre: 'Otros', ventas: otrosTotal, recaudo: 0, ordenes: 0, cobros: 0 }]
                    : asignados
                  return filas.map((v, vi) => {
                    const vMeta = (v as any).meta || 0
                    const vPct = vMeta > 0 ? Math.round((v.ventas / vMeta) * 100) : null
                    return (
                    <tr key={v.nombre + vi} style={{ background: '#081422' }}>
                      <td style={{ padding: '7px 12px 7px 24px', fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: vi === filas.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35', borderRight: '1px solid #1a3557' }}>
                        {(() => { const p = v.nombre.trim().split(' '); return p[0] + (p[1] ? ' ' + p[1] : '') })()}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#6ee7b7', textAlign: 'right', borderBottom: vi === filas.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35', borderRight: '1px solid #1a3557' }}>
                        {fmt(v.ventas)}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: '#fff', textAlign: 'right', borderBottom: vi === filas.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35', borderRight: '1px solid #1a3557' }}>
                        {vMeta > 0 ? fmt(vMeta) : '—'}
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, color: vPct === null ? '#4b5563' : vPct >= 100 ? '#34d399' : '#fbbf24', textAlign: 'right', borderBottom: vi === filas.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35' }}>
                        {vPct !== null ? vPct + '%' : '—'}
                      </td>
                    </tr>
                  )})
                })()}
              </>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: '#0f1e35' }}>
            <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#94a3b8', borderTop: '1px solid #1a3557', borderRight: '1px solid #1a3557' }}>Total</td>
            <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#34d399', textAlign: 'right', borderTop: '1px solid #1a3557', borderRight: esAdmin ? '1px solid #1a3557' : undefined }}>{fmt(total)}</td>
            {esAdmin && <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'right', borderTop: '1px solid #1a3557', borderRight: '1px solid #1a3557' }}>{metaGlobal > 0 ? fmt(metaGlobal) : '—'}</td>}
            {esAdmin && <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: pctGlobal === null ? '#4b5563' : pctGlobal >= 100 ? '#34d399' : '#fbbf24', textAlign: 'right', borderTop: '1px solid #1a3557' }}>{pctGlobal !== null ? pctGlobal + '%' : '—'}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

const TABS = [
  { id: 'ventas', label: '💼 Ventas' },
  { id: 'postventa', label: '📦 Postventa' },
]

export default function VentasPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<'ventas' | 'postventa'>('ventas')
  const [meses, setMeses] = useState<Mes[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const role = (session?.user as any)?.role

  useEffect(() => {
    if (status === 'loading') return
    if (!session || !['empresa', 'supervisor', 'vendedor'].includes(role)) {
      router.replace('/inicio'); return
    }
    fetch('/api/stats/historico')
      .then(r => r.json())
      .then(d => { if (d.meses) setMeses(d.meses); else setError(d.error || 'Error') })
      .catch(() => setError('Error de red'))
      .finally(() => setLoading(false))
  }, [status])

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'tab-active' : 'text-white hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Ventas */}
      {tab === 'ventas' && (
        <div className="fade-up">
          {loading && <p className="text-center text-sm mt-16" style={{ color: '#475569' }}>Cargando...</p>}
          {error && <p className="text-center text-sm mt-16" style={{ color: '#f87171' }}>{error}</p>}
          {!loading && !error && meses.length === 0 && (
            <p className="text-center text-sm mt-16" style={{ color: '#475569' }}>Sin datos históricos</p>
          )}
          <TablaVentas meses={meses} esAdmin={["empresa","supervisor"].includes(role)} />
        </div>
      )}

      {/* Tab Postventa — pendiente */}
      {tab === 'postventa' && (
        <div className="fade-up flex flex-col items-center justify-center mt-20 gap-3">
          <span className="text-4xl">📦</span>
          <p className="text-sm" style={{ color: '#475569' }}>Próximamente</p>
        </div>
      )}
    </div>
  )
}
