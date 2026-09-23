'use client'
import { useEffect, useState } from 'react'
import { generarPasswordDefault } from './utils'

export function useEmpleados() {
  const [empleados, setEmpleados] = useState<any[]>([])
  const [limites, setLimites] = useState<any>({})
  const [modal, setModal] = useState(false)
  const [slotRol, setSlotRol] = useState('')
  const [slotNum, setSlotNum] = useState(0)
  const [editando, setEditando] = useState<any>(null)
  const [emailEdit, setEmailEdit] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [telefonoValido, setTelefonoValido] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [vendedorId, setVendedorId] = useState('')
  const [listaIds, setListaIds] = useState<string[]>([])
  const [listas, setListas] = useState<any[]>([])
  const [vendedorIds, setVendedorIds] = useState<string[]>([])
  const [etiqueta, setEtiqueta] = useState('')
  const [permisos, setPermisos] = useState<Record<string, boolean>>({})
  const [popupPermisos, setPopupPermisos] = useState(false)
  const [puedeCapturarGps, setPuedeCapturarGps] = useState(false)
  const [ciudadesAsignadas, setCiudadesAsignadas] = useState<string[]>([])
  const [ciudadBusqueda, setCiudadBusqueda] = useState('')
  const [colombiaData, setColombiaData] = useState<any[]>([])
  const [ciudadesSugeridas, setCiudadesSugeridas] = useState<string[]>([])
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [empresaNombre, setEmpresaNombre] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [precios, setPrecios] = useState<Record<string, number>>({})

  const [cantidades, setCantidades] = useState<Record<string, number>>({ supervisor: 0, vendedor: 0, entregas: 0, impulsadora: 0, bodega: 0 })
  const [ampliarAbierto, setAmpliarAbierto] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(false)
  const [enMora, setEnMora] = useState<'al_dia'|'pendiente'|'mora'|null>(null)
  const [syncEmpleados, setSyncEmpleados] = useState<any[]>([])
  const [tieneIntegracion, setTieneIntegracion] = useState(false)
  const [apiIdSeleccionado, setApiIdSeleccionado] = useState('')

  const [storageData, setStorageData] = useState<any>(null)
  const [popupSync, setPopupSync] = useState(false)
  const [popupSyncForm, setPopupSyncForm] = useState(false)
  const [popupAsignacion, setPopupAsignacion] = useState(false)
  const [asigLoading, setAsigLoading] = useState(false)
  const [asigMsg, setAsigMsg] = useState('')
  const [syncEvidencia, setSyncEvidencia] = useState<string|null>(null)
  const [syncEmpleadoId, setSyncEmpleadoId] = useState('')
  const [syncFecha, setSyncFecha] = useState('')
  const [syncPrimerRecibo, setSyncPrimerRecibo] = useState<{numeroRecibo:string, fecha:string}|null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [empRes, meRes, estadoRes] = await Promise.all([
      fetch('/api/empleados').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
      fetch('/api/mi-empresa/estado').then(r => r.json()),
    ])
    fetch('/api/listas').then(r => r.json()).then(d => { if (Array.isArray(d)) setListas(d) })
    fetch('/api/sync-empleados').then(r => r.json()).then(d => { if (d.ok) { setSyncEmpleados(d.empleados || []); setTieneIntegracion(d.tieneIntegracion || false) } })
    setEmpleados(empRes.empleados || [])
    setLimites(empRes.limites || {})
    setEmpresaNombre(meRes.nombre || '')
    setEmpresaId(meRes.id || '')
    fetch('/api/plan-empresa').then(r => r.json()).then(d => { if (d.billingEstado) setEnMora(d.billingEstado as any) }).catch(() => {})
    fetch('/api/precios/publico')
      .then(r => r.json())
      .then(d => {
        const map: Record<string, number> = {}
        for (const p of (d.precios ?? [])) map[p.rol] = p.precio
        setPrecios(map)
      })
      .catch(() => {})
  }

  function abrirSlot(rol: string, num: number, empleadoExistente?: any) {
    setSlotRol(rol)
    setSlotNum(num)
    setEmailEdit(empleadoExistente?.email || '')
    setEditando(empleadoExistente || null)
    setNombre(empleadoExistente?.nombre || '')
    setTelefono(empleadoExistente?.telefono || '')
    setPuedeCapturarGps(empleadoExistente?.puedeCapturarGps || false)
    setVendedorId(empleadoExistente?.vendedorId || '')
    setListaIds(empleadoExistente?.listasAsignadas?.map((l: any) => l.listaId) || [])
    setVendedorIds(empleadoExistente?.vendedoresAsignados?.map((v: any) => v.vendedorId) || [])
    setPermisos(empleadoExistente?.permisos || {})
    setEtiqueta(empleadoExistente?.etiqueta || '')
    setCiudadesAsignadas(empleadoExistente?.ciudades || [])
    setCiudadBusqueda('')
    if (colombiaData.length === 0) fetch('/colombia.json').then(r => r.json()).then(d => setColombiaData(d))
    setPassword('')
    setSyncFecha('')
    setSyncMsg('')
    setSyncEvidencia(null)
    setSyncPrimerRecibo(null)
    setResultado(null)
    setError('')
    setApiIdSeleccionado(empleadoExistente?.apiId || '')
    setModal(true)
  }

  async function guardar(confirmarReduccionListas?: boolean) {
    setLoading(true); setError('')
    if (editando) {
      const res = await fetch('/api/empleados', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editando.id, nombre, email: emailEdit || undefined, telefono, password: password || undefined, vendedorId: vendedorId || null, puedeCapturarGps, ciudades: ciudadesAsignadas, listaIds, vendedorIds: (slotRol === 'supervisor' || editando?.rol === 'supervisor') ? vendedorIds : undefined, permisos: permisos, etiqueta: (slotRol === 'supervisor' || editando?.rol === 'supervisor') ? etiqueta : undefined, apiId: apiIdSeleccionado || undefined, confirmarReduccionListas })
      })
      const data = await res.json()
      if (data.error === 'REDUCCION_LISTAS_SIN_CONFIRMAR') {
        setLoading(false)
        const nombres = (data.listaIdsRemovidas || []).join(', ')
        if (confirm(`Este cambio quita ${data.listaIdsRemovidas?.length || 0} lista(s) asignada(s) (${nombres}). ¿Confirmar?`)) {
          guardar(true)
        }
        return
      }
      setLoading(false)
      if (data.error) { setError(data.error); return }
      setModal(false)
      loadData()
    } else {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, rol: slotRol, telefono, password, vendedorId: vendedorId || null, ciudades: ciudadesAsignadas, listaIds, vendedorIds: slotRol === 'supervisor' ? vendedorIds : undefined, permisos: permisos, etiqueta: slotRol === 'supervisor' ? etiqueta : undefined, apiId: apiIdSeleccionado || undefined })
      })
      const data = await res.json()
      setLoading(false)
      if (data.error) { setError(data.error); return }
      setResultado(data)
      // Si el empleado tiene apiId y lista → preparar popup sync (solo si no tiene syncInicioAt)
      if (data.id && apiIdSeleccionado && listaIds.length > 0) {
        setSyncEmpleadoId(data.id)
        setSyncFecha(new Date().toISOString().split('T')[0])
        setSyncMsg('')
      }
    }
  }

  async function ejecutarSyncInicial() {
    if (!syncEmpleadoId || !syncFecha) return
    setSyncLoading(true); setSyncMsg('')
    const res = await fetch('/api/vendedor/sync-inicial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empleadoId: syncEmpleadoId, syncInicioAt: new Date(syncFecha + 'T05:00:00Z').toISOString() })
    })
    const data = await res.json()
    setSyncLoading(false)
    if (data.error) { setSyncMsg('Error: ' + data.error); return }
    setSyncMsg(`✅ ${data.actualizadas} deudas sincronizadas`)
    setTimeout(() => { setPopupSync(false); setSyncMsg('') }, 2000)
  }

  async function toggleActivo(id: string, activoActual: boolean) {
    const accion = activoActual ? 'Inactivar' : 'Activar'
    if (!confirm(`${accion} este empleado?`)) return
    await fetch('/api/empleados', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion: 'toggle' }),
    })
    loadData()
    setModal(false)
  }

  async function eliminarSlotVacio(rol: string) {
    if (!confirm('¿Eliminar este slot vacío?')) return
    const res = await fetch('/api/empleados/slot', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol }),
    })
    const d = await res.json()
    if (!d.ok) { alert(d.error); return }
    loadData()
  }

  function guardarPermisos(nuevosPermisos: Record<string, boolean>) {
    setPermisos(nuevosPermisos)
    setPopupPermisos(false)
  }

  return {
    empleados, setEmpleados,
    limites, setLimites,
    modal, setModal,
    slotRol, setSlotRol,
    slotNum, setSlotNum,
    editando, setEditando,
    emailEdit, setEmailEdit,
    nombre, setNombre,
    telefono, setTelefono,
    telefonoValido, setTelefonoValido,
    password, setPassword,
    showPassword, setShowPassword,
    generarPasswordDefault,
    vendedorId, setVendedorId,
    listaIds, setListaIds,
    listas, setListas,
    vendedorIds, setVendedorIds,
    etiqueta, setEtiqueta,
    permisos, setPermisos,
    popupPermisos, setPopupPermisos,
    puedeCapturarGps, setPuedeCapturarGps,
    ciudadesAsignadas, setCiudadesAsignadas,
    ciudadBusqueda, setCiudadBusqueda,
    colombiaData, setColombiaData,
    ciudadesSugeridas, setCiudadesSugeridas,
    resultado, setResultado,
    error, setError,
    loading, setLoading,
    empresaNombre, setEmpresaNombre,
    empresaId, setEmpresaId,
    precios, setPrecios,
    cantidades, setCantidades,
    ampliarAbierto, setAmpliarAbierto,
    confirmToggle, setConfirmToggle,
    enMora, setEnMora,
    syncEmpleados, setSyncEmpleados,
    tieneIntegracion, setTieneIntegracion,
    apiIdSeleccionado, setApiIdSeleccionado,
    storageData, setStorageData,
    popupSync, setPopupSync,
    popupSyncForm, setPopupSyncForm,
    popupAsignacion, setPopupAsignacion,
    asigLoading, setAsigLoading,
    asigMsg, setAsigMsg,
    syncEvidencia, setSyncEvidencia,
    syncEmpleadoId, setSyncEmpleadoId,
    syncFecha, setSyncFecha,
    syncPrimerRecibo, setSyncPrimerRecibo,
    syncLoading, setSyncLoading,
    syncMsg, setSyncMsg,
    loadData,
    abrirSlot,
    guardar,
    ejecutarSyncInicial,
    toggleActivo,
    eliminarSlotVacio,
    guardarPermisos,
  }
}

export type UseEmpleados = ReturnType<typeof useEmpleados>
