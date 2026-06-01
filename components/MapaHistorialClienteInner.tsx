'use client'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'

function distancia(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function colorDist(dist: number | null) {
  if (dist === null) return '#6b7280'
  if (dist <= 200) return '#16a34a'
  if (dist <= 500) return '#d97706'
  return '#dc2626'
}

function distLabel(dist: number | null) {
  if (dist === null) return 'sin referencia'
  if (dist < 1000) return Math.round(dist) + 'm'
  return (dist / 1000).toFixed(1) + 'km'
}

function FlyTo({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => { map.flyTo(center, 17, { duration: 1 }) }, [center])
  return null
}

interface Props {
  visitas: any[]
  selected?: { lat: number; lng: number } | null
}

export default function MapaHistorialClienteInner({ visitas, selected }: Props) {
  const conGps = visitas.filter(v => v.lat && v.lng)
  const cliLat = conGps[0]?.cliente?.lat
  const cliLng = conGps[0]?.cliente?.lng

  const centerLat = cliLat || (conGps.length ? conGps.reduce((s, v) => s + v.lat, 0) / conGps.length : 4.4389)
  const centerLng = cliLng || (conGps.length ? conGps.reduce((s, v) => s + v.lng, 0) / conGps.length : -75.2322)

  return (
    <MapContainer
      center={[centerLat, centerLng]}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />

      {selected && <FlyTo center={[selected.lat, selected.lng]} />}

      {/* Marcador ubicación registrada del cliente */}
      {cliLat && cliLng && (
        <CircleMarker
          center={[cliLat, cliLng]}
          radius={10}
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.3, weight: 2 }}
        >
          <Popup>Ubicación registrada del cliente</Popup>
        </CircleMarker>
      )}

      {/* Marcadores por visita */}
      {conGps.map(v => {
        const dist = (cliLat && cliLng) ? distancia(v.lat, v.lng, cliLat, cliLng) : null
        const color = colorDist(dist)
        const fecha = new Date(v.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
        const hora  = new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
        const isSelected = selected && Math.abs(selected.lat - v.lat) < 0.0001 && Math.abs(selected.lng - v.lng) < 0.0001
        return (
          <CircleMarker
            key={v.id}
            center={[v.lat, v.lng]}
            radius={isSelected ? 10 : 7}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: isSelected ? 3 : 1.5 }}
          >
            <Popup>
              <b style={{ textTransform: 'capitalize' }}>{v.tipo}</b><br />
              {fecha} · {hora}<br />
              <span style={{ color }}>{distLabel(dist)} del cliente</span>
              {v.monto ? <><br />${Number(v.monto).toLocaleString('es-CO')}</> : null}
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
