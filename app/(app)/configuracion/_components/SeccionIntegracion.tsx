'use client'
import { Seccion } from './Seccion'
import { eyeOpen, eyeOff } from '../_lib/icons'
import { inputClass, labelClass } from '../_lib/utils'
import type { Integracion } from '../_lib/useIntegracion'



interface Props extends Integracion {
  isOpen: boolean
  onToggle: () => void
}

export function SeccionIntegracion({ isOpen, onToggle, ...ig }: Props) {
  return (
    <Seccion titulo="Modo de integración" icono="⚙️" isOpen={isOpen} onToggle={onToggle}>
      <p className="text-zinc-500 text-xs">Define cómo se sincronizan clientes, cartera y recaudos.</p>

      {/* ── Card API UpTres ── */}
      <div className={`rounded-2xl border transition-colors ${ig.modoSel === 'erp' ? 'border-violet-500/60 bg-violet-500/5' : 'border-zinc-700 bg-zinc-800/40'}`}>
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => ig.setModoSel('erp')}>
          <div className="flex items-center gap-3">
            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${ig.modoSel === 'erp' ? 'border-violet-500 bg-violet-500' : 'border-zinc-500'}`} />
            <div>
              <p className="text-white text-sm font-medium">🔗 API UpTres</p>
              <p className="text-zinc-500 text-xs">Sincroniza clientes, cartera e impulso</p>
            </div>
          </div>
          {ig.modoActivo === 'erp' && <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-semibold">Activo</span>}
        </div>
        {ig.modoSel === 'erp' && (
          <div className="px-4 pb-4 pt-1 border-t border-zinc-700 space-y-3">
            {ig.erpConectado ? (
              <>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✅</span>
                    <p className="text-emerald-400 text-sm font-semibold">Conectado</p>
                  </div>
                  {ig.ultimaSync && (
                    <p className="text-zinc-500 text-xs mt-0.5">
                      Última sync: {new Date(ig.ultimaSync).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
                    </p>
                  )}
                  {ig.syncHistorial.length > 0 && (
                    <div className="mt-4">
                      <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">Historial sync</p>
                      <div className="space-y-1.5">
                        {ig.syncHistorial.map((s: any) => {
                          const durSeg = s.duracionMs ? Math.round(s.duracionMs / 1000) : null
                          const fecha = new Date(s.inicio).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
                          return (
                            <div key={s.id} className={`rounded-xl px-3 py-2 text-xs border ${s.estado === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-800/60 border-zinc-700/50'}`}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-zinc-300 font-medium">{fecha}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.disparadoPor === 'manual' ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-700 text-zinc-400'}`}>
                                    {s.disparadoPor === 'manual' ? 'Manual' : 'Auto'}
                                  </span>
                                  <span className={s.estado === 'error' ? 'text-red-400' : 'text-emerald-400'}>{s.estado === 'error' ? '✗' : '✓'}</span>
                                </div>
                              </div>
                              {s.estado !== 'error' ? (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-500">
                                  <span>{s.deudasSincronizadas} deudas</span>
                                  {s.zombis > 0 && <span className="text-orange-400">{s.zombis} cerradas</span>}
                                  {s.pagosConfrontados > 0 && <span className="text-cyan-400">{s.pagosConfrontados} pagos</span>}
                                  {durSeg && <span>{durSeg}s</span>}
                                </div>
                              ) : (
                                <p className="text-red-400">{(s.errores as any)?.message || 'Error desconocido'}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {!ig.syncInicial ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 space-y-2">
                    <p className="text-amber-400 text-sm font-semibold">⚠️ Sincronización inicial pendiente</p>
                    <p className="text-zinc-400 text-xs">Carga todos los clientes, cartera y datos de impulso. Solo se ejecuta una vez.</p>
                    {ig.msgSync && <p className="text-sm text-emerald-400">{ig.msgSync}</p>}
                    <button onClick={ig.ejecutarSyncInicial} disabled={ig.sincronizando}
                      className={`w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold px-4 py-2 rounded-xl text-sm ${ig.sincronizando ? 'btn-shimmer' : ''}`}>
                      {ig.sincronizando ? 'Sincronizando...' : '🚀 Ejecutar sincronización inicial'}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl px-4 py-3" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
                    <p className="text-zinc-400 text-xs">✅ Sync inicial completada</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Delta diario 3am Bogotá</p>
                    {ig.msgSync && <p className="text-sm text-emerald-400 mt-1">{ig.msgSync}</p>}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={ig.syncDelta} disabled={ig.sincronizando || ig.sincronizandoNocturno}
                    className={`bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/20 font-semibold px-4 py-2 rounded-xl text-sm transition-colors ${ig.sincronizando ? 'btn-shimmer' : ''}`}>
                    {ig.sincronizando ? 'Sincronizando...' : '🔄 Sync'}
                  </button>
                  <button onClick={ig.syncNocturno} disabled={ig.sincronizando || ig.sincronizandoNocturno}
                    className={`bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 font-semibold px-4 py-2 rounded-xl text-sm transition-colors ${ig.sincronizandoNocturno ? 'btn-shimmer' : ''}`}>
                    {ig.sincronizandoNocturno ? 'Sincronizando...' : '🌙 Sync Completo'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={labelClass}>API Key</label>
                  <input value={ig.uptresApiKey} onChange={e => ig.setUptresApiKey(e.target.value)} placeholder="pk_..." className={inputClass} onClick={e => e.stopPropagation()} />
                </div>
                <div>
                  <label className={labelClass}>API Secret</label>
                  <div className="relative">
                    <input type={ig.showUptresSecret ? 'text' : 'password'} value={ig.uptresApiSecret} onChange={e => ig.setUptresApiSecret(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-10'} onClick={e => e.stopPropagation()} />
                    <button type="button" tabIndex={-1} onClick={e => { e.stopPropagation(); ig.setShowUptresSecret(p => !p) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                      {ig.showUptresSecret ? eyeOff : eyeOpen}
                    </button>
                  </div>
                </div>
                {ig.msgErp && <p className="text-sm text-red-400">{ig.msgErp}</p>}
                <button onClick={e => { e.stopPropagation(); ig.validarUpTres() }} disabled={ig.conectandoErp || !ig.uptresApiKey || !ig.uptresApiSecret}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                  {ig.conectandoErp ? 'Validando...' : 'Validar conexión'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Card API Universal ── */}
      <div className={`rounded-2xl border transition-colors ${ig.modoSel === 'api' ? 'border-sky-500/60 bg-sky-500/5' : 'border-zinc-700 bg-zinc-800/40'}`}>
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => { ig.setModoSel('api'); if (ig.modoActivo !== 'api') ig.setPasoApi(1) }}>
          <div className="flex items-center gap-3">
            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${ig.modoSel === 'api' ? 'border-sky-500 bg-sky-500' : 'border-zinc-500'}`} />
            <div>
              <p className="text-white text-sm font-medium">🌐 API Universal</p>
              <p className="text-zinc-500 text-xs">Conecta con cualquier sistema via REST</p>
            </div>
          </div>
          {ig.modoActivo === 'api' && <span className="text-xs bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full font-semibold">Activo</span>}
        </div>
        {ig.modoSel === 'api' && (
          <div className="px-4 pb-4 pt-1 border-t border-zinc-700 space-y-3" onClick={e => e.stopPropagation()}>
            {ig.modoActivo === 'api' ? (
              <>
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3">
                  <p className="text-sky-400 text-sm font-semibold">✅ Conectado</p>
                  <p className="text-zinc-400 text-xs mt-0.5 font-mono truncate">{ig.intUrl}</p>
                </div>
                {ig.resultValidacion && (
                  <div className="space-y-1.5 rounded-xl p-3" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
                    {Object.entries(ig.resultValidacion).map(([ep, r]: any) => (
                      <div key={ep} className="flex items-center gap-2 text-xs">
                        <span>{r.ok ? '✅' : r.error === 'timeout' ? '⏱️' : '❌'}</span>
                        <span className="text-zinc-300 w-20">{ep}</span>
                        <span className="text-zinc-500 font-mono">{ig.endpointsDetectados?.[ep]?.path ?? '/' + ep}</span>
                        <span className="text-zinc-600 ml-auto">{r.ok ? `${r.status}` : r.error ?? r.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : ig.pasoApi === 1 ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                  <p className="text-zinc-300 text-xs font-semibold">Credenciales</p>
                </div>
                <div>
                  <label className={labelClass}>URL base</label>
                  <input value={ig.intUrl} onChange={e => ig.setIntUrl(e.target.value)} placeholder="https://api.ejemplo.com" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Token / API Key</label>
                  <div className="relative">
                    <input type={ig.showIntToken ? 'text' : 'password'} value={ig.intToken} onChange={e => ig.setIntToken(e.target.value)} placeholder="••••••••••••••••" className={inputClass + ' pr-10'} />
                    <button type="button" tabIndex={-1} onClick={() => ig.setShowIntToken(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                      {ig.showIntToken ? eyeOff : eyeOpen}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Documentación de la API <span className="text-zinc-600">(opcional — para análisis IA)</span></label>
                  <textarea value={ig.docApi} onChange={e => ig.setDocApi(e.target.value)} rows={4} placeholder="Pega aquí la documentación, Swagger o ejemplos de endpoints…"
                    className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-sky-500 resize-none" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {ig.docApi.trim() && (
                    <button onClick={ig.analizarDocs} disabled={ig.analizando}
                      className="bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                      {ig.analizando ? '🤖 Analizando...' : '🤖 Analizar con IA'}
                    </button>
                  )}
                  <button onClick={ig.validarConexionApi} disabled={ig.validando || !ig.intUrl}
                    className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                    {ig.validando ? 'Validando...' : '✓ Validar conexión'}
                  </button>
                </div>
              </>
            ) : ig.pasoApi === 2 ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                  <p className="text-zinc-300 text-xs font-semibold">Endpoints detectados — edita si es necesario</p>
                </div>
                <div className="rounded-xl p-3 space-y-2" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
                  {(['clientes', 'cartera', 'empleados', 'recaudos'] as const).map(ep => (
                    <div key={ep} className="flex items-center gap-2">
                      <span className="text-zinc-500 text-xs w-20 flex-shrink-0">{ep}</span>
                      <select value={ig.endpointsDetectados?.[ep]?.method ?? 'GET'}
                        onChange={e => ig.setEndpointsDetectados((p: any) => ({ ...p, [ep]: { ...p?.[ep], method: e.target.value } }))}
                        className="bg-zinc-700 border border-zinc-600 rounded-lg px-2 py-1 text-white text-xs w-20 flex-shrink-0">
                        <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option>
                      </select>
                      <input value={ig.endpointsDetectados?.[ep]?.path ?? ''}
                        onChange={e => ig.setEndpointsDetectados((p: any) => ({ ...p, [ep]: { ...p?.[ep], path: e.target.value } }))}
                        className="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-2 py-1 text-white text-xs min-w-0" />
                    </div>
                  ))}
                  {ig.mapeoIA && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <p className="text-zinc-500 text-xs mb-1 font-semibold">Mapeo de campos sugerido</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {Object.entries(ig.mapeoIA).map(([k, v]: any) => (
                          <p key={k} className="text-xs text-zinc-400"><span className="text-zinc-500">{k}:</span> {v}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => ig.setPasoApi(1)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm">← Volver</button>
                  <button onClick={ig.validarConexionApi} disabled={ig.validando || !ig.intUrl}
                    className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                    {ig.validando ? 'Validando...' : '✓ Validar conexión'}
                  </button>
                </div>
              </>
            ) : (() => {
              const eps = ig.resultValidacion ? Object.entries(ig.resultValidacion) : []
              const okCount = eps.filter(([, r]: any) => r.ok).length
              return (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
                    <p className="text-zinc-300 text-xs font-semibold">Resultado de validación</p>
                  </div>
                  <div className="rounded-xl p-3 space-y-2" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
                    {eps.map(([ep, r]: any) => (
                      <div key={ep} className="flex items-center gap-2 text-xs">
                        <span className="w-4">{r.ok ? '✅' : r.error === 'timeout' ? '⏱️' : '❌'}</span>
                        <span className="text-zinc-300 w-20 flex-shrink-0">{ep}</span>
                        <span className="text-zinc-500 font-mono text-xs truncate flex-1">{ig.endpointsDetectados?.[ep]?.path ?? '/' + ep}</span>
                        <span className={`font-mono text-xs flex-shrink-0 ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                          {r.ok ? `${r.status}` : r.error === 'timeout' ? 'timeout' : `${r.status || '???'}`}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-zinc-700">
                      <p className={`text-xs font-semibold ${okCount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {okCount} de {eps.length} endpoints activos
                      </p>
                    </div>
                  </div>
                  {okCount > 0 ? (
                    <button onClick={ig.activarApiConexion} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm">
                      🚀 Activar integración
                    </button>
                  ) : (
                    <>
                      <p className="text-red-400 text-xs">Ningún endpoint respondió. Verifica la URL base, el token y los paths.</p>
                      <button onClick={() => ig.setPasoApi(ig.endpointsDetectados ? 2 : 1)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm">← Volver</button>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* Modal validación UpTres */}
      {ig.modalValidacion && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base">🔌 API UpTres</h3>
              {(ig.faseConexion === 'listo' || ig.faseConexion === 'error') && (
                <button onClick={() => { ig.setModalValidacion(false); ig.setFaseConexion('idle') }} className="text-zinc-500 hover:text-white text-xl">×</button>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-semibold uppercase">Endpoints</p>
              {Object.entries(ig.endpointsFase).map(([k, estado]) => (
                <div key={k} className="flex items-center justify-between py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-300 text-sm capitalize">{k}</span>
                  <span className="text-xs">
                    {estado === 'cargando' && <span className="text-zinc-400 animate-pulse">⏳ validando...</span>}
                    {estado === 'ok' && <span className="text-emerald-400">✅ {ig.validacion.counts?.[k] ?? 0} registros</span>}
                    {estado === 'error' && <span className="text-red-400">❌ sin acceso</span>}
                    {estado === 'pendiente' && <span className="text-zinc-600">—</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className={`rounded-xl p-3 text-center text-sm font-semibold ${
              ig.faseConexion === 'validando' ? 'bg-blue-500/10 text-blue-400' :
              ig.faseConexion === 'conectando' ? 'bg-amber-500/10 text-amber-400' :
              ig.faseConexion === 'sincronizando' ? 'bg-purple-500/10 text-purple-400' :
              ig.faseConexion === 'listo' ? 'bg-emerald-500/10 text-emerald-400' :
              ig.faseConexion === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {ig.faseConexion === 'validando' && <span className="animate-pulse">🔄 Validando conexión...</span>}
              {ig.faseConexion === 'conectando' && <span className="animate-pulse">🔗 Activando integración...</span>}
              {ig.faseConexion === 'sincronizando' && <span className="animate-pulse">⚡ Sincronizando datos...</span>}
              {ig.faseConexion === 'listo' && (
                <div className="space-y-1">
                  <p>✅ Todo listo</p>
                  {Object.keys(ig.syncResultado).length > 0 && (
                    <div className="text-xs text-emerald-300 space-y-0.5 mt-1">
                      {ig.syncResultado.clientes !== undefined && <p>👥 {ig.syncResultado.clientes} clientes</p>}
                      {ig.syncResultado.deudas !== undefined && <p>📋 {ig.syncResultado.deudas} deudas</p>}
                    </div>
                  )}
                </div>
              )}
              {ig.faseConexion === 'error' && <span>❌ {ig.msgErp || 'Error de conexión'}</span>}
            </div>
            {ig.faseConexion === 'error' && (
              <div className="flex gap-2">
                <button onClick={() => { ig.setModalValidacion(false); ig.setFaseConexion('idle') }} className="flex-1 bg-zinc-800 text-white py-2 rounded-xl text-sm">Cerrar</button>
                <button onClick={ig.validarUpTres} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-semibold">🔄 Reintentar</button>
              </div>
            )}
            {ig.faseConexion === 'listo' && (
              <button onClick={() => { ig.setModalValidacion(false); ig.setFaseConexion('idle') }} className="w-full bg-emerald-600 text-white py-2 rounded-xl text-sm font-semibold">✓ Cerrar</button>
            )}
          </div>
        </div>
      )}
    </Seccion>
  )
}
