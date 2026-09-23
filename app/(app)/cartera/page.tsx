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
import { useComisiones } from './hooks/useComisiones'
import { usePagos } from './hooks/usePagos'
import { useCarteraData } from './hooks/useCarteraData'
import CarteraReportes from './CarteraReportes'
import CarteraTablaClientes from './CarteraTablaClientes'
import CarteraTabPagos from './CarteraTabPagos'
import CarteraTabComisiones from './CarteraTabComisiones'
import CarteraSyncModal from './CarteraSyncModal'

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
      {tab === 'pagos' && (
        <CarteraTabPagos
          pagos={pagos}
          pagosGlobal={pagosGlobal}
          loadingPagosGlobal={loadingPagosGlobal}
          busquedaPagos={busquedaPagos}
          setBusquedaPagos={setBusquedaPagos}
          vendedorPagoId={vendedorPagoId}
          setVendedorPagoId={setVendedorPagoId}
          filtroDia={filtroDia}
          setFiltroDia={setFiltroDia}
          pickerDiaAbierto={pickerDiaAbierto}
          setPickerDiaAbierto={setPickerDiaAbierto}
          mesPagos={mesPagos}
          setMesPagos={setMesPagos}
          anioPagos={anioPagos}
          setAnioPagos={setAnioPagos}
          notaPopupId={notaPopupId}
          setNotaPopupId={setNotaPopupId}
          isDesktopPagos={isDesktopPagos}
          filtroDiaInputRef={filtroDiaInputRef}
          cargarPagos={cargarPagos}
          vendedores={vendedores}
          isAdmin={isAdmin}
          abrirRecibo={abrirRecibo}
          alertaVoucherPopupId={alertaVoucherPopupId}
          setAlertaVoucherPopupId={setAlertaVoucherPopupId}
        />
      )}

      {tab === 'comisiones' && (
        <CarteraTabComisiones
          isAdmin={isAdmin}
          esVendedor={esVendedor}
          comisiones={comisiones}
          setComisiones={setComisiones}
          comisionPropia={comisionPropia}
          loadingComisionPropia={loadingComisionPropia}
          comisionCalculo={comisionCalculo}
          editandoFormulaId={editandoFormulaId}
          setEditandoFormulaId={setEditandoFormulaId}
          borradorFormula={borradorFormula}
          setBorradorFormula={setBorradorFormula}
          borradorPorcentaje={borradorPorcentaje}
          setBorradorPorcentaje={setBorradorPorcentaje}
          loadingComisiones={loadingComisiones}
          nombreComision={nombreComision}
          setNombreComision={setNombreComision}
          guardandoComision={guardandoComision}
          mesComision={mesComision}
          setMesComision={setMesComision}
          anioComision={anioComision}
          setAnioComision={setAnioComision}
          guardarComisionAuto={guardarComisionAuto}
          cargarComisiones={cargarComisiones}
          guardarComisionFinal={guardarComisionFinal}
        />
      )}

    </div>

    {/* Modal Sync con historial */}
    <CarteraSyncModal
      modalSync={modalSync}
      setModalSync={setModalSync}
      syncInfo={syncInfo}
      sincronizando={sincronizando}
      sincronizar={sincronizar}
    />
    </>
  )
}
