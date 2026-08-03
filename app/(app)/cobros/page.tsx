'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

type Vendedor = { nombre: string; recaudo: number; cobros: number; meta?: number }
type Mes = { mes: string; totalRecaudo: number; vendedores: Record<string, Vendedor> }

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const fmtMes = (k: string) => { const [y, m] = k.split('-'); return `${MESES[Number(m) - 1]} ${y}` }

export default function CobrosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [meses, setMeses] = useState<Mes[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const role = (session?.user as any)?.role

  useEffect(() => {
    if (status === 'loading') return
    if (!session || !['empresa', 'supervisor'].includes(role)) { router.replace('/inicio'); return }
    fetch('/api/stats/historico-cobros')
      .then(r => r.json())
      .then(d => { if (d.meses) setMeses(d.meses); else setError(d.error || 'Error') })
      .catch(() => setError('Error de red'))
      .finally(() => setLoading(false))
  }, [status])

  const total = meses.reduce((a, m) => a + m.totalRecaudo, 0)
  const metaGlobal = meses.reduce((a, m) => a + Object.values(m.vendedores).reduce((s, v: any) => s + (v.meta || 0), 0), 0)
  const pctGlobal = metaGlobal > 0 ? Math.round((total / metaGlobal) * 100) : null

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <h2 className="text-lg font-bold text-white px-1">💰 Histórico Recaudos</h2>

      {loading && <p className="text-center text-sm mt-16" style={{ color: '#475569' }}>Cargando...</p>}
      {error && <p className="text-center text-sm mt-16" style={{ color: '#f87171' }}>{error}</p>}
      {!loading && !error && meses.length === 0 && (
        <p className="text-center text-sm mt-16" style={{ color: '#475569' }}>Sin datos históricos</p>
      )}

      {!loading && !error && meses.length > 0 && (
        <div className="rounded-2xl border" style={{ borderColor: '#1a3557', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: 340, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0f1e35' }}>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'left', borderBottom: '1px solid #1a3557', borderRight: '1px solid #1a3557', width: '35%' }}>Mes</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #1a3557', borderRight: '1px solid #1a3557', width: '25%' }}>Recaudo</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #1a3557', borderRight: '1px solid #1a3557', width: '25%' }}>Meta</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #1a3557', width: '15%' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m, i) => {
                const abierto = expandidos.has(m.mes)
                const vendedores = Object.values(m.vendedores).filter(v => v.recaudo > 0).sort((a, b) => b.recaudo - a.recaudo)
                const clickable = vendedores.length > 0
                const metaTotal = vendedores.reduce((a, v) => a + (v.meta || 0), 0)
                const pct = metaTotal > 0 ? Math.round((m.totalRecaudo / metaTotal) * 100) : null
                return (
                  <>
                    <tr key={m.mes}
                      onClick={() => clickable && setExpandidos(prev => { const s = new Set(prev); abierto ? s.delete(m.mes) : s.add(m.mes); return s })}
                      style={{ background: i % 2 === 0 ? '#0d1b2e' : '#0a1628', cursor: clickable ? 'pointer' : 'default' }}>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#e2e8f0', whiteSpace: 'nowrap', borderBottom: abierto ? 'none' : '1px solid #1e2a3d', borderRight: '1px solid #1a3557' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {clickable && <span style={{ fontSize: 10, color: '#475569', display: 'inline-block', transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>}
                          {fmtMes(m.mes)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#60a5fa', textAlign: 'right', borderBottom: abierto ? 'none' : '1px solid #1e2a3d', borderRight: '1px solid #1a3557' }}>{fmt(m.totalRecaudo)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#fff', textAlign: 'right', borderBottom: abierto ? 'none' : '1px solid #1e2a3d', borderRight: '1px solid #1a3557' }}>{metaTotal > 0 ? fmt(metaTotal) : '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: pct === null ? '#4b5563' : pct >= 100 ? '#34d399' : '#fbbf24', textAlign: 'right', borderBottom: abierto ? 'none' : '1px solid #1e2a3d' }}>{pct !== null ? pct + '%' : '—'}</td>
                    </tr>
                    {abierto && vendedores.map((v, vi) => {
                      const vPct = (v.meta || 0) > 0 ? Math.round((v.recaudo / v.meta!) * 100) : null
                      return (
                        <tr key={v.nombre + vi} style={{ background: '#081422' }}>
                          <td style={{ padding: '7px 12px 7px 24px', fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: vi === vendedores.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35', borderRight: '1px solid #1a3557' }}>
                            {(() => { const p = v.nombre.trim().split(' '); return p[0] + (p[1] ? ' ' + p[1] : '') })()}
                          </td>
                          <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#60a5fa', textAlign: 'right', borderBottom: vi === vendedores.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35', borderRight: '1px solid #1a3557' }}>{fmt(v.recaudo)}</td>
                          <td style={{ padding: '7px 12px', fontSize: 12, color: '#fff', textAlign: 'right', borderBottom: vi === vendedores.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35', borderRight: '1px solid #1a3557' }}>{(v.meta || 0) > 0 ? fmt(v.meta!) : '—'}</td>
                          <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, color: vPct === null ? '#4b5563' : vPct >= 100 ? '#34d399' : '#fbbf24', textAlign: 'right', borderBottom: vi === vendedores.length - 1 ? '1px solid #1e2a3d' : '1px solid #0f1e35' }}>{vPct !== null ? vPct + '%' : '—'}</td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0f1e35' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#94a3b8', borderTop: '1px solid #1a3557', borderRight: '1px solid #1a3557' }}>Total</td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#60a5fa', textAlign: 'right', borderTop: '1px solid #1a3557', borderRight: '1px solid #1a3557' }}>{fmt(total)}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'right', borderTop: '1px solid #1a3557', borderRight: '1px solid #1a3557' }}>{metaGlobal > 0 ? fmt(metaGlobal) : '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: pctGlobal === null ? '#4b5563' : pctGlobal >= 100 ? '#34d399' : '#fbbf24', textAlign: 'right', borderTop: '1px solid #1a3557' }}>{pctGlobal !== null ? pctGlobal + '%' : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
