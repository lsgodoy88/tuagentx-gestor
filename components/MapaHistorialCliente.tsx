'use client'
import dynamic from 'next/dynamic'

const Inner = dynamic(() => import('./MapaHistorialClienteInner'), { ssr: false })

interface Props {
  visitas: any[]
  selected?: { lat: number; lng: number } | null
}

export default function MapaHistorialCliente({ visitas, selected }: Props) {
  const conGps = visitas.filter(v => v.lat && v.lng)
  if (conGps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full rounded-xl" style={{background:'#1e243a',border:'1px solid #1e3a5f'}}>
        <p className="text-zinc-500 text-sm">Sin GPS registrado</p>
      </div>
    )
  }
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid #1e3a5f' }}>
      <Inner visitas={visitas} selected={selected} />
    </div>
  )
}
