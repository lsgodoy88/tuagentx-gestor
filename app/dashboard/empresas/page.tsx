'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

function slugify(nombre: string) {
  return nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20)
}

function diasDesde(fecha: string | null) {
  if (!fecha) return null
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

export default function EmpresasPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const [empresas, setEmpresas] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [modalEditar, setModalEditar] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [paso, setPaso] = useState(1)
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState('')
  const [maxSupervisores, setMaxSupervisores] = useState(1)
  const [maxVendedores, setMaxVendedores] = useState(1)
  const [maxEntregas, setMaxEntregas] = useState(0)
  const [maxBodega, setMaxBodega] = useState(0)
  const [maxImpulsadoras, setMaxImpulsadoras] = useState(0)
  const [sel, setSel] = useState<any>(null)
  const [modalPass, setModalPass] = useState<any>(null)
  const [newPass, setNewPass] = useState('')
  const [passMsg, setPassMsg] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [modalEliminar, setModalEliminar] = useState<{ id: string; nombre: string } | null>(null)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (user?.role !== 'superadmin') { router.push('/dashboard'); return }
    loadData()
  }, [user])

  async function loadData() {
    const res = await fetch('/api/empresas')
    const data = await res.json()
    setEmpresas(Array.isArray(data) ? data : [])
  }

  function resetModal() {
    setModal(false); setPaso(1); setNombre(''); setPassword('')
    setResultado(null); setError('')
    setMaxSupervisores(1); setMaxVendedores(1); setMaxEntregas(0); setMaxImpulsadoras(0)
  }

  async function crear() {
    setLoading(true); setError('')
    const res = await fetch('/api/empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, password, plan: 'basico', maxSupervisores, maxVendedores, maxEntregas, maxImpulsadoras, maxBodega })
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setError(data.error); return }
    setResultado(data)
    setPaso(3)
    loadData()
  }

  async function guardarPlan() {
    if (!editando) return
    await fetch('/api/empresas/' + editando.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxSupervisores, maxVendedores, maxEntregas, maxImpulsadoras, maxBodega })
    })
    setModalEditar(false)
    loadData()
  }

  async function toggleActivo(e: any) {
    await fetch(`/api/empresas/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !e.activo })
    })
    loadData()
  }

  function eliminarEmpresa(e: any) {
    setModalEliminar({ id: e.id, nombre: e.nombre })
    setConfirmText('')
  }

  async function confirmarEliminar() {
    if (!modalEliminar || confirmText !== 'eliminar') return
    await fetch(`/api/empresas/${modalEliminar.id}`, { method: 'DELETE' })
    setModalEliminar(null)
    setConfirmText('')
    setSel(null)
    loadData()
  }

  async function resetPass() {
    if (!newPass || newPass.length < 6) { setPassMsg('Mínimo 6 caracteres'); return }
    const res = await fetch(`/api/empresas/${modalPass.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'reset_password', password: newPass })
    })
    const data = await res.json()
    setPassMsg(data.ok ? '✅ Contraseña actualizada' : 'Error al actualizar')
    if (data.ok) setNewPass('')
  }

  const rolesConfig = [
    { label: 'Supervisores', value: maxSupervisores, set: setMaxSupervisores },
    { label: 'Vendedores', value: maxVendedores, set: setMaxVendedores },
    { label: 'Entregas', value: maxEntregas, set: setMaxEntregas },
    { label: 'Bodega', value: maxBodega, set: setMaxBodega },
    { label: 'Impulsadoras', value: maxImpulsadoras, set: setMaxImpulsadoras },
  ]

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="text-zinc-400 text-sm mt-1">{empresas.length} empresas registradas</p>
        </div>
        <button onClick={() => setModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm">
          + Nueva
        </button>
      </div>

      <div className="space-y-3">
        {empresas.map((e: any) => {
          const d = diasDesde(e.createdAt)
          return (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex flex-wrap gap-4 items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
                    {e.nombre?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-semibold">{e.nombre}</div>
                    <div className="text-zinc-500 text-xs font-mono">{e.email}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-semibold uppercase">{e.plan || 'basico'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${e.activo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {e.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  {d !== null && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-zinc-800 text-zinc-400">
                      {d === 0 ? 'Hoy' : `${d}d`}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  ['Empleados', e._count?.empleados ?? 0],
                  ['Supervisores', e.maxSupervisores ?? 0],
                  ['Vendedores', e.maxVendedores ?? 0],
                  ['Impulsadoras', e.maxImpulsadoras ?? 0],
                ].map(([l, v]) => (
                  <div key={String(l)} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <div className="text-white font-bold text-lg">{v}</div>
                    <div className="text-zinc-500 text-xs mt-0.5">{l}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSel(sel?.id === e.id ? null : e)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-3 py-1.5 rounded-lg">
                  {sel?.id === e.id ? 'Cerrar detalle' : 'Ver detalle'}
                </button>
                <button onClick={() => {
                  setEditando(e)
                  setMaxSupervisores(e.maxSupervisores || 1)
                  setMaxVendedores(e.maxVendedores || 1)
                  setMaxEntregas(e.maxEntregas || 0)
                  setMaxBodega(e.maxBodega || 0)
                  setMaxImpulsadoras(e.maxImpulsadoras || 0)
                  setModalEditar(true)
                }} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-3 py-1.5 rounded-lg">
                  Editar plan
                </button>
                <button onClick={() => { setModalPass(e); setPassMsg(''); setNewPass('') }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-3 py-1.5 rounded-lg">
                  🔑 Contraseña
                </button>
              </div>

              {sel?.id === e.id && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-800/50 rounded-xl p-3">
                      <div className="text-zinc-500 text-xs mb-1">Clientes</div>
                      <div className="text-white font-semibold">{e._count?.clientes ?? 0}</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-xl p-3">
                      <div className="text-zinc-500 text-xs mb-1">Entregas máx.</div>
                      <div className="text-white font-semibold">{e.maxEntregas ?? 0}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => toggleActivo(e)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${e.activo ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}>
                      {e.activo ? '⏸ Desactivar' : '▶ Activar'}
                    </button>
                    <button onClick={() => eliminarEmpresa(e)}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30">
                      🗑 Desinstalar empresa
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {empresas.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-zinc-400">No hay empresas registradas</p>
          </div>
        )}
      </div>

      {/* Modal crear empresa */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold">Nueva empresa</h3>
                <span className="text-zinc-500 text-xs">{paso}/3</span>
              </div>
              {paso < 3 && (
                <div className="flex gap-1">
                  {[1,2].map(s => (
                    <div key={s} className={"h-1 flex-1 rounded-full " + (paso >= s ? "bg-emerald-500" : "bg-zinc-700")} />
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 space-y-4">
              {paso === 1 && (
                <div className="space-y-3">
                  <p className="text-white font-semibold">Datos de la empresa</p>
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre empresa</label>
                    <input value={nombre} onChange={e => setNombre(e.target.value)}
                      placeholder="Ej: Distribuidora XYZ"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  </div>
                  {nombre && (
                    <div className="bg-zinc-800 rounded-xl p-3">
                      <p className="text-zinc-400 text-xs mb-1">Usuario admin:</p>
                      <p className="text-emerald-400 font-mono text-sm">admin@{slugify(nombre)}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Contraseña inicial</label>
                    <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Contraseña para el admin"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  </div>
                </div>
              )}
              {paso === 2 && (
                <div className="space-y-3">
                  <p className="text-white font-semibold">Cantidad de roles</p>
                  {rolesConfig.map(r => (
                    <div key={r.label} className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3">
                      <span className="text-white text-sm font-medium">{r.label}</span>
                      <div className="flex items-center gap-3">
                        <button onClick={() => r.set(Math.max(0, r.value - 1))}
                          className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-bold flex items-center justify-center">−</button>
                        <span className="text-white font-bold w-6 text-center">{r.value}</span>
                        <button onClick={() => r.set(r.value + 1)}
                          className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-bold flex items-center justify-center">+</button>
                      </div>
                    </div>
                  ))}
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                </div>
              )}
              {paso === 3 && resultado && (
                <div className="text-center space-y-3">
                  <div className="text-4xl">✅</div>
                  <p className="text-white font-semibold">Empresa creada</p>
                  <div className="bg-zinc-800 rounded-xl p-4 text-left space-y-2">
                    <p className="text-zinc-400 text-xs">Email admin:</p>
                    <p className="text-emerald-400 font-mono text-sm">{resultado.email}</p>
                    <p className="text-zinc-400 text-xs mt-2">Contraseña:</p>
                    <p className="text-white font-mono text-sm">{resultado.password}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={resetModal}
                  className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">
                  {paso === 3 ? 'Cerrar' : 'Cancelar'}
                </button>
                {paso === 1 && (
                  <button onClick={() => setPaso(2)} disabled={!nombre || !password}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                    Siguiente →
                  </button>
                )}
                {paso === 2 && (
                  <button onClick={crear} disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm py-3 rounded-xl">
                    {loading ? 'Creando...' : 'Crear empresa'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar plan */}
      {modalEditar && editando && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Editar plan — {editando.nombre}</h3>
              <button onClick={() => setModalEditar(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-3">
              {rolesConfig.map(r => (
                <div key={r.label} className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3">
                  <span className="text-white text-sm font-medium">{r.label}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => r.set(Math.max(0, r.value - 1))}
                      className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-bold flex items-center justify-center">−</button>
                    <span className="text-white font-bold w-6 text-center">{r.value}</span>
                    <button onClick={() => r.set(r.value + 1)}
                      className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-bold flex items-center justify-center">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalEditar(false)}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={guardarPlan}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar empresa */}
      {modalEliminar && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-red-900/50 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-white font-bold">Eliminar empresa</h3>
              <p className="text-zinc-400 text-sm mt-1">
                Esta acción eliminará <span className="text-white font-semibold">{modalEliminar.nombre}</span> y todos sus datos: empleados, clientes, rutas y visitas.
              </p>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">
                Escribe <span className="text-red-400 font-mono">eliminar</span> para confirmar
              </label>
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
                placeholder="eliminar"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-red-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setModalEliminar(null); setConfirmText('') }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={confirmarEliminar} disabled={confirmText !== 'eliminar'}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm py-3 rounded-xl">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal contraseña */}
      {modalPass && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold mb-1">Reset contraseña</h3>
            <p className="text-zinc-400 text-sm mb-4">{modalPass.email}</p>
            <div className="relative mb-3">
              <input value={newPass} onChange={e => setNewPass(e.target.value)}
                placeholder="Nueva contraseña (mín. 6 caracteres)"
                type={showPass ? 'text' : 'password'}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 pr-10 text-white text-sm outline-none focus:border-emerald-500" />
              <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                {showPass
                  ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            {passMsg && <p className={`text-sm mb-3 ${passMsg.includes('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{passMsg}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setModalPass(null); setPassMsg(''); setNewPass('') }}
                className="flex-1 bg-zinc-800 text-white text-sm py-2 rounded-xl">Cerrar</button>
              <button onClick={resetPass}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-2 rounded-xl">
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
