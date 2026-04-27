'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const ROL_ICON: Record<string, string> = {
  vendedor: '💼',
  entregas: '📦',
  impulsadora: '⭐',
  supervisor: '🔍',
}

const ROL_LABEL: Record<string, string> = {
  vendedor: 'Vendedor',
  entregas: 'Entregas',
  impulsadora: 'Impulsadora',
  supervisor: 'Supervisor',
}

export default function PreciosPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const [precios, setPrecios] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && user.role !== 'superadmin') { router.push('/dashboard'); return }
    if (user) cargar()
  }, [user])

  async function cargar() {
    setLoading(true)
    const res = await fetch('/api/precios').then(r => r.json())
    setPrecios(res.precios || [])
    setEmpresas(res.resumenEmpresas || [])
    setLoading(false)
  }

  async function guardarPrecio(rol: string) {
    const precio = editando[rol]
    if (!precio) return
    setGuardando(rol)
    await fetch('/api/precios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol, precio: parseInt(precio) })
    })
    setGuardando(null)
    setEditando(prev => { const n = {...prev}; delete n[rol]; return n })
    cargar()
  }


  if (loading) return <div className="p-8 text-zinc-400 text-center">Cargando...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Precios</h1>
        <p className="text-zinc-400 text-sm mt-1">Configura el valor mensual por rol</p>
      </div>

      {/* Tabla de precios */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-white font-semibold">Precio por rol / mes</p>
        </div>
        {precios.map((p: any) => (
          <div key={p.rol} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-xl">{ROL_ICON[p.rol] || '👤'}</span>
              <span className="text-white text-sm font-medium">{ROL_LABEL[p.rol] || p.rol}</span>
            </div>
            <div className="flex items-center gap-2">
              {editando[p.rol] !== undefined ? (
                <>
                  <span className="text-zinc-400 text-sm">$</span>
                  <input
                    type="number"
                    value={editando[p.rol]}
                    onChange={e => setEditando(prev => ({ ...prev, [p.rol]: e.target.value }))}
                    className="bg-zinc-800 border border-emerald-500 rounded-lg px-3 py-1.5 text-white text-sm w-28 outline-none"
                    onKeyDown={e => e.key === 'Enter' && guardarPrecio(p.rol)}
                    autoFocus
                  />
                  <button onClick={() => guardarPrecio(p.rol)} disabled={guardando === p.rol}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">
                    {guardando === p.rol ? '...' : '✓'}
                  </button>
                  <button onClick={() => setEditando(prev => { const n = {...prev}; delete n[p.rol]; return n })}
                    className="text-zinc-500 hover:text-white text-xs px-2 py-1.5 rounded-lg">✕</button>
                </>
              ) : (
                <>
                  <span className="text-white font-semibold">${p.precio.toLocaleString('es-CO')}</span>
                  <button onClick={() => setEditando(prev => ({ ...prev, [p.rol]: String(p.precio) }))}
                    className="text-zinc-500 hover:text-white text-xs bg-zinc-800 px-2 py-1.5 rounded-lg ml-2">✏️</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>



    </div>
  )
}
