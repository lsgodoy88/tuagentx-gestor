'use client'
import { useEffect, useState } from 'react'

export default function ListasPage() {
  const [listas, setListas] = useState<any[]>([])
  const [empleados, setEmpleados] = useState<any[]>([])
  const [modalCrear, setModalCrear] = useState(false)
  const [modalEditar, setModalEditar] = useState<any>(null)
  const [nombre, setNombre] = useState('')
  const [vendedorIds, setVendedorIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [listasRes, empRes] = await Promise.all([
      fetch('/api/listas').then(r => r.json()),
      fetch('/api/empleados').then(r => r.json()),
    ])
    setListas(Array.isArray(listasRes) ? listasRes : [])
    const todos = empRes.empleados || []
    setEmpleados(todos.filter((e: any) => e.rol === 'vendedor' && e.activo))
  }

  async function crear() {
    if (!nombre.trim()) return
    setLoading(true)
    await fetch('/api/listas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre.trim() }),
    })
    setLoading(false)
    setModalCrear(false)
    setNombre('')
    loadAll()
  }

  async function guardarEdicion() {
    if (!modalEditar || !nombre.trim()) return
    setLoading(true)
    await fetch('/api/listas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: modalEditar.id, nombre: nombre.trim(), vendedorIds }),
    })
    setLoading(false)
    setModalEditar(null)
    setNombre('')
    setVendedorIds([])
    loadAll()
  }

  async function eliminar(id: string, nombreLista: string) {
    if (!confirm(`¿Eliminar la lista "${nombreLista}"? Los clientes asignados quedarán sin lista.`)) return
    await fetch('/api/listas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    loadAll()
  }

  function abrirEditar(lista: any) {
    setModalEditar(lista)
    setNombre(lista.nombre)
    setVendedorIds(lista.vendedores?.map((v: any) => v.empleadoId) || [])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Listas de clientes</h1>
          <p className="text-zinc-400 text-sm mt-1">{listas.length} lista{listas.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setNombre(''); setModalCrear(true) }}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm">
          + Nueva lista
        </button>
      </div>

      <div className="space-y-3">
        {listas.map((lista: any) => {
          const vendedoresNombres = lista.vendedores
            ?.map((v: any) => v.empleado?.nombre)
            .filter(Boolean) || []
          return (
            <div key={lista.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{lista.nombre}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-zinc-500 text-xs">{lista._count?.clientes ?? 0} clientes</span>
                  {vendedoresNombres.length > 0 && (
                    <span className="text-zinc-500 text-xs">·</span>
                  )}
                  {vendedoresNombres.length > 0 ? (
                    <span className="text-emerald-400 text-xs">{vendedoresNombres.join(', ')}</span>
                  ) : (
                    <span className="text-zinc-600 text-xs">Sin vendedores</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => abrirEditar(lista)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded-lg">
                  Editar
                </button>
                <button onClick={() => eliminar(lista.id, lista.nombre)}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-lg">
                  Eliminar
                </button>
              </div>
            </div>
          )
        })}
        {listas.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-zinc-400">No hay listas creadas</p>
          </div>
        )}
      </div>

      {/* Modal crear */}
      {modalCrear && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-white font-bold text-lg">Nueva lista</h3>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && crear()}
                placeholder="Ej: Zona Norte"
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModalCrear(false)}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={crear} disabled={loading || !nombre.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                {loading ? 'Guardando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {modalEditar && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-white font-bold text-lg">Editar lista</h3>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre *</label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
            {empleados.length > 0 && (
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Vendedores asignados</label>
                <div className="space-y-1 max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-xl p-2">
                  {empleados.map((emp: any) => (
                    <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vendedorIds.includes(emp.id)}
                        onChange={e => setVendedorIds(prev =>
                          e.target.checked ? [...prev, emp.id] : prev.filter(x => x !== emp.id)
                        )}
                        className="accent-emerald-500"
                      />
                      <span className="text-white text-sm">{emp.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {empleados.length === 0 && (
              <p className="text-zinc-500 text-xs">No hay vendedores activos para asignar.</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setModalEditar(null); setNombre(''); setVendedorIds([]) }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={guardarEdicion} disabled={loading || !nombre.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
