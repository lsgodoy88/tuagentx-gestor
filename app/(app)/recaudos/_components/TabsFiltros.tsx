'use client'
import type { UseRecaudos } from '../_lib/useRecaudos'
import { TABS } from '../_lib/tipos'
import { fmtFechaBtn, fmtMonto } from '../_lib/utils'

export function TabsFiltros({ r }: { r: UseRecaudos }) {
  const {
    tab, setTab, puedeEditarRecaudos, haySeleccion, enviandoSeleccionados, enviarSeleccionados,
    seleccionados, isAdmin, vendedorId, setVendedorId, vendedores, fecha, setFecha,
    fechaInputRef, puedeAdminRecaudos, modalEliminarPaso, abrirModalEliminar, cerrarModalEliminar,
    reciboBuscado, setReciboBuscado, buscarPorRecibo, errorBusquedaRecibo, buscandoRecibo,
    pagoEncontrado, confirmarEliminarPorRecibo, eliminando,
  } = r

  return (
    <>
      {/* Tabs principales */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 py-2 text-base font-semibold transition-colors text-center ${tab === t.key ? 'tab-active' : 'text-white hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros — una línea, ancho completo */}
      <div style={{display:'flex',gap:8,width:'100%',alignItems:'stretch'}}>
        {/* Enviar — solo tab pendiente, habilitado solo con selección */}
        {tab === 'pendiente' && puedeEditarRecaudos && (
          <button
            onClick={() => enviarSeleccionados()}
            disabled={!haySeleccion || enviandoSeleccionados}
            style={{flexShrink:0,background:haySeleccion?'rgba(37,99,235,0.35)':'#1e2a3d',border:haySeleccion?'1px solid rgba(96,165,250,0.5)':'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'8px 16px',fontSize:12,fontWeight:700,color:haySeleccion?'white':'rgba(255,255,255,0.4)',cursor:haySeleccion?'pointer':'not-allowed',whiteSpace:'nowrap'}}>
            {enviandoSeleccionados ? '⏳ Enviando...' : `📤 Enviar${haySeleccion ? ` (${seleccionados.size})` : ''}`}
          </button>
        )}
        {/* Vendedor — flex restante */}
        {isAdmin && (
          <div style={{flex:1,background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',minWidth:0,overflow:'hidden'}}>
            <select
              value={vendedorId}
              onChange={e => setVendedorId(e.target.value)}
              className="bg-[#0d1220] border border-[#1e2a3d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none w-full cursor-pointer" style={{fontWeight:600}}>
              <option value="">Vendedor</option>
              {vendedores.map(v => (
                <option key={v.id} value={v.id} style={{background:'#060a24'}}>{v.nombre.split(' ')[0]}</option>
              ))}
            </select>
          </div>
        )}
        {/* Calendario — botón limpio + popover */}
        <div style={{position:'relative',flexShrink:0}}>
          <button
            onClick={() => {
              if (fecha) { setFecha(''); return }
              try { fechaInputRef.current?.showPicker?.() } catch {}
              fechaInputRef.current?.click()
            }}
            style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:6,height:40,boxSizing:'border-box',outline:'none',position:'relative'}}>
            <span style={{fontSize:18,lineHeight:1}}>📅</span>
            {fecha && <span style={{fontSize:10,fontWeight:700,color:'white'}}>{fmtFechaBtn(fecha)} ✕</span>}
          </button>
          <input
            ref={fechaInputRef}
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            style={{position:'absolute',opacity:0,pointerEvents:'none',width:0,height:0}}
          />
        </div>
        {/* Eliminar por recibo — oculto en tab Revisar */}
        {tab !== 'revisar' && puedeEditarRecaudos && <div style={{position:'relative',flexShrink:0}} data-popover-eliminar>
          <button
            onClick={() => { if (!puedeAdminRecaudos) return; modalEliminarPaso === 'cerrado' ? abrirModalEliminar() : cerrarModalEliminar() }}
            title="Eliminar por recibo"
            style={{flexShrink:0,background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'8px 14px',display:'flex',alignItems:'center',height:40,boxSizing:'border-box',fontSize:18,lineHeight:1,cursor:'pointer'}}>
            🗑️
          </button>

          {/* Popover eliminar por número de recibo */}
          {modalEliminarPaso !== 'cerrado' && (
            <div style={{
              position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:100,
              background:'rgba(8,12,30,0.98)', border:'1px solid rgba(59,130,246,0.35)',
              borderRadius:14, padding:14, width:260,
              boxShadow:'0 16px 40px rgba(0,0,0,0.6)',
            }}>
              {modalEliminarPaso === 'pedir' ? (
                <>
                  <div className="flex items-center justify-between" style={{marginBottom:10}}>
                    <span style={{fontSize:11, letterSpacing:'0.10em', color:'#475569', textTransform:'uppercase'}}>Eliminar recibo</span>
                    <button onClick={cerrarModalEliminar} className="text-white">✕</button>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={reciboBuscado}
                    onChange={e => setReciboBuscado(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') buscarPorRecibo() }}
                    placeholder="Número de recibo"
                    className="w-full bg-[#0d1220] border border-[#1e2a3d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    style={{marginBottom:10}}
                  />
                  {errorBusquedaRecibo && (
                    <p className="text-red-400 text-xs" style={{marginBottom:8}}>{errorBusquedaRecibo}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button onClick={cerrarModalEliminar}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                      Cancelar
                    </button>
                    <button onClick={buscarPorRecibo} disabled={buscandoRecibo || !reciboBuscado.trim()}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                      {buscandoRecibo ? 'Buscando...' : 'Buscar'}
                    </button>
                  </div>
                </>
              ) : pagoEncontrado && (
                <>
                  <div className="flex items-center justify-between" style={{marginBottom:10}}>
                    <span style={{fontSize:11, letterSpacing:'0.10em', color:'#475569', textTransform:'uppercase'}}>¿Eliminar recibo?</span>
                    <button onClick={cerrarModalEliminar} className="text-white">✕</button>
                  </div>
                  <p className="text-white text-sm" style={{marginBottom:10}}>
                    ¿Seguro deseas eliminar el recibo de{' '}
                    <span className="font-semibold">{pagoEncontrado.Cartera?.Cliente?.nombre || (pagoEncontrado as any).cliente?.nombre || 'cliente sin cartera'}</span>
                    {' '}por valor{' '}
                    <span className="font-mono font-semibold">{fmtMonto(pagoEncontrado.monto)}</span>?
                  </p>
                  {errorBusquedaRecibo && (
                    <p className="text-red-400 text-xs" style={{marginBottom:8}}>{errorBusquedaRecibo}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button onClick={cerrarModalEliminar}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                      Cancelar
                    </button>
                    <button onClick={confirmarEliminarPorRecibo} disabled={eliminando}
                      className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                      {eliminando ? 'Eliminando...' : 'Confirmar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>}
      </div>
    </>
  )
}
