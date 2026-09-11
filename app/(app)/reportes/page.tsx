'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SelectorMes from '@/components/SelectorMes'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const fmtN = (n: number) => Math.round(n).toLocaleString('es-CO')

// Gauge SVG — estándar para todos los gráficos
function Gauge({ pct, label, sub, colorTrack, colorFill }: {
  pct: number, label: string, sub?: string, colorTrack?: string, colorFill?: string
}) {
  const r = 48, circ = 2 * Math.PI * r
  const p = Math.min(Math.max(pct, 0), 100)
  const dash = (p / 100) * circ
  const track = colorTrack || 'rgba(255,255,255,0.35)'
  const fill = colorFill || '#3b82f6'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 500 }}>{label}</div>
      <div style={{ position: 'relative', width: 112, height: 112, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="112" height="112" viewBox="0 0 112 112">
          <circle cx="56" cy="56" r={r} fill="none" stroke={track} strokeWidth="12" />
          <circle cx="56" cy="56" r={r} fill="none" stroke={fill} strokeWidth="12"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 56 56)" />
        </svg>
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#ffffff' }}>{Math.round(p)}%</div>
          {sub && <div style={{ fontSize: 10, color: '#4b6080', marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
    </div>
  )
}

function Dona({ main, gasto, label, total, gastoPct }: { main: number, gasto: number, label: string, total: number, gastoPct: number }) {
  const pct = total > 0 ? Math.round((total - gasto) / total * 100) : 0
  return <Gauge pct={pct} label={label} sub={`gastos ${gastoPct}%`} colorTrack="rgba(255,255,255,0.35)" colorFill="#3b82f6" />
}

function DonaRecaudo({ ventas, recaudos, label }: { ventas: number, recaudos: number, label: string }) {
  const pct = ventas > 0 ? Math.round(recaudos / ventas * 100) : 0
  return <Gauge pct={pct} label={label} sub="cobrado" colorTrack="rgba(255,255,255,0.35)" colorFill="#10b981" />
}

export default function ReportesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [tab, setTab] = useState<'empresa' | 'vendedores' | 'impulsadoras'>('empresa')
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [dataV, setDataV] = useState<any[]>([])
  const [dataI, setDataI] = useState<any[]>([])
  const [iaTextos, setIaTextos] = useState<Record<string, string>>({})
  const [iaEmpresa, setIaEmpresa] = useState('')
  const [iaEmpresaLoading, setIaEmpresaLoading] = useState(false)
  const [categorias, setCategorias] = useState<any[]>([])
  const [catFiltroEmp, setCatFiltroEmp] = useState('') // filtro empresa: categoría egreso
  const [metaVentaTotal, setMetaVentaTotal] = useState(0)
  const [metaRecaudoTotal, setMetaRecaudoTotal] = useState(0)
  const [iaLoading, setIaLoading] = useState<Record<string, boolean>>({})



  useEffect(() => {
    if (!session) return
    cargar()
  }, [mes, anio, session])

  async function cargar() {
    setLoading(true)
    const empresaId = user?.empresaId || user?.id
    const params = `mes=${mes}&anio=${anio}&empresaId=${empresaId}`
    const [rv, ri, rc] = await Promise.all([
      fetch(`/api/reportes/vendedores?${params}`).then(r => r.json()),
      fetch(`/api/reportes/impulsadoras?${params}`).then(r => r.json()),
      fetch(`/api/reportes/categorias?${params}`).then(r => r.json()),
    ])
    setDataV(rv.data || [])
    setDataI(ri.data || [])
    setCategorias(rc.data || [])
    setMetaVentaTotal(rv.metaVentaTotal || 0)
    setMetaRecaudoTotal(rv.metaRecaudoTotal || 0)
    setIaTextos({})
    setLoading(false)
  }

  async function evaluar(id: string, tipo: 'vendedor' | 'impulsadora', empleado: string, datos: any) {
    setIaLoading(prev => ({ ...prev, [id]: true }))
    const equipo = tipo === 'vendedor' ? dataV : dataI
    const r = await fetch('/api/reportes/evaluar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, empleado, datos, equipo, mes, anio })
    }).then(r => r.json())
    setIaTextos(prev => ({ ...prev, [id]: r.texto || 'Sin análisis.' }))
    setIaLoading(prev => ({ ...prev, [id]: false }))
  }

  const mesStr = `${anio}-${String(mes).padStart(2, '0')}`

  if (status === 'loading' || !session) return null
  if (!['empresa','supervisor'].includes(user?.role)) return null

  return (
    <div className="space-y-4 pb-28 max-w-7xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {[
          { key: 'empresa', label: 'Empresa' },
          { key: 'vendedores', label: 'Vendedores' },
          { key: 'impulsadoras', label: 'Impulsos' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tab === t.key ? 'tab-active' : 'text-white hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Selector mes */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SelectorMes
          value={mesStr}
          onChange={v => { const [a, m] = v.split('-'); setAnio(Number(a)); setMes(Number(m)) }}
        />
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#4b6080', fontSize: 13 }}>Cargando datos...</div>
      )}

      {/* VENDEDORES */}
      {/* EMPRESA — totales consolidados */}
      {!loading && tab === 'empresa' && (() => {
        const totalVentas = dataV.reduce((s, e) => s + e.ventas, 0)
        const totalRecaudos = dataV.reduce((s, e) => s + e.recaudos, 0)
        const totalGastosV = dataV.reduce((s, e) => s + e.gastos, 0)
        const totalVentasI = dataI.reduce((s, e) => s + e.ventas, 0)
        const totalGastosI = dataI.reduce((s, e) => s + e.gastos, 0)
        const totalGastos = totalGastosV + totalGastosI
        const totalVentasTodo = totalVentas + totalVentasI
        const pctGasto = totalVentasTodo > 0 ? Math.round(totalGastos / totalVentasTodo * 100) : 0
        const pctCartera = totalVentas > 0 ? Math.round((totalVentas - totalRecaudos) / totalVentas * 100) : 0
        const pctRecaudo = totalVentas > 0 ? Math.round(totalRecaudos / totalVentas * 100) : 0
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Card empresa — mismo patrón que empleado */}
            <div style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>Resumen empresa</div>
                <button onClick={async () => {
                  setIaEmpresaLoading(true)
                  const r = await fetch('/api/reportes/evaluar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo: 'empresa', empleado: 'Empresa', datos: { ventas: totalVentasTodo, recaudos: totalRecaudos, gastos: totalGastos, cartera: totalVentas - totalRecaudos, ventasI: totalVentasI, gastosI: totalGastosI }, equipo: [], mes, anio })
                  }).then(r => r.json())
                  setIaEmpresa(r.texto || '')
                  setIaEmpresaLoading(false)
                }} disabled={iaEmpresaLoading}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid #1e3a5f', background: 'transparent', color: '#60a5fa', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {iaEmpresaLoading ? '⏳ Analizando...' : '✨ Evaluar con IA'}
                </button>
              </div>
              {/* Dropdown centrado */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <select value={catFiltroEmp} onChange={e => setCatFiltroEmp(e.target.value)}
                  className={`bg-[#0d1220] text-white rounded-lg px-3 py-2 text-sm focus:outline-none cursor-pointer ${catFiltroEmp ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}
                  style={{ width: '60%' }}>
                  <option value="">Total gastos</option>
                  <option value="__egresos">Total egresos</option>
                  {categorias.map(c => (
                    <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const totalEgresos = categorias.reduce((s: number, c: any) => s + c.total, 0)
                let gastoFiltrado = totalGastos
                if (catFiltroEmp === '__egresos') gastoFiltrado = totalEgresos
                else if (catFiltroEmp) gastoFiltrado = categorias.find((c: any) => c.key === catFiltroEmp)?.total ?? 0
                const pctVenta = totalVentasTodo > 0 ? Math.min(Math.round(gastoFiltrado / totalVentasTodo * 100), 100) : 0
                const pctRecaudo = totalRecaudos > 0 ? Math.min(Math.round(gastoFiltrado / totalRecaudos * 100), 100) : 0
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                    <Gauge pct={pctVenta} label="VS VENTA" colorFill="#3b82f6" />
                    <Gauge pct={pctRecaudo} label="VS RECAUDO" colorFill="#10b981" />
                  </div>
                )
              })()}
              {(() => {
                const gastoMostrar = catFiltroEmp
                  ? (categorias.find(c => c.key === catFiltroEmp)?.total ?? 0)
                  : totalGastos
                const catLabel = catFiltroEmp
                  ? (categorias.find(c => c.key === catFiltroEmp)?.label ?? 'Gastos')
                  : 'Gastos'
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                    {[
                      { label: 'Ventas', val: fmt(totalVentasTodo), color: '#60a5fa' },
                      { label: 'Recaudos', val: fmt(totalRecaudos), color: '#34d399' },
                      { label: catLabel, val: fmt(gastoMostrar), color: '#f87171' },
                    ].map(k => (
                      <div key={k.label} style={{ background: '#0d1220', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#ffffff', marginBottom: 3 }}>{k.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: k.color }}>{k.val}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {iaEmpresa && (
                <div style={{ marginTop: 12, background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 500, marginBottom: 6 }}>✨ Análisis IA</div>
                  <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{iaEmpresa}</p>
                </div>
              )}
            </div>
            {/* Metas vendedores */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#e2e8f0', marginBottom: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.05em' }}>Venta vs meta</div>
                <Gauge pct={metaVentaTotal > 0 ? Math.min(Math.round(totalVentas / metaVentaTotal * 100), 100) : 0} label="VENTAS" colorTrack="rgba(255,255,255,0.35)" colorFill="#3b82f6" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {[{ label: 'Logrado', val: fmt(totalVentas), color: '#60a5fa' }, { label: 'Meta', val: fmt(metaVentaTotal), color: '#94a3b8' }].map(k => (
                    <div key={k.label} style={{ background: '#0d1220', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#ffffff', marginBottom: 2 }}>{k.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: k.color }}>{k.val}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#e2e8f0', marginBottom: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.05em' }}>Recaudo vs meta</div>
                <Gauge pct={metaRecaudoTotal > 0 ? Math.min(Math.round(totalRecaudos / metaRecaudoTotal * 100), 100) : 0} label="RECAUDO" colorTrack="rgba(255,255,255,0.35)" colorFill="#10b981" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {[{ label: 'Logrado', val: fmt(totalRecaudos), color: '#34d399' }, { label: 'Meta', val: fmt(metaRecaudoTotal), color: '#94a3b8' }].map(k => (
                    <div key={k.label} style={{ background: '#0d1220', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#ffffff', marginBottom: 2 }}>{k.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: k.color }}>{k.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {!loading && tab === 'vendedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dataV.length === 0 && <p style={{ color: '#4b6080', textAlign: 'center', padding: 40 }}>Sin datos para este período</p>}
          {dataV.map(emp => {
            const gastoPctR = emp.recaudos > 0 ? Math.round(emp.gastos / emp.recaudos * 100) : 0
            const gastoPctV = emp.ventas > 0 ? Math.round(emp.gastos / emp.ventas * 100) : 0
            return (
              <div key={emp.id} style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>{emp.nombre}</div>
                  <button onClick={() => evaluar(emp.id, 'vendedor', emp.nombre, emp)}
                    disabled={iaLoading[emp.id]}
                    style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid #1e3a5f', background: 'transparent', color: '#60a5fa', cursor: 'pointer' }}>
                    {iaLoading[emp.id] ? '⏳ Analizando...' : '✨ Evaluar con IA'}
                  </button>
                </div>

                {/* Dropdown gastos empleado */}
                {emp.gastosDetalle && emp.gastosDetalle.length > 0 && (() => {
                  const tipos = [...new Set(emp.gastosDetalle.map((g: any) => g.tipo).filter(Boolean))]
                  return (
                    <select defaultValue="" onChange={e => {
                      const el = document.getElementById(`gasto-sel-${emp.id}`) as any
                      if (el) el.value = e.target.value
                    }}
                      id={`gasto-sel-${emp.id}`}
                      className="w-full bg-[#0d1220] text-white rounded-lg px-2 py-2 text-sm mb-3 border border-[#1e2a3d] focus:outline-none cursor-pointer">
                      <option value="">Todos los gastos — {fmt(emp.gastos)}</option>
                      {tipos.map((t: any) => {
                        const sum = emp.gastosDetalle.filter((g: any) => g.tipo === t).reduce((s: number, g: any) => s + Number(g.valor), 0)
                        return <option key={t} value={t}>{t} — {fmt(sum)}</option>
                      })}
                    </select>
                  )
                })()}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <Gauge pct={emp.ventas > 0 ? Math.round((emp.ventas - emp.gastos) / emp.ventas * 100) : 0} label="Ventas netas" sub={`gasto ${gastoPctV}%`} colorFill="#3b82f6" />
                  <Gauge pct={emp.recaudos > 0 ? Math.round((emp.recaudos - emp.gastos) / emp.recaudos * 100) : 0} label="Recaudo neto" sub={`gasto ${gastoPctR}%`} colorFill="#10b981" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                  {[
                    { label: 'Ventas', val: fmt(emp.ventas), color: '#60a5fa' },
                    { label: 'Recaudos', val: fmt(emp.recaudos), color: '#34d399' },
                    { label: 'Gastos', val: fmt(emp.gastos), color: '#f87171' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#0d1220', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#ffffff', marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: m.color }}>{m.val}</div>
                    </div>
                  ))}
                </div>

                {iaTextos[emp.id] && (
                  <div style={{ marginTop: 12, background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 500, marginBottom: 6 }}>✨ Análisis IA</div>
                    <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{iaTextos[emp.id]}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* IMPULSADORAS */}
      {!loading && tab === 'impulsadoras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dataI.length === 0 && <p style={{ color: '#4b6080', textAlign: 'center', padding: 40 }}>Sin datos para este período</p>}
          {dataI.map(emp => {
            const gastoPct = emp.ventas > 0 ? Math.round(emp.gastos / emp.ventas * 100) : 0
            const metaPct = emp.meta > 0 ? Math.round(emp.ventas / emp.meta * 100) : 0
            return (
              <div key={emp.id} style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>{emp.nombre}</div>
                  <button onClick={() => evaluar(emp.id, 'impulsadora', emp.nombre, emp)}
                    disabled={iaLoading[emp.id]}
                    style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid #1e3a5f', background: 'transparent', color: '#60a5fa', cursor: 'pointer' }}>
                    {iaLoading[emp.id] ? '⏳ Analizando...' : '✨ Evaluar con IA'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <Dona main={emp.ventas - emp.gastos} gasto={emp.gastos} label="Ventas vs gastos" total={emp.ventas} gastoPct={gastoPct} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Gauge pct={metaPct} label="Cumplimiento meta" sub="meta" colorTrack="rgba(255,255,255,0.35)" colorFill="#8b5cf6" />
                    <div style={{ fontSize: 10, color: '#8ba4c0' }}>{fmtN(emp.visitas)} visitas</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                  {[
                    { label: 'Ventas', val: fmt(emp.ventas), color: '#8b5cf6' },
                    { label: 'Gastos', val: fmt(emp.gastos), color: '#f87171' },
                    { label: 'Visitas', val: fmtN(emp.visitas), color: '#60a5fa' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#0d1220', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#ffffff', marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: m.color }}>{m.val}</div>
                    </div>
                  ))}
                </div>

                {iaTextos[emp.id] && (
                  <div style={{ marginTop: 12, background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 500, marginBottom: 6 }}>✨ Análisis IA</div>
                    <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{iaTextos[emp.id]}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
