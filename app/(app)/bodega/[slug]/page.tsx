'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { BodegaContext } from '@/lib/bodega-context'

const StockPage = dynamic(() => import('@/app/(app)/stock/page'), { ssr: false })
const TabSugerido = dynamic(() => import('@/components/TabSugerido'), { ssr: false })

const ModuloOrdenes = dynamic(() => import('@/components/ModuloOrdenes'), { ssr: false })

function Cargando() {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
}

type Tab = 'ordenes' | 'inventario' | 'sugerido'

export default function BodegaEmpresaPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { slug } = useParams() as { slug: string }
  const user = session?.user as any

  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'ordenes')
  const [empresa, setEmpresa] = useState<{ id: string; nombre: string; color?: string; origenId: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
      router.replace('/inicio'); return
    }
    fetch('/api/bodega/empresas')
      .then(r => r.json())
      .then(d => {
        if (slug === 'propia') {
          setEmpresa({ ...d.propia, origenId: 'propia' })
        } else {
          const v = d.vinculadas?.find((e: any) => e.slug === slug)
          if (v) setEmpresa({ ...v, origenId: v.id })
          else router.replace('/inicio')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug, user])

  if (loading || !empresa) return <Cargando />

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ordenes',    label: 'Órdenes'    },
    { id: 'inventario', label: 'Inventario' },
    { id: 'sugerido',   label: 'Sugerido'   },
  ]

  return (
    <BodegaContext.Provider value={{ origenId: empresa.origenId, forzado: true }}>
      <div className="space-y-4">
        {/* Header empresa */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: empresa.color || '#3b82f6' }} />
          <h1 className="text-white text-xl font-bold">{empresa.nombre}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 tab-pills rounded-xl p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'tab-active' : 'text-white hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido — context provee origenId sin exponer en URL */}
        <Suspense fallback={<Cargando />}>
          {tab === 'ordenes' && <ModuloOrdenes />}
          {tab === 'inventario' && <StockPage />}
          {tab === 'sugerido' && <TabSugerido empresaId={empresa.origenId} />}
        </Suspense>
      </div>
    </BodegaContext.Provider>
  )
}
