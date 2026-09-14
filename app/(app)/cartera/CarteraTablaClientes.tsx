'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

const ESTADO_COLOR: Record<string, string> = {
  critica: '#dc2626', mora: '#f43f5e', vencida: '#f97316',
  proxima: '#f59e0b', pendiente: '#eab308', vigente: '#3b82f6',
  abonada: '#3b82f6', pagada: '#22c55e',
}
const ESTADO_LABEL: Record<string, string> = {
  critica: 'Crítica', mora: 'En mora', vencida: 'Vencida',
  proxima: 'Por vencer', pendiente: 'Pendiente', vigente: 'Vigente',
  abonada: 'Abonada', pagada: 'Pagada',
}
function estadoPrincipal(porEstado: any): string {
  for (const e of ['critica', 'mora', 'vencida', 'pendiente', 'abonada', 'pagada'])
    if (porEstado?.[e] > 0) return e
  return 'pendiente'
}

const CPC_COLS_BASE = [220, 160, 120, 120, 130, 110, 160]
const CPC_STORAGE = 'dt-widths-cpc'

interface CarteraTablaClientesProps {
  filtradas: any[]
  filtradasPagina: any[]
  buscar: string
  userRole: string | undefined
  onSync: (cartera: any) => void
  onWhatsApp: (cartera: any) => void
}

export default function CarteraTablaClientes({
  filtradas, filtradasPagina, buscar, userRole, onSync, onWhatsApp,
}: CarteraTablaClientesProps) {
  const esSupervisor = userRole === 'empresa' || userRole === 'supervisor'

  const [cpcWidths, setCpcWidths] = useState<number[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = localStorage.getItem(CPC_STORAGE)
        if (s) { const p = JSON.parse(s); if (Array.isArray(p)) return p }
      } catch {}
    }
    return CPC_COLS_BASE
  })

  useEffect(() => {
    try { localStorage.setItem(CPC_STORAGE, JSON.stringify(cpcWidths)) } catch {}
  }, [cpcWidths])

  const cpcResizing = useRef<{ ci: number; sx: number; sw: number } | null>(null)
  const onCpcResize = useCallback((e: React.MouseEvent, ci: number) => {
    e.preventDefault(); e.stopPropagation()
    cpcResizing.current = { ci, sx: e.clientX, sw: cpcWidths[ci] }
    const onMove = (ev: MouseEvent) => {
      if (!cpcResizing.current) return
      const { ci, sx, sw } = cpcResizing.current
      setCpcWidths(prev => { const w = [...prev]; w[ci] = Math.max(60, sw + ev.clientX - sx); return w })
    }
    const onUp = () => { cpcResizing.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }, [cpcWidths])

  if (filtradas.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-zinc-400">{buscar ? 'Sin resultados' : 'Sin cartera registrada'}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2a3d' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <colgroup>
            <col style={{ width: cpcWidths[0] }} />
            {esSupervisor && <col style={{ width: cpcWidths[1] }} />}
            <col style={{ width: cpcWidths[2] }} />
            <col style={{ width: cpcWidths[3] }} />
            <col style={{ width: cpcWidths[4] }} />
            <col style={{ width: cpcWidths[5] }} />
            <col style={{ width: cpcWidths[6] }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
              {(['Cliente', 'Vendedor', 'Factura', 'Vencimiento', 'Saldo', 'Estado', 'Acciones'] as const).map((label, i) => {
                if (label === 'Vendedor' && !esSupervisor) return null
                return (
                  <th key={label} style={{ padding: '8px 10px', fontSize: 14, fontWeight: 500, color: 'white', textAlign: 'center' as const, userSelect: 'none' as const, position: 'relative' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden' as const, borderRight: '1px solid #1e2a3d' }}>
                    {label}
                    <div onMouseDown={e => onCpcResize(e, i)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', background: 'transparent' }} />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filtradasPagina.map((cartera: any, ci: number) => {
              const deudas = [...(cartera.DetalleCartera || [])].sort((a: any, b: any) => {
                const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
                const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
                return fa - fb
              })
              const esUltimoCliente = ci === filtradasPagina.length - 1
              return deudas.map((d: any, di: number) => {
                const esPrimera = di === 0
                const esUltimaDeuda = di === deudas.length - 1
                const color = ESTADO_COLOR[d.estado] || '#6366f1'
                const separador = esUltimaDeuda && !esUltimoCliente ? '2px solid #1e2a3d' : '1px solid #1e2a3d'
                return (
                  <tr key={`${cartera.id}-${di}`} style={{ background: '#141c2e', borderBottom: separador }}>
                    <td style={{ padding: '8px 10px', fontSize: 14, fontWeight: 500, color: 'white', maxWidth: 180, overflow: 'hidden', borderBottom: '1px solid #1e2a3d' }}>
                      {esPrimera ? (
                        <div className="flex items-center gap-2">
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLOR[estadoPrincipal(cartera.porEstado)] || '#6366f1', flexShrink: 0, boxShadow: `0 0 5px ${ESTADO_COLOR[estadoPrincipal(cartera.porEstado)] || '#6366f1'}` }} />
                          <span style={{ color: 'white', fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cartera.cliente?.nombre || '—'}</span>
                        </div>
                      ) : null}
                    </td>
                    {esSupervisor && (
                      <td style={{ padding: '8px 10px', fontSize: 14, fontWeight: 500, color: 'white', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d', textAlign: 'center' }}>
                        {esPrimera ? (cartera.empleado?.nombre || '—') : null}
                      </td>
                    )}
                    <td style={{ padding: '8px 10px', fontSize: 14, fontWeight: 500, color: 'white', fontFamily: 'monospace', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d', textAlign: 'center' }}>
                      {d.numeroFactura ? `Fact. ${d.numeroFactura}` : d.numeroOrden ? `${d.numeroOrden}` : '—'}
                      {d.electronicInvoiceNumber && <span style={{ display: 'block', fontSize: 12, color: '#94a3b8' }}>Elect. {d.electronicInvoiceNumber}</span>}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 14, fontWeight: 500, color: 'white', fontFamily: 'monospace', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d', textAlign: 'center' }}>
                      {d.fechaVencimiento ? new Date(d.fechaVencimiento).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Bogota' }) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 14, fontWeight: 500, color: 'white', fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d' }}>
                      {fmt(Number(d.saldo))}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d' }}>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                        {ESTADO_LABEL[d.estado] || d.estado}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d' }}>
                      {esPrimera && Number(cartera.saldoPendiente) > 0 ? (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => onSync(cartera)} id={'sync-' + cartera.id} title="Sync UpTres" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '2px 4px' }}>🔄</button>
                          <button onClick={() => onWhatsApp(cartera)} className="flex items-center justify-center p-1.5 rounded-lg transition-colors" style={{ background: '#25D366', color: '#fff' }}>
                            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'currentColor' }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#0d1220', borderTop: '1px solid #1e2a3d' }}>
              <td colSpan={esSupervisor ? 4 : 3} className="px-4 py-3 text-slate-300 font-bold text-xs">
                {filtradas.length} clientes · {filtradas.reduce((s: number, c: any) => s + (c.DetalleCartera?.length || 0), 0)} facturas
              </td>
              <td className="px-4 py-3 text-right font-bold whitespace-nowrap text-xs" style={{ color: '#fde68a' }}>
                {fmt(filtradas.reduce((s: number, c: any) => s + Number(c.saldoPendiente), 0))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
