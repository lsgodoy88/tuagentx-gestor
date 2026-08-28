'use client'
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  visitas: any[]
  colorEmpleado: (id: string) => string
  onVisitaClick: (v: any) => void
}

export default function MapaVivo({ visitas, colorEmpleado, onVisitaClick }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [isFs, setIsFs] = useState(false)

  const toggleFs = () => {
    if (!document.fullscreenElement) {
      wrapRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const centro = visitas.length > 0
    ? [visitas[0].lat, visitas[0].lng] as [number, number]
    : [4.5709, -74.2973] as [number, number]

  // Agrupar visitas por empleado para trazar líneas
  const porEmpleado = visitas.reduce((acc: any, v: any) => {
    if (!acc[v.empleadoId]) acc[v.empleadoId] = []
    acc[v.empleadoId].push([v.lat, v.lng])
    return acc
  }, {})

  return (
    <div ref={wrapRef} style={{position:'relative',width:'100%',height:'100%'}}>
      {/* Botón fullscreen — bajo el zoom +/- de Leaflet (top-left) */}
      {!isFs && (
        <button
          onClick={toggleFs}
          title="Pantalla completa"
          style={{
            position:'absolute',top:94,left:8,zIndex:1000,
            background:'white',border:'2px solid rgba(0,0,0,0.2)',
            borderRadius:4,width:30,height:30,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 1px 4px rgba(0,0,0,0.3)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="12" height="12" rx="1" stroke="#333" strokeWidth="1.5" fill="none"/>
            <rect x="3.5" y="3.5" width="7" height="7" rx="0.5" stroke="#333" strokeWidth="1.2" fill="none"/>
          </svg>
        </button>
      )}
      {/* X cerrar fullscreen — esquina superior derecha */}
      {isFs && (
        <button
          onClick={toggleFs}
          title="Salir pantalla completa"
          style={{
            position:'absolute',top:12,right:12,zIndex:1000,
            background:'rgba(0,0,0,0.55)',border:'none',
            borderRadius:'50%',width:32,height:32,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            color:'white',fontSize:18,fontWeight:'bold',
            boxShadow:'0 2px 6px rgba(0,0,0,0.4)'
          }}
        >
          ✕
        </button>
      )}
    <MapContainer center={centro} zoom={14} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=cWjo22T4qDhlXcByRanE"
        attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
      />

      {/* Líneas de ruta por empleado */}
      {Object.entries(porEmpleado).map(([empId, puntos]: any) => (
        puntos.length > 1 && (
          <Polyline
            key={empId}
            positions={puntos}
            color={colorEmpleado(empId)}
            weight={2}
            opacity={0.5}
            dashArray="5,5"
          />
        )
      ))}

      {/* Puntos de visita */}
      {visitas.map((v: any, i: number) => {
        const visitasEmp = visitas.filter((x: any) => x.empleadoId === v.empleadoId)
        const idxEmp = visitasEmp.findIndex((x: any) => x.id === v.id)
        const esInicio = idxEmp === 0
        const esFin = idxEmp === visitasEmp.length - 1
        const label = String(idxEmp + 1)
        return (
        <CircleMarker
          key={v.id}
          center={[v.lat, v.lng]}
          radius={12}
          fillColor={colorEmpleado(v.empleadoId)}
          color="white"
          weight={2}
          fillOpacity={0.9}
          eventHandlers={{ click: () => onVisitaClick(v) }}
        >
          <Tooltip permanent direction="center" offset={[0, 0]} opacity={1} className="leaflet-label" pane="tooltipPane">
            <span style={{color:'white',fontWeight:'bold',fontSize:'11px',background:'transparent',border:'none',boxShadow:'none'}}>{label}</span>
          </Tooltip>
          <Popup>
            <div style={{ minWidth: '150px' }}>
              <p style={{ fontWeight: 'bold', margin: '0 0 4px' }}>{v.cliente?.nombre}</p>
              <p style={{ color: '#666', margin: '0 0 2px', fontSize: '12px' }}>{v.empleado?.nombre}</p>
              <p style={{ color: '#666', margin: '0 0 4px', fontSize: '12px' }}>
                {new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
              </p>
              {v.tipo && v.tipo !== 'visita' && <p style={{ fontSize: '12px', margin: '2px 0', color: '#10b981', fontWeight: 'bold' }}>{v.tipo === 'venta' ? '💰' : v.tipo === 'cobro' ? '💵' : '📦'} {v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1)}{v.monto ? ': $' + Number(v.monto).toLocaleString('es-CO') : ''}</p>}
              {v.nota && <p style={{ fontSize: '12px', margin: 0, color: '#999' }}>{v.nota}</p>}
              <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`}
                target="_blank"
                style={{ color: '#10b981', fontSize: '12px' }}>
                Ver en Maps →
              </a>
            </div>
          </Popup>
        </CircleMarker>
        )
      })}
    </MapContainer>
    </div>
  )
}
