'use client'
import { useEffect, useState } from 'react'
import { distanciaMetros } from '@/lib/gps'

export default function HistorialPage() {
  const [visitas, setVisitas] = useState<any[]>([])
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadData() }, [fecha])

  async function loadData() {
    setLoading(true)
    const res = await fetch('/api/visitas/todas')
    const data = await res.json()
    setVisitas(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  const visitasFecha = visitas.filter(v => {
    const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(v.createdAt).toLocaleDateString('en-CA')
    return fv === fecha && (v.tipo === 'entrada' || v.tipo === 'salida')
  })

  // Agrupar por cliente
  const clientesMap: any = {}
  for (const v of visitasFecha) {
    const id = v.clienteId
    if (!clientesMap[id]) {
      clientesMap[id] = { cliente: v.cliente, entrada: null, salida: null }
    }
    if (v.tipo === 'entrada') clientesMap[id].entrada = v
    if (v.tipo === 'salida') clientesMap[id].salida = v
  }
  const clientesAgrupados = Object.values(clientesMap)

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Historial</h1>
        <p className="text-zinc-400 text-sm mt-1">Registro de visitas por día</p>
      </div>

      <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />

      {loading ? (
        <div className="text-zinc-400 text-center py-8">Cargando...</div>
      ) : clientesAgrupados.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-white font-semibold">Sin registros</p>
          <p className="text-zinc-400 text-sm mt-1">No hay visitas registradas para este día</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-zinc-400 text-xs font-semibold">{clientesAgrupados.length} PUNTOS VISITADOS</p>
          {clientesAgrupados.map((item: any) => {
            const tiempoMin = item.entrada && item.salida
              ? Math.round((new Date(item.salida.createdAt).getTime() - new Date(item.entrada.createdAt).getTime()) / 60000)
              : null
            return (
              <div key={item.cliente.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{item.cliente.nombre}</p>
                    {item.cliente.nombreComercial && <p className="text-zinc-400 text-sm">{item.cliente.nombreComercial}</p>}
                    {item.cliente.direccion && <p className="text-zinc-500 text-xs mt-1">📍 {item.cliente.direccion}</p>}
                  </div>
                  {item.cliente.lat && (
                    <a href={"https://www.google.com/maps?q=" + item.cliente.lat + "," + item.cliente.lng}
                      target="_blank"
                      className="bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs px-3 py-1.5 rounded-lg flex-shrink-0">
                      🗺️ Mapa
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className={"rounded-xl p-3 " + (item.entrada ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-zinc-800 border border-zinc-700")}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-zinc-400 text-xs">Entrada</p>
                      {item.entrada?.lat && (
                        <a href={"https://www.google.com/maps?q=" + item.entrada.lat + "," + item.entrada.lng}
                          target="_blank" className="text-emerald-400 text-xs">📍</a>
                      )}
                    </div>
                    {item.entrada ? (
                      <p className="text-emerald-400 font-semibold text-sm">
                        {new Date(item.entrada.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}
                      </p>
                    ) : (
                      <p className="text-zinc-600 text-sm">—</p>
                    )}
                  </div>
                  <div className={"rounded-xl p-3 " + (item.salida ? "bg-orange-500/10 border border-orange-500/20" : "bg-zinc-800 border border-zinc-700")}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-zinc-400 text-xs">Salida</p>
                      {item.salida?.lat && (
                        <a href={"https://www.google.com/maps?q=" + item.salida.lat + "," + item.salida.lng}
                          target="_blank" className="text-orange-400 text-xs">📍</a>
                      )}
                    </div>
                    {item.salida ? (
                      <p className="text-orange-400 font-semibold text-sm">
                        {new Date(item.salida.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}
                      </p>
                    ) : (
                      <p className="text-zinc-600 text-sm">—</p>
                    )}
                  </div>
                </div>

                {item.cliente.lat && item.entrada?.lat && (() => {
                  const dist = Math.round(distanciaMetros(item.entrada.lat, item.entrada.lng, item.cliente.lat, item.cliente.lng))
                  if (dist <= 20) return <p className="text-emerald-400 text-xs mt-1">✅ En punto ({dist}m)</p>
                  return <p className="text-orange-400 text-xs mt-1">⚠️ Lejos del punto ({dist}m — max 20m)</p>
                })()}
                {tiempoMin !== null && (
                  <p className="text-zinc-500 text-xs text-center">⏱ {tiempoMin} minutos en punto</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
