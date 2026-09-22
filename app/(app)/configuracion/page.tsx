'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useConfigEntregas } from './_lib/useConfigEntregas'
import { useIntegracion } from './_lib/useIntegracion'
import { useTema } from './_lib/useTema'
import { useVinculadas } from './_lib/useVinculadas'
import { SeccionEmpresa } from './_components/SeccionEmpresa'
import { SeccionDespachos } from './_components/SeccionDespachos'
import { SeccionTransporte } from './_components/SeccionTransporte'
import { SeccionTurnos } from './_components/SeccionTurnos'
import { SeccionIntegracion } from './_components/SeccionIntegracion'
import { SeccionVinculadas } from './_components/SeccionVinculadas'
import { SeccionTema } from './_components/SeccionTema'
import { SeccionPerfil } from './_components/SeccionPerfil'

export default function ConfiguracionPage() {
  const { data: session, status, update } = useSession()
  const user = session?.user as any
  const role: string = user?.role ?? ''
  const esAdmin = role === 'empresa' || role === 'supervisor'
  const esSoloEmpleado = role !== 'empresa' && role !== 'superadmin' && role !== 'supervisor'

  const [seccionAbierta, setSeccionAbierta] = useState('')
  function toggleSeccion(id: string) { setSeccionAbierta(prev => prev === id ? '' : id) }

  // Datos empresa (para SeccionEmpresa)
  const [cfgEmpNit, setCfgEmpNit] = useState('')
  const [cfgEmpDir, setCfgEmpDir] = useState('')
  const [cfgEmpTel, setCfgEmpTel] = useState('')
  const [savingMiEmpresa, setSavingMiEmpresa] = useState(false)
  const [msgMiEmpresa, setMsgMiEmpresa] = useState('')

  const configEntregas = useConfigEntregas(role)
  const integracion = useIntegracion()
  const tema = useTema(user?.id)
  const vinculadas = useVinculadas()

  useEffect(() => {
    if (status !== 'authenticated') return

    if (esAdmin) {
      fetch('/api/recibos/config/empresa').then(r => r.json()).then(d => {
        if (!d.error) {
          setCfgEmpNit(d.nit ?? '')
          setCfgEmpDir(d.direccion ?? '')
          setCfgEmpTel(d.telefono ?? '')
        }
      }).catch(() => {})
    }

    if (role === 'empresa') {
      fetch('/api/integracion/estado').then(r => r.json()).then(d => integracion.initFromEstado(d)).catch(() => {})
      fetch('/api/recibos/config/empresa').then(r => r.json()).then(d => integracion.initFromRecibosConfig(d)).catch(() => {})
    }

    if (role === 'empresa' || role === 'supervisor') {
      fetch('/api/empresas-vinculadas').then(r => r.json()).then(d => vinculadas.init(d)).catch(() => {})
    }
  }, [status])

  async function guardarMiEmpresa() {
    setSavingMiEmpresa(true)
    const res = await fetch('/api/recibos/config/empresa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nit: cfgEmpNit || null, direccion: cfgEmpDir || null, telefono: cfgEmpTel || null }),
    })
    setSavingMiEmpresa(false)
    setMsgMiEmpresa(res.ok ? '✅ Guardado' : 'Error al guardar')
    setTimeout(() => setMsgMiEmpresa(''), 3000)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-zinc-400 text-sm mt-1">Ajustes de tu cuenta</p>
      </div>

      {/* ── EMPRESA ── */}
      {(role === 'empresa' || role === 'supervisor') && (
        <SeccionEmpresa
          isOpen={seccionAbierta === 'empresa'} onToggle={() => toggleSeccion('empresa')}
          role={role} email={user?.email ?? ''}
          cfgEmpNit={cfgEmpNit} setCfgEmpNit={setCfgEmpNit}
          cfgEmpDir={cfgEmpDir} setCfgEmpDir={setCfgEmpDir}
          cfgEmpTel={cfgEmpTel} setCfgEmpTel={setCfgEmpTel}
          savingMiEmpresa={savingMiEmpresa} msgMiEmpresa={msgMiEmpresa}
          onGuardarMiEmpresa={guardarMiEmpresa}
        />
      )}

      {role === 'empresa' && (
        <>
          <SeccionDespachos
            isOpen={seccionAbierta === 'entregas'} onToggle={() => toggleSeccion('entregas')}
            conectadas={vinculadas.conectadas}
            {...configEntregas}
          />

          <SeccionTransporte
            isOpen={seccionAbierta === 'transporte'} onToggle={() => toggleSeccion('transporte')}
          />

          <SeccionTurnos
            isOpen={seccionAbierta === 'turnos'} onToggle={() => toggleSeccion('turnos')}
            {...configEntregas}
          />

          <SeccionIntegracion
            isOpen={seccionAbierta === 'integracion'} onToggle={() => toggleSeccion('integracion')}
            {...integracion}
          />

          <SeccionVinculadas
            isOpen={seccionAbierta === 'vinculadas'} onToggle={() => toggleSeccion('vinculadas')}
            tieneBodega={configEntregas.tieneBodega}
            bodegaPuedeEnviar={configEntregas.bodegaPuedeEnviar}
            {...vinculadas}
          />
        </>
      )}

      {/* ── EMPLEADO ── */}
      {esSoloEmpleado && (
        <SeccionPerfil
          isOpen={seccionAbierta === 'perfil'} onToggle={() => toggleSeccion('perfil')}
          email={user?.email ?? ''} role={role}
        />
      )}

      {/* ── TEMA — todos los roles ── */}
      <SeccionTema
        isOpen={seccionAbierta === 'tema'} onToggle={() => toggleSeccion('tema')}
        onGuardar={() => tema.guardarTema(update)}
        {...tema}
      />
    </div>
  )
}
