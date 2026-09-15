'use client'
import React from 'react'
import { mesBogota, anioBogota, esDelMesBogota } from '@/lib/fechas'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { calcularEstado } from '@/lib/cartera/index'
import { CountUp, LiveDot } from '@/components/FX'
import SelectorMes from '@/components/SelectorMes'
import CarteraCard from '@/components/CarteraCard'
import { ROLES_ADMIN } from '@/lib/auth-helpers'
import { useSyncInfo, type SyncLogItem } from './hooks/useSyncInfo'
import { useEdadesCartera, EDADES, type Edad } from './hooks/useEdadesCartera'
import { useComisiones, evaluarComision } from './hooks/useComisiones'
import { usePagos } from './hooks/usePagos'
import { useCarteraData } from './hooks/useCarteraData'
import CarteraReportes from './CarteraReportes'
import CarteraTablaClientes from './CarteraTablaClientes'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')


const fmtShort = (n: number): string => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' mill'
  if (n >= 1_000)     return '$' + (n / 1_000).toLocaleString('es-CO',     { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' K'
  return '$' + Math.round(n).toLocaleString('es-CO')
}


export default function CarteraPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'
  const esVendedor = user?.role === 'vendedor'
  const searchParamsCartera = useSearchParams()
  const [tab, setTab] = useState<'cartera' | 'clientes' | 'pagos' | 'comisiones'>(
    (searchParamsCartera.get('tab') as any) || 'pagos'
  )
  const [mesAnalisis, setMesAnalisis] = useState(mesBogota())
  const [snapMesInicio, setSnapMesInicio] = useState(mesBogota())
  const [snapAnioInicio, setSnapAnioInicio] = useState(anioBogota())
  const [snapMesFin, setSnapMesFin] = useState(mesBogota())
  const [snapAnioFin, setSnapAnioFin] = useState(anioBogota())
  const [generandoSnap, setGenerandoSnap] = useState(false)
  const [anioAnalisis, setAnioAnalisis] = useState(anioBogota())
  const [mesSel, setMesSel] = useState(mesBogota())
  const [anioSel, setAnioSel] = useState(anioBogota())
  const [metaForm, setMetaForm] = useState({ empleadoId: '', carteraBase: '', metaPct: '' })
  const [guardandoMeta, setGuardandoMeta] = useState(false)
  const [snapshotHistorico, setSnapshotHistorico] = useState<any>(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const { porEdadApi, porEdadVendedorApi, edadesCargadas, cargandoEdades, cargarEdades } = useEdadesCartera()
  const { comisiones, setComisiones, comisionPropia, loadingComisionPropia, comisionCalculo, editandoFormulaId, setEditandoFormulaId, borradorFormula, setBorradorFormula, borradorPorcentaje, setBorradorPorcentaje, loadingComisiones, nombreComision, setNombreComision, guardandoComision, mesComision, setMesComision, anioComision, setAnioComision, guardarComisionAuto, cargarComisiones, guardarComisionFinal } = useComisiones(esVendedor, tab, status)
  const [vendedores, setVendedores] = useState<any[]>([])
  const { pagos, setPagos, loadingPagos, pagosGlobal, loadingPagosGlobal, busquedaPagos, setBusquedaPagos, vendedorPagoId, setVendedorPagoId, filtroDia, setFiltroDia, pickerDiaAbierto, setPickerDiaAbierto, mesPagos, setMesPagos, anioPagos, setAnioPagos, notaPopupId, setNotaPopupId, isDesktopPagos, filtroDiaInputRef, cargarPagos } = usePagos(vendedores)
  const [alertaVoucherPopupId, setAlertaVoucherPopupId] = React.useState<string | null>(null)
  const { carteras, metas, setMetas, loading, offline, cacheAgeCartera, loadingBusqueda, buscar, setBuscar, hayMas, setHayMas, paginaActual, setPaginaActual, totalReal, cargandoMas, cargarDatos, cargarMas, onBuscarChange, inicializar } = useCarteraData(filtroDia, vendedorPagoId, setPagos, user?.role)
  const { syncInfo, modalSync, setModalSync, sincronizando, cargarSyncInfo, sincronizar } = useSyncInfo(async () => { await cargarDatos(buscar) })

  const [dlShine, setDlShine] = useState(false)
  const [dlOrdenPopup, setDlOrdenPopup] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    inicializar(setVendedores)
  }, [status])

  useEffect(() => { cargarSyncInfo() }, [])

  // Agregados por estado
  const porEstado = carteras.reduce((acc, c) => {
    const detalles = c.DetalleCartera || []
    for (const d of detalles) {
      const vf = Number(d.valorFactura ?? d.valor)
      const ab = Number(d.abonos ?? 0)
      const saldo = Math.max(0, vf - ab)
      const { estado } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
      acc[estado] = (acc[estado] ?? 0) + saldo
    }
    return acc
  }, {} as Record<string, number>)

  // Edades de cartera — desde API (todas las deudas, no solo la página)
  const porEdad = porEdadApi as Record<Edad, number>

  // Admin: por vendedor — desde API
  // Filtrar 'Sin vendedor' — deudas de apiIds sin Empleado en BD
  const porEdadVendedor = Object.fromEntries(
    Object.entries(porEdadVendedorApi as Record<string, Record<Edad, number>>)
      .filter(([nombre]) => nombre !== 'Sin vendedor')
  ) as Record<string, Record<Edad, number>>

  const totalPendiente = totalReal ? totalReal.saldoPendiente : carteras.reduce((s, c) => s + Number(c.saldoPendiente), 0)

  // ── CPC resize ──────────────────────────────────────────────────
  const PAGE_SIZE = 15
  const filtradas = carteras
  const totalPaginas = Math.ceil(filtradas.length / PAGE_SIZE)
  const filtradasPagina = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)

  // --- Importar ---


  // --- Sync UpTres individual ---
  async function syncCliente(cartera: any) {
    const clienteApiId = cartera?.cliente?.apiId || cartera?.clienteApiId
    if (!clienteApiId) return
    try {
      await fetch('/api/integracion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'cliente', clienteApiId })
      })
      await cargarDatos()
    } catch {}
  }

  // --- Recaudar ---
  function abrirWhatsApp(cartera: any) {
    const telefono = (cartera.cliente?.celular || cartera.cliente?.telefono || cartera.telefono || cartera.celular || '').replace(/\D/g, '')
    if (!telefono) { alert('Cliente sin teléfono registrado'); return }

    const deudas = (cartera.DetalleCartera || cartera.deudas || [])
      .filter((d: any) => d.estado !== 'pagada' && Number(d.saldo ?? d.saldoPendiente ?? 0) > 0)
      .sort((a: any, b: any) => { const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity; const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity; return fa - fb })

    if (!deudas.length) { alert('Sin facturas pendientes'); return }

    const nombreCliente = cartera.cliente?.nombre || cartera.nombre || ''
    const nombreEmpresa = (user as any)?.empresa?.nombre || (user as any)?.empresaNombre || 'nuestra empresa'
    const total = deudas.reduce((sum: number, d: any) => sum + Number(d.saldo ?? d.saldoPendiente ?? 0), 0)

    let mensaje = `Hola Sr(a) *${nombreCliente}*, le recordamos que tiene *${deudas.length} factura${deudas.length > 1 ? 's' : ''} pendiente${deudas.length > 1 ? 's' : ''}*:\n`

    deudas.forEach((d: any) => {
      mensaje += `\n📋 Fact. ${d.numeroFactura || d.numeroOrden || ''} → $${Number(d.saldo ?? d.saldoPendiente ?? 0).toLocaleString('es-CO')}`
      if (d.fechaVencimiento) mensaje += ` _(vence ${new Date(d.fechaVencimiento).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Bogota' })})_`
    })

    mensaje += `\n\n💰 *Total pendiente: $${total.toLocaleString('es-CO')}*`
    mensaje += `\n\nAgradecemos su pronto pago.\n— ${nombreEmpresa}`

    window.open(`https://wa.me/57${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank')
  }


  if (status === 'loading' || loading) return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="shimmer rounded-2xl h-24" />
      ))}
    </div>
  )

  const isAdmin = ROLES_ADMIN.includes(user?.role)

  const tabs = [
    { id: 'pagos', label: 'Pagos' },
    { id: 'clientes', label: 'Cartera' },
    { id: 'cartera', label: 'Reportes' },
    ...((isAdmin || esVendedor) ? [{ id: 'comisiones', label: 'Comisión' }] : []),
  ] as const


  async function abrirRecibo(pagoId: string) {
    const res = await fetch('/api/cartera/recibo-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagoId })
    })
    const data = await res.json()
    if (data.reciboToken) {
      const fmt = data.anchoPapel === '58mm' ? '&fmt=58mm' : ''
      window.open(`/recaudo/recibo?token=${data.reciboToken}${fmt}`, '_blank')
    } else {
      alert('Error al generar enlace del recibo')
    }
  }

  return (
    <>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Offline banner */}
      {offline && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-400 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          Sin conexión · datos guardados{cacheAgeCartera !== null ? ` hace ${cacheAgeCartera < 1 ? 'menos de 1 min' : cacheAgeCartera + ' min'}` : ''}
        </div>
      )}

      {/* Tabs + botones en misma fila */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'tab-active' : 'text-white hover:text-white'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'clientes' && (
        <input value={buscar} onChange={e => onBuscarChange(e.target.value)}
          placeholder="Buscar por nombre o NIT..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
      )}


      {tab === 'cartera' && (
        <div key='tab-cartera' className='fade-up'>
          <CarteraReportes
            pagos={pagos} carteras={carteras} metas={metas} vendedores={vendedores} totalReal={totalReal}
            porEdadApi={porEdadApi} porEdadVendedorApi={porEdadVendedorApi}
            edadesCargadas={edadesCargadas} cargandoEdades={cargandoEdades} cargarEdades={cargarEdades}
            snapshotHistorico={snapshotHistorico} loadingSnapshot={loadingSnapshot} loadingBusqueda={loadingBusqueda}
            mesSel={mesSel} setMesSel={setMesSel} anioSel={anioSel} setAnioSel={setAnioSel}
            mesAnalisis={mesAnalisis} anioAnalisis={anioAnalisis}
            setMesAnalisis={setMesAnalisis} setAnioAnalisis={setAnioAnalisis}
            setSnapshotHistorico={setSnapshotHistorico} setLoadingSnapshot={setLoadingSnapshot}
            snapMesInicio={snapMesInicio} setSnapMesInicio={setSnapMesInicio}
            snapAnioInicio={snapAnioInicio} setSnapAnioInicio={setSnapAnioInicio}
            snapMesFin={snapMesFin} setSnapMesFin={setSnapMesFin}
            snapAnioFin={snapAnioFin} setSnapAnioFin={setSnapAnioFin}
            generandoSnap={generandoSnap} setGenerandoSnap={setGenerandoSnap}
            metaForm={metaForm} setMetaForm={setMetaForm}
            guardandoMeta={guardandoMeta} setGuardandoMeta={setGuardandoMeta} setMetas={setMetas}
            dlShine={dlShine} setDlShine={setDlShine}
            dlOrdenPopup={dlOrdenPopup} setDlOrdenPopup={setDlOrdenPopup}
            esAdmin={esAdmin} isAdmin={isAdmin}
            userRole={user?.role} empresaNombre={(user as any)?.empresa?.nombre || (user as any)?.empresaNombre || ''}
          />
        </div>
      )}
      {/* CLIENTES */}
      {tab === 'clientes' && (<div key='tab-clientes' className='fade-up'>
        <div className="space-y-3">

          {/* MÓVIL — cards colapsables (sin cambios) */}
          <div className="md:hidden">
            {filtradasPagina.map((c: any) => (
              <CarteraCard
                key={c.id}
                cartera={c}
                rol={user?.role}
                fmt={fmt}
                onSync={() => syncCliente(c)}
                onWhatsApp={() => abrirWhatsApp(c)}
                variant="lista"
              />
            ))}
            {filtradas.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-zinc-400">{buscar ? 'Sin resultados' : 'Sin cartera registrada'}</p>
              </div>
            )}
          </div>

          {/* DESKTOP — tabla plana una fila por deuda */}
          <div className="hidden md:block">
            <CarteraTablaClientes
              filtradas={filtradas}
              filtradasPagina={filtradasPagina}
              buscar={buscar}
              userRole={user?.role}
              onSync={syncCliente}
              onWhatsApp={abrirWhatsApp}
            />
          </div>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-3 px-1">
              <button
                onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors">
                ← Anterior
              </button>
              <span className="text-zinc-500 text-xs">{paginaActual} / {totalPaginas}</span>
              <button
                onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors">
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>)}
      {/* PAGOS */}
      {tab === 'pagos' && (<div key='tab-pagos' className='fade-up space-y-3'>

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
      </div>)}

      {tab === 'comisiones' && isAdmin && (<div key='tab-comisiones' className='fade-up space-y-4'>

        {/* Selector mes + botón cargar */}
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMes
            value={`${anioComision}-${String(mesComision).padStart(2,'0')}`}
            onChange={v => { const [a,m] = v.split('-'); setAnioComision(Number(a)); setMesComision(Number(m)) }}
          />
          <button
            onClick={cargarComisiones}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            Cargar
          </button>
        </div>

        {comisiones.length > 0 && (
          <>
            {/* Tabla de vendedores con % */}
            <div className="rounded-2xl overflow-hidden" style={{border:'1px solid #1e2a3d'}}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead>
                    <tr style={{background:'#0d1220',borderBottom:'1px solid #1e2a3d'}}>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"left"}}>Vendedor</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Efect.</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Transf.</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Total</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"center"}}>% Comisión</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comisiones.map((v: any, i: number) => {
                      const total = (v.efectivo||0) + (v.transferencia||0)
                      return (
                      <tr key={v.id} style={{background: i%2===0 ? '#141c2e' : '#141c2e', borderBottom:'1px solid #1e2a3d'}}>
                        <td className="px-4 py-3 text-white font-medium">{v.nombre}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{fmt(v.efectivo||0)}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{fmt(v.transferencia||0)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmt(total)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number" min="0" max="100" step="0.5"
                              value={v.porcentaje === 0 ? '' : v.porcentaje}
                              onChange={e => {
                                const raw = e.target.value
                                const porcentaje = raw === '' ? 0 : (parseFloat(raw) || 0)
                                setComisiones(prev => prev.map(x => x.id === v.id
                                  ? { ...x, porcentaje, comision: evaluarComision(x.formula, total, porcentaje) }
                                  : x))
                                guardarComisionAuto(v.id, porcentaje, v.formula || 'total/1.19*porcentaje')
                              }}
                              className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-white text-center text-xs outline-none focus:border-blue-500"
                            />
                            <span className="text-zinc-500">%</span>
                            <button
                              onClick={() => {
                                setBorradorFormula(v.formula || 'total/1.19*porcentaje')
                                setBorradorPorcentaje(v.porcentaje)
                                setEditandoFormulaId(v.id)
                              }}
                              title="Editar fórmula de comisión"
                              className="text-zinc-500 hover:text-blue-400 transition-colors">
                              ✏️
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-amber-400 font-bold">{fmt(v.comision)}</span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'#0d1220',borderTop:'1px solid #1e2a3d'}}>
                      <td className="px-4 py-3 text-zinc-400 font-bold">Total</td>
                      <td className="px-4 py-3 text-right text-zinc-300 font-bold">{fmt(comisiones.reduce((s,v)=>s+(v.efectivo||0),0))}</td>
                      <td className="px-4 py-3 text-right text-zinc-300 font-bold">{fmt(comisiones.reduce((s,v)=>s+(v.transferencia||0),0))}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold">{fmt(comisiones.reduce((s,v)=>s+(v.efectivo||0)+(v.transferencia||0),0))}</td>
                      <td></td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold">{fmt(comisiones.reduce((s,v)=>s+v.comision,0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Guardar */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={nombreComision}
                onChange={e => setNombreComision(e.target.value)}
                placeholder="Ej: ComisionMayo2026"
                className="flex-1 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500"
              />
              <button
                disabled={guardandoComision}
                onClick={guardarComisionFinal}
                className={`bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors ${guardandoComision ? 'btn-shimmer' : ''}`}>
                {guardandoComision ? 'Guardando...' : '💾 Guardar como ' + (nombreComision || 'Comision')}
              </button>
            </div>

            {/* Último cálculo guardado */}
            {comisionCalculo && (
              <div className="rounded-2xl px-4 py-3" style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.25)'}}>
                <p className="text-emerald-400 text-sm font-semibold">✅ Guardado: {comisionCalculo.nombre}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{new Date(comisionCalculo.createdAt).toLocaleDateString('es-CO',{timeZone:'America/Bogota'})}</p>
              </div>
            )}
          </>
        )}
      </div>)}

      {tab === 'comisiones' && esVendedor && (<div key='tab-comisiones-vendedor' className='fade-up space-y-4'>
        <SelectorMes
          value={`${anioComision}-${String(mesComision).padStart(2,'0')}`}
          onChange={v => { const [a,m] = v.split('-'); setAnioComision(Number(a)); setMesComision(Number(m)) }}
        />

        {loadingComisionPropia ? (
          <p className="text-zinc-500 text-sm text-center py-8">Cargando...</p>
        ) : !comisionPropia ? (
          <p className="text-zinc-500 text-sm text-center py-8">Sin datos para este mes</p>
        ) : (
          <div className="rounded-2xl p-5 space-y-3" style={{background:'#141c2e', border:'1px solid #1e2a3d'}}>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Efectivo</span>
              <span className="text-zinc-200 font-semibold">{fmt(comisionPropia.efectivo||0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Transferencia</span>
              <span className="text-zinc-200 font-semibold">{fmt(comisionPropia.transferencia||0)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="text-zinc-400 text-sm">Total recaudo</span>
              <span className="text-emerald-400 font-bold">{fmt(comisionPropia.total||0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Tu % de comisión</span>
              <span className="text-zinc-200 font-semibold">{comisionPropia.porcentaje}%</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="text-zinc-300 text-base font-semibold">Tu comisión del mes</span>
              <span className="text-amber-400 font-bold text-xl">{fmt(comisionPropia.comision||0)}</span>
            </div>
          </div>
        )}
      </div>)}

      {/* Modal editar fórmula de comisión */}
      {editandoFormulaId && (() => {
        const v = comisiones.find((x: any) => x.id === editandoFormulaId)
        if (!v) return null
        const total = (v.efectivo||0) + (v.transferencia||0)
        const preview = evaluarComision(borradorFormula, total, borradorPorcentaje)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{background:'rgba(0,0,0,0.6)'}}
            onClick={() => setEditandoFormulaId(null)}>
            <div onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-5 space-y-4"
              style={{background:'#141c2e', border:'1px solid #1e2a3d'}}>
              <h3 className="text-white font-semibold text-base">Editar fórmula de comisión — {v.nombre}</h3>

              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total recaudo</span>
                <span className="text-emerald-400 font-semibold">{fmt(total)}</span>
              </div>

              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">Fórmula</label>
                <input
                  type="text"
                  value={borradorFormula}
                  onChange={e => setBorradorFormula(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none font-mono focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">Porcentaje (%)</label>
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={borradorPorcentaje === 0 ? '' : borradorPorcentaje}
                  onChange={e => {
                    const raw = e.target.value
                    setBorradorPorcentaje(raw === '' ? 0 : (parseFloat(raw) || 0))
                  }}
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="rounded-xl px-3 py-2 text-xs space-y-1" style={{background:'#0d1220'}}>
                <p className="text-zinc-400 font-semibold mb-1">Variables disponibles:</p>
                <p className="text-zinc-500"><span className="text-blue-400 font-mono">total</span> → recaudo del mes ({fmt(total)})</p>
                <p className="text-zinc-500"><span className="text-blue-400 font-mono">porcentaje</span> → campo % arriba, ya convertido a fracción (5% → 0.05)</p>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                <span className="text-zinc-400 text-sm">Resultado</span>
                <span className="text-amber-400 font-bold text-lg">{fmt(preview)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditandoFormulaId(null)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setComisiones(prev => prev.map(x => x.id === v.id
                      ? { ...x, formula: borradorFormula, porcentaje: borradorPorcentaje, comision: preview }
                      : x))
                    guardarComisionAuto(v.id, borradorPorcentaje, borradorFormula)
                    setEditandoFormulaId(null)
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>

    {/* Modal Sync con historial */}
    {modalSync && syncInfo?.tieneIntegracion && (
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
    )}
    </>
  )
}
