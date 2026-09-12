'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SelectorMes from '@/components/SelectorMes'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const fmtN = (n: number) => Math.round(n).toLocaleString('es-CO')

function Gauge({ pct, label, sub, colorTrack, colorFill }: {
  pct: number, label: string, sub?: string, colorTrack?: string, colorFill?: string
}) {
  const r = 48, circ = 2 * Math.PI * r
  const p = Math.max(pct, 0)
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
  const [categorias, setCategorias] = useState<any[]>([])
  const [metaVentaTotal, setMetaVentaTotal] = useState(0)
  const [metaRecaudoTotal, setMetaRecaudoTotal] = useState(0)
  const [catFiltroEmp, setCatFiltroEmp] = useState('')
  const [modoVend, setModoVend] = useState<'gastos' | 'meta'>('gastos')
  const [iaTextos, setIaTextos] = useState<Record<string, { texto: string, fecha: string }>>({})
  const [iaEmpresa, setIaEmpresa] = useState<{ texto: string, fecha: string } | null>(null)
  const [iaEmpresaLoading, setIaEmpresaLoading] = useState(false)
  const [iaEquipoV, setIaEquipoV] = useState<{ texto: string, fecha: string } | null>(null)
  const [iaEquipoVLoading, setIaEquipoVLoading] = useState(false)
  const [iaEquipoI, setIaEquipoI] = useState<{ texto: string, fecha: string } | null>(null)
  const [iaEquipoILoading, setIaEquipoILoading] = useState(false)
  const [iaLoading, setIaLoading] = useState<Record<string, boolean>>({})
  const [iaColapsado, setIaColapsado] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Cargar análisis persistidos
    try {
      const saved = localStorage.getItem('reportes_ia')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.textos) {
          setIaTextos(parsed.textos)
          // Todos colapsados al cargar
          const cols: Record<string, boolean> = {}
          Object.keys(parsed.textos).forEach(k => { cols[k] = true })
          if (parsed.empresa) cols.empresa = true
          setIaColapsado(cols)
        }
        if (parsed.empresa) setIaEmpresa(parsed.empresa)

      }
    } catch {}
  }, [])

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
    // metaVenta y metaRecaudo por empleado vienen en rv.data
    setIaTextos({})
    setLoading(false)
  }

  async function evaluar(id: string, tipo: 'vendedor' | 'impulsadora' | 'empresa', empleado: string, datos: any) {
    if (tipo === 'empresa') {
      setIaEmpresaLoading(true)
      const r = await fetch('/api/reportes/evaluar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, empleado, datos, equipo: [], mes, anio })
      }).then(r => r.json())
      const entradaEmp = { texto: r.texto || '', fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
      setIaEmpresa(entradaEmp)
      setIaColapsado(prev => ({ ...prev, empresa: false }))
      try { localStorage.setItem('reportes_ia', JSON.stringify({ textos: iaTextos, empresa: entradaEmp })) } catch {}
      setIaEmpresaLoading(false)
      return
    }
    setIaLoading(prev => ({ ...prev, [id]: true }))
    const equipo = tipo === 'vendedor' ? dataV : dataI
    const r = await fetch('/api/reportes/evaluar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, empleado, datos, equipo, mes, anio })
    }).then(r => r.json())
    const entrada = { texto: r.texto || 'Sin análisis.', fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
    setIaTextos(prev => {
      const next = { ...prev, [id]: entrada }
      try { localStorage.setItem('reportes_ia', JSON.stringify({ textos: next, empresa: iaEmpresa })) } catch {}
      return next
    })
    setIaColapsado(prev => ({ ...prev, [id]: false }))
    setIaLoading(prev => ({ ...prev, [id]: false }))
  }

  async function evaluarEquipo(tipo: 'vendedor' | 'impulsadora') {
    if (tipo === 'vendedor') {
      setIaEquipoVLoading(true)
      const r = await fetch('/api/reportes/evaluar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'equipo_vendedor', empleado: 'Equipo Vendedores', datos: {}, equipo: dataV, mes, anio })
      }).then(r => r.json())
      const entrada = { texto: r.texto || '', fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
      setIaEquipoV(entrada)
      setIaColapsado(prev => ({ ...prev, equipoV: false }))
      // equipoV no persiste
      setIaEquipoVLoading(false)
    } else {
      setIaEquipoILoading(true)
      const r = await fetch('/api/reportes/evaluar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'equipo_impulsadora', empleado: 'Equipo Impulsos', datos: {}, equipo: dataI, mes, anio })
      }).then(r => r.json())
      const entrada = { texto: r.texto || '', fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
      setIaEquipoI(entrada)
      setIaColapsado(prev => ({ ...prev, equipoI: false }))
      // equipoI no persiste
      setIaEquipoILoading(false)
    }
  }

  const mesStr = `${anio}-${String(mes).padStart(2, '0')}`

  if (status === 'loading' || !session) return null
  if (!['empresa', 'supervisor'].includes(user?.role)) return null

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

      {/* Selector mes + switch vendedores + dropdown empresa */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        {tab === 'empresa' && (
          <select value={catFiltroEmp} onChange={e => setCatFiltroEmp(e.target.value)}
            className={`bg-[#0d1220] text-white rounded-lg px-3 py-2 text-sm focus:outline-none cursor-pointer ${catFiltroEmp ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}>
            <option value="">Total gastos</option>
            <option value="__egresos">Total egresos</option>
            {categorias.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
          </select>
        )}
        {tab === 'vendedores' && (
          <div style={{ position: 'relative', display: 'flex', background: '#111827', border: '1px solid #1e2a3d', borderRadius: 20, padding: 3, gap: 0 }}>
            {/* Indicador deslizante */}
            <div style={{
              position: 'absolute', top: 3, bottom: 3,
              left: modoVend === 'gastos' ? 3 : '50%',
              width: 'calc(50% - 3px)',
              background: '#3b82f6', borderRadius: 16,
              transition: 'left 0.25s cubic-bezier(.4,0,.2,1)',
              pointerEvents: 'none'
            }} />
            {(['gastos', 'meta'] as const).map(m => (
              <button key={m} onClick={() => setModoVend(m)}
                style={{ position: 'relative', flex: 1, padding: '6px 18px', fontSize: 14, fontWeight: 500, border: 'none', background: 'transparent', borderRadius: 16, cursor: 'pointer',
                  color: modoVend === m ? '#ffffff' : '#4b6080',
                  transition: 'color 0.25s', zIndex: 1 }}>
                {m === 'gastos' ? 'Gastos' : 'Metas'}
              </button>
            ))}
          </div>
        )}
        {tab === 'vendedores' && (
          <button onClick={() => evaluarEquipo('vendedor')} disabled={iaEquipoVLoading}
            style={{ fontSize: 14, padding: '8px 12px', borderRadius: 8, border: '1px solid #1e2a3d', background: '#0d1220', color: '#ffffff', cursor: 'pointer', flexShrink: 0 }}>
            {iaEquipoVLoading ? '⏳' : '✨IA'}
          </button>
        )}
        {tab === 'impulsadoras' && (
          <button onClick={() => evaluarEquipo('impulsadora')} disabled={iaEquipoILoading}
            style={{ fontSize: 14, padding: '8px 12px', borderRadius: 8, border: '1px solid #1e2a3d', background: '#0d1220', color: '#ffffff', cursor: 'pointer', flexShrink: 0 }}>
            {iaEquipoILoading ? '⏳' : '✨IA'}
          </button>
        )}
        <SelectorMes value={mesStr} onChange={v => { const [a, m] = v.split('-'); setAnio(Number(a)); setMes(Number(m)) }} className="bg-[#0d1220] text-white rounded-lg px-2 py-2 text-sm focus:outline-none cursor-pointer border border-[#1e2a3d]" style={{ maxWidth: '135px' }} />
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#4b6080', fontSize: 13 }}>Cargando datos...</div>}

      {/* TAB EMPRESA */}
      {!loading && tab === 'empresa' && (() => {
        const totalVentas = dataV.reduce((s, e) => s + e.ventas, 0)
        const totalRecaudos = dataV.reduce((s, e) => s + e.recaudos, 0)
        const totalGastosV = dataV.reduce((s, e) => s + e.gastos, 0)
        const totalVentasI = dataI.reduce((s, e) => s + e.ventas, 0)
        const totalGastosI = dataI.reduce((s, e) => s + e.gastos, 0)
        const totalGastos = totalGastosV + totalGastosI
        const totalVentasTodo = totalVentas + totalVentasI
        const totalEgresosCat = categorias.reduce((s, c) => s + c.total, 0)

        const gastoMostrar = catFiltroEmp === '__egresos'
          ? totalEgresosCat
          : catFiltroEmp
            ? (categorias.find(c => c.key === catFiltroEmp)?.total ?? 0)
            : totalGastos
        const catLabel = catFiltroEmp === '__egresos'
          ? 'Egresos'
          : catFiltroEmp
            ? (categorias.find(c => c.key === catFiltroEmp)?.label ?? 'Gastos')
            : 'Gastos'

        const pctVS = totalVentasTodo > 0 ? Math.round(gastoMostrar / totalVentasTodo * 100) : 0
        const pctRS = totalRecaudos > 0 ? Math.round(gastoMostrar / totalRecaudos * 100) : 0

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>Resumen empresa</div>
                <button onClick={() => evaluar('empresa', 'empresa', 'Empresa', { ventas: totalVentasTodo, recaudos: totalRecaudos, gastos: totalGastos, cartera: totalVentas - totalRecaudos, ventasI: totalVentasI, gastosI: totalGastosI })}
                  disabled={iaEmpresaLoading}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #1e3a5f', background: 'transparent', color: '#60a5fa', cursor: 'pointer', flexShrink: 0 }}>
                  {iaEmpresaLoading ? '⏳ Analizando...' : '✨ Evaluar con IA'}
                </button>
              </div>

              {/* 2 gauges reactivos al dropdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <Gauge pct={pctVS} label="VS VENTA" colorFill="#3b82f6" />
                <Gauge pct={pctRS} label="VS RECAUDO" colorFill="#10b981" />
              </div>

              {/* KPIs: Ventas, [Gasto/Egreso], Recaudos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                {[
                  { label: 'Ventas', val: fmt(totalVentasTodo), color: '#60a5fa' },
                  { label: catLabel, val: fmt(gastoMostrar), color: '#f87171' },
                  { label: 'Recaudos', val: fmt(totalRecaudos), color: '#34d399' },
                ].map(k => (
                  <div key={k.label} style={{ background: '#0d1220', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#ffffff', marginBottom: 3 }}>{k.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: k.color }}>{k.val}</div>
                  </div>
                ))}
              </div>

              {iaEmpresa && (
                <div style={{ marginTop: 12, background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, overflow: 'hidden' }}>
                  <div onClick={() => setIaColapsado(prev => ({ ...prev, empresa: !prev.empresa }))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer' }}>
                    <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 500 }}>✨ Análisis IA</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#ffffff' }}>{iaEmpresa.fecha}</span>
                      <span style={{ fontSize: 10, color: '#4b6080' }}>{iaColapsado.empresa ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {!iaColapsado.empresa && (
                    <div style={{ padding: '0 12px 12px' }}>
                      <p style={{ fontSize: 12, color: '#ffffff', lineHeight: 1.6, margin: 0 }}>{iaEmpresa.texto}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metas vendedores */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#e2e8f0', marginBottom: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.05em' }}>Venta vs meta</div>
                <Gauge pct={metaVentaTotal > 0 ? Math.round(totalVentas / metaVentaTotal * 100) : 0} label="VENTAS" colorFill="#3b82f6" />
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
                <Gauge pct={metaRecaudoTotal > 0 ? Math.round(totalRecaudos / metaRecaudoTotal * 100) : 0} label="RECAUDO" colorFill="#10b981" />
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

      {/* TAB VENDEDORES */}
      {!loading && tab === 'vendedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {iaEquipoV && (
            <div style={{ background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => setIaColapsado(prev => ({ ...prev, equipoV: !prev.equipoV }))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer' }}>
                <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 500 }}>✨ Análisis IA — Equipo</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#ffffff' }}>{iaEquipoV.fecha}</span>
                  <span style={{ fontSize: 10, color: '#4b6080' }}>{iaColapsado.equipoV ? '▲' : '▼'}</span>
                </div>
              </div>
              {!iaColapsado.equipoV && (
                <div style={{ padding: '0 12px 12px' }}>
                  <p style={{ fontSize: 12, color: '#ffffff', lineHeight: 1.6, margin: 0 }}>{iaEquipoV.texto}</p>
                </div>
              )}
            </div>
          )}
          {dataV.length === 0 && <p style={{ color: '#4b6080', textAlign: 'center', padding: 40 }}>Sin datos para este período</p>}
          {dataV.map(emp => {
            // Modo gastos: % recaudado de ventas y % gasto sobre recaudos
            // Modo meta: % ventas logrado vs meta y % recaudos logrado vs meta recaudo
            const pct1 = modoVend === 'gastos'
              ? (emp.ventas > 0 ? Math.round(emp.recaudos / emp.ventas * 100) : 0)
              : (emp.metaVenta > 0 ? Math.round(emp.ventas / emp.metaVenta * 100) : 0)
            const pct2 = modoVend === 'gastos'
              ? (emp.recaudos > 0 ? Math.round(emp.gastos / emp.recaudos * 100) : 0)
              : (emp.metaRecaudo > 0 ? Math.round(emp.recaudos / emp.metaRecaudo * 100) : 0)
            const label1 = modoVend === 'gastos' ? 'RECAUDO / VENTA' : 'VENTA / META'
            const label2 = modoVend === 'gastos' ? 'GASTO / RECAUDO' : 'RECAUDO / META'
            const color1 = modoVend === 'gastos' ? '#10b981' : '#3b82f6'
            const color2 = modoVend === 'gastos' ? '#f87171' : '#10b981'
            return (
              <div key={emp.id} style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{(() => { const p = emp.nombre?.split(' ').filter(Boolean) || []; return (p.length >= 3 ? `${p[0]} ${p[2]}` : emp.nombre)?.toUpperCase() })()} </div>
                  <button onClick={() => evaluar(emp.id, 'vendedor', emp.nombre, emp)}
                    disabled={iaLoading[emp.id]}
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #1e3a5f', background: 'transparent', color: '#60a5fa', cursor: 'pointer', flexShrink: 0 }}>
                    {iaLoading[emp.id] ? '⏳ Analizando...' : '✨ Evaluar con IA'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <Gauge pct={pct1} label={label1} colorFill={color1} />
                  <Gauge pct={pct2} label={label2} colorFill={color2} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                  {[
                    { label: 'Ventas', val: fmt(emp.ventas), color: '#60a5fa' },
                    { label: 'Gastos', val: fmt(emp.gastos), color: '#f87171' },
                    { label: 'Recaudos', val: fmt(emp.recaudos), color: '#34d399' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#0d1220', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#ffffff', marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: m.color }}>{m.val}</div>
                    </div>
                  ))}
                </div>

                {iaTextos[emp.id] && (
                  <div style={{ marginTop: 12, background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, overflow: 'hidden' }}>
                    <div onClick={() => setIaColapsado(prev => ({ ...prev, [emp.id]: !prev[emp.id] }))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 500 }}>✨ Análisis IA</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#ffffff' }}>{iaTextos[emp.id].fecha}</span>
                        <span style={{ fontSize: 10, color: '#4b6080' }}>{iaColapsado[emp.id] ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {!iaColapsado[emp.id] && (
                      <div style={{ padding: '0 12px 12px' }}>
                        <p style={{ fontSize: 12, color: '#ffffff', lineHeight: 1.6, margin: 0 }}>{iaTextos[emp.id].texto}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* TAB IMPULSOS */}
      {!loading && tab === 'impulsadoras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {iaEquipoI && (
            <div style={{ background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => setIaColapsado(prev => ({ ...prev, equipoI: !prev.equipoI }))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer' }}>
                <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 500 }}>✨ Análisis IA — Equipo</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#ffffff' }}>{iaEquipoI.fecha}</span>
                  <span style={{ fontSize: 10, color: '#4b6080' }}>{iaColapsado.equipoI ? '▲' : '▼'}</span>
                </div>
              </div>
              {!iaColapsado.equipoI && (
                <div style={{ padding: '0 12px 12px' }}>
                  <p style={{ fontSize: 12, color: '#ffffff', lineHeight: 1.6, margin: 0 }}>{iaEquipoI.texto}</p>
                </div>
              )}
            </div>
          )}
          {dataI.length === 0 && <p style={{ color: '#4b6080', textAlign: 'center', padding: 40 }}>Sin datos para este período</p>}
          {dataI.map(emp => {
            const gastoPct = emp.ventas > 0 ? Math.round(emp.gastos / emp.ventas * 100) : 0
            const metaPct = emp.meta > 0 ? Math.round(emp.ventas / emp.meta * 100) : 0
            return (
              <div key={emp.id} style={{ background: '#111827', border: '1px solid #1e2a3d', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{(() => { const p = emp.nombre?.split(' ').filter(Boolean) || []; return (p.length >= 3 ? `${p[0]} ${p[2]}` : emp.nombre)?.toUpperCase() })()} </div>
                  <button onClick={() => evaluar(emp.id, 'impulsadora', emp.nombre, emp)}
                    disabled={iaLoading[emp.id]}
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #1e3a5f', background: 'transparent', color: '#60a5fa', cursor: 'pointer', flexShrink: 0 }}>
                    {iaLoading[emp.id] ? '⏳ Analizando...' : '✨ Evaluar con IA'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <Gauge pct={gastoPct} label="GASTO / VENTA" colorFill="#8b5cf6" />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Gauge pct={metaPct} label="CUMPLIMIENTO META" colorFill="#f59e0b" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                  {[
                    { label: 'Ventas', val: fmt(emp.ventas), color: '#8b5cf6' },
                    { label: 'Gastos', val: fmt(emp.gastos), color: '#f87171' },
                    { label: 'Clientes', val: fmtN(emp.clientesRuta), color: '#60a5fa' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#0d1220', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#ffffff', marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: m.color }}>{m.val}</div>
                    </div>
                  ))}
                </div>

                {iaTextos[emp.id] && (
                  <div style={{ marginTop: 12, background: '#0d1630', border: '1px solid #1e3a5f', borderRadius: 8, overflow: 'hidden' }}>
                    <div onClick={() => setIaColapsado(prev => ({ ...prev, [emp.id]: !prev[emp.id] }))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 500 }}>✨ Análisis IA</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#ffffff' }}>{iaTextos[emp.id].fecha}</span>
                        <span style={{ fontSize: 10, color: '#4b6080' }}>{iaColapsado[emp.id] ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {!iaColapsado[emp.id] && (
                      <div style={{ padding: '0 12px 12px' }}>
                        <p style={{ fontSize: 12, color: '#ffffff', lineHeight: 1.6, margin: 0 }}>{iaTextos[emp.id].texto}</p>
                      </div>
                    )}
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
