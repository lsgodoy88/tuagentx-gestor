'use client'
import React, { useState, useEffect, useRef } from 'react'

const thSt: React.CSSProperties = {
  padding: '8px 12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase',
  fontSize: 11, letterSpacing: '0.06em', borderBottom: '2px solid #1e2a3d', whiteSpace: 'nowrap',
}

function pctColor(pct: number | null): React.CSSProperties {
  return pct === null ? { color: '#71717a' } : pct >= 80 ? { color: '#34d399' } : pct >= 50 ? { color: '#fbbf24' } : { color: '#f87171' }
}

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CO') }

function labelMes(ym: string) {
  const [a, m] = ym.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('es-CO', { month: 'long' }).replace(/^./, c => c.toUpperCase()) + ' ' + a
}

function ReporteImpulsoTabla({ mes, hasta, refreshToken = 0, empleadosParaRefresh }: {
  mes: string; hasta?: string; refreshToken?: number
  empleadosParaRefresh?: React.MutableRefObject<string[]>
}) {
  const esRango = hasta && hasta !== mes
  const [datos, setDatos] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const prevRefreshToken = useRef(0)
  const BORDER = '1px solid #1e2a3d'
  const BORDER_DAY = '2px solid #1e3a5f'

  useEffect(() => {
    setLoading(true)
    const url = esRango
      ? `/api/impulso/pdf?fecha=${mes}-01&hasta=${hasta}`
      : `/api/impulso/pdf?fecha=${mes}-01`
    fetch(url).then(r => r.json()).then(d => { setDatos(d); setLoading(false) })
  }, [mes, hasta])

  useEffect(() => {
    if (esRango) return
    if (refreshToken === 0 || refreshToken === prevRefreshToken.current) return
    prevRefreshToken.current = refreshToken
    const ids = empleadosParaRefresh?.current ?? []
    if (ids.length === 0) return
    Promise.all(
      ids.map(id => fetch('/api/impulso/pdf?fecha=' + mes + '-01&empleadoId=' + id).then(r => r.json()))
    ).then(resultados => {
      setDatos((prev: any) => {
        if (!prev) return prev
        const impActualizadas = resultados.flatMap((r: any) => r.impulsadoras || [])
        const impMap = new Map((prev.impulsadoras || []).map((i: any) => [i.id, i]))
        impActualizadas.forEach((imp: any) => impMap.set(imp.id, imp))
        return { ...prev, impulsadoras: [...impMap.values()] }
      })
    })
  }, [refreshToken])

  if (loading) return (
    <div className="p-4 space-y-4">
      <div className="shimmer h-10 w-2/3 rounded-xl mx-auto" />
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer rounded-2xl h-24" />)}
    </div>
  )
  if (!datos) return null

  // Modo rango
  if (datos.rango && datos.meses?.length > 1) {
    const mesesRango: string[] = datos.meses
    const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]
    return (
      <div className="space-y-6 w-full">
        {datos.impulsadoras?.map((imp: any) => {
          const clientes: any[] = imp.clientesUnion || []
          const totales = imp.totalesPorMes || {}
          const porDia: Record<number, any[]> = {}
          const sinDia: any[] = []
          for (const cli of clientes) {
            if (cli.dia != null) { if (!porDia[cli.dia]) porDia[cli.dia] = []; porDia[cli.dia].push(cli) }
            else sinDia.push(cli)
          }
          const diasConClientes = ORDEN_DIAS.filter(d => porDia[d]?.length > 0)
          return (
            <div key={imp.id} style={{ background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: BORDER, background: '#0a0f1a' }}>
                <span style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>{imp.nombre}</span>
              </div>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 220 + mesesRango.length * 260 }}>
                  <thead>
                    <tr style={{ background: '#080d18' }}>
                      <th style={{ ...thSt, width: 52, borderRight: BORDER_DAY }}>Día</th>
                      <th style={{ ...thSt, textAlign: 'left', minWidth: 160 }}>Cliente</th>
                      {mesesRango.map(ym => (
                        <th key={ym} colSpan={3} style={{ ...thSt, textAlign: 'center', borderLeft: BORDER_DAY, minWidth: 240 }}>{labelMes(ym)}</th>
                      ))}
                    </tr>
                    <tr style={{ background: '#060a18' }}>
                      <th style={{ ...thSt, borderRight: BORDER_DAY }}></th>
                      <th style={{ ...thSt, textAlign: 'left' }}></th>
                      {mesesRango.map(ym => (
                        <React.Fragment key={ym}>
                          <th style={{ ...thSt, textAlign: 'right', borderLeft: BORDER_DAY, color: '#f59e0b', fontSize: 11 }}>Meta</th>
                          <th style={{ ...thSt, textAlign: 'right', color: '#60a5fa', fontSize: 11 }}>Venta</th>
                          <th style={{ ...thSt, textAlign: 'right', color: '#94a3b8', fontSize: 11 }}>%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {diasConClientes.map(dia => {
                      const clis = porDia[dia]
                      const nombreDia = clis[0]?.diaNombre ?? ''
                      return clis.map((cli: any, i: number) => (
                        <tr key={cli.clienteId} style={{ borderBottom: BORDER, background: '#0d1220' }}>
                          {i === 0 && (
                            <td rowSpan={clis.length} style={{
                              padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle',
                              fontWeight: 700, fontSize: 11, color: '#93c5fd', textTransform: 'uppercase',
                              borderRight: BORDER_DAY, whiteSpace: 'nowrap', letterSpacing: '0.05em',
                              background: '#0b1628', borderBottom: BORDER_DAY,
                            }}>
                              {nombreDia.slice(0, 3).toUpperCase()}
                            </td>
                          )}
                          <td style={{ padding: '7px 12px', borderRight: BORDER }}>
                            <span style={{ color: 'white', fontWeight: 500, display: 'block', whiteSpace: 'nowrap' }}>{cli.nombre}</span>
                            {cli.nombreComercial && <span style={{ color: '#64748b', fontSize: 11 }}>{cli.nombreComercial}</span>}
                          </td>
                          {mesesRango.map(ym => {
                            const p = imp.clientesPorMes?.[ym]?.[cli.clienteId]
                            return (
                              <React.Fragment key={ym}>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600, borderLeft: BORDER_DAY, whiteSpace: 'nowrap' }}>{p && p.meta > 0 ? fmt(p.meta) : '—'}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>{p && p.montoMes > 0 ? fmt(p.montoMes) : '—'}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', ...pctColor(p?.pct ?? null) }}>{p?.pct != null ? p.pct + '%' : '—'}</td>
                              </React.Fragment>
                            )
                          })}
                        </tr>
                      ))
                    })}
                    {sinDia.map((cli: any) => (
                      <tr key={cli.clienteId} style={{ borderBottom: BORDER, background: '#0a0f1a' }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#334155', fontWeight: 700, fontSize: 11, borderRight: BORDER_DAY, background: '#080e1a' }}>—</td>
                        <td style={{ padding: '7px 12px', borderRight: BORDER }}>
                          <span style={{ color: 'white', fontWeight: 500, display: 'block', whiteSpace: 'nowrap' }}>{cli.nombre}</span>
                        </td>
                        {mesesRango.map(ym => {
                          const p = imp.clientesPorMes?.[ym]?.[cli.clienteId]
                          return (
                            <React.Fragment key={ym}>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600, borderLeft: BORDER_DAY, whiteSpace: 'nowrap' }}>{p && p.meta > 0 ? fmt(p.meta) : '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>{p && p.montoMes > 0 ? fmt(p.montoMes) : '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', ...pctColor(p?.pct ?? null) }}>{p?.pct != null ? p.pct + '%' : '—'}</td>
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    ))}
                    <tr style={{ background: '#0a0f1a', borderTop: BORDER_DAY }}>
                      <td style={{ padding: '8px 10px', borderRight: BORDER_DAY }}></td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', borderRight: BORDER }}>Total</td>
                      {mesesRango.map(ym => {
                        const t = totales[ym]
                        return (
                          <React.Fragment key={ym}>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 700, borderLeft: BORDER_DAY, whiteSpace: 'nowrap' }}>{t ? fmt(t.totalMeta) : '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#60a5fa', fontWeight: 700, whiteSpace: 'nowrap' }}>{t ? fmt(t.totalMes) : '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', ...pctColor(t?.pctTotal ?? null) }}>{t?.pctTotal != null ? t.pctTotal + '%' : '—'}</td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Modo mes único
  const ABREV_DIA: Record<string, string> = {
    'Lunes': 'LUN', 'Martes': 'MAR', 'Miércoles': 'MIE', 'Jueves': 'JUE',
    'Viernes': 'VIE', 'Sábado': 'SAB', 'Domingo': 'DOM',
  }
  return (
    <div className="space-y-6 w-full">
      <div className={`grid gap-4 ${datos.impulsadoras?.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        {datos.impulsadoras?.map((imp: any) => {
          const diasConPuntos = (imp.semana || []).filter((d: any) => d.puntos?.length > 0)
          return (
            <div key={imp.id} style={{ background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: BORDER, background: '#0a0f1a' }}>
                <span style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>{imp.nombre}</span>
                <span style={{ fontSize: 13, fontWeight: 700, ...pctColor(imp.pctTotal) }}>
                  {fmt(imp.totalMes)} / {fmt(imp.totalMeta)}
                  {imp.pctTotal !== null && <span style={{ marginLeft: 6 }}>{imp.pctTotal}%</span>}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: '#080d18' }}>
                      <th style={{ ...thSt, width: 52, borderRight: BORDER_DAY }}>Día</th>
                      <th style={{ ...thSt, textAlign: 'left' }}>Cliente</th>
                      <th style={{ ...thSt, textAlign: 'right', width: 130 }}>Meta</th>
                      <th style={{ ...thSt, textAlign: 'right', width: 130 }}>Ventas</th>
                      <th style={{ ...thSt, textAlign: 'right', width: 60 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasConPuntos.map((dia: any, dIdx: number) => {
                      const puntos = dia.puntos || []
                      return puntos.map((p: any, i: number) => (
                        <tr key={`${dIdx}-${i}`} style={{ borderBottom: BORDER, background: dIdx % 2 === 0 ? '#0d1220' : '#0a0f1a' }}>
                          {i === 0 && (
                            <td rowSpan={puntos.length} style={{
                              padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle',
                              fontWeight: 700, fontSize: 11, color: '#93c5fd', textTransform: 'uppercase',
                              borderRight: BORDER_DAY,
                              borderBottom: dIdx < diasConPuntos.length - 1 ? BORDER_DAY : BORDER,
                              whiteSpace: 'nowrap', letterSpacing: '0.05em',
                              background: dIdx % 2 === 0 ? '#0b1628' : '#08101e',
                            }}>
                              {ABREV_DIA[dia.nombre] ?? dia.nombre}
                            </td>
                          )}
                          <td style={{ padding: '7px 12px', borderRight: BORDER }}>
                            <span style={{ color: 'white', fontWeight: 500, display: 'block' }}>{p.nombre}</span>
                            {p.nombreComercial && <span style={{ color: '#64748b', fontSize: 11, display: 'block', marginTop: 1 }}>{p.nombreComercial}</span>}
                          </td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 600, borderRight: BORDER, whiteSpace: 'nowrap' }}>{p.meta > 0 ? fmt(p.meta) : '—'}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', color: '#60a5fa', fontWeight: 600, borderRight: BORDER, whiteSpace: 'nowrap' }}>{p.montoMes > 0 ? fmt(p.montoMes) : '—'}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', ...pctColor(p.pct) }}>{p.pct !== null ? p.pct + '%' : '—'}</td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
      {datos.actualizadoEn && (
        <p style={{ textAlign: 'right', fontSize: 11, color: '#4b5563', marginTop: 4 }}>
          Actualizado el: {new Date(datos.actualizadoEn).toLocaleString('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'America/Bogota',
          })}
        </p>
      )}
    </div>
  )
}

export default function TabReporte({ refreshToken = 0, empleadosParaRefresh }: {
  refreshToken?: number
  empleadosParaRefresh?: React.MutableRefObject<string[]>
}) {
  const mesActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)
  const [mesDesde, setMesDesde] = useState(mesActual)
  const [mesHasta, setMesHasta] = useState(mesActual)
  const [openDesde, setOpenDesde] = useState(false)
  const [openHasta, setOpenHasta] = useState(false)

  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    const valor = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .replace(' de ', ' ').replace(/^./, c => c.toUpperCase()).replace('.', '')
    return { valor, label }
  })

  const mesesHasta = meses.filter(m => {
    if (m.valor < mesDesde) return false
    const [da, dm] = mesDesde.split('-').map(Number)
    const [ha, hm] = m.valor.split('-').map(Number)
    const diff = (ha - da) * 12 + (hm - dm)
    return diff <= 3
  })

  useEffect(() => {
    if (!mesesHasta.find(m => m.valor === mesHasta)) {
      setMesHasta(mesesHasta[0]?.valor ?? mesDesde)
    }
  }, [mesDesde])

  const labelDesde = meses.find(m => m.valor === mesDesde)?.label ?? mesDesde
  const labelHasta = mesesHasta.find(m => m.valor === mesHasta)?.label ?? mesHasta
  const esRango = mesDesde !== mesHasta

  const abrirPDF = () => {
    const url = esRango ? `/pdf-impulso?fecha=${mesDesde}-01&hasta=${mesHasta}` : `/pdf-impulso?fecha=${mesDesde}-01`
    window.open(url, '_blank')
  }

  const dropdownStyle = (open: boolean): React.CSSProperties => ({
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
    background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 8,
    overflow: 'hidden', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    display: open ? 'block' : 'none',
  })

  const btnMesStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    background: '#0d1220', border: '1px solid #1e2a3d',
    borderRadius: 8, padding: '8px 12px', color: 'white',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', width: '100%',
  }

  return (
    <div className="space-y-6 w-full">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <button onClick={() => { setOpenDesde(o => !o); setOpenHasta(false) }} style={btnMesStyle}>
            {labelDesde}<span style={{ color: '#64748b', fontSize: 11 }}>{openDesde ? '▲' : '▼'}</span>
          </button>
          <div style={dropdownStyle(openDesde)}>
            {meses.map(m => (
              <button key={m.valor} onClick={() => { setMesDesde(m.valor); setOpenDesde(false) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', fontSize: 13, cursor: 'pointer', background: m.valor === mesDesde ? '#1d4ed8' : 'transparent', color: m.valor === mesDesde ? 'white' : '#cbd5e1', fontWeight: m.valor === mesDesde ? 700 : 400, borderBottom: '1px solid #1e2a3d' }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', flex: 1 }}>
          <button onClick={() => { setOpenHasta(o => !o); setOpenDesde(false) }} style={btnMesStyle}>
            {labelHasta}<span style={{ color: '#64748b', fontSize: 11 }}>{openHasta ? '▲' : '▼'}</span>
          </button>
          <div style={dropdownStyle(openHasta)}>
            {mesesHasta.map(m => (
              <button key={m.valor} onClick={() => { setMesHasta(m.valor); setOpenHasta(false) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', fontSize: 13, cursor: 'pointer', background: m.valor === mesHasta ? '#1d4ed8' : 'transparent', color: m.valor === mesHasta ? 'white' : '#cbd5e1', fontWeight: m.valor === mesHasta ? 700 : 400, borderBottom: '1px solid #1e2a3d' }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ alignSelf: 'flex-end', flexShrink: 0 }}>
          <button onClick={abrirPDF} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
            📄 PDF
          </button>
        </div>
      </div>
      <ReporteImpulsoTabla mes={mesDesde} hasta={mesHasta} refreshToken={refreshToken} empleadosParaRefresh={empleadosParaRefresh} />
    </div>
  )
}
