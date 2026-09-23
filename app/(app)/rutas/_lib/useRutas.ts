import { useEffect, useState } from 'react'

// onClientesIniciales replica el efecto original: loadData() también poblaba
// `clientes`/`totalCli` (estado usado por el modal "Nueva ruta") con la
// primera página de /api/clientes. Se inyecta como callback para no duplicar
// ese estado ni su lógica en dos hooks.
export function useRutas(onClientesIniciales?: (clientes: any[], total: number) => void) {
  const [rutas, setRutas] = useState<any[]>([])
  const [empleados, setEmpleados] = useState<any[]>([])
  const [generando, setGenerando] = useState(false)
  const [rutaDetalle, setRutaDetalle] = useState<any>(null)

  // Filtro fecha + paginación
  const [filtroFecha, setFiltroFecha] = useState('')
  const [pageRutas, setPageRutas] = useState(1)
  const PAGE_SIZE = 7

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [rutRes, empRes, cliRes] = await Promise.all([
      fetch('/api/rutas').then(r => r.json()),
      fetch('/api/empleados').then(r => r.json()),
      fetch('/api/clientes?page=1&limit=10').then(r => r.json()),
    ])
    setRutas(Array.isArray(rutRes) ? rutRes : [])
    setEmpleados(Array.isArray(empRes) ? empRes : Array.isArray(empRes?.empleados) ? empRes.empleados : [])
    onClientesIniciales?.(cliRes?.clientes || [], cliRes?.total || 0)
  }

  async function generarRutaHoy() {
    setGenerando(true)
    try {
      const res = await fetch('/api/rutas/procesar-dia', { method: 'POST' })
      const d = await res.json()
      if (d.ok) { alert('Rutas generadas: ' + d.rutasCreadas); window.location.reload() }
      else alert(d.error || 'Error al generar')
    } catch (e) { alert('Error de conexión') }
    finally { setGenerando(false) }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar ruta?')) return
    await fetch('/api/rutas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadData()
  }

  const rutasFiltradas = filtroFecha
    ? rutas.filter(r => r.fecha && r.fecha.split('T')[0] === filtroFecha)
    : rutas
  const totalPaginas = Math.max(1, Math.ceil(rutasFiltradas.length / PAGE_SIZE))
  const rutasPagina = rutasFiltradas.slice((pageRutas - 1) * PAGE_SIZE, pageRutas * PAGE_SIZE)

  return {
    rutas, setRutas, empleados, setEmpleados, generando, generarRutaHoy,
    rutaDetalle, setRutaDetalle,
    filtroFecha, setFiltroFecha, pageRutas, setPageRutas, PAGE_SIZE,
    loadData, eliminar,
    rutasFiltradas, totalPaginas, rutasPagina,
  }
}

export type UseRutas = ReturnType<typeof useRutas>
