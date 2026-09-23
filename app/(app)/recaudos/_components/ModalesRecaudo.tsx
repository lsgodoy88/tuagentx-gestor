'use client'
import type { UseRecaudos } from '../_lib/useRecaudos'
import { fmtMonto } from '../_lib/utils'

export function LightboxVoucher({ r }: { r: UseRecaudos }) {
  const { lightboxUrl, setLightboxUrl } = r
  if (!lightboxUrl) return null
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={() => setLightboxUrl(null)}>
      <img src={lightboxUrl} alt="Comprobante" className="max-w-full max-h-full rounded-xl object-contain" />
      <button onClick={() => setLightboxUrl(null)}
        className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
    </div>
  )
}

export function ModalDetalleVariacion({ r }: { r: UseRecaudos }) {
  const { detalleVariacion, pagos, setDetalleVariacion } = r
  if (!detalleVariacion) return null
  const pago = pagos.find(p => p.id === detalleVariacion)
  if (!pago) return null
  const v = pago.envioVariacion as any
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
      onClick={() => setDetalleVariacion(null)}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold">⚠ Detalle de variación</h3>
          <button onClick={() => setDetalleVariacion(null)} className="text-white">✕</button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white">Monto enviado</span>
            <span className="text-white font-mono">{fmtMonto(pago.monto)}</span>
          </div>
          {v?.montoRecibido !== undefined && (
            <div className="flex justify-between">
              <span className="text-white">Monto recibido</span>
              <span className="text-white font-mono">{fmtMonto(v.montoRecibido)}</span>
            </div>
          )}
          {v?.diferencia !== undefined && (
            <div className="flex justify-between border-t border-zinc-700 pt-2">
              <span className="text-red-400 font-semibold">Diferencia</span>
              <span className="text-red-400 font-bold font-mono">{fmtMonto(v.diferencia)}</span>
            </div>
          )}
          {v?.detalle && <p className="text-white text-xs">{v.detalle}</p>}
        </div>
      </div>
    </div>
  )
}

export function ModalAjuste({ r }: { r: UseRecaudos }) {
  const {
    modalAjuste, setModalAjuste, ajusteMonto, setAjusteMonto, ajusteNota, setAjusteNota,
    ajusteMsg, ajusteLoading, ejecutarAjuste,
  } = r
  if (!modalAjuste) return null
  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="text-2xl mb-1">📝</div>
          <h3 className="text-white font-bold text-sm">Ajuste manual</h3>
          <p className="text-zinc-500 text-xs mt-1">{modalAjuste.cliente} · Fact. {modalAjuste.factura}</p>
        </div>
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Monto del ajuste</label>
          <input type="number" value={ajusteMonto} onChange={e => setAjusteMonto(e.target.value)} placeholder={`Sugerido: $${modalAjuste.montoSugerido.toLocaleString('es-CO')}`} className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" style={{background:'#0d1220',border:'1px solid #1e2a3d'}} />
        </div>
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nota <span className="text-red-400">*</span></label>
          <input value={ajusteNota} onChange={e => setAjusteNota(e.target.value)} placeholder="Ej: Nota crédito UpTres, descuento comercial..." className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" style={{background:'#0d1220',border:'1px solid #1e2a3d'}} />
        </div>
        {ajusteMsg && <p className={ajusteMsg.startsWith('✅') ? 'text-sm text-center text-emerald-400' : 'text-sm text-center text-red-400'}>{ajusteMsg}</p>}
        <div className="flex gap-2">
          <button onClick={() => { setModalAjuste(null); setAjusteMonto(''); setAjusteNota('') }} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
          <button onClick={ejecutarAjuste} disabled={ajusteLoading || !ajusteMonto || !ajusteNota.trim()} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-3 rounded-xl font-semibold">{ajusteLoading ? 'Aplicando...' : 'Aplicar'}</button>
        </div>
      </div>
    </div>
  )
}
