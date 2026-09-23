'use client'
import { useState } from 'react'
import PagarPlanBtn from './PagarPlanBtn'

export default function PlanActualCard({ resumen, totalEmpleados, empresaId, limites, precios, montoNegociado, billingEstado }: {
  resumen: { rol: string; activos: number; precio: number; subtotal: number }[]
  totalEmpleados: number
  empresaId: string
  limites: Record<string, number>
  precios: Record<string, number>
  montoNegociado?: number | null
  billingEstado?: 'al_dia'|'pendiente'|'mora'|null
}) {
  const [abierto, setAbierto] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [historial, setHistorial] = useState<any[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  async function abrirHistorial(e: React.MouseEvent) {
    e.stopPropagation()
    setHistorialOpen(true)
    if (historial.length > 0) return
    setLoadingHist(true)
    try {
      const res = await fetch('/api/plan-empresa/historial').then(r => r.json())
      setHistorial(res.historial || [])
    } catch {}
    finally { setLoadingHist(false) }
  }

  const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
    pagado:   { label: 'Pagado',   color: '#10b981' },
    pendiente:{ label: 'Pendiente',color: '#f59e0b' },
    vencido:  { label: 'Vencido',  color: '#ef4444' },
  }

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 cursor-pointer select-none" onClick={() => setAbierto(a => !a)}>
          <div className="flex-1 min-w-0">
            <span className="text-white font-semibold text-sm">Plan actual</span>
            <span className="text-zinc-500 text-xs ml-2">· {totalEmpleados} rol{totalEmpleados !== 1 ? "es" : ""} activo{totalEmpleados !== 1 ? "s" : ""}</span>
          </div>
          {billingEstado && <button onClick={abrirHistorial}
            className={`text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded-lg border transition-colors ${billingEstado === 'mora' ? 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' : billingEstado === 'pendiente' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'}`}>
            {billingEstado === 'mora' ? 'En mora ↗' : billingEstado === 'pendiente' ? 'Pendiente ↗' : 'Al día ↗'}
          </button>}
          <span className="text-zinc-500 text-xs flex-shrink-0 ml-1">{abierto ? "▲" : "▼"}</span>
        </div>
        {abierto && (
          <div className="px-3 space-y-1 border-t border-zinc-800 pt-2 pb-2">
            {resumen.map(r => (
              <div key={r.rol} className="flex items-center justify-between rounded-xl px-4 py-2" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                <span className="text-zinc-300 text-sm capitalize">{r.rol} × {r.activos}</span>
                <span className="text-zinc-400 text-sm">${r.subtotal.toLocaleString("es-CO")}</span>
              </div>
            ))}
          </div>
        )}
        <div className="px-3 pb-3 pt-2 border-t border-zinc-800">
          <PagarPlanBtn empresaId={empresaId} limites={limites} precios={precios} montoNegociado={montoNegociado} />
        </div>
      </div>

      {/* Modal historial pagos */}
      {historialOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/90 p-4 pt-20"
          onClick={() => setHistorialOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{background:"#0d1220",border:"1px solid rgba(37,99,235,.3)"}}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{borderBottom:"1px solid rgba(37,99,235,.15)"}}>
              <span className="text-white font-semibold text-sm">Historial de pagos</span>
              <button onClick={() => setHistorialOpen(false)} className="text-zinc-500 hover:text-white text-lg">✕</button>
            </div>
            <div className="max-h-80 overflow-y-auto" style={{borderTop:"none"}}>
              {loadingHist && (
                <div className="flex justify-center py-8">
                  <span className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
              {!loadingHist && historial.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-8">Sin historial</p>
              )}
              {!loadingHist && historial.map((h: any) => {
                const est = ESTADO_LABEL[h.estado] ?? { label: h.estado, color: '#6b7280' }
                const [anio, mes] = h.mes.split('-')
                const mesLabel = new Date(Number(anio), Number(mes) - 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
                return (
                  <div key={h.mes} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-sm">{mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}</p>
                      <p className="text-white text-sm font-mono">${(h.saldo ?? h.monto).toLocaleString('es-CO')}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        {h.voucherNum && <p className="text-xs font-mono" style={{color:'#93c5fd'}}>{h.voucherNum}</p>}
                        {h.pagoFecha && <p className="text-zinc-500 text-xs">Pagado {new Date(h.pagoFecha).toLocaleDateString('es-CO')}</p>}
                        {h.fechaLimite && h.estado !== 'pagado' && <p className="text-zinc-500 text-xs">Vence {new Date(h.fechaLimite).toLocaleDateString('es-CO')}</p>}
                      </div>
                      <span className="text-xs font-semibold" style={{color: est.color}}>{est.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
