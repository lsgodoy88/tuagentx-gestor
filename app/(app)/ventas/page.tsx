'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

type Vendedor = { nombre: string; ventas: number; recaudo: number; ordenes: number; cobros: number }
type Mes = { mes: string; totalVentas: number; totalRecaudo: number; vendedores: Vendedor[] }

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

function TablaVentas({ meses }: { meses: Mes[] }) {
  const total = meses.reduce((a, m) => a + m.totalVentas, 0)
  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#1a3557' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f1e35' }}>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#94a3b8', textAlign: 'left', borderBottom: '1px solid #1a3557', borderRight: '1px solid #1a3557' }}>Mes</th>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#94a3b8', textAlign: 'right', borderBottom: '1px solid #1a3557' }}>Ventas</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => (
            <tr key={m.mes} style={{ background: i % 2 === 0 ? '#0d1b2e' : '#0a1628' }}>
              <td style={{ padding: '11px 14px', fontSize: 14, color: '#e2e8f0', borderBottom: '1px solid #1e2a3d', borderRight: '1px solid #1a3557', textTransform: 'capitalize' }}>
                {fmtMes(m.mes)}
              </td>
              <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 700, color: '#34d399', textAlign: 'right', borderBottom: '1px solid #1e2a3d' }}>
                {fmt(m.totalVentas)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#0f1e35' }}>
            <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#94a3b8', borderTop: '1px solid #1a3557', borderRight: '1px solid #1a3557' }}>Total</td>
            <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 700, color: '#34d399', textAlign: 'right', borderTop: '1px solid #1a3557' }}>{fmt(total)}</td>
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
          <TablaVentas meses={meses} />
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
