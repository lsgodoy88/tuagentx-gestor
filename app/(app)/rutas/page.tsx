'use client'
import dynamic from 'next/dynamic'
const MapaEnVivo = dynamic(() => import('@/components/MapaEnVivo'), { ssr: false })
import { useSession } from 'next-auth/react'
import { checkPermiso } from '@/lib/permisos'
import TabHistorialVisitas from '@/components/TabHistorialVisitas'
import TabEntregasAdmin from './_components/TabEntregas'
import ModalNuevaRuta from './_components/ModalNuevaRuta'
import ModalAgregarClientes from './_components/ModalAgregarClientes'
import ModalEditarRuta from './_components/ModalEditarRuta'
import ModalAgregarSimple from './_components/ModalAgregarSimple'
import ModalVisita from './_components/ModalVisita'
import { useState } from 'react'
import { useRutas } from './_lib/useRutas'
import { useCrearRuta } from './_lib/useCrearRuta'
import { useEditarRuta } from './_lib/useEditarRuta'
import { useVisitaModal } from './_lib/useVisitaModal'

export default function RutasPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const esSupervisor = user?.role === 'supervisor'
  const esEmpresa = user?.role === 'empresa'
  const puedeAsignar = !user || esEmpresa || checkPermiso(session, 'asignarRutas')
  const puedeEditarClientes = esEmpresa || checkPermiso(session, 'editarClientes')

  // Tab principal
  const [tabPrincipal, setTabPrincipal] = useState<'mapa' | 'ruta' | 'historial'>('mapa')

  const rt = useRutas((clientes, total) => { cr.setClientes(clientes); cr.setTotalCli(total) })
  const cr = useCrearRuta(rt.loadData)
  const er = useEditarRuta(rt.loadData, rt.empleados)
  const vm = useVisitaModal()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Tabs principales */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        <button onClick={() => setTabPrincipal('mapa')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'mapa' ? 'tab-active' : 'text-white hover:text-white'}`}>
          Mapa
        </button>
        <button onClick={() => setTabPrincipal('ruta')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'ruta' ? 'tab-active' : 'text-white hover:text-white'}`}>
          Entregas
        </button>
        <button onClick={() => setTabPrincipal('historial')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'historial' ? 'tab-active' : 'text-white hover:text-white'}`}>
          Historial
        </button>
      </div>

      {tabPrincipal === 'mapa' && <div style={{marginTop:-12}}><MapaEnVivo embebido /></div>}

      {tabPrincipal === 'historial' && (
        <TabHistorialVisitas apiUrl="/api/visitas/admin" mostrarEmpleado={true} canEditClientes={puedeEditarClientes} />
      )}

      {tabPrincipal === 'ruta' && <TabEntregasAdmin />}

      {/* Modal nueva/editar ruta (solo no-supervisor) */}
      <ModalNuevaRuta cr={cr} empleados={rt.empleados} />

      {/* Modal agregar clientes (supervisor) */}
      <ModalAgregarClientes er={er} />

      {/* Modal editar ruta */}
      <ModalEditarRuta er={er} empleados={rt.empleados} />

      {/* Modal simple — agregar cliente a ruta vinculada */}
      <ModalAgregarSimple er={er} />

      <ModalVisita vm={vm} />
    </div>
  )
}
