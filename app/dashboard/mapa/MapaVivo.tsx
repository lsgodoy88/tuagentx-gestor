'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  visitas: any[]
  colorEmpleado: (id: string) => string
  onVisitaClick: (v: any) => void
}

export default function MapaVivo({ visitas, colorEmpleado, onVisitaClick }: Props) {
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
    <MapContainer center={centro} zoom={14} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
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
        const label = esInicio ? 'I' : esFin ? 'F' : String(idxEmp + 1)
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
                {new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
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
  )
}
