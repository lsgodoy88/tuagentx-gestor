'use client'
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  clientes: any[]
  clientesEjecutados: string[]
  ubicacionInicio: { lat: number, lng: number } | null
  onClienteClick: (cliente: any) => void
}

function parseMapsCoords(url: string): { lat: number, lng: number } | null {
  if (!url) return null
  // q=LAT,LNG
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*)[,+](-?\d+\.?\d*)/)
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) }
  // @LAT,LNG,ZOOM (Google Maps place URLs)
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/)
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }
  return null
}

function resolverCoords(c: any): { lat: number; lng: number; tipo: 'gps' | 'tmp' | 'maps' } | null {
  if (c.lat && c.lng) return { lat: c.lat, lng: c.lng, tipo: 'gps' }
  if (c.latTmp && c.lngTmp) return { lat: c.latTmp, lng: c.lngTmp, tipo: 'tmp' }
  if (c.maps) {
    const coords = parseMapsCoords(c.maps)
    if (coords) return { ...coords, tipo: 'maps' }
  }
  return null
}

export default function MapaRutaVivo({ clientes, clientesEjecutados, ubicacionInicio, onClienteClick }: Props) {
  const [verLeyenda, setVerLeyenda] = useState(false)
  const [osrmPolyline, setOsrmPolyline] = useState<[number, number][] | null>(null)
  const [duracionMin, setDuracionMin] = useState<number | null>(null)
  const clientesConCoords = clientes.map(c => ({ c, coords: resolverCoords(c) })).filter(x => x.coords)

  const centro = ubicacionInicio
    ? [ubicacionInicio.lat, ubicacionInicio.lng] as [number, number]
    : clientesConCoords.length > 0
      ? [clientesConCoords[0].coords!.lat, clientesConCoords[0].coords!.lng] as [number, number]
      : [4.5709, -74.2973] as [number, number]

  const puntos: [number, number][] = []
  if (ubicacionInicio) puntos.push([ubicacionInicio.lat, ubicacionInicio.lng])
  clientesConCoords.forEach(({ coords }) => puntos.push([coords!.lat, coords!.lng]))

  useEffect(() => {
    if (puntos.length < 2) return
    const coordStr = puntos.map(([lat, lng]) => `${lng},${lat}`).join(';')
    fetch(`/api/osrm-route?coords=${encodeURIComponent(coordStr)}`)
      .then(r => r.json())
      .then(data => {
        if (data.routes?.[0]) {
          const geo = data.routes[0].geometry.coordinates as [number, number][]
          setOsrmPolyline(geo.map(([lng, lat]) => [lat, lng]))
          setDuracionMin(Math.round(data.routes[0].duration / 60))
        }
      })
      .catch(() => { /* fallback a línea recta */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(puntos)])

  const iconoCasa = L.divIcon({
    html: '<div style="background:#059669;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,0.5)">🏠</div>',
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })

  function iconoCliente(num: number, ejecutado: boolean, tipo: 'gps'|'tmp'|'maps' = 'gps', color?: string) {
    const bg = color || (ejecutado ? '#059669' : '#2563eb')
    const label = ejecutado ? '✓' : String(num)
    const borde = tipo === 'gps' ? '3px solid white' : '3px dashed rgba(255,255,255,0.65)'
    return L.divIcon({
      html: `<div style="background:${bg};width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:${borde};font-size:14px;font-weight:bold;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer">${label}</div>`,
      className: '',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    })
  }

  function iconoClienteMaps(num: number) {
    return L.divIcon({
      html: `<div style="background:#3f3f46;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #71717a;font-size:12px;font-weight:bold;color:#a1a1aa;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer">${num}</div>`,
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    })
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {duracionMin !== null && (
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: '20px', padding: '5px 12px', color: '#10b981', fontSize: '13px', fontWeight: '700', pointerEvents: 'none' }}>
          {duracionMin} min
        </div>
      )}
      <button
        onClick={() => setVerLeyenda(v => !v)}
        style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '14px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        ?
      </button>
      {verLeyenda && (
        <div style={{ position: 'absolute', top: '46px', right: '10px', zIndex: 1000, background: '#0f0f1a', border: '1px solid #27272a', borderRadius: '14px', padding: '14px', minWidth: '200px', maxWidth: '240px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: 'white', fontWeight: '800', fontSize: '13px' }}>🗺️ Guía del mapa</span>
            <button onClick={() => setVerLeyenda(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Estado</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#2563eb', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'white', fontWeight: '800' }}>1</div>
            <span style={{ fontSize: '12px', color: '#d1d5db' }}>Pendiente</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#059669', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'white', fontWeight: '800' }}>✓</div>
            <span style={{ fontSize: '12px', color: '#d1d5db' }}>Ejecutado</span>
          </div>
          <div style={{ height: '1px', background: '#1f1f1f', margin: '6px 0' }}></div>
          <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Precisión</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#2563eb', border: '2px solid white', flexShrink: 0 }}></div>
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>GPS capturado en campo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#2563eb', border: '2px dashed rgba(255,255,255,0.5)', flexShrink: 0 }}></div>
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>Ubicación aproximada</span>
          </div>
        </div>
      )}
      <MapContainer center={centro} zoom={14} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />

      {puntos.length > 1 && (
        osrmPolyline ? (
          <Polyline positions={osrmPolyline} color="#00C6FF" weight={6} opacity={0.9} />
        ) : (
          <Polyline positions={puntos} color="#00C6FF" weight={5} opacity={0.7} dashArray="8,5" />
        )
      )}

      {ubicacionInicio && (
        <Marker position={[ubicacionInicio.lat, ubicacionInicio.lng]} icon={iconoCasa}>
          <Popup>Tu ubicación actual</Popup>
        </Marker>
      )}

      {clientes.map((c, i) => {
        const esEjecutado = clientesEjecutados.includes(c.id)
        const coords = resolverCoords(c)
        if (!coords) return null

        if (coords.tipo === 'gps') {
          return (
            <Marker
              key={c.id}
              position={[coords.lat, coords.lng]}
              icon={iconoCliente(i + 1, esEjecutado, coords.tipo, c.empresaVinculada?.color)}
            >
              <Popup>
                <div>
                  <p style={{ fontWeight: 'bold', margin: 0 }}>{c.nombre}</p>
                  {c.nombreComercial && <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>{c.nombreComercial}</p>}
                  {c.direccion && <p style={{ margin: 0, fontSize: '12px' }}>{c.direccion}</p>}
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: esEjecutado ? '#059669' : '#2563eb' }}>
                    {esEjecutado ? '✅ Ejecutado' : '⏳ Pendiente — Toca para registrar'}
                  </p>
                  {!esEjecutado && (
                    <button
                      onClick={() => onClienteClick(c)}
                      style={{ marginTop: '6px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', width: '100%' }}>
                      + Registrar visita
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        }

        if (coords.tipo === 'tmp') {
          return (
            <Marker
              key={c.id}
              position={[coords.lat, coords.lng]}
              icon={iconoCliente(i + 1, esEjecutado, coords.tipo, c.empresaVinculada?.color)}
            >
              <Popup>
                <div>
                  <p style={{ fontWeight: 'bold', margin: 0 }}>{c.nombre}</p>
                  {c.nombreComercial && <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>{c.nombreComercial}</p>}
                  {c.direccion && <p style={{ margin: 0, fontSize: '12px' }}>{c.direccion}</p>}
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#71717a' }}>📍 Ubicación estimada</p>
                  {!esEjecutado && (
                    <button
                      onClick={() => onClienteClick(c)}
                      style={{ marginTop: '6px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', width: '100%' }}>
                      + Registrar visita
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        }

        // tipo === 'maps' (fallback URL de Google Maps)
        return (
          <Marker
            key={c.id}
            position={[coords.lat, coords.lng]}
            icon={iconoCliente(i + 1, esEjecutado, coords.tipo, c.empresaVinculada?.color)}
            eventHandlers={{ click: () => window.open(c.maps, '_blank', 'noopener,noreferrer') }}
          >
            <Popup>
              <div>
                <p style={{ fontWeight: 'bold', margin: 0 }}>{c.nombre}</p>
                {c.nombreComercial && <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>{c.nombreComercial}</p>}
                {c.direccion && <p style={{ margin: 0, fontSize: '12px' }}>{c.direccion}</p>}
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#71717a' }}>📌 Ubicación aproximada</p>
                <a href={c.maps} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: '6px', background: '#2563eb', color: 'white', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                  🗺️ Abrir en Maps
                </a>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
    </div>
  )
}
