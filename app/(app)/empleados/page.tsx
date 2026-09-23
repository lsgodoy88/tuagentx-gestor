'use client'
import { useSession } from 'next-auth/react'
import PopupPermisos from '@/components/PopupPermisos'
import { checkPermiso } from '@/lib/permisos'
import { useEffect, useState } from 'react'
import { useEmpleados } from './_lib/useEmpleados'
import { useTurnos } from './_lib/useTurnos'
import { useMetas } from './_lib/useMetas'
import { useNotifReglas } from './_lib/useNotifReglas'
import TabEquipo from './_components/TabEquipo'
import TabRutas from './_components/TabRutas'
import TabMetas from './_components/TabMetas'
import TabNotifica from './_components/TabNotifica'
import PopupAsignacionInicial from './_components/PopupAsignacionInicial'
import { PopupSyncForm } from './_components/PopupSyncCartera'

export default function EmpleadosPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const esAdmin = user?.role === 'empresa'
  const esSupervisor = user?.role === 'supervisor'
  const puedeEditarEmpleados = esAdmin || (!esSupervisor) || checkPermiso(session, 'editarEmpleados')

  const emp = useEmpleados()
  const turnos = useTurnos()
  const metas = useMetas()
  const notif = useNotifReglas()

  // Tab principal
  const [tabPrincipal, setTabPrincipal] = useState<'rutas' | 'equipo' | 'metas' | 'notifica'>('equipo')

  // Card Almacenamiento Nube (tab Equipo) — fetch original dependía de esAdmin, calculado aquí
  useEffect(() => {
    if (esAdmin) fetch('/api/almacenamiento').then(r => r.json()).then(d => emp.setStorageData(d)).catch(() => {})
  }, [esAdmin])

  return (
    <>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Tabs principales */}
        <div className="flex gap-1 tab-pills rounded-xl p-1">
          <button onClick={() => setTabPrincipal('equipo')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'equipo' ? 'tab-active' : 'text-white hover:text-white'}`}>
            Equipo
          </button>
          <button onClick={() => setTabPrincipal('rutas')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'rutas' ? 'tab-active' : 'text-white hover:text-white'}`}>
            Rutas
          </button>
          <button onClick={() => setTabPrincipal('metas')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'metas' ? 'tab-active' : 'text-white hover:text-white'}`}>
            Metas
          </button>
          {esAdmin && (
            <button onClick={() => { setTabPrincipal('notifica'); if (notif.notifReglas.length === 0) notif.cargarNotifReglas() }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'notifica' ? 'tab-active' : 'text-white hover:text-white'}`}>
              Notif.
            </button>
          )}
        </div>

        {/* Tab Rutas */}
        {tabPrincipal === 'rutas' && <TabRutas turnos={turnos} />}

        {/* Tab Equipo — contenido original */}
        {tabPrincipal === 'equipo' && (
          <TabEquipo
            emp={emp}
            esAdmin={esAdmin}
            esSupervisor={esSupervisor}
            puedeEditarEmpleados={puedeEditarEmpleados}
            tieneIntegracion={emp.tieneIntegracion}
          />
        )}

        {/* Tab Metas */}
        {tabPrincipal === 'metas' && <TabMetas metas={metas} empleados={emp.empleados} />}

        {tabPrincipal === 'notifica' && esAdmin && <TabNotifica notif={notif} />}
      </div>

      {/* Popup Asignación inicial */}
      <PopupAsignacionInicial emp={emp} />

      <PopupSyncForm emp={emp} />

      {emp.popupPermisos && emp.editando && (
        <PopupPermisos
          nombreEmpleado={emp.editando.nombre}
          permisosIniciales={emp.permisos}
          onGuardar={emp.guardarPermisos}
          onCerrar={() => emp.setPopupPermisos(false)}
        />
      )}
    </>
  )
}
