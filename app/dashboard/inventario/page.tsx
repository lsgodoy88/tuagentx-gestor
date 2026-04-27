'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function InventarioPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (!['empresa', 'supervisor', 'bodega'].includes(user?.role)) router.push('/dashboard')
  }, [status])

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-white">🏭 Inventario</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl">
        <div className="flex border-b border-zinc-800">
          <button className="px-5 py-3 text-sm font-semibold text-emerald-400 border-b-2 border-emerald-500">
            📦 Stock
          </button>
        </div>
        <div className="p-8 text-center text-zinc-500">
          <p className="text-4xl mb-3">🏭</p>
          <p className="font-semibold text-white">Módulo en construcción</p>
          <p className="text-sm mt-1">Próximamente: control de stock, entradas y salidas</p>
        </div>
      </div>
    </div>
  )
}
