'use client'
import ClienteCardRol from '@/components/ClienteCardRol'
import DataTable, { ColDef } from '@/components/DataTable'
const ModalVisita = dynamic(() => import('@/components/ModalVisita'), { ssr: false })
import { useEffect, useState, useRef } from 'react'
import { saveCache, loadCache } from '@/lib/offlineCache'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { checkPermiso } from '@/lib/permisos'

const PAGE_SIZE = 15

function getClienteColumns(ctx: {
  rol: string
  puedeEditar: boolean
  setEditando: (c: any) => void
  setEditForm: (f: any) => void
  colombiaData: any[]
  setColombiaData: (d: any[]) => void
  setVisitaModal: (v: any) => void
  router: any
}): ColDef<any>[] {
  return [
    {
      key: 'nombre', label: 'Cliente', width: 220, minWidth: 120,
      render: (c: any) => (
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'capitalize' }}>{c.nombre?.toLowerCase()}</div>
          {c.nombreComercial && c.nombreComercial !== c.nombre && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'capitalize' }}>{c.nombreComercial?.toLowerCase()}</div>
          )}
        </div>
      ),
    },
    {
      key: 'nit', label: 'NIT', width: 120, minWidth: 70,
      render: (c: any) => <span style={{ fontFamily: 'monospace' }}>{c.nit || '—'}</span>,
    },
    {
      key: 'telefono', label: 'Celular', width: 130, minWidth: 80,
      render: (c: any) => <span style={{ fontFamily: 'monospace' }}>{c.telefono || '—'}</span>,
    },
    {
      key: 'ciudad', label: 'Ciudad', width: 130, minWidth: 80,
      render: (c: any) => <span style={{textTransform:'capitalize'}}>{c.ciudad?.toLowerCase() || '—'}</span>,
    },
    {
      key: 'vendedor', label: 'Vendedor', width: 130, minWidth: 80,
      render: (c: any) => <span style={{textTransform:'capitalize'}}>{c.lista?.vendedores?.[0]?.empleado?.nombre?.split(' ')[0]?.toLowerCase() || '—'}</span>,
    },
    {
      key: 'acciones', label: 'Acciones', width: 170, minWidth: 120,
      render: (c: any) => {
        const tel = (c.telefono ?? '').replace(/\D/g, '')
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <a href={`tel:${tel}`} title="Llamar"
              style={{ fontSize: 16, lineHeight: 1, textDecoration: 'none' }}>📞</a>
            <a href={`https://wa.me/57${tel}`} target="_blank" rel="noreferrer" title="WhatsApp"
              style={{ fontSize: 16, lineHeight: 1, textDecoration: 'none' }}>💬</a>
            {ctx.puedeEditar && (
              <button onClick={e => {
                e.stopPropagation()
                ctx.setEditando(c)
                ctx.setEditForm({ nombre: c.nombre, nombreComercial: c.nombreComercial||'', direccion: c.direccion||'', telefono: c.telefono||'', ciudad: c.ciudad||'', nit: c.nit||'', listaId: c.listaId||'', apiId: c.apiId||'', maps: c.maps||'' })
                if (ctx.colombiaData.length === 0) fetch('/colombia.json').then(r => r.json()).then(d => ctx.setColombiaData(d))
              }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }} title="Editar">✏️</button>
            )}
            <button onClick={e => { e.stopPropagation(); ctx.router.push(`/visitas-admin?clienteId=${c.id}`) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }} title="Historial">📋</button>
            {(ctx.rol === 'vendedor') && (
              <button onClick={e => { e.stopPropagation(); ctx.setVisitaModal({ cliente: c, tipo: 'visita' }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }} title="Visita">✅</button>
            )}
          </div>
        )
      },
    },
  ]
}

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
  const [tieneIntegracion, setTieneIntegracion] = useState<boolean | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [nextCursor, setNextCursor] = useState<string|null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const LIMIT = 15
  const [form, setForm] = useState({ nombre: '', nit: '', nombreComercial: '', direccion: '', ciudad: '', telefono: '', listaId: '', apiId: '', maps: '' })
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listas, setListas] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [colombiaData, setColombiaData] = useState<any[]>([])
  const [ciudadSugeridas, setCiudadSugeridas] = useState<string[]>([])
  const [editando, setEditando] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'clientes'|'listas'>('clientes')
  const [importandoImpExp, setImportandoImpExp] = useState(false)
  const [visitaModal, setVisitaModal] = useState<{ cliente: any; tipo: string } | null>(null)
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null)
  const [filtroLista, setFiltroLista] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [isDesktop, setIsDesktop] = useState(false)
  const [page,      setPage]      = useState(0)

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    loadClientes('', null)
    Promise.all([
      fetch('/api/listas').then(r=>r.json()),
      fetch('/api/empleados').then(r=>r.json()),
      fetch('/api/integracion/estado').then(r=>r.json()).catch(()=>null),
    ]).then(([listas, emps, integracion]) => {
      if(Array.isArray(listas)) setListas(listas)
      if(emps?.empleados) setVendedores(emps.empleados.filter((e:any)=>e.rol==='vendedor'&&e.activo))
      if(integracion?.tieneIntegracion) setTieneIntegracion(true)
    })
  }, [])

  async function loadClientes(q: string = '', cursor: string | null = null, listaOverride?: string) {
    const listaToUse = listaOverride !== undefined ? listaOverride : filtroLista
    const params = new URLSearchParams({ q, limit: String(LIMIT) })
    if (cursor) params.set('cursor', cursor)
    if (listaToUse) params.set('listaId', listaToUse)

    // Stale-while-revalidate: mostrar caché al instante, red en background
    if (!cursor && !q && !listaToUse) {
      const cached = loadCache<any>('clientes')
      if (cached?.data?.clientes) {
        setClientes(cached.data.clientes)
        setNextCursor(cached.data.nextCursor ?? null)
        setHasMore(cached.data.hasMore ?? false)
        setTotal(cached.data.clientes.length)
        // Refrescar en background sin spinner
        fetch(`/api/clientes?${params}`).then(r => r.json()).then(data => {
          const nuevos = data.clientes ?? []
          saveCache('clientes', { clientes: nuevos, nextCursor: data.nextCursor, hasMore: data.hasMore })
          setClientes(nuevos)
          setNextCursor(data.nextCursor ?? null)
          setHasMore(data.hasMore ?? false)
          setTotal(nuevos.length)
        }).catch(() => {})
        return
      }
    }

    if (!cursor) setLoading(true); else setLoadingMore(true)
    const res = await fetch(`/api/clientes?${params}`)
    const data = await res.json()
    const nuevos = data.clientes ?? []
    if (!cursor) saveCache('clientes', { clientes: nuevos, nextCursor: data.nextCursor, hasMore: data.hasMore })
    setClientes(!cursor ? nuevos : prev => [...prev, ...nuevos])
    setNextCursor(data.nextCursor ?? null)
    setHasMore(data.hasMore ?? false)
    setTotal(prev => !cursor ? nuevos.length : prev + nuevos.length)
    if (!cursor) setLoading(false); else setLoadingMore(false)
  }


  async function asignarGps(id: string) {
    navigator.geolocation.getCurrentPosition(
      async pos => {
        await fetch('/api/clientes/gps', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, lat: pos.coords.latitude, lng: pos.coords.longitude })
        })
        loadClientes(buscar, null)
      },
      () => alert('No se pudo obtener la ubicacion'),
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
    )
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar cliente?')) return
    await fetch('/api/clientes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadClientes(buscar, null)
  }


  async function guardarEdicion() {
    if (!editando) return
    await fetch('/api/clientes/' + editando.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    })
    setEditando(null)
    loadClientes(buscar, null)
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
      <div className="space-y-3 max-w-7xl mx-auto">
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
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-white font-bold text-lg">Nueva lista</h3>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
                <input value={nombreLista} onChange={e => setNombreLista(e.target.value)} onKeyDown={e => e.key === 'Enter' && crearLista()} placeholder="Ej: Zona Norte" autoFocus
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
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
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-white font-bold text-lg">Editar lista</h3>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
                <input value={nombreLista} onChange={e => setNombreLista(e.target.value)}
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
              </div>
              {empTab.length > 0 && (
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Vendedores asignados</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto  rounded-xl p-2" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}}>
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
    return true
  })

  const pagedClientes = clientesFiltrados.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages    = Math.max(1, Math.ceil(clientesFiltrados.length / PAGE_SIZE))


  async function sincronizarClientes() {
    setSincronizando(true)
    try {
      await fetch('/api/integracion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'delta' })
      })
      await loadClientes(buscar, null, filtroLista)
    } catch {}
    setSincronizando(false)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">


      {/* Toolbar: search + filters */}
      <div className="flex gap-2 flex-wrap mb-3">
        <input value={buscar} onChange={e => {
          const q = e.target.value
          setBuscar(q)
          clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => loadClientes(q, null), 500)
        }}
          placeholder="Buscar por nombre, NIT o nombre comercial..."
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
        {listas.length > 0 && (
          <select value={filtroLista} onChange={e => { const v = e.target.value; setFiltroLista(v); loadClientes(buscar, null, v) }}
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


          {isDesktop ? (
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <DataTable
                columns={getClienteColumns({ rol, puedeEditar, setEditando, setEditForm, colombiaData, setColombiaData, setVisitaModal, router })}
                rows={pagedClientes}
                rowKey={(c: any) => c.id}
                onRowClick={(c: any) => setClienteSeleccionado(c)}
                loading={loading}
                storageKey="clientes"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
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
                      onHistorial={() => router.push(`/visitas-admin?clienteId=${c.id}`)}
                      onEditar={puedeEditar ? () => {
                        setEditando(c)
                        setEditForm({ nombre: c.nombre, nombreComercial: c.nombreComercial||'', direccion: c.direccion||'', telefono: c.telefono||'', ciudad: c.ciudad||'', nit: c.nit||'', listaId: c.listaId||'', apiId: c.apiId||'' })
                        if (colombiaData.length === 0) fetch('/colombia.json').then(r => r.json()).then(d => setColombiaData(d))
                      } : undefined}
                    />
                  ))}
                  {clientesFiltrados.length === 0 && !loading && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                      <p className="text-3xl mb-2">🏪</p>
                      <p className="text-zinc-400">{buscar || filtroLista ? 'Sin resultados' : 'No hay clientes registrados'}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {isDesktop ? (
            /* ── Paginación desktop ── */
            clientesFiltrados.length > 0 && (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,paddingTop:8}}>
                <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                  style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'6px 16px',fontSize:12,fontWeight:700,color:page===0?'rgba(255,255,255,0.25)':'white',cursor:page===0?'not-allowed':'pointer'}}>
                  ← Anterior
                </button>
                <span style={{fontSize:12,color:'rgba(255,255,255,0.6)',minWidth:90,textAlign:'center'}}>
                  Pág {page + 1} / {totalPages}{hasMore ? '+' : ''}
                </span>
                <button
                  onClick={async () => {
                    const nextPage = page + 1
                    if (nextPage >= totalPages && hasMore) await loadClientes(buscar, nextCursor)
                    setPage(nextPage)
                  }}
                  disabled={(page >= totalPages - 1 && !hasMore) || loadingMore}
                  style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'6px 16px',fontSize:12,fontWeight:700,color:(page>=totalPages-1&&!hasMore)?'rgba(255,255,255,0.25)':'white',cursor:(page>=totalPages-1&&!hasMore)?'not-allowed':'pointer'}}>
                  {loadingMore ? '...' : 'Siguiente →'}
                </button>
                <span style={{fontSize:11,color:'rgba(255,255,255,0.3)',marginLeft:4}}>{clientesFiltrados.length} clientes</span>
              </div>
            )
          ) : (
            /* ── Cargar más mobile ── */
            hasMore && (
              <button onClick={() => loadClientes(buscar, nextCursor)} disabled={loadingMore}
                style={{background:"#1e2a3d",border:"1px solid #1e3a5f",borderRadius:10,padding:"6px 18px",color:"white",fontSize:13,fontWeight:500,cursor:"pointer"}}>
                {loadingMore ? 'Cargando...' : `Cargar más (${clientes.length} cargados)`}
              </button>
            )
          )}
        </div>


      </div>
      {visitaModal && (
        <ModalVisita
          open={true}
          onClose={() => setVisitaModal(null)}
          clienteInicial={visitaModal.cliente}
          tipoForzado={visitaModal.tipo}
          onRegistrado={() => { setVisitaModal(null); loadClientes(buscar, null) }}
        />
      )}

      {/* Modal editar cliente */}
      {editando && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg">Editar cliente</h3>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">NIT</label>
              <div style={{position:'relative'}}>
                <input value={editForm.nit} onChange={e => setEditForm({...editForm, nit: e.target.value})}
                  className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)",paddingRight: editando?.apiId ? 36 : undefined}} />
                {editando?.apiId && (
                  <span title="Sincronizado con UpTres" style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'#22c55e', pointerEvents:'none'}}>🔒</span>
                )}
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
              <input value={editForm.nombre} onChange={e => setEditForm({...editForm, nombre: e.target.value})}
                className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre comercial</label>
              <input value={editForm.nombreComercial} onChange={e => setEditForm({...editForm, nombreComercial: e.target.value})}
                className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Celular</label>
                <input value={editForm.telefono} onChange={e => setEditForm({...editForm, telefono: e.target.value})}
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
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
                    className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
                  {ciudadSugeridas.length > 0 && (
                    <div className="absolute z-10 w-full mt-1  rounded-xl overflow-hidden shadow-xl" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}}>
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
                className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
            </div>
            {esAdmin && (
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Lista</label>
                <select value={editForm.listaId||''} onChange={e => setEditForm({...editForm, listaId: e.target.value})}
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}}>
                  <option value="">Sin lista</option>
                  {listas.map((l:any) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">URL Maps</label>
              <input value={editForm.maps||''} onChange={e => setEditForm({...editForm, maps: e.target.value})}
                placeholder={(editForm.direccion || editForm.ciudad) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([editForm.direccion, editForm.ciudad].filter(Boolean).join(' ')) : 'https://www.google.com/maps/search/?api=1&query=...'}
                className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditando(null)} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={guardarEdicion} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm py-3 rounded-xl">Guardar</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Importar / Exportar clientes */}


    </div>
  )
}
