'use client'
import React from 'react'
import SelectorMes from '@/components/SelectorMes'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

interface CarteraTabPagosProps {
  pagos: any[]
  pagosGlobal: any[]
  loadingPagosGlobal: boolean
  busquedaPagos: string
  setBusquedaPagos: (v: string) => void
  vendedorPagoId: string
  setVendedorPagoId: (v: string) => void
  filtroDia: string
  setFiltroDia: (v: string) => void
  pickerDiaAbierto: boolean
  setPickerDiaAbierto: React.Dispatch<React.SetStateAction<boolean>>
  mesPagos: number
  setMesPagos: (v: number) => void
  anioPagos: number
  setAnioPagos: (v: number) => void
  notaPopupId: string | null
  setNotaPopupId: React.Dispatch<React.SetStateAction<string | null>>
  isDesktopPagos: boolean
  filtroDiaInputRef: React.RefObject<HTMLInputElement | null>
  cargarPagos: (mes?: number, anio?: number, vendedorId?: string, diaOverride?: string) => Promise<void>
  vendedores: any[]
  isAdmin: boolean
  abrirRecibo: (pagoId: string) => Promise<void>
  alertaVoucherPopupId: string | null
  setAlertaVoucherPopupId: React.Dispatch<React.SetStateAction<string | null>>
}

