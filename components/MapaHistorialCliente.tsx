'use client'
import { useEffect, useRef } from 'react'

interface Visita {
  id: string
  lat?: number | null
  lng?: number | null
  tipo: string
  createdAt: string
  monto?: number | null
  cliente?: { lat?: number | null; lng?: number | null; nombre?: string }
}

interface Props {
  visitas: Visita[]
  selected?: { lat: number; lng: number } | null
}

function distancia(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function colorPorDistancia(dist: number | null): string {
  if (dist === null) return '#6b7280'
  if (dist <= 200) return '#16a34a'
  if (dist <= 500) return '#d97706'
  return '#dc2626'
}

export default function MapaHistorialCliente({ visitas, selected }: Props) {
  const mapRef = useRef<any>(null)
  const containerId = 'mapa-historial-cliente'
  const markersRef = useRef<any[]>([])
  const heatRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const L = (window as any).L
    if (!L) return

    const conGps = visitas.filter(v => v.lat && v.lng)
    if (conGps.length === 0) return

    // Centro — promedio de puntos o ubicación del cliente
    const cliLat = conGps[0]?.cliente?.lat
    const cliLng = conGps[0]?.cliente?.lng
    const centerLat = cliLat || conGps.reduce((s, v) => s + v.lat!, 0) / conGps.length
    const centerLng = cliLng || conGps.reduce((s, v) => s + v.lng!, 0) / conGps.length

    if (!mapRef.current) {
      mapRef.current = L.map(containerId, { zoomControl: true }).setView([centerLat, centerLng], 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapRef.current)
    }

    // Limpiar marcadores previos
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (heatRef.current) { heatRef.current.remove(); heatRef.current = null }

    // Marcador ubicación del cliente registrada
    if (cliLat && cliLng) {
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 0 0 3px #3b82f650"></div>`,
        className: '', iconAnchor: [7, 7]
      })
      const m = L.marker([cliLat, cliLng], { icon })
        .addTo(mapRef.current)
        .bindTooltip('Ubicación registrada del cliente', { permanent: false })
      markersRef.current.push(m)
    }

    // Heatmap
    const heatPoints = conGps.map(v => [v.lat!, v.lng!, 0.8])
    if ((window as any).L?.heatLayer) {
      heatRef.current = (window as any).L.heatLayer(heatPoints, {
        radius: 25, blur: 20, maxZoom: 17,
        gradient: { 0.3: '#16a34a', 0.6: '#d97706', 1.0: '#dc2626' }
      }).addTo(mapRef.current)
    }

    // Marcadores por visita
    conGps.forEach(v => {
      const dist = (cliLat && cliLng) ? distancia(v.lat!, v.lng!, cliLat, cliLng) : null
      const color = colorPorDistancia(dist)
      const fecha = new Date(v.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
      const hora = new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
      const icon = L.divIcon({
        html: `<div style="width:10px;height:10px;background:${color};border:2px solid white;border-radius:50%"></div>`,
        className: '', iconAnchor: [5, 5]
      })
      const distLabel = dist !== null ? `${dist < 1000 ? Math.round(dist) + 'm' : (dist/1000).toFixed(1) + 'km'}` : 'sin ref'
      const m = L.marker([v.lat!, v.lng!], { icon })
        .addTo(mapRef.current)
        .bindPopup(`<b style="text-transform:capitalize">${v.tipo}</b><br>${fecha} · ${hora}<br><span style="color:${color}">${distLabel} del cliente</span>`)
      markersRef.current.push(m)
    })

    mapRef.current.setView([centerLat, centerLng], 15)
    setTimeout(() => mapRef.current?.invalidateSize(), 100)

    return () => {}
  }, [visitas])

  // Centrar en punto seleccionado
  useEffect(() => {
    if (!selected || !mapRef.current) return
    mapRef.current.setView([selected.lat, selected.lng], 17)
  }, [selected])

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 400, borderRadius: 12, overflow: 'hidden' }}>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" />
      <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js" />
      <div id={containerId} style={{ width: '100%', height: '100%', minHeight: 400 }} />
    </div>
  )
}

export { distancia }
