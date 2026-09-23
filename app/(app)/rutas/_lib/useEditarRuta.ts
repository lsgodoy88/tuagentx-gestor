import { useState } from 'react'

// Estado y acciones de: modal "Agregar clientes" (supervisor), modal "Editar
// ruta" y modal simple "Agregar cliente a ruta vinculada". Los tres comparten
// el mismo selector de clientes (clientesSup/selSup/etc.) y el mismo listado
// de pedidos vinculados tal como en el archivo original — se mantienen juntos
// aquí para no duplicar ese estado compartido en hooks separados.
export function useEditarRuta(loadData: () => void, empleados: any[]) {
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState('')
  const [empSeleccionados, setEmpSeleccionados] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [editando, setEditando] = useState<any>(null)

  const [modalAgregar, setModalAgregar] = useState<any>(null) // ruta target
  const [clientesSup, setClientesSup] = useState<any[]>([])
  const [buscarSup, setBuscarSup] = useState('')
  const [pageSup, setPageSup] = useState(1)
  const [totalSup, setTotalSup] = useState(0)
  const [selSup, setSelSup] = useState<string[]>([])
  const [savingSup, setSavingSup] = useState(false)
  const LIMIT_SUP = 10
  const [tabSup, setTabSup] = useState<'mis-clientes' | 'vinculadas'>('mis-clientes')
  const [pedidosVinculados, setPedidosVinculados] = useState<any[]>([])
  const [selVinculadas, setSelVinculadas] = useState<string[]>([])
  const [loadingVinculadas, setLoadingVinculadas] = useState(false)
  const [modalSimpleRuta, setModalSimpleRuta] = useState<any>(null)

  const [modalEditar, setModalEditar] = useState(false)
  const [tabEditar, setTabEditar] = useState<'empleados' | 'mis-clientes' | 'vinculadas'>('empleados')

  async function abrirEditar(r: any) {
    setNombre(r.nombre)
    setFecha(r.fecha ? r.fecha.split('T')[0] : '')
    setEmpSeleccionados(r.empleados.map((re: any) => re.empleadoId))
    setEditando(r)
    setTabEditar('empleados')
    setSelSup([])
    setBuscarSup('')
    setPageSup(1)
    setSelVinculadas([])
    setLoadingVinculadas(true)
    setModalEditar(true)
    const [_, vinRes] = await Promise.all([
      loadClientesSup('', 1),
      fetch('/api/empresas-vinculadas/pedidos-pendientes').then(r => r.json()),
    ])
    setPedidosVinculados(vinRes.pedidos || [])
    setLoadingVinculadas(false)
  }

  function cerrarModalEditar() {
    setModalEditar(false)
    setEditando(null)
    setNombre('')
    setFecha('')
    setEmpSeleccionados([])
    setSelSup([])
    setBuscarSup('')
    setSelVinculadas([])
  }

  async function guardarEdicion() {
    setLoading(true)
    await fetch('/api/rutas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editando.id, nombre, fecha, empleadoIds: empSeleccionados })
    })
    setLoading(false)
    cerrarModalEditar()
    loadData()
  }

  async function agregarClientesEditar() {
    if (!editando || selSup.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${editando.id}/agregar-clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteIds: selSup })
    })
    setSavingSup(false)
    setSelSup([])
    loadData()
  }

  async function agregarVinculadosEditar() {
    if (!editando || selVinculadas.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${editando.id}/agregar-vinculados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoIds: selVinculadas })
    })
    setSavingSup(false)
    setSelVinculadas([])
    loadData()
  }

  function toggleEmp(id: string) {
    setEmpSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function loadClientesSup(q: string, p: number) {
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT_SUP}`)
    const data = await res.json()
    setClientesSup(data.clientes || [])
    setTotalSup(data.total || 0)
  }

  async function abrirModalSimple(ruta: any) {
    setModalSimpleRuta(ruta)
    setSelSup([])
    setBuscarSup('')
    setPageSup(1)
    await loadClientesSup('', 1)
  }

  async function abrirModalAgregar(ruta: any) {
    setModalAgregar(ruta)
    setSelSup([])
    setBuscarSup('')
    setPageSup(1)
    setTabSup('mis-clientes')
    setSelVinculadas([])
    setLoadingVinculadas(true)
    const [_, vinRes] = await Promise.all([
      loadClientesSup('', 1),
      fetch('/api/empresas-vinculadas/pedidos-pendientes').then(r => r.json()),
    ])
    setPedidosVinculados(vinRes.pedidos || [])
    setLoadingVinculadas(false)
  }

  async function agregarClientes() {
    if (!modalAgregar || selSup.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${modalAgregar.id}/agregar-clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteIds: selSup })
    })
    setSavingSup(false)
    setModalAgregar(null)
    loadData()
  }

  async function agregarVinculados() {
    if (!modalAgregar || selVinculadas.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${modalAgregar.id}/agregar-vinculados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoIds: selVinculadas })
    })
    setSavingSup(false)
    setModalAgregar(null)
    loadData()
  }

  async function agregarClienteSimple() {
    if (selSup.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${modalSimpleRuta.id}/agregar-clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteIds: selSup })
    })
    setSavingSup(false)
    setModalSimpleRuta(null)
    setSelSup([])
    setBuscarSup('')
    loadData()
  }

  function cerrarModalSimple() {
    setModalSimpleRuta(null)
    setSelSup([])
    setBuscarSup('')
  }

  return {
    nombre, setNombre, fecha, setFecha, empSeleccionados, setEmpSeleccionados,
    loading, editando,
    modalAgregar, setModalAgregar, clientesSup, buscarSup, setBuscarSup,
    pageSup, setPageSup, totalSup, selSup, setSelSup, savingSup, LIMIT_SUP,
    tabSup, setTabSup, pedidosVinculados, selVinculadas, setSelVinculadas,
    loadingVinculadas, modalSimpleRuta,
    modalEditar, tabEditar, setTabEditar,
    abrirEditar, cerrarModalEditar, guardarEdicion,
    agregarClientesEditar, agregarVinculadosEditar, toggleEmp,
    loadClientesSup, abrirModalSimple, abrirModalAgregar,
    agregarClientes, agregarVinculados, agregarClienteSimple, cerrarModalSimple,
  }
}

export type UseEditarRuta = ReturnType<typeof useEditarRuta>