export default function CarteraTabPagos({
  pagos, pagosGlobal, loadingPagosGlobal, busquedaPagos, setBusquedaPagos,
  vendedorPagoId, setVendedorPagoId, filtroDia, setFiltroDia,
  pickerDiaAbierto, setPickerDiaAbierto, mesPagos, setMesPagos, anioPagos, setAnioPagos,
  notaPopupId, setNotaPopupId, isDesktopPagos, filtroDiaInputRef, cargarPagos,
  vendedores, isAdmin, abrirRecibo, alertaVoucherPopupId, setAlertaVoucherPopupId,
}: CarteraTabPagosProps) {
  return (
    <div key='tab-pagos' className='fade-up space-y-3'>

      {/* Filtros: mes + botón + buscador en una línea */}
      <div className="flex items-center gap-2">
        <SelectorMes
          value={`${anioPagos}-${String(mesPagos).padStart(2,'0')}`}
          onChange={v => { const [a,m] = v.split('-'); const anio=Number(a), mes=Number(m); setAnioPagos(anio); setMesPagos(mes); try { sessionStorage.setItem('cartera_mesPagos', String(mes)); sessionStorage.setItem('cartera_anioPagos', String(anio)) } catch {} const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); const [ah,mh] = hoyStr.split('-').map(Number); const diaRef = (mes === mh && anio === ah) ? hoyStr : `${String(anio)}-${String(mes).padStart(2,'0')}-01`; setFiltroDia(diaRef); cargarPagos(mes, anio, vendedorPagoId, diaRef) }}
        />

        {/* Filtro día — picker desplegable con día visible en botón */}
        <div data-picker-dia style={{position:'relative', flexShrink:0}}>
          <button
            onClick={() => setPickerDiaAbierto(v => !v)}
            title="Filtrar por día"
            style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'0 10px', height:36, borderRadius:10,
              border: filtroDia ? '1px solid rgba(59,130,246,0.70)' : '1px solid rgba(59,130,246,0.35)',
              background: filtroDia ? 'rgba(37,99,235,0.20)' : 'rgba(15,20,40,0.90)',
              cursor:'pointer', color: filtroDia ? '#bfdbfe' : '#93c5fd',
              transition:'all 0.15s', flexShrink:0,
            }}>
            {/* Ícono calendario */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
            </svg>
            {/* Día seleccionado */}
            <span style={{fontSize:13, fontWeight:700, lineHeight:1, letterSpacing:'-0.02em'}}>
              {filtroDia ? Number(filtroDia.split('-')[2]) : new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}).split('-')[2].replace(/^0/,'')}
            </span>
            {/* Punto indicador filtro activo */}
            {filtroDia && <span style={{width:5,height:5,borderRadius:'50%',background:'#3b82f6',flexShrink:0}}/>}
          </button>

          {/* Picker desplegable */}
          {pickerDiaAbierto && (
            <div style={{
              position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:100,
              background:'rgba(8,12,30,0.98)', border:'1px solid rgba(59,130,246,0.35)',
              borderRadius:14, padding:14, width:220,
              boxShadow:'0 16px 40px rgba(0,0,0,0.6)',
            }}>
              {/* Header */}
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
                <span style={{fontSize:11, letterSpacing:'0.10em', color:'#475569', textTransform:'uppercase'}}>Filtrar día</span>
                <button
                  onClick={() => { setFiltroDia(''); setPickerDiaAbierto(false); cargarPagos(mesPagos, anioPagos, vendedorPagoId, '') }}
                  style={{fontSize:10, color:'#3b82f6', cursor:'pointer', background:'none', border:'none', padding:'2px 6px', borderRadius:6}}>
                  Limpiar
                </button>
              </div>
              {/* Input date */}
              <input
                ref={filtroDiaInputRef}
                type="date"
                value={filtroDia || new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'})}
                onChange={e => { const d = e.target.value; setFiltroDia(d); setPickerDiaAbierto(false); cargarPagos(mesPagos, anioPagos, vendedorPagoId, d) }}
                onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {} }}
                style={{
                  width:'100%', background:'rgba(15,20,40,0.90)',
                  border:'1px solid rgba(59,130,246,0.30)', borderRadius:10,
                  color:'white', padding:'8px 10px', fontSize:13,
                  outline:'none', cursor:'pointer', marginBottom:10,
                  fontFamily:'inherit',
                }}
              />
              {/* Shortcuts */}
              <div style={{display:'flex', gap:5, flexWrap:'wrap'}}>
                {[
                  { label:'Hoy', val: new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}) },
                  { label:'Ayer', val: new Date(Date.now()-86400000).toLocaleDateString('en-CA',{timeZone:'America/Bogota'}) },
                ].map(s => (
                  <button key={s.label}
                    onClick={() => { setFiltroDia(s.val); setPickerDiaAbierto(false); cargarPagos(mesPagos, anioPagos, vendedorPagoId, s.val) }}
                    style={{
                      fontSize:11, padding:'4px 9px', borderRadius:8,
                      border: filtroDia === s.val ? '1px solid rgba(59,130,246,0.65)' : '1px solid rgba(59,130,246,0.22)',
                      background: filtroDia === s.val ? 'rgba(37,99,235,0.18)' : 'rgba(15,20,40,0.60)',
                      color: filtroDia === s.val ? '#93c5fd' : '#94a3b8',
                      cursor:'pointer', fontWeight: filtroDia === s.val ? 600 : 400,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative min-w-0" style={{flex:2}}>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={busquedaPagos}
            onChange={e => setBusquedaPagos(e.target.value)}
            placeholder="Cliente o factura..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-white text-sm outline-none focus:border-blue-500 placeholder:text-zinc-600"
          />
          {loadingPagosGlobal && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">...</span>}
          {busquedaPagos && (
            <button onClick={() => setBusquedaPagos('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs">✕</button>
          )}
        </div>
        {isAdmin && isDesktopPagos && (
          <select
            value={vendedorPagoId}
            onChange={e => { const v = e.target.value; setVendedorPagoId(v); cargarPagos(mesPagos, anioPagos, v) }}
            className={`flex-shrink-0 bg-[#0d1220] text-white rounded-lg px-2 py-2 text-sm focus:outline-none cursor-pointer ${vendedorPagoId ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}
            style={{flex:3, minWidth:0, fontSize:'0.9em'}}>
            <option value="">Vendedores</option>
            {vendedores.map((v: any) => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </select>
        )}
      </div>
      {isAdmin && !isDesktopPagos && (
        <select
          value={vendedorPagoId}
          onChange={e => { const v = e.target.value; setVendedorPagoId(v); cargarPagos(mesPagos, anioPagos, v) }}
          className={`w-full bg-[#0d1220] text-white rounded-lg px-2 py-2 text-sm focus:outline-none cursor-pointer ${vendedorPagoId ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}>
          <option value="">Todos los vendedores</option>
          {vendedores.map((v: any) => (
            <option key={v.id} value={v.id}>{v.nombre}</option>
          ))}
        </select>
      )}

      {/* Tabla scroll horizontal — funciona en móvil y desktop */}
      {loadingPagosGlobal ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-zinc-400 text-sm">Buscando pagos...</p>
        </div>
      ) : pagos.length === 0 && !busquedaPagos ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-2">💳</p>
          <p className="text-zinc-400">Sin pagos en este período</p>
        </div>
      ) : (() => {
        // Pre-calcular totales
        let totEfectivo = 0, totTransf = 0, totDesc = 0
        const qTrim = busquedaPagos.trim()
        const _pagosBase = qTrim.length >= 3 ? pagosGlobal : pagos
        const pagosFiltrados = _pagosBase

        const rows = pagosFiltrados.map((p: any) => {
          const lineas: any[] = Array.isArray(p.lineasPago) ? p.lineasPago : []
          const efectivoTotal = lineas.filter(l => l.metodoPago === 'efectivo').reduce((s, l) => s + Number(l.monto || 0), 0) || ((!p.lineasPago && (p.metodoPago || p.metodopago) === 'efectivo') ? Number(p.monto) : 0)
          const transfTotal   = lineas.filter(l => l.metodoPago !== 'efectivo' && l.metodoPago).reduce((s, l) => s + Number(l.monto || 0), 0) || ((!p.lineasPago && (p.metodoPago || p.metodopago) !== 'efectivo') ? Number(p.monto) : 0)
          const desc          = Number(p.descuento || 0)
          const saldoAnt      = Number(p.saldoAnterior || 0)
          const nuevoSaldo    = p.reciboPago?.saldoNuevo != null
            ? Number(p.reciboPago.saldoNuevo)
            : saldoAnt > 0 ? saldoAnt - Number(p.monto) - desc : null

          // Distribuir transf primero (más antigua → más reciente), luego efectivo para el resto
          const facturas: any[] = Array.isArray(p._facturas) && p._facturas.length > 0
            ? [...p._facturas].sort((a: any, b: any) => Number(a.numeroFactura || 0) - Number(b.numeroFactura || 0))
            : p.numeroFactura ? [{ numeroFactura: p.numeroFactura, montoAplicado: p.monto }] : []
          let transfRestante = transfTotal
          let efectivoRestante = efectivoTotal
          const _facturasConMetodo = facturas.map((f: any) => {
            const monto = Number(f.montoAplicado || 0)
            const tAplica = Math.min(transfRestante, monto)
            transfRestante -= tAplica
            const eAplica = Math.min(efectivoRestante, monto - tAplica)
            efectivoRestante -= eAplica
            const dAplica = Math.round(desc * (monto / Math.max(facturas.reduce((s: number, ff: any) => s + Number(ff.montoAplicado || 0), 0), 1)))
            return { ...f, _efectivo: Math.round(eAplica), _transf: Math.round(tAplica), _desc: dAplica }
          })

          totEfectivo += efectivoTotal; totTransf += transfTotal; totDesc += desc
          return { ...p, _efectivo: efectivoTotal, _transf: transfTotal, _desc: desc, _nuevoSaldo: nuevoSaldo, _facturasConMetodo }
        })
        return (
          <div className="rounded-2xl overflow-hidden" style={{border:'1px solid #1e2a3d'}}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[780px]">
                <thead>
                  <tr style={{background:'#0d1220',borderBottom:'1px solid #1e2a3d'}}>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"left",whiteSpace:"nowrap",width:90}}>Fecha</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"left",whiteSpace:"nowrap",width:80}}>#Recibo</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"left",whiteSpace:"nowrap",width:80}}>Factura</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"left",width:'30%'}}>Cliente</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right",whiteSpace:"nowrap"}}>Efectivo</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right",whiteSpace:"nowrap"}}>Transf.</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right",whiteSpace:"nowrap"}}>Descuento</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right",whiteSpace:"nowrap"}}>Nuevo Saldo</th>
                    <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"center",whiteSpace:"nowrap"}}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p: any, i: number) => {
                    const facturasConMetodo: any[] = Array.isArray(p._facturasConMetodo) && p._facturasConMetodo.length > 0
                      ? p._facturasConMetodo
                      : p.numeroFactura ? [{ numeroFactura: p.numeroFactura, montoAplicado: p.monto, _efectivo: p._efectivo, _transf: p._transf, _desc: p._desc }] : []
                    const primeraFact = facturasConMetodo[0]
                    const subFacturas = facturasConMetodo.slice(1)
                    const tdBase: React.CSSProperties = { padding:"8px 10px", fontSize:14, fontWeight:500, color:"white", whiteSpace:"nowrap", borderBottom: subFacturas.length > 0 ? 'none' : '1px solid #1e2a3d' }
                    const tdSub: React.CSSProperties  = { padding:"8px 10px", fontSize:14, fontWeight:500, color:"white", whiteSpace:"nowrap" }
                    const hayMod = Array.isArray(p.lineasPago) && p.lineasPago.some((l: any) => {
                      if (l.valorModificado) return true
                      if (l.voucherDatosIA?.valor != null) {
                        return Math.abs(Number(l.monto) - Number(l.voucherDatosIA.valor)) >= 1000
                      }
                      return false
                    })
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{background:'#141c2e'}}>
                          <td style={tdBase}>
                            {new Date(p.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'America/Bogota'})}
                          </td>
                          <td style={{...tdBase, padding:"8px 10px"}} className="whitespace-nowrap">
                            <button onClick={() => abrirRecibo(p.id)}
                              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors font-mono">
                              🖨️ {p.numeroRecibo || '—'}
                            </button>
                          </td>
                          <td style={{...tdBase, fontFamily:"monospace"}}>
                            {primeraFact ? primeraFact.numeroFactura : '—'}
                          </td>
                          <td style={{...tdBase, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis"}}>
                            {p.clienteNombre || p.cartera?.cliente?.nombre || p.Cartera?.Cliente?.nombre || '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-semibold whitespace-nowrap" style={{borderBottom: subFacturas.length > 0 ? 'none' : '1px solid #1e2a3d'}}>
                            {primeraFact?._efectivo > 0 ? fmt(primeraFact._efectivo) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-blue-400 font-semibold whitespace-nowrap" style={{borderBottom: subFacturas.length > 0 ? 'none' : '1px solid #1e2a3d', position:'relative'}}>
                            {(() => {
                              const av = p.alertaVoucher ? (() => { try { return JSON.parse(p.alertaVoucher) } catch { return null } })() : null
                              const esCross = av?.tipo === 'cross-empresa'
                              return primeraFact?._transf > 0 ? (
                                <span className="inline-flex items-center gap-1 justify-end">
                                  {hayMod && <span title="Valor modificado respecto al comprobante" style={{fontSize:9, opacity:0.7}}>⚠️</span>}
                                  {av && (
                                    <span style={{position:'relative', display:'inline-block'}}>
                                      <button
                                        onClick={e => { e.stopPropagation(); setAlertaVoucherPopupId(alertaVoucherPopupId === p.id ? null : p.id) }}
                                        style={{background:'none', border:'none', cursor:'pointer', fontSize:12, padding:0, lineHeight:1}}>
                                        {av.nivel === 1 ? '🚨' : av.nivel === 2 ? '⚠️' : '🔎'}
                                      </button>
                                      {alertaVoucherPopupId === p.id && (
                                        <div onClick={e => e.stopPropagation()} style={{
                                          position:'fixed', right:12, top:80,
                                          background:'#1a0a0a', border:'1px solid ' + (av.nivel === 1 ? '#7f1d1d' : av.nivel === 2 ? '#78350f' : '#1e3a5f') + ',',
                                          borderRadius:12, padding:'12px 16px',
                                          minWidth:240, maxWidth:'calc(100vw - 24px)',
                                          fontSize:12, color:'white',
                                          boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
                                          zIndex:999, lineHeight:1.6,
                                        }}>
                                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                                            <span style={{fontWeight:700, color: av.nivel === 1 ? '#f87171' : av.nivel === 2 ? '#fbbf24' : '#60a5fa', fontSize:13}}>
                                              {av.otrosRecibos?.[0] ? ((av.nivel === 1 ? '🚨 ' : av.nivel === 2 ? '⚠️ ' : '🔎 ') + 'Coincidencia en ' + (av.otrosRecibos[0].empresa || av.otrosRecibos[0].empresaId || 'otra empresa')) : '—'}
                                            </span>
                                            <button onClick={() => setAlertaVoucherPopupId(null)} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:18,padding:'0 0 0 12px',lineHeight:1}}>×</button>
                                          </div>
                                          <div style={{color:'#94a3b8', fontSize:11, marginBottom:8, lineHeight:1.8}}>
                                            <div><span style={{color:'#475569'}}>Ref {av.referencia} · </span>{av.banco}</div>
                                            <div><span style={{color:'#475569'}}>Valor: </span>${Number(av.valor).toLocaleString('es-CO')} · <span style={{color:'#475569'}}>RC: </span>{av.otrosRecibos?.[0]?.numeroRecibo || '—'}</div>
                                            <div><span style={{color:'#475569'}}>Fecha: </span>{av.fecha ? new Date(av.fecha).toLocaleString('es-CO', {timeZone:'America/Bogota', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—'}</div>
                                            <div><span style={{color:'#475569'}}>Titular: </span>{av.titular}</div>
                                          </div>

                                        </div>
                                      )}
                                    </span>
                                  )}
                                  {fmt(primeraFact._transf)}
                                </span>
                              ) : '—'
                            })()}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-400 whitespace-nowrap" style={{borderBottom: subFacturas.length > 0 ? 'none' : '1px solid #1e2a3d'}}>
                            {primeraFact?._desc > 0 ? fmt(primeraFact._desc) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-300 whitespace-nowrap" style={{borderBottom: subFacturas.length > 0 ? 'none' : '1px solid #1e2a3d'}}>
                            {primeraFact?.nSaldo != null ? fmt(Number(primeraFact.nSaldo)) : p._nuevoSaldo !== null ? fmt(p._nuevoSaldo) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap" style={{borderBottom: subFacturas.length > 0 ? 'none' : '1px solid #1e2a3d'}}>
                            {p.notas ? (
                              <span style={{position:'relative',display:'inline-block'}}>
                                <button
                                  onClick={e => { e.stopPropagation(); setNotaPopupId(notaPopupId === p.id ? null : p.id) }}
                                  style={{background:'none',border:'none',cursor:'pointer',fontSize:16,padding:0}}>
                                  ✍🏼
                                </button>
                                {notaPopupId === p.id && (
                                  <div style={{
                                    position:'absolute', right:0, bottom:'calc(100% + 6px)',
                                    background:'#1e2a3d', border:'1px solid #2d3a50',
                                    borderRadius:10, padding:'8px 12px',
                                    minWidth:180, maxWidth:260,
                                    fontSize:13, color:'white',
                                    boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
                                    zIndex:100, whiteSpace:'pre-wrap', wordBreak:'break-word',
                                    lineHeight:1.4,
                                  }}>
                                    {p.notas}
                                  </div>
                                )}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                        {subFacturas.map((sf: any, si: number) => {
                          const bSub = { borderBottom: si < subFacturas.length - 1 ? 'none' : '1px solid #1e2a3d' }
                          const tdS: React.CSSProperties = { padding:"8px 10px", fontSize:14, fontWeight:500, color:"white", whiteSpace:"nowrap", ...bSub }
                          return (
                            <tr key={`${p.id}-sf-${si}`} style={{background:'#141c2e'}}>
                              <td style={tdS}></td>
                              <td style={tdS}></td>
                              <td style={{...tdS, fontFamily:'monospace'}}>
                                {sf.numeroFactura}
                              </td>
                              <td style={{...tdS, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis'}}></td>
                              <td className="px-4 py-3 text-right text-emerald-400 font-semibold whitespace-nowrap" style={bSub}>
                                {sf._efectivo > 0 ? fmt(sf._efectivo) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-blue-400 font-semibold whitespace-nowrap" style={bSub}>
                                {sf._transf > 0 ? fmt(sf._transf) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-amber-400 whitespace-nowrap" style={bSub}>
                                {sf._desc > 0 ? fmt(sf._desc) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-300 whitespace-nowrap" style={bSub}>
                                {sf.nSaldo != null ? fmt(Number(sf.nSaldo)) : '—'}
                              </td>
                              <td className="px-4 py-3 text-center whitespace-nowrap" style={bSub}></td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                {/* Totales */}
                <tfoot>
                  <tr style={{background:'#0d1220',borderTop:'1px solid #1e2a3d'}}>
                    <td colSpan={4} className="px-4 py-3 text-zinc-400 font-bold">{rows.length} {busquedaPagos ? `de ${pagos.length}` : ''} pagos</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-bold whitespace-nowrap">{fmt(totEfectivo)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-bold whitespace-nowrap">{fmt(totTransf)}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-bold whitespace-nowrap">{totDesc > 0 ? fmt(totDesc) : '—'}</td>
                    <td className="px-4 py-3 text-right text-zinc-400 font-bold">—</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
