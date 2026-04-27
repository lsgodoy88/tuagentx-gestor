'use client'
import { useState } from 'react'

const TIPO_ICON: Record<string, string> = {
  visita:   '👁️',
  venta:    '💰',
  cobro:    '💵',
  entrega:  '📦',
  entrada:  '🟢',
  salida:   '🔴',
}

const TIPO_COLOR: Record<string, string> = {
  visita:  'text-zinc-200',
  venta:   'text-emerald-400',
  cobro:   'text-blue-400',
  entrega: 'text-orange-400',
  entrada: 'text-emerald-400',
  salida:  'text-red-400',
}

interface Props {
  visita: any
  mostrarEmpleado?: boolean
  mostrarCliente?: boolean
  colapsado?: boolean
}

export default function TarjetaVisita({ visita: v, mostrarEmpleado = false, mostrarCliente = true, colapsado = false }: Props) {
  const [expandido, setExpandido] = useState(!colapsado)
  const [firmaUrl, setFirmaUrl] = useState<string|null>(null)
  const [cargandoFirma, setCargandoFirma] = useState(false)

  const hora = new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  const fecha = new Date(v.fechaBogota || v.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  async function verFirma() {
    if (firmaUrl) { setFirmaUrl(null); return }
    setCargandoFirma(true)
    const res = await fetch('/api/firma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firma: v.firma })
    }).then(r => r.json())
    if (res.url) setFirmaUrl(res.url)
    setCargandoFirma(false)
  }

  return (
    <div className="bg-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={() => setExpandido(e => !e)}>
        <span className="text-base">{TIPO_ICON[v.tipo] || '📋'}</span>
        <span className={`text-sm font-semibold capitalize ${TIPO_COLOR[v.tipo] || 'text-zinc-300'}`}>{v.tipo}</span>
        <span className="text-zinc-300 text-xs ml-auto">{hora} · {fecha}</span>
      </div>

      {expandido && (
        <div className="px-3 pb-3 space-y-2">
          {/* Cliente */}
          {mostrarCliente && v.cliente && (
            <p className="text-white text-sm font-medium">{v.cliente.nombre}
              {v.cliente.nombreComercial && <span className="text-zinc-200 font-normal"> · {v.cliente.nombreComercial}</span>}
            </p>
          )}
          {/* Empleado */}
          {mostrarEmpleado && v.empleado && (
            <p className="text-zinc-200 text-xs">👤 {v.empleado.nombre}</p>
          )}
          {/* Venta / Cobro */}
          {(v.tipo === 'venta' || v.tipo === 'cobro') && v.monto && (
            <p className={`text-sm font-bold ${v.tipo === 'venta' ? 'text-emerald-400' : 'text-blue-400'}`}>
              ${Number(v.monto).toLocaleString('es-CO')}
            </p>
          )}
          {/* Entrega */}
          {v.tipo === 'entrega' && (
            <div className="space-y-1">
              {v.factura && (
                <p className="text-blue-400 text-xs font-semibold">Factura: {v.factura}</p>
              )}
              {v.firma && (
                <button onClick={(e) => { e.stopPropagation(); verFirma() }}
                  className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-lg">
                  {cargandoFirma ? 'Cargando...' : firmaUrl ? 'Ocultar firma' : 'Ver firma'}
                </button>
              )}
              {firmaUrl && (
                <div className="bg-white rounded-lg p-2 mt-1">
                  <img src={firmaUrl} alt="Firma" className="w-full rounded" />
                </div>
              )}
            </div>
          )}
          {/* Nota */}
          {v.nota && (
            <p className="text-zinc-200 text-xs">{v.nota}</p>
          )}
          {/* GPS */}
          {v.lat ? (
            <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank"
              className="text-emerald-400 text-xs">GPS registrado</a>
          ) : (
            <span className="text-zinc-600 text-xs">Sin GPS</span>
          )}
        </div>
      )}
    </div>
  )
}