'use client'
import React from 'react'
import { useSession } from 'next-auth/react'
import { checkPermiso } from '@/lib/permisos'
import ModuloGastos from '@/components/ModuloGastos'
import TabProveedores from '@/components/TabProveedores'
import { MESES } from './_lib/tipos'
import { fmt } from './_lib/utils'
import { useEgresos } from './_lib/useEgresos'
import { Tabla } from './_components/Tabla'
import { ModalCategorias } from './_components/ModalCategorias'

export default function EgresosPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const isAdmin = user?.role === 'empresa' || user?.role === 'supervisor'
  const puedeEditarEgresos = user?.role === 'empresa' || checkPermiso(session, 'editarEgresos')
  const puedeAdminEgresos  = user?.role === 'empresa' || checkPermiso(session, 'adminEgresos')

  const {
    mes, setMes, anio, setAnio,
    reloadKey, setReloadKey,
    setTotalesKey,
    totalGeneral,
    categorias, setCategorias,
    showCategorias, setShowCategorias,
    nuevaCat, setNuevaCat,
    scrollRefs, triggerGastos,
    tab, setTab,
  } = useEgresos()

  return (
    <div className="space-y-4 pb-20 max-w-5xl mx-auto">
      {/* Tabs — ancho completo */}
      <div className="flex gap-1 tab-pills rounded-xl p-1 w-full px-1">
        <button onClick={() => setTab('egresos')} className={`flex-1 py-1.5 text-sm font-semibold transition-colors rounded-lg ${tab === 'egresos' ? 'tab-active' : 'text-white hover:text-white'}`}>Egresos</button>
        <button onClick={() => setTab('gastos')} className={`flex-1 py-1.5 text-sm font-semibold transition-colors rounded-lg ${tab === 'gastos' ? 'tab-active' : 'text-white hover:text-white'}`}>Gastos</button>
        {isAdmin && <button onClick={() => setTab('proveedores')} className={`flex-1 py-1.5 text-sm font-semibold transition-colors rounded-lg ${tab === 'proveedores' ? 'tab-active' : 'text-white hover:text-white'}`}>Proveedor</button>}
      </div>

      <div>
        <div style={{ display: tab === 'egresos' ? 'block' : 'none' }} className="space-y-4">
            {totalGeneral !== null && (
              <>
                <div className="flex justify-between px-4 py-3 rounded-2xl" style={{background:'#0d1b35', border:'1px solid #1e40af'}}>
                  <div className="flex flex-col items-center">
                    <span className="text-white text-xs">Total</span>
                    <span className="text-white text-sm font-bold">{fmt(totalGeneral.total)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-white text-xs">Pagado</span>
                    <span className="text-emerald-400 text-sm font-bold">{totalGeneral.pagado > 0 ? fmt(totalGeneral.pagado) : '—'}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-white text-xs">Pendiente</span>
                    <span className={`text-sm font-bold ${totalGeneral.pendiente > 0 ? 'text-red-400' : 'text-white'}`}>{fmt(totalGeneral.pendiente)}</span>
                  </div>
                </div>

              </>
            )}
            {categorias.map(cat => <Tabla key={cat.key} cat={cat} mes={mes} anio={anio} scrollRefs={scrollRefs} isAdmin={puedeAdminEgresos} canEdit={puedeEditarEgresos} canAdmin={puedeAdminEgresos} onTotalesUpdate={() => setTotalesKey(k => k+1)} onCatUpdate={puedeAdminEgresos ? (id, label, emoji) => {
              fetch('/api/egresos/categorias', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, label, emoji}) })
                .then(() => setReloadKey(k => k+1))
            } : undefined} />)}
            {/* Selectores mes/año */}
            <div className="flex items-center gap-2 justify-end">
              {puedeAdminEgresos && <button onClick={() => setShowCategorias(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-sm font-semibold transition-colors"
                style={{background:'#0f1623',border:'1px solid rgba(255,255,255,0.12)'}}>
                ⚙️ <span>Categorías</span>
              </button>}
              <select value={mes} onChange={e => setMes(Number(e.target.value))}
                className="text-white text-sm rounded-xl px-3 py-1.5 cursor-pointer"
                style={{background:'#0f1623',border:'1px solid rgba(255,255,255,0.12)'}}>
                {MESES.map((ml, i) => <option key={i} value={i+1}>{ml}</option>)}
              </select>
              <select value={anio} onChange={e => setAnio(Number(e.target.value))}
                className="text-white text-sm rounded-xl px-3 py-1.5 cursor-pointer"
                style={{background:'#0f1623',border:'1px solid rgba(255,255,255,0.12)'}}>
                {[2024,2025,2026,2027].map(yr => <option key={yr} value={yr}>{yr}</option>)}
              </select>
            </div>

            {/* Popup gestión categorías */}
            {showCategorias && (
              <ModalCategorias
                categorias={categorias}
                setCategorias={setCategorias}
                nuevaCat={nuevaCat}
                setNuevaCat={setNuevaCat}
                onClose={() => setShowCategorias(false)}
                setReloadKey={setReloadKey}
              />
            )}
          </div>
        <div style={{ display: tab === 'proveedores' ? 'block' : 'none' }}>
          <TabProveedores mes={mes} anio={anio} onChangeFecha={(m,a) => { setMes(m); setAnio(a) }} canEdit={puedeEditarEgresos} />
        </div>
        <div style={{ display: tab === 'gastos' ? 'block' : 'none' }}>
          <ModuloGastos isAdmin={puedeEditarEgresos} hideButton triggerRef={triggerGastos} />
        </div>
      </div>
    </div>
  )
}
