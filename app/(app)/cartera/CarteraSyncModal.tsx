'use client'
import React from 'react'
import type { SyncLogItem } from './hooks/useSyncInfo'

interface CarteraSyncModalProps {
  modalSync: boolean
  setModalSync: (v: boolean) => void
  syncInfo: {
    ultimaSync: string | null
    ultimaSyncCompleta?: string | null
    tieneIntegracion?: boolean
    historial?: SyncLogItem[]
  } | null
  sincronizando: boolean
  sincronizar: () => void
}

export default function CarteraSyncModal({ modalSync, setModalSync, syncInfo, sincronizando, sincronizar }: CarteraSyncModalProps) {
  if (!(modalSync && syncInfo?.tieneIntegracion)) return null
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 pt-20" onClick={() => setModalSync(false)}>
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base">🔄 Sincronización</h3>
          <button onClick={() => setModalSync(false)} className="text-zinc-500 hover:text-white text-xl">×</button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Última sync rápida</span>
            <span className="text-zinc-300 text-xs">
              {syncInfo?.ultimaSync
                ? new Date(syncInfo.ultimaSync).toLocaleString('es-CO', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})
                : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Última sync completa</span>
            <span className="text-zinc-300 text-xs">
              {syncInfo?.ultimaSyncCompleta
                ? new Date(syncInfo.ultimaSyncCompleta).toLocaleString('es-CO', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})
                : '—'}
            </span>
          </div>
        </div>
        <button
          onClick={() => { setModalSync(false); sincronizar() }}
          disabled={sincronizando}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <span className={sincronizando ? 'animate-spin' : ''}>🔄</span>
          {sincronizando ? 'Sincronizando...' : 'Actualizar ahora'}
        </button>
        {/* Historial de últimas syncs */}
        {(syncInfo?.historial?.length ?? 0) > 0 && (
          <div className="border-t border-zinc-800 pt-4">
            <div className="text-zinc-400 text-xs font-semibold mb-2">Últimas {syncInfo!.historial!.length} ejecuciones</div>
            <div className="space-y-2">
              {syncInfo!.historial!.map((h: SyncLogItem) => (
                <div key={h.id} className="bg-zinc-900/60 rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={
                        h.estado === 'ok' ? 'text-emerald-500' :
                        h.estado === 'error' ? 'text-red-500' : 'text-amber-500'
                      }>●</span>
                      <span className="text-zinc-300">
                        {new Date(h.inicio).toLocaleString('es-CO', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota'})}
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-500">{h.disparadoPor === 'cron' ? '⏰ auto' : '👤 manual'}</span>
                    </div>
                    <span className="text-zinc-500">{h.duracionMs ? `${(h.duracionMs/1000).toFixed(1)}s` : '—'}</span>
                  </div>
                  {h.estado === 'ok' && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-400">
                      {h.clientesActualizados > 0 && <span>👤 {h.clientesActualizados}</span>}
                      {h.deudasSincronizadas > 0 && <span>💰 {h.deudasSincronizadas}</span>}
                      {h.zombis > 0 && <span>🪦 {h.zombis}</span>}
                      {h.pagosConfrontados > 0 && <span>✓ {h.pagosConfrontados}</span>}
                      {h.clientesActualizados === 0 && h.deudasSincronizadas === 0 && h.zombis === 0 && h.pagosConfrontados === 0 && (
                        <span className="text-zinc-600 italic">sin cambios</span>
                      )}
                    </div>
                  )}
                  {h.estado === 'error' && h.errores && (
                    <div className="text-red-400 text-[11px]">
                      {(h.errores as any)?.message || 'Error desconocido'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
