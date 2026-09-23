'use client'
import type { UseEmpleados } from '../_lib/useEmpleados'

// Popup de sincronización post-creación de empleado (dentro del modal "resultado")
export function PopupSyncInicial({ emp }: { emp: UseEmpleados }) {
  const {
    popupSync, setPopupSync,
    syncFecha, setSyncFecha,
    syncPrimerRecibo,
    syncMsg, setSyncMsg,
    syncLoading,
    ejecutarSyncInicial,
  } = emp

  if (!popupSync) return null

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-2">📊</div>
          <h3 className="text-white font-bold">Sincronizar cartera inicial</h3>
          <p className="text-zinc-400 text-xs mt-1">El saldo actual de UpTres se usará como base. Solo se contarán los pagos registrados en Gestor desde la fecha indicada.</p>
        </div>
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Fecha de inicio de pagos</label>
          <input type="date" value={syncFecha} onChange={e => setSyncFecha(e.target.value)}
            onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {} }}
            className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 cursor-pointer"
            style={{background:'#0d1220', border:'1px solid #1e2a3d'}} />
          <p className="text-zinc-600 text-xs mt-1">Los pagos anteriores a esta fecha no se descontarán del saldo base.</p>
          {syncPrimerRecibo && (
            <p className="text-amber-400 text-xs mt-2">⚠️ Primer recibo detectado: <strong>{syncPrimerRecibo.numeroRecibo}</strong> del {new Date(syncPrimerRecibo.fecha).toLocaleDateString('es-CO')}. Se usó como fecha de inicio.</p>
          )}
        </div>
        {syncMsg && <p className={`text-sm text-center ${syncMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{syncMsg}</p>}
        <div className="flex gap-2">
          <button onClick={() => { setPopupSync(false); setSyncMsg('') }}
            className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">
            Omitir
          </button>
          <button onClick={ejecutarSyncInicial} disabled={syncLoading || !syncFecha}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-3 rounded-xl font-semibold">
            {syncLoading ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Popup de sincronización desde el modal de edición de empleado (popupSyncForm)
export function PopupSyncForm({ emp }: { emp: UseEmpleados }) {
  const {
    popupSyncForm, setPopupSyncForm,
    editando, setEditando,
    syncFecha, setSyncFecha,
    syncPrimerRecibo,
    syncMsg, setSyncMsg,
    syncLoading, setSyncLoading,
  } = emp

  if (!popupSyncForm || !editando) return null

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#0a0f28', border: '1px solid rgba(59,130,246,0.30)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(59,130,246,0.20)' }}>
          <div>
            <p className="text-white font-bold text-sm">🔗 Sincronización cartera</p>
            <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[200px]">{editando.nombre}</p>
          </div>
          <button onClick={() => { setPopupSyncForm(false); setSyncMsg('') }} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {editando?.syncInicioAt ? (
            /* READONLY — ya sincronizado */
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)' }}>
                <p className="text-emerald-400 text-sm font-bold">✅ {editando.syncDeudas ?? 0} deudas sincronizadas</p>
                <p className="text-zinc-500 text-xs mt-1">Sincronización completada</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs font-semibold mb-1">Fecha de inicio de pagos</p>
                <p className="text-white text-sm px-3 py-2 rounded-lg" style={{ background: '#0d1220', border: '1px solid #1e2a3d' }}>
                  {new Date(editando.syncInicioAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <p className="text-zinc-600 text-xs text-center">La sincronización inicial es inmutable. Contacta soporte para modificarla.</p>
            </div>
          ) : (
            /* EDITABLE — aún no sincronizado */
            <>
              <p className="text-zinc-400 text-xs">El saldo actual de UpTres se usará como base. Solo se contarán los pagos registrados en Gestor desde la fecha indicada.</p>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Fecha de inicio de pagos</label>
                <input type="date" value={syncFecha} onChange={e => setSyncFecha(e.target.value)}
                  onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {} }}
                  className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none cursor-pointer"
                  style={{ background: '#0d1220', border: '1px solid #1e2a3d' }} />
                {syncPrimerRecibo && (
                  <p className="text-amber-400 text-xs mt-2">⚠️ Primer recibo: <strong>{syncPrimerRecibo.numeroRecibo}</strong> del {new Date(syncPrimerRecibo.fecha).toLocaleDateString('es-CO')}</p>
                )}
              </div>
              {syncMsg && (
                <p className={`text-sm text-center ${syncMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{syncMsg}</p>
              )}
            </>
          )}
        </div>
        {/* Footer */}
        <div className="px-5 py-3 border-t flex gap-2" style={{ borderColor: 'rgba(59,130,246,0.20)' }}>
          <button onClick={() => { setPopupSyncForm(false); setSyncMsg('') }}
            className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {editando?.syncInicioAt ? 'Cerrar' : 'Omitir'}
          </button>
          {!editando?.syncInicioAt && (
            <button onClick={async () => {
              if (!editando || !syncFecha) return
              setSyncLoading(true); setSyncMsg('')
              const res = await fetch('/api/vendedor/sync-inicial', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empleadoId: editando.id, syncInicioAt: new Date(syncFecha + 'T05:00:00Z').toISOString() })
              })
              const data = await res.json()
              setSyncLoading(false)
              if (data.error) { setSyncMsg('Error: ' + data.error) }
              else {
                // Actualizar editando en memoria → popup cambia a readonly sin reload
                setEditando((prev: any) => ({ ...prev, syncInicioAt: data.fechaInicio, syncDeudas: data.actualizadas }))
              }
            }} disabled={syncLoading || !syncFecha}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: '1px solid rgba(59,130,246,0.50)' }}>
              {syncLoading ? 'Sincronizando...' : '🔗 Sincronizar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
