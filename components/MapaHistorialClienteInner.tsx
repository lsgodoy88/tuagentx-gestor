'use client'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'

import { useCallback } from 'react'

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
  canEditClientes?: boolean
}

export default function MapaHistorialClienteInner({ visitas, selected, canEditClientes = false }: Props) {
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [guardandoGpsReal, setGuardandoGpsReal] = useState(false)

  const establecerGpsReal = useCallback(async (v: any) => {
    const clienteId = v.clienteId || v.cliente?.id
    if (!clienteId) return
    setGuardandoGpsReal(true)
    try {
      await fetch(`/api/clientes/${clienteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: v.lat, lng: v.lng, ubicacionReal: true }),
      })
    } catch {}
    setGuardandoGpsReal(false)
    setConfirmando(null)
  }, [])

  const conGps = visitas.filter(v => v.lat && v.lng)
  const cliLat = conGps[0]?.cliente?.lat
  const cliLng = conGps[0]?.cliente?.lng

  const centerLat = cliLat || (conGps.length ? conGps.reduce((s, v) => s + v.lat, 0) / conGps.length : 4.4389)
  const centerLng = cliLng || (conGps.length ? conGps.reduce((s, v) => s + v.lng, 0) / conGps.length : -75.2322)

  const wrapRef = useRef<HTMLDivElement>(null)
  const [isFs, setIsFs] = useState(false)
  const toggleFs = () => {
    if (!document.fullscreenElement) { wrapRef.current?.requestFullscreen() }
    else { document.exitFullscreen() }
  }
  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div ref={wrapRef} style={{position:'relative',width:'100%',height:'100%'}}>
      {!isFs && (
        <button onClick={toggleFs} title="Pantalla completa" style={{
          position:'absolute',top:94,left:8,zIndex:1000,
          background:'white',border:'2px solid rgba(0,0,0,0.2)',
          borderRadius:4,width:30,height:30,cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:'0 1px 4px rgba(0,0,0,0.3)'
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="12" height="12" rx="1" stroke="#333" strokeWidth="1.5" fill="none"/>
            <rect x="3.5" y="3.5" width="7" height="7" rx="0.5" stroke="#333" strokeWidth="1.2" fill="none"/>
          </svg>
        </button>
      )}
      {isFs && (
        <button onClick={toggleFs} title="Salir pantalla completa" style={{
          position:'absolute',top:12,right:12,zIndex:1000,
          background:'rgba(0,0,0,0.55)',border:'none',
          borderRadius:'50%',width:32,height:32,cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',
          color:'white',fontSize:18,fontWeight:'bold',
          boxShadow:'0 2px 6px rgba(0,0,0,0.4)'
        }}>✕</button>
      )}
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
      >
      <TileLayer
        url="https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=cWjo22T4qDhlXcByRanE"
        attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
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
            <Popup closeButton={false} autoPan={false}>
              <b style={{ textTransform: 'capitalize' }}>{v.tipo}</b><br />
              {fecha} · {hora}<br />
              <span style={{ color }}>{distLabel(dist)} del cliente</span>
              {v.monto ? <><br />${Number(v.monto).toLocaleString('es-CO')}</> : null}
              {canEditClientes && !v.cliente?.ubicacionReal && (
                confirmando === v.id ? (
                  <div style={{marginTop:6}}>
                    <p style={{fontSize:11,color:'#f59e0b',marginBottom:4}}>¿Establecer como ubicación del cliente?</p>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={() => setConfirmando(null)}
                        style={{flex:1,padding:'4px 0',borderRadius:6,border:'1px solid #4b5563',background:'#374151',color:'white',fontSize:11,cursor:'pointer'}}>
                        Cancelar
                      </button>
                      <button onClick={() => establecerGpsReal(v)} disabled={guardandoGpsReal}
                        style={{flex:1,padding:'4px 0',borderRadius:6,border:'none',background:'#16a34a',color:'white',fontSize:11,fontWeight:'bold',cursor:'pointer'}}>
                        {guardandoGpsReal ? '...' : 'Sí'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{marginTop:6}}>
                    <button onClick={e => { e.stopPropagation(); setConfirmando(v.id) }}
                      style={{background:'none',border:'1px solid #f59e0b',borderRadius:6,color:'#f59e0b',fontSize:11,padding:'3px 8px',cursor:'pointer',width:'100%'}}>
                      📌 Establecer ubicación
                    </button>
                  </div>
                )
              )}
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
    </div>
  )
}
