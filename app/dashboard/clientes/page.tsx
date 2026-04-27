'use client'
import ClienteCardRol from '@/components/ClienteCardRol'
import ModalVisita from '@/components/ModalVisita'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ExcelJS from 'exceljs'
import { checkPermiso } from '@/lib/permisos'

export default function ClientesPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const esAdmin = (session?.user as any)?.role === 'empresa'
  const puedeEditar = esAdmin || checkPermiso(session, 'editarClientes')
  const userRole = (session?.user as any)?.role
  const rol: 'vendedor' | 'entregador' | 'admin' | 'supervisor' =
    userRole === 'empresa' ? 'admin' :
    userRole === 'supervisor' ? 'supervisor' :
    userRole === 'entregador' ? 'entregador' : 'vendedor'
  const [clientes, setClientes] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalImport, setModalImport] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 15
  const [form, setForm] = useState({ nombre: '', nit: '', nombreComercial: '', direccion: '', ciudad: '', telefono: '', listaId: '', apiId: '', maps: '' })
  const [importData, setImportData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<any[]>([])
  const [listas, setListas] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [colombiaData, setColombiaData] = useState<any[]>([])
  const [ciudadSugeridas, setCiudadSugeridas] = useState<string[]>([])
  const [editando, setEditando] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'clientes'|'listas'>('clientes')
  const [modalImpExp, setModalImpExp] = useState(false)
  const [previewRows, setPreviewRows] = useState<any[]>([])
  const [draggingImpExp, setDraggingImpExp] = useState(false)
  const [importandoImpExp, setImportandoImpExp] = useState(false)
  const [importResultImpExp, setImportResultImpExp] = useState<any>(null)
  const [visitaModal, setVisitaModal] = useState<{ cliente: any; tipo: string } | null>(null)
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null)
  const [filtroLista, setFiltroLista] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const fileRefImpExp = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    loadClientes('', 1)
    fetch('/api/listas').then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setListas(d) })
    fetch('/api/empleados').then(r=>r.json()).then(d=>{ if(d.empleados) setVendedores(d.empleados.filter((e:any)=>e.rol==='vendedor'&&e.activo)) })
  }, [])

  async function loadClientes(q: string = '', p: number = 1) {
    if (p === 1) setLoading(true); else setLoadingMore(true)
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT}`)
    const data = await res.json()
    const nuevos = data.clientes ?? []
    setClientes(p === 1 ? nuevos : prev => [...prev, ...nuevos])
    setTotal(data.total ?? 0)
    setPage(p)
    if (p === 1) setLoading(false); else setLoadingMore(false)
  }

  async function crear() {
    if (!form.nombre) return
    if (form.telefono && form.telefono.replace(/\D/g,'').length !== 10) { setError('El celular debe tener 10 dígitos'); return }
    setError('')
    setLoading(true)
    await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    setLoading(false)
    setModal(false)
    setForm({ nombre: '', nit: '', nombreComercial: '', direccion: '', ciudad: '', telefono: '', listaId: '', apiId: '', maps: '' })
    loadClientes(buscar, 1)
  }

  async function asignarGps(id: string) {
    navigator.geolocation.getCurrentPosition(
      async pos => {
        await fetch('/api/clientes/gps', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, lat: pos.coords.latitude, lng: pos.coords.longitude })
        })
        loadClientes(buscar, 1)
      },
      () => alert('No se pudo obtener la ubicacion'),
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
    )
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar cliente?')) return
    await fetch('/api/clientes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadClientes(buscar, 1)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const buffer = ev.target?.result as ArrayBuffer
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]
      const rows: any[] = []
      const headers: string[] = []
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) {
          row.eachCell((cell, col) => { headers[col] = String(cell.value || '').trim().toLowerCase() })
        } else {
          const obj: any = {}
          headers.forEach((h, col) => {
            if (h) obj[h] = row.getCell(col).value ?? ''
          })
          // Solo agregar si al menos un campo tiene valor
          const tieneValor = Object.values(obj).some(v => v !== '' && v !== null && v !== undefined)
          if (tieneValor) rows.push(obj)
        }
      })
      const OBLIGATORIOS = ['nit', 'nombre', 'celular', 'direccion', 'nombre_comercial', 'ciudad']
      const allRows = rows.map((r, i) => ({
        fila: i + 2,
        nit: String(r['nit'] || r['Nit'] || r['NIT'] || ''),
        nombre: r['nombre'] || r['Nombre'] || r['NOMBRE'] || '',
        nombreComercial: r['nombre_comercial'] || r['Nombre Comercial'] || r['nombreComercial'] || '',
        ciudad: r['ciudad'] || r['Ciudad'] || r['CIUDAD'] || '',
        direccion: r['direccion'] || r['Dirección'] || r['DIRECCION'] || '',
        telefono: String(r['telefono'] || r['Teléfono'] || r['TELEFONO'] || r['celular'] || r['Celular'] || ''),
        email: r['email'] || r['Email'] || r['EMAIL'] || '',
        listaNombre: String(r['lista'] || r['Lista'] || r['LISTA'] || ''),
        apiId: String(r['api'] || r['API'] || r['Api'] || r['api id'] || r['API ID'] || ''),
      }))
      const errores: any[] = []
      const validos = allRows.filter(r => {
        const faltantes: string[] = []
        if (!r.nit) faltantes.push('nit')
        if (!r.nombre) faltantes.push('nombre')
        if (!r.telefono) faltantes.push('celular')
        if (!r.direccion) faltantes.push('direccion')
        if (!r.nombreComercial) faltantes.push('nombre_comercial')
        if (!r.ciudad) faltantes.push('ciudad')
        if (faltantes.length > 0) {
          errores.push({ fila: r.fila, nombre: r.nombre || '(sin nombre)', faltantes })
          return false
        }
        return true
      })
      setImportErrors(errores)
      setImportData(validos)
      setModalImport(true)
    }
    reader.readAsBinaryString(file)
  }

  async function importar() {
    setImporting(true)
    const dataConLista = importData.map(c => {
      const lista = listas.find((l:any) => l.nombre.toLowerCase() === (c.listaNombre||'').toLowerCase())
      return { ...c, listaId: lista?.id || null }
    })
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataConLista)
    })
    const data = await res.json()
    setImporting(false)
    setModalImport(false)
    setImportData([])
    loadClientes('', 1)
    setBuscar('')
    alert(`✅ ${data.count} clientes importados`)
  }

  async function descargarExcel() {
    const wb = new ExcelJS.Workbook()

    // Hoja Listas
    const wsListas = wb.addWorksheet('Listas')
    wsListas.state = 'veryHidden'
    listas.forEach((l: any, i: number) => { wsListas.getCell(i + 1, 1).value = l.nombre })

    // Hoja Ciudades
    const dataCol = colombiaData.length > 0 ? colombiaData : await fetch('/colombia.json').then(r => r.json())
    const todasCiudades: string[] = []
    dataCol.forEach((dep: any) => dep.ciudades.forEach((c: string) => todasCiudades.push(dep.departamento + '/' + c)))
    const wsCiudades = wb.addWorksheet('Ciudades')
    wsCiudades.state = 'veryHidden'
    todasCiudades.forEach((c, i) => { wsCiudades.getCell(i + 1, 1).value = c })

    const sheetCols = [
      { header: 'api',             key: 'api',             width: 20 },
      { header: 'nit',             key: 'nit',             width: 15 },
      { header: 'nombre',          key: 'nombre',          width: 25 },
      { header: 'celular',         key: 'celular',         width: 15 },
      { header: 'direccion',       key: 'direccion',       width: 30 },
      { header: 'nombre_comercial',key: 'nombre_comercial',width: 25 },
      { header: 'ciudad',          key: 'ciudad',          width: 25 },
      { header: 'lista',           key: 'lista',           width: 20 },
      { header: 'maps',            key: 'maps',            width: 40 },
    ]
    const grayKeys = ['api', 'nit']
    const blueKeys = ['maps']

    function setupHeaders(ws: ExcelJS.Worksheet) {
      ws.columns = sheetCols
      ws.getRow(1).eachCell((cell, colNum) => {
        const key = ws.getColumn(colNum).key as string
        const argb = grayKeys.includes(key) ? 'FF3F3F46' : blueKeys.includes(key) ? 'FF1D4ED8' : 'FF16A34A'
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      })
    }

    function applyDV(ws: ExcelJS.Worksheet) {
      const cCol = ws.getColumn('ciudad').number
      const lCol = ws.getColumn('lista').number
      for (let r = 2; r <= 10000; r++) {
        ws.getCell(r, cCol).dataValidation = { type: 'list', allowBlank: true, formulae: [`IF(B${r}<>"",Ciudades!$A$1:$A$${todasCiudades.length},"")`], showErrorMessage: false }
        ws.getCell(r, lCol).dataValidation = { type: 'list', allowBlank: true, formulae: [`IF(B${r}<>"",Listas!$A$1:$A$${listas.length},"")`], showErrorMessage: false }
      }
    }

    // Hoja Existentes
    const wsE = wb.addWorksheet('Existentes')
    setupHeaders(wsE)
    clientes.forEach((c: any) => {
      const listaNombre = listas.find((l: any) => l.id === c.listaId)?.nombre || ''
      const dataRow = wsE.addRow({ api: c.apiId || '', nit: c.nit || '', nombre: c.nombre || '', celular: c.telefono || '', direccion: c.direccion || '', nombre_comercial: c.nombreComercial || '', ciudad: c.ciudad || '', lista: listaNombre, maps: c.maps || '' })
      ;[1, 2].forEach(col => {
        dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
        dataRow.getCell(col).font = { color: { argb: 'FF71717A' } }
      })
    })
    applyDV(wsE)

    // Hoja Nuevos
    const wsN = wb.addWorksheet('Nuevos')
    setupHeaders(wsN)
    wsN.addRow({ api: '', nit: '123456789', nombre: 'Ejemplo Cliente', celular: '3001234567', direccion: 'Calle 1 #2-3', nombre_comercial: 'Tienda Ejemplo', ciudad: 'Bogota', lista: listas[0]?.nombre || '', maps: '' })
    applyDV(wsN)

    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf]))
    const a = document.createElement('a'); a.href = url; a.download = 'clientes.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function descargarErrores() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Clientes')
    ws.columns = [
      { header: 'nit', key: 'nit', width: 15 },
      { header: 'nombre', key: 'nombre', width: 25 },
      { header: 'celular', key: 'celular', width: 15 },
      { header: 'direccion', key: 'direccion', width: 30 },
      { header: 'nombre_comercial', key: 'nombre_comercial', width: 25 },
      { header: 'ciudad', key: 'ciudad', width: 20 },
      { header: 'lista', key: 'lista', width: 15 },
    ]
    // Encabezado verde
    ws.getRow(1).eachCell((cell, colNum) => {
      const obligatorias = ['nombre','celular','direccion','ciudad']
      const key = ws.getColumn(colNum).key as string
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: obligatorias.includes(key) ? 'FF16A34A' : 'FF71717A' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    ws.getRow(1).height = 20
    // Filas con error en rojo
    importErrors.forEach(e => {
      const row = ws.addRow({
        nit: e.nit || '',
        nombre: e.nombre === '(sin nombre)' ? '' : e.nombre,
        celular: e.celular || '',
        direccion: e.direccion || '',
        nombre_comercial: e.nombreComercial || '',
        ciudad: e.ciudad || '',
        lista: e.listaNombre || '',
      })
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const key = ws.getColumn(colNum).key as string
        if (e.faltantes.includes(key === 'celular' ? 'celular' : key)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } }
          cell.font = { color: { argb: 'FFFFFFFF' } }
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }
        }
      })
    })
    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf]))
    const a = document.createElement('a'); a.href = url; a.download = 'clientes_con_errores.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function onFileImpExp(file: File) {
    const buffer = await file.arrayBuffer()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    // Leer hojas Existentes y Nuevos; si no existen, usar la primera hoja
    const sheetNames = ['Existentes', 'Nuevos']
    const sheetsToRead = sheetNames.map(n => wb.getWorksheet(n)).filter(Boolean) as ExcelJS.Worksheet[]
    if (sheetsToRead.length === 0) sheetsToRead.push(wb.worksheets[0])
    const rawRows: any[] = []
    sheetsToRead.forEach(ws => {
      const headers: string[] = []
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) {
          row.eachCell((cell, col) => { headers[col] = String(cell.value || '').trim().toLowerCase() })
        } else {
          const obj: any = {}
          headers.forEach((h, col) => { if (h) obj[h] = row.getCell(col).value ?? '' })
          const tieneValor = Object.values(obj).some(v => v !== '' && v !== null && v !== undefined)
          if (tieneValor) rawRows.push(obj)
        }
      })
    })
    const parsed = rawRows.map((r, i) => {
      const apiId     = String(r['api'] || r['API'] || r['Api'] || '').trim()
      const nit       = String(r['nit/cédula'] || r['nit'] || r['NIT/Cédula'] || r['NIT'] || r['cedula'] || r['cédula'] || '').trim()
      const nombre    = String(r['nombre'] || r['Nombre'] || r['NOMBRE'] || '').trim()
      const telefono  = String(r['teléfono'] || r['telefono'] || r['Teléfono'] || r['celular'] || r['Celular'] || '').trim()
      const direccion = String(r['dirección'] || r['direccion'] || r['Dirección'] || r['DIRECCION'] || '').trim()
      const ciudad    = String(r['ciudad'] || r['Ciudad'] || r['CIUDAD'] || '').trim()
      const listaNombre = String(r['lista'] || r['Lista'] || r['LISTA'] || '').trim()
      const maps      = String(r['maps'] || r['Maps'] || r['MAPS'] || '').trim()
      const issues: string[] = []
      let status: 'valid' | 'warning' | 'invalid'
      if (!nit) issues.push('NIT/Cédula')
      if (!nombre) issues.push('Nombre')
      if (!nit || !nombre) {
        status = 'invalid'
      } else {
        if (!ciudad) issues.push('Ciudad')
        if (!listaNombre) issues.push('Lista')
        status = issues.length > 0 ? 'warning' : 'valid'
      }
      return { fila: i + 2, apiId, nit, nombre, telefono, direccion, ciudad, listaNombre, maps, status, issues }
    })
    setPreviewRows(parsed)
    setImportResultImpExp(null)
  }

  async function exportarClientes() {
    const res = await fetch('/api/clientes/exportar')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'clientes_exportados.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function importarImpExp() {
    const toImport = previewRows.filter(r => r.status !== 'invalid')
    if (toImport.length === 0) return
    setImportandoImpExp(true)
    const dataConLista = toImport.map(c => {
      const lista = listas.find((l: any) => l.nombre.toLowerCase() === (c.listaNombre || '').toLowerCase())
      return { apiId: c.apiId || null, nit: c.nit, nombre: c.nombre, telefono: c.telefono, direccion: c.direccion, ciudad: c.ciudad, listaId: lista?.id || null, maps: c.maps || null }
    })
    const res = await fetch('/api/clientes/importar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataConLista),
    })
    const data = await res.json()
    setImportandoImpExp(false)
    setImportResultImpExp(data)
    if (data.ok) { loadClientes('', 1); setBuscar('') }
  }

  async function guardarEdicion() {
    if (!editando) return
    await fetch('/api/clientes/' + editando.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    })
    setEditando(null)
    loadClientes(buscar, 1)
  }

  function ListasTab({ empresaId }: { empresaId?: string }) {
    const [listasTab, setListasTab] = useState<any[]>([])
    const [empTab, setEmpTab] = useState<any[]>([])
    const [modalCrear, setModalCrear] = useState(false)
    const [modalEditar, setModalEditar] = useState<any>(null)
    const [nombreLista, setNombreLista] = useState('')
    const [vendedorIds, setVendedorIds] = useState<string[]>([])
    const [loadingLista, setLoadingLista] = useState(false)

    useEffect(() => {
      fetch('/api/listas').then(r => r.json()).then(d => { if (Array.isArray(d)) setListasTab(d) })
      fetch('/api/empleados').then(r => r.json()).then(d => {
        if (d.empleados) setEmpTab(d.empleados.filter((e: any) => e.rol === 'vendedor' && e.activo))
      })
    }, [])

    async function crearLista() {
      if (!nombreLista.trim()) return
      setLoadingLista(true)
      await fetch('/api/listas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nombreLista.trim() }) })
      setLoadingLista(false)
      setModalCrear(false)
      setNombreLista('')
      fetch('/api/listas').then(r => r.json()).then(d => { if (Array.isArray(d)) { setListasTab(d); setListas(d) } })
    }

    async function guardarEdicion() {
      if (!modalEditar || !nombreLista.trim()) return
      setLoadingLista(true)
      await fetch('/api/listas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modalEditar.id, nombre: nombreLista.trim(), vendedorIds }) })
      setLoadingLista(false)
      setModalEditar(null)
      setNombreLista('')
      setVendedorIds([])
      fetch('/api/listas').then(r => r.json()).then(d => { if (Array.isArray(d)) { setListasTab(d); setListas(d) } })
    }

    async function eliminarLista(id: string, nom: string) {
      if (!confirm(`¿Eliminar la lista "${nom}"? Los clientes asignados quedarán sin lista.`)) return
      await fetch('/api/listas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      fetch('/api/listas').then(r => r.json()).then(d => { if (Array.isArray(d)) { setListasTab(d); setListas(d) } })
    }

    function abrirEditar(lista: any) {
      setModalEditar(lista)
      setNombreLista(lista.nombre)
      setVendedorIds(lista.vendedores?.map((v: any) => v.empleadoId) || [])
    }

    return (
      <div className="space-y-3">
        {esAdmin && (
          <div className="flex justify-end">
            <button onClick={() => { setNombreLista(''); setModalCrear(true) }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm">
              + Nueva lista
            </button>
          </div>
        )}

        {listasTab.map((lista: any) => {
          const nombresV = lista.vendedores?.map((v: any) => v.empleado?.nombre).filter(Boolean) || []
          return (
            <div key={lista.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{lista.nombre}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-zinc-500 text-xs">{lista._count?.clientes ?? 0} clientes</span>
                  {nombresV.length > 0 ? (
                    <><span className="text-zinc-600 text-xs">·</span><span className="text-emerald-400 text-xs">{nombresV.join(', ')}</span></>
                  ) : (
                    <><span className="text-zinc-600 text-xs">·</span><span className="text-zinc-600 text-xs">Sin vendedores</span></>
                  )}
                </div>
              </div>
              {esAdmin && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => abrirEditar(lista)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded-lg">Editar</button>
                  <button onClick={() => eliminarLista(lista.id, lista.nombre)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-lg">Eliminar</button>
                </div>
              )}
            </div>
          )
        })}
        {listasTab.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-zinc-400">No hay listas creadas</p>
          </div>
        )}

        {modalCrear && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-white font-bold text-lg">Nueva lista</h3>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
                <input value={nombreLista} onChange={e => setNombreLista(e.target.value)} onKeyDown={e => e.key === 'Enter' && crearLista()} placeholder="Ej: Zona Norte" autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModalCrear(false)} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
                <button onClick={crearLista} disabled={loadingLista || !nombreLista.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                  {loadingLista ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        )}

        {modalEditar && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-white font-bold text-lg">Editar lista</h3>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
                <input value={nombreLista} onChange={e => setNombreLista(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
              </div>
              {empTab.length > 0 && (
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Vendedores asignados</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-xl p-2">
                    {empTab.map((emp: any) => (
                      <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700 cursor-pointer">
                        <input type="checkbox" checked={vendedorIds.includes(emp.id)}
                          onChange={e => setVendedorIds(prev => e.target.checked ? [...prev, emp.id] : prev.filter(x => x !== emp.id))}
                          className="accent-emerald-500" />
                        <span className="text-white text-sm">{emp.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {empTab.length === 0 && <p className="text-zinc-500 text-xs">No hay vendedores activos.</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setModalEditar(null); setNombreLista(''); setVendedorIds([]) }} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
                <button onClick={guardarEdicion} disabled={loadingLista || !nombreLista.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                  {loadingLista ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }


  const clientesFiltrados = clientes.filter((c: any) => {
    if (filtroLista && c.listaId !== filtroLista) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-zinc-400 text-sm mt-0.5">{total} registrados</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {puedeEditar && <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />}
          {puedeEditar && <input ref={fileRefImpExp} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFileImpExp(f); e.target.value = '' }} />}
          {puedeEditar && (
            <button onClick={() => { setPreviewRows([]); setImportResultImpExp(null); setModalImpExp(true) }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 whitespace-nowrap">
              📥 Importar / Exportar
            </button>
          )}
          {puedeEditar && (
            <button onClick={() => setModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs whitespace-nowrap">
              + Nuevo
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        <button onClick={() => setTab("clientes")} className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${tab === "clientes" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-zinc-400 hover:text-white"}`}>👥 Clientes</button>
        {(rol === 'admin' || rol === 'supervisor') && (
          <button onClick={() => setTab("listas")} className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${tab === "listas" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-zinc-400 hover:text-white"}`}>📋 Listas</button>
        )}
      </div>

      {tab === 'clientes' && (<>



      {/* Toolbar: search + filters */}
      <div className="flex gap-2 flex-wrap mb-3">
        <input value={buscar} onChange={e => {
          const q = e.target.value
          setBuscar(q)
          clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => loadClientes(q, 1), 500)
        }}
          placeholder="Buscar por nombre, NIT o nombre comercial..."
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
        {listas.length > 0 && (
          <select value={filtroLista} onChange={e => setFiltroLista(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-emerald-500 cursor-pointer">
            <option value="">Lista: Todas</option>
            {listas.map((l: any) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        )}
      </div>

      {/* Layout: cards + panel lateral */}
      <div className="flex gap-4 items-start">

        {/* Cards area */}
        <div className="flex-1 min-w-0">
          {clientes.length > 0 && (
            <p className="text-zinc-500 text-xs mb-2">Mostrando {clientesFiltrados.length} de {total} clientes</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-2xl h-20" />
              ))
            ) : (
              <>
                {clientesFiltrados.map((c: any) => (
                  <ClienteCardRol
                    key={c.id}
                    cliente={c}
                    rol={rol}
                    isSelected={clienteSeleccionado?.id === c.id}
                    onSelect={() => setClienteSeleccionado(c)}
                    onVisita={(tipo) => setVisitaModal({ cliente: c, tipo: tipo.toLowerCase() })}
                    onEntregar={() => setVisitaModal({ cliente: c, tipo: 'entrega' })}
                    onHistorial={() => router.push(`/dashboard/visitas-admin?clienteId=${c.id}`)}
                    onEditar={puedeEditar ? () => {
                      setEditando(c)
                      setEditForm({ nombre: c.nombre, nombreComercial: c.nombreComercial||'', direccion: c.direccion||'', telefono: c.telefono||'', ciudad: c.ciudad||'', nit: c.nit||'', listaId: c.listaId||'', apiId: c.apiId||'' })
                      if (colombiaData.length === 0) fetch('/colombia.json').then(r => r.json()).then(d => setColombiaData(d))
                    } : undefined}
                  />
                ))}
                {clientesFiltrados.length === 0 && !loading && (
                  <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                    <p className="text-3xl mb-2">🏪</p>
                    <p className="text-zinc-400">{buscar || filtroLista ? 'Sin resultados' : 'No hay clientes registrados'}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {clientes.length < total && (
            <button onClick={() => loadClientes(buscar, page + 1)} disabled={loadingMore}
              className="w-full mt-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-medium py-3 rounded-2xl border border-zinc-700 transition-colors">
              {loadingMore ? 'Cargando...' : `Cargar más (${clientes.length} de ${total})`}
            </button>
          )}
        </div>

        {/* Panel lateral derecho — desktop only */}
        <div className="hidden lg:block w-[320px] flex-shrink-0 bg-[#0f0f0f] border border-[#1a1a1a] rounded-2xl">
          {clienteSeleccionado ? (() => {
            const cs = clienteSeleccionado
            const telLimpio = (cs.telefono ?? '').replace(/\D/g, '')
            const listaNombre = listas.find((l: any) => l.id === cs.listaId)?.nombre
            const vendedorNombre = cs.lista?.vendedores?.[0]?.empleado?.nombre
            return (
              <div className="p-5 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-white font-bold text-base truncate">{cs.nombre}</h3>
                    {cs.nit && <p className="text-zinc-500 text-xs mt-0.5">NIT: {cs.nit}</p>}
                    {cs.nombreComercial && cs.nombreComercial !== cs.nombre && (
                      <p className="text-zinc-400 text-sm mt-0.5">{cs.nombreComercial}</p>
                    )}
                  </div>
                  <button onClick={() => setClienteSeleccionado(null)}
                    className="text-zinc-600 hover:text-white text-xl leading-none flex-shrink-0 mt-0.5">×</button>
                </div>

                {/* Info fields */}
                <div className="space-y-1.5">
                  {cs.telefono && (
                    <div className="bg-zinc-900/80 rounded-xl px-3 py-2.5">
                      <p className="text-zinc-600 text-xs">Celular</p>
                      <p className="text-zinc-200 text-sm">{cs.telefono}</p>
                    </div>
                  )}
                  {cs.ciudad && (
                    <div className="bg-zinc-900/80 rounded-xl px-3 py-2.5">
                      <p className="text-zinc-600 text-xs">Ciudad</p>
                      <p className="text-zinc-200 text-sm">{cs.ciudad}</p>
                    </div>
                  )}
                  {cs.direccion && (
                    <div className="bg-zinc-900/80 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-zinc-600 text-xs">Dirección</p>
                        <p className="text-zinc-200 text-sm truncate">{cs.direccion}</p>
                      </div>
                      <a href={cs.maps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((cs.direccion || '') + (cs.ciudad ? ', ' + cs.ciudad : ''))}`}
                        target="_blank" rel="noreferrer"
                        className="flex-shrink-0 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm px-2 py-1 rounded-lg">
                        🗺️
                      </a>
                    </div>
                  )}
                  {vendedorNombre && (
                    <div className="bg-zinc-900/80 rounded-xl px-3 py-2.5">
                      <p className="text-zinc-600 text-xs">Vendedor</p>
                      <p className="text-zinc-200 text-sm">{vendedorNombre}</p>
                    </div>
                  )}
                  {listaNombre && (
                    <div className="bg-zinc-900/80 rounded-xl px-3 py-2.5">
                      <p className="text-zinc-600 text-xs">Lista</p>
                      <p className="text-zinc-200 text-sm">{listaNombre}</p>
                    </div>
                  )}
                </div>

                {/* Botones de acción */}
                <div className="pt-1 space-y-2">
                  {(rol === 'admin' || rol === 'supervisor') ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <a href={`tel:${telLimpio}`}
                          className="flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-300 text-sm font-medium no-underline">
                          📞 Llamar
                        </a>
                        <a href={`https://wa.me/57${telLimpio}`} target="_blank" rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-emerald-400 text-sm font-medium no-underline">
                          💬 WA
                        </a>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {puedeEditar && (
                          <button onClick={() => {
                            setEditando(cs)
                            setEditForm({ nombre: cs.nombre, nombreComercial: cs.nombreComercial||'', direccion: cs.direccion||'', telefono: cs.telefono||'', ciudad: cs.ciudad||'', nit: cs.nit||'', listaId: cs.listaId||'', apiId: cs.apiId||'', maps: cs.maps||'' })
                            if (colombiaData.length === 0) fetch('/colombia.json').then(r => r.json()).then(d => setColombiaData(d))
                          }}
                            className="flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 border border-amber-900/50 rounded-xl text-amber-400 text-sm font-medium">
                            ✏️ Editar
                          </button>
                        )}
                        <button onClick={() => router.push(`/dashboard/visitas-admin?clienteId=${cs.id}`)}
                          className={`flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 border border-purple-900/50 rounded-xl text-purple-400 text-sm font-medium ${puedeEditar ? '' : 'col-span-2'}`}>
                          📋 Historial
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <a href={`tel:${telLimpio}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-300 text-sm no-underline">
                        📞 Llamar
                      </a>
                      <a href={`https://wa.me/57${telLimpio}`} target="_blank" rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-emerald-400 text-sm no-underline">
                        💬 WA
                      </a>
                      {rol === 'vendedor' && (
                        <button onClick={() => setVisitaModal({ cliente: cs, tipo: 'visita' })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-sm font-semibold">
                          + Visita
                        </button>
                      )}
                      {rol === 'entregador' && (
                        <button onClick={() => setVisitaModal({ cliente: cs, tipo: 'entrega' })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-white text-sm font-semibold">
                          📦 Entregar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })() : (
            <div className="flex flex-col items-center justify-center text-center p-8">
              <p className="text-4xl mb-3 opacity-20">👈</p>
              <p className="text-zinc-600 text-sm">Selecciona un cliente para ver el detalle</p>
            </div>
          )}
        </div>

      </div>
      </>)}

      {tab === 'listas' && (
        <ListasTab empresaId={(session?.user as any)?.id} />
      )}

      {visitaModal && (
        <ModalVisita
          open={true}
          onClose={() => setVisitaModal(null)}
          clienteInicial={visitaModal.cliente}
          tipoForzado={visitaModal.tipo}
          onRegistrado={() => { setVisitaModal(null); loadClientes(buscar, 1) }}
        />
      )}

      {/* Modal nuevo cliente */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 pb-24 md:pb-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg">Nuevo cliente</h3>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
              <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                placeholder="Nombre del cliente"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">NIT</label>
              <input value={form.nit||''} onChange={e => setForm({...form, nit: e.target.value})}
                placeholder="NIT del cliente"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre comercial</label>
              <input value={form.nombreComercial} onChange={e => setForm({...form, nombreComercial: e.target.value})}
                placeholder="Tienda, negocio..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Dirección</label>
              <input value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})}
                placeholder="Dirección del cliente"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Ciudad</label>
              <div className="relative">
                <input value={form.ciudad}
                  onChange={e => {
                    const q = e.target.value
                    setForm({...form, ciudad: q})
                    if (q.length < 2) { setCiudadSugeridas([]); return }
                    if (colombiaData.length === 0) {
                      fetch('/colombia.json').then(r=>r.json()).then(d => {
                        setColombiaData(d)
                        const res: string[] = []
                        d.forEach((dep: any) => {
                          dep.ciudades.forEach((c: string) => {
                            if (c.toLowerCase().includes(q.toLowerCase()) || dep.departamento.toLowerCase().includes(q.toLowerCase()))
                              res.push(dep.departamento + '/' + c)
                          })
                        })
                        setCiudadSugeridas(res.slice(0, 8))
                      })
                      return
                    }
                    const res: string[] = []
                    colombiaData.forEach((dep: any) => {
                      dep.ciudades.forEach((c: string) => {
                        if (c.toLowerCase().includes(q.toLowerCase()) || dep.departamento.toLowerCase().includes(q.toLowerCase()))
                          res.push(dep.departamento + '/' + c)
                      })
                    })
                    setCiudadSugeridas(res.slice(0, 8))
                  }}
                  placeholder="Buscar ciudad..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                {ciudadSugeridas.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
                    {ciudadSugeridas.map(c => (
                      <button key={c} type="button" onClick={() => { setForm({...form, ciudad: c}); setCiudadSugeridas([]) }}
                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Teléfono</label>
              <input value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})}
                placeholder="3001234567"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            {esAdmin && (
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Lista</label>
                <select value={form.listaId||''} onChange={e => setForm({...form, listaId: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500">
                  <option value="">Sin lista</option>
                  {listas.map((l:any) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">URL Maps</label>
              <input value={form.maps} onChange={e => setForm({...form, maps: e.target.value})}
                placeholder={(form.direccion || form.ciudad) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([form.direccion, form.ciudad].filter(Boolean).join(' ')) : 'https://www.google.com/maps/search/?api=1&query=...'}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setModal(false)} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={crear} disabled={loading || !form.nombre}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {modalImport && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6 pb-24 md:pb-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg">Importar clientes</h3>
            {importData.length > 0 && (
              <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-3">
                <p className="text-emerald-400 text-sm font-semibold">
                  ✅ {importData.length} cliente{importData.length !== 1 ? 's' : ''} listos para importar
                </p>
                <p className="text-emerald-600 text-xs mt-1">
                  Desde <span className="text-emerald-400 font-medium">{importData[0].nombre}</span> hasta <span className="text-emerald-400 font-medium">{importData[importData.length - 1].nombre}</span>
                </p>
              </div>
            )}
            {importErrors.length > 0 && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-3 space-y-2">
                <p className="text-red-400 text-sm font-semibold">⚠️ {importErrors.length} fila{importErrors.length !== 1 ? 's' : ''} con datos incompletos (no se importarán)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-red-500">
                        <th className="text-left pr-3 pb-1">Fila</th>
                        <th className="text-left pr-3 pb-1">Nombre</th>
                        <th className="text-left pb-1">Campos faltantes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importErrors.map((e, i) => (
                        <tr key={i} className="border-t border-red-900">
                          <td className="text-red-400 pr-3 py-1">{e.fila}</td>
                          <td className="text-white pr-3 py-1">{e.nombre}</td>
                          <td className="text-red-300 py-1">{e.faltantes.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {importData.length === 0 && importErrors.length === 0 && (
              <p className="text-zinc-400 text-sm">No se encontraron clientes válidos.</p>
            )}
            {importErrors.length > 0 && (
              <div className="bg-zinc-800 rounded-xl p-3">
                <p className="text-zinc-300 text-xs mb-2">⚠️ Corrige los errores antes de importar. Descarga el archivo con los errores marcados:</p>
                <button onClick={descargarErrores}
                  className="w-full bg-red-600 hover:bg-red-500 text-white text-sm py-2 rounded-xl font-semibold">
                  📥 Descargar filas con errores
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setModalImport(false); setImportData([]); setImportErrors([]) }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              {importData.length > 0 && importErrors.length === 0 && (
                <button onClick={importar} disabled={importing}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                  {importing ? 'Importando...' : `Importar ${importData.length}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal editar cliente */}
      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg">Editar cliente</h3>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">NIT</label>
              <div style={{position:'relative'}}>
                <input value={editForm.nit} onChange={e => setEditForm({...editForm, nit: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                  style={{paddingRight: editando?.apiId ? 36 : undefined}} />
                {editando?.apiId && (
                  <span title="Sincronizado con UpTres" style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'#22c55e', pointerEvents:'none'}}>🔒</span>
                )}
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
              <input value={editForm.nombre} onChange={e => setEditForm({...editForm, nombre: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre comercial</label>
              <input value={editForm.nombreComercial} onChange={e => setEditForm({...editForm, nombreComercial: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Celular</label>
                <input value={editForm.telefono} onChange={e => setEditForm({...editForm, telefono: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Ciudad</label>
                <div className="relative">
                  <input value={editForm.ciudad}
                    onChange={e => {
                      const q = e.target.value
                      setEditForm({...editForm, ciudad: q})
                      if (q.length < 2) { setCiudadSugeridas([]); return }
                      const res: string[] = []
                      colombiaData.forEach((dep: any) => {
                        dep.ciudades.forEach((c: string) => {
                          if (c.toLowerCase().includes(q.toLowerCase()) || dep.departamento.toLowerCase().includes(q.toLowerCase()))
                            res.push(dep.departamento + '/' + c)
                        })
                      })
                      setCiudadSugeridas(res.slice(0, 8))
                    }}
                    placeholder="Buscar ciudad..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  {ciudadSugeridas.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
                      {ciudadSugeridas.map(c => (
                        <button key={c} type="button" onClick={() => { setEditForm({...editForm, ciudad: c}); setCiudadSugeridas([]) }}
                          className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors">
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Dirección</label>
              <input value={editForm.direccion} onChange={e => setEditForm({...editForm, direccion: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            {esAdmin && (
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Lista</label>
                <select value={editForm.listaId||''} onChange={e => setEditForm({...editForm, listaId: e.target.value})}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500">
                  <option value="">Sin lista</option>
                  {listas.map((l:any) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">URL Maps</label>
              <input value={editForm.maps||''} onChange={e => setEditForm({...editForm, maps: e.target.value})}
                placeholder={(editForm.direccion || editForm.ciudad) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([editForm.direccion, editForm.ciudad].filter(Boolean).join(' ')) : 'https://www.google.com/maps/search/?api=1&query=...'}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditando(null)} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={guardarEdicion} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm py-3 rounded-xl">Guardar</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Importar / Exportar clientes */}
      {modalImpExp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Importar / Exportar clientes</h3>
              <button onClick={() => { setModalImpExp(false); setPreviewRows([]); setImportResultImpExp(null) }}
                className="text-zinc-500 hover:text-white text-2xl leading-none">×</button>
            </div>

            {/* Importar */}
            <div className="space-y-4">
              <p className="text-white font-semibold text-sm">📥 Importar clientes</p>

              {/* Drop area */}
              {previewRows.length === 0 && !importResultImpExp && (
                <>
                  <button onClick={descargarExcel}
                    style={{ background: '#059669', borderRadius: '10px', padding: '10px 16px', fontWeight: 600, fontSize: '14px' }}
                    className="w-full text-white hover:opacity-90 transition-opacity"
                    onMouseOver={e => (e.currentTarget.style.background = '#047857')}
                    onMouseOut={e => (e.currentTarget.style.background = '#059669')}>
                    ⬇ Descargar Excel
                  </button>
                  <div
                    onDragOver={e => { e.preventDefault(); setDraggingImpExp(true) }}
                    onDragLeave={() => setDraggingImpExp(false)}
                    onDrop={e => { e.preventDefault(); setDraggingImpExp(false); const f = e.dataTransfer.files[0]; if (f) onFileImpExp(f) }}
                    onClick={() => fileRefImpExp.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${draggingImpExp ? 'border-emerald-500 bg-emerald-950/20' : 'border-zinc-700 hover:border-zinc-500'}`}
                  >
                    <p className="text-3xl mb-2">📁</p>
                    <p className="text-zinc-300 text-sm font-semibold">Arrastra tu archivo aquí</p>
                    <p className="text-zinc-500 text-xs mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
                    <p className="text-zinc-600 text-xs mt-2">Columnas: api · nit · nombre · celular · direccion · ciudad · lista</p>
                  </div>
                </>
              )}

              {/* Preview */}
              {previewRows.length > 0 && !importResultImpExp && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-3 text-center">
                      <p className="text-emerald-400 font-bold text-xl">{previewRows.filter(r => r.status === 'valid').length}</p>
                      <p className="text-emerald-600 text-xs mt-0.5">Válidas</p>
                    </div>
                    <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-xl p-3 text-center">
                      <p className="text-yellow-400 font-bold text-xl">{previewRows.filter(r => r.status === 'warning').length}</p>
                      <p className="text-yellow-600 text-xs mt-0.5">Advertencias</p>
                    </div>
                    <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-center">
                      <p className="text-red-400 font-bold text-xl">{previewRows.filter(r => r.status === 'invalid').length}</p>
                      <p className="text-red-600 text-xs mt-0.5">Inválidas</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-zinc-700 max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-zinc-800">
                          <th className="text-left px-3 py-2 text-zinc-400 font-semibold">NIT/Cédula</th>
                          <th className="text-left px-3 py-2 text-zinc-400 font-semibold">Nombre</th>
                          <th className="text-left px-3 py-2 text-zinc-400 font-semibold">Ciudad</th>
                          <th className="text-left px-3 py-2 text-zinc-400 font-semibold">Lista</th>
                          <th className="text-left px-3 py-2 text-zinc-400 font-semibold">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={i} className={`border-t border-zinc-800/60 ${r.status === 'valid' ? 'bg-emerald-950/25' : r.status === 'warning' ? 'bg-yellow-950/25' : 'bg-red-950/25'}`}>
                            <td className="px-3 py-1.5 text-zinc-300">{r.nit || <span className="text-red-400 font-semibold">—</span>}</td>
                            <td className="px-3 py-1.5 text-white">{r.nombre || <span className="text-red-400 font-semibold">—</span>}</td>
                            <td className="px-3 py-1.5 text-zinc-400">{r.ciudad || <span className="text-yellow-500">—</span>}</td>
                            <td className="px-3 py-1.5 text-zinc-400">{r.listaNombre || <span className="text-yellow-500">—</span>}</td>
                            <td className="px-3 py-1.5">
                              {r.status === 'valid'   && <span className="text-emerald-400">✓ Válida</span>}
                              {r.status === 'warning' && <span className="text-yellow-400">⚠ Falta: {r.issues.join(', ')}</span>}
                              {r.status === 'invalid' && <span className="text-red-400">✗ Falta: {r.issues.join(', ')}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-zinc-500 text-xs">
                    Se importarán <span className="text-white font-medium">{previewRows.filter(r => r.status !== 'invalid').length}</span> filas (válidas + advertencias).
                    {previewRows.filter(r => r.status === 'invalid').length > 0 && <> <span className="text-red-400">{previewRows.filter(r => r.status === 'invalid').length} inválidas</span> serán ignoradas.</>}
                    {' '}Si el NIT ya existe, el cliente se actualizará.
                  </p>
                </>
              )}

              {/* Resultado */}
              {importResultImpExp && (
                <div className={`rounded-xl p-4 space-y-1.5 ${importResultImpExp.ok ? 'bg-emerald-950 border border-emerald-800' : 'bg-red-950 border border-red-800'}`}>
                  {importResultImpExp.ok ? (
                    <>
                      <p className="text-emerald-400 font-semibold text-sm">✅ Importación completada</p>
                      <p className="text-emerald-300 text-xs">· {importResultImpExp.creados} clientes creados</p>
                      <p className="text-emerald-300 text-xs">· {importResultImpExp.actualizados} clientes actualizados</p>
                      {importResultImpExp.errores?.length > 0 && (
                        <p className="text-yellow-400 text-xs">· {importResultImpExp.errores.length} filas con error</p>
                      )}
                    </>
                  ) : (
                    <p className="text-red-400 font-semibold text-sm">✗ Error en la importación</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalImpExp(false); setPreviewRows([]); setImportResultImpExp(null) }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">
                {importResultImpExp ? 'Cerrar' : 'Cancelar'}
              </button>
              {previewRows.length > 0 && !importResultImpExp && (
                <button onClick={() => { setPreviewRows([]); if (fileRefImpExp.current) fileRefImpExp.current.value = '' }}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm py-3 px-4 rounded-xl">
                  Cambiar
                </button>
              )}
              {previewRows.filter(r => r.status !== 'invalid').length > 0 && !importResultImpExp && (
                <button onClick={importarImpExp} disabled={importandoImpExp}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                  {importandoImpExp ? 'Importando...' : `Importar ${previewRows.filter(r => r.status !== 'invalid').length} clientes`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
