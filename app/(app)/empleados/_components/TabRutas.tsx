'use client'
import type { UseTurnos } from '../_lib/useTurnos'
import { ROL_ICON } from '../_lib/tipos'

export default function TabRutas({ turnos }: { turnos: UseTurnos }) {
  const {
    subTabRutas, setSubTabRutas,
    turnosHoy,
    turnosHistorial,
    filtroRol, setFiltroRol,
    loadingTurnos,
    paginaHist, totalPaginasHist, totalHist,
    cargarTurnos,
  } = turnos

  return (
    <div className="space-y-4">
      {/* Subtabs */}
      <div className="flex gap-2">
        <button onClick={() => { setSubTabRutas('hoy'); cargarTurnos('hoy') }}
          className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${subTabRutas === 'hoy' ? 'bg-[#09091e] border-[rgba(59,130,246,0.60)] text-white' : 'bg-[rgba(8,8,28,0.60)] border-[rgba(59,130,246,0.20)] text-zinc-400 hover:text-white'}`}>
          📅 Hoy
        </button>
        <button onClick={() => setSubTabRutas('historial')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${subTabRutas === 'historial' ? 'bg-[#09091e] border-[rgba(59,130,246,0.60)] text-white' : 'bg-[rgba(8,8,28,0.60)] border-[rgba(59,130,246,0.20)] text-zinc-400 hover:text-white'}`}>
          📋 Historial
        </button>
      </div>

      {/* Filtro rol — solo en historial */}
      {subTabRutas === 'historial' && (
        <div className="flex gap-2 flex-wrap">
          {['', 'vendedor', 'entregas', 'supervisor', 'impulsadora', 'bodega'].map(r => (
            <button key={r} onClick={() => setFiltroRol(r)}
              className={`px-3 py-1.5 text-xs rounded-xl border font-semibold transition-colors ${filtroRol === r ? 'bg-[#09091e] border-[rgba(59,130,246,0.50)] text-white' : 'bg-[rgba(8,8,28,0.60)] border-[rgba(59,130,246,0.20)] text-zinc-400 hover:text-white'}`}>
              {r === '' ? 'Todos' : ROL_ICON[r] + ' ' + r}
            </button>
          ))}
        </div>
      )}

      {loadingTurnos ? (
        <div className="text-center py-10 text-zinc-500 text-sm">Cargando...</div>
      ) : (
        <>
          {/* HOY */}
          {subTabRutas === 'hoy' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {turnosHoy.length === 0 ? (
                <div style={{ background:"#060a24", border:"1px solid rgba(59,130,246,0.20)", borderRadius:16, padding:40, textAlign:"center" }}>
                  <p className="text-3xl mb-2">😴</p>
                  <p className="text-zinc-400">Sin turnos activos hoy</p>
                </div>
              ) : turnosHoy.map((t: any) => (
                <div key={t.id} style={{ background:"#060a24", border:`1px solid ${t.activo ? "rgba(59,130,246,0.40)" : "#0f2540"}`, borderRadius:16, padding:16 }} className={`space-y-3`}>
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{ROL_ICON[t.rol] || '👤'}</span>
                      <p className="text-white font-semibold text-sm truncate">{t.empleado}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${t.activo ? (t.pausado ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400') : 'bg-zinc-700 text-zinc-400'}`}>
                      {t.activo ? (t.pausado ? '⏸ Pausa' : '🟢 Activo') : '✅ Fin'}
                    </span>
                  </div>
                  {/* Inicio / Fin */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-zinc-500 mb-0.5">🟢 Inicio</p>
                      {t.latInicio && t.lngInicio ? (
                        <a href={`https://www.google.com/maps?q=${t.latInicio},${t.lngInicio}`} target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline font-medium">{t.inicio}</a>
                      ) : (
                        <p className="text-white font-medium">{t.inicio}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-zinc-500 mb-0.5">🔴 Fin</p>
                      {t.fin ? (
                        t.latFin && t.lngFin ? (
                          <a href={`https://www.google.com/maps?q=${t.latFin},${t.lngFin}`} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline font-medium">{t.fin}</a>
                        ) : (
                          <p className="text-white font-medium">{t.fin}</p>
                        )
                      ) : (
                        <p className="text-zinc-600">—</p>
                      )}
                    </div>
                  </div>
                  {/* Pausa */}
                  {t.pausaMotivo && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs">
                      <span className="text-amber-400 font-semibold">
                        ☕ {t.pausaMotivo}
                        {t.pausaInicio ? ` · ${t.pausaInicio}` : ''}
                        {t.pausaDuracionMin ? ` · ${t.pausaDuracionMin}min` : ''}
                      </span>
                    </div>
                  )}
                  {/* Duración */}
                  <div className="flex items-center gap-3 text-xs border-t border-zinc-800 pt-2">
                    <span className="text-zinc-500">⏱ Efectivo:</span>
                    <span className="text-white font-semibold">{t.duracionEfectiva}</span>
                    {t.pausaDuracionMin > 0 && (
                      <><span className="text-zinc-600">Total:</span><span className="text-zinc-400">{t.duracionTotal}</span></>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HISTORIAL */}
          {subTabRutas === 'historial' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {turnosHistorial.length === 0 ? (
                <div style={{ background:"#060a24", border:"1px solid rgba(59,130,246,0.20)", borderRadius:16, padding:40, textAlign:"center" }}>
                  <p className="text-zinc-400">Sin historial en los últimos 30 días</p>
                </div>
              ) : turnosHistorial.map((t: any) => (
                <div key={t.id} style={{ background:"#060a24", border:"1px solid rgba(59,130,246,0.20)", borderRadius:16, padding:16 }}>
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{ROL_ICON[t.rol] || '👤'}</span>
                      <p className="text-white font-semibold text-sm truncate">{t.empleado}</p>
                    </div>
                    <span className="text-zinc-500 text-xs flex-shrink-0">{t.fecha}</span>
                  </div>
                  {/* Inicio / Fin */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-zinc-500 mb-0.5">🟢 Inicio</p>
                      {t.latInicio && t.lngInicio ? (
                        <a href={`https://www.google.com/maps?q=${t.latInicio},${t.lngInicio}`} target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline font-medium">{t.inicio}</a>
                      ) : (
                        <p className="text-white font-medium">{t.inicio}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-zinc-500 mb-0.5">🔴 Fin</p>
                      {t.latFin && t.lngFin ? (
                        <a href={`https://www.google.com/maps?q=${t.latFin},${t.lngFin}`} target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline font-medium">{t.fin}</a>
                      ) : (
                        <p className="text-white font-medium">{t.fin || '—'}</p>
                      )}
                    </div>
                  </div>
                  {/* Pausa */}
                  {t.pausaMotivo && (
                    <p className="text-zinc-500 text-xs">
                      ☕ {t.pausaMotivo}
                      {t.pausaInicio ? ` · ${t.pausaInicio}` : ''}
                      {t.pausaDuracionMin ? ` · ${t.pausaDuracionMin}min` : ''}
                    </p>
                  )}
                  {/* Duración */}
                  <div className="flex items-center gap-3 text-xs border-t border-zinc-800 pt-2">
                    <span className="text-zinc-500">⏱ Efectivo:</span>
                    <span className="text-white font-semibold">{t.duracionEfectiva}</span>
                    {t.pausaDuracionMin > 0 && (
                      <><span className="text-zinc-600">Total:</span><span className="text-zinc-400">{t.duracionTotal}</span></>
                    )}
                  </div>
                </div>
              ))}
              {/* Cargar más */}
              {paginaHist < totalPaginasHist && (
                <div className="col-span-full">
                  <button onClick={() => cargarTurnos('historial', filtroRol, paginaHist + 1)}
                    disabled={loadingTurnos}
                    style={{ background:"rgba(8,8,28,0.82)", border:"1px solid rgba(59,130,246,0.30)", borderRadius:12, padding:"10px 0", color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:600, width:"100%", cursor:"pointer" }}>
                    {loadingTurnos ? 'Cargando...' : `Cargar más (${turnosHistorial.length} de ${totalHist})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
