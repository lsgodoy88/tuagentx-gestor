'use client'
import { Seccion } from './Seccion'
import type { Vinculadas } from '../_lib/useVinculadas'



interface Props extends Vinculadas {
  isOpen: boolean
  onToggle: () => void
  tieneBodega: boolean
  bodegaPuedeEnviar: boolean
}

export function SeccionVinculadas({ isOpen, onToggle, tieneBodega, bodegaPuedeEnviar, ...vk }: Props) {
  return (
    <Seccion titulo="Empresas vinculadas" icono="📦" isOpen={isOpen} onToggle={onToggle}>
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-xs">Empresas externas con acceso a rutas via API</p>
        <div className="flex gap-2">
          <button
            onClick={() => { vk.setModalConectarToken(true); vk.setTokenInput(''); vk.setTokenLookup(null); vk.setTokenMsg('') }}
            disabled={bodegaPuedeEnviar}
            title={bodegaPuedeEnviar ? 'Tu empresa ya tiene bodega propia' : ''}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors">
            🔗 Token
          </button>
          <button
            onClick={() => { vk.setModalVinculada(true) }}
            disabled={!tieneBodega}
            title={!tieneBodega ? 'Requiere empleado de bodega activo' : ''}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors">
            + Nueva
          </button>
        </div>
      </div>

      {vk.vinculadas.length === 0 && vk.conectadas.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-3">Sin empresas vinculadas</p>
      ) : (
        <div className="space-y-2">
          {vk.vinculadas.map(v => (
            <div key={v.id} className="rounded-xl px-4 py-3 space-y-2" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)', opacity: v.activa ? 1 : 0.5 }}>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                <p className="text-white text-sm font-medium flex-1">{v.nombre === 'Pendiente' ? '⏳ Esperando conexión' : v.nombre}</p>
              </div>
              {v.conectadaAt && <p className="text-zinc-600 text-xs">Integrada el {new Date(v.conectadaAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-500 text-xs">🚚 Inicio bodega:</span>
                <input type="date"
                  value={vk.fechaVinculadaLocal[v.id] ?? (v.fechaInicioBodega ? v.fechaInicioBodega.split('T')[0] : '')}
                  onChange={e => vk.setFechaVinculadaLocal(p => ({ ...p, [v.id]: e.target.value }))}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-white text-xs outline-none focus:border-blue-500" />
                <button
                  onClick={() => vk.guardarFechaInicioBodega(v.id, vk.fechaVinculadaLocal[v.id] ?? '')}
                  disabled={!vk.fechaVinculadaLocal[v.id]}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
                  Guardar
                </button>
                {v.activa ? (
                  <button onClick={() => vk.setConfirmVinculada(v.id)} className="text-zinc-400 hover:text-red-400 text-sm px-2 py-1 rounded-lg transition-colors">🚫</button>
                ) : (
                  <button onClick={() => vk.toggleActivaVinculada(v.id, true)} className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors font-semibold">Reactivar</button>
                )}
              </div>
              {vk.sincVinculadaMsg[v.id] && <p className="text-emerald-400 text-xs">{vk.sincVinculadaMsg[v.id]}</p>}
              {vk.confirmVinculada === v.id && (
                <div className="rounded-xl p-3 mt-1 border border-red-500/30 bg-red-500/10 space-y-2">
                  <p className="text-white text-xs font-semibold">¿Inactivar esta vinculación?</p>
                  <p className="text-zinc-400 text-xs">No podrá despachar órdenes. El historial se conserva.</p>
                  <div className="flex gap-2">
                    <button onClick={() => vk.toggleActivaVinculada(v.id, false)} className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Inactivar</button>
                    <button onClick={() => vk.setConfirmVinculada(null)} className="text-zinc-500 text-xs px-2 py-1.5 rounded-lg hover:text-zinc-300 transition-colors">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {vk.conectadas.map(v => (
            <div key={v.id} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
              <span className="w-3 h-3 rounded-full flex-shrink-0 bg-emerald-500" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">✅ {v.nombreEmpresaPrincipal}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Conectada como cliente</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva vinculada */}
      {vk.modalVinculada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => { if (!vk.tokenGenerado) vk.setModalVinculada(false) }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4" onClick={e => e.stopPropagation()}>
            {!vk.tokenGenerado ? (
              <>
                <h3 className="text-white font-semibold">Nueva empresa vinculada</h3>
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Color identificador</label>
                  <div className="flex gap-2">
                    {['#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#84cc16', '#f59e0b'].map(c => (
                      <button key={c} onClick={() => vk.setNuevaVinculada(p => ({ ...p, color: c }))}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${vk.nuevaVinculada.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                {vk.msgVinculada && <p className="text-sm text-red-400">{vk.msgVinculada}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => vk.setModalVinculada(false)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm">Cancelar</button>
                  <button onClick={vk.crearVinculada} disabled={vk.creandoVinculada}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
                    {vk.creandoVinculada ? 'Generando...' : 'Generar token'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-white font-semibold">✅ Token generado</h3>
                <p className="text-zinc-400 text-xs">Comparte este token con la empresa. Solo se muestra una vez.</p>
                <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
                  <p className="text-white font-mono text-xs flex-1 break-all">{vk.tokenGenerado}</p>
                  <button onClick={() => navigator.clipboard.writeText(vk.tokenGenerado!)} className="text-violet-400 hover:text-violet-300 flex-shrink-0 text-xs font-semibold">Copiar</button>
                </div>
                <p className="text-amber-400 text-xs text-center">⚠️ Este token no volverá a mostrarse</p>
                <button onClick={() => { vk.setTokenGenerado(null); vk.setModalVinculada(false) }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl text-sm">
                  ✓ Ya lo copié, cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal conectar token */}
      {vk.modalConectarToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => { vk.setModalConectarToken(false); vk.setTokenLookup(null); vk.setTokenMsg('') }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">🔗 Conectar con empresa</h3>
            <p className="text-zinc-400 text-xs">Ingresa el token que te compartió la empresa para vincularse.</p>
            <input
              value={vk.tokenInput}
              onChange={e => { vk.setTokenInput(e.target.value); vk.setTokenLookup(null); vk.setTokenMsg('') }}
              placeholder="Pega el token aquí..."
              className="w-full rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-violet-500 font-mono"
              style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}
            />
            {vk.tokenLookup && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
                <p className="text-emerald-400 text-sm font-semibold">✅ Conectado a {vk.tokenLookup.nombre}</p>
                <p className="text-zinc-400 text-xs mt-0.5">Confirma para completar la vinculación</p>
              </div>
            )}
            {vk.tokenMsg && (
              <p className={`text-xs text-center ${vk.tokenMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{vk.tokenMsg}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => { vk.setModalConectarToken(false); vk.setTokenLookup(null); vk.setTokenMsg('') }} className="flex-1 bg-zinc-800 text-white py-2 rounded-xl text-sm">Cancelar</button>
              {!vk.tokenLookup ? (
                <button onClick={vk.buscarToken} disabled={vk.buscandoToken || !vk.tokenInput.trim()}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-2 rounded-xl text-sm font-semibold">
                  {vk.buscandoToken ? 'Buscando...' : 'Verificar'}
                </button>
              ) : (
                <button onClick={vk.confirmarConexionToken} disabled={vk.conectandoToken}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white py-2 rounded-xl text-sm font-semibold">
                  {vk.conectandoToken ? 'Conectando...' : '✓ Confirmar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Seccion>
  )
}
