'use client'
import type { UseVisitaModal } from '../_lib/useVisitaModal'

export default function ModalVisita({ vm }: { vm: UseVisitaModal }) {
  const { visitaModal, firmaUrl, cerrar } = vm

  if (!visitaModal) return null

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 w-full max-w-md space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white font-bold">Comprobante de entrega</p>
          <button onClick={cerrar} className="text-zinc-400 hover:text-white text-xl">×</button>
        </div>
        <div className="space-y-1 text-sm border-b border-zinc-700 pb-3">
          <p className="text-zinc-400">Cliente: <span className="text-white">{visitaModal.clienteNombre || ''}</span></p>
          <p className="text-zinc-400">Factura: <span className="text-blue-400 font-semibold">{visitaModal.factura || 'Sin factura'}</span></p>
          {visitaModal.monto && <p className="text-zinc-400">Monto: <span className="text-emerald-400 font-semibold">${Number(visitaModal.monto).toLocaleString('es-CO')}</span></p>}
          {visitaModal.nota && <p className="text-zinc-400">Nota: <span className="text-white">{visitaModal.nota}</span></p>}
          <p className="text-zinc-400">Fecha: <span className="text-white">{new Date(visitaModal.createdAt).toLocaleString('es-CO', {day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone: 'America/Bogota'})}</span></p>
        </div>
        {visitaModal.firma && (
          <div className="bg-white rounded-xl p-2">
            {firmaUrl
              ? <img src={firmaUrl} alt="Firma" className="w-full rounded-lg" />
              : <div className="flex items-center justify-center h-20 text-zinc-400 text-sm">Cargando firma...</div>
            }
          </div>
        )}
        {visitaModal.lat && (
          <a href={`https://www.google.com/maps?q=${visitaModal.lat},${visitaModal.lng}`} target="_blank"
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl px-4 py-3 text-emerald-400 text-sm">
            📍 Ver ubicación en Maps
          </a>
        )}
      </div>
    </div>
  )
}
