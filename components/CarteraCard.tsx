'use client'
import { useState } from 'react'

interface DetalleDeuda {
  id: string
  externalId?: string
  numeroOrden?: number
  numeroFactura?: number
  valor: number
  saldo: number
  abono: number
  diasCredito?: number
  fechaVencimiento?: string
  estado: string
}

interface CarteraCardProps {
  cartera: any
  rol: string
  fmt: (n: number) => string
  onRecaudar?: () => void
}

const ESTADO_COLOR: Record<string, string> = {
  critica: '#ef4444',
  mora: '#f97316',
  vencida: '#f59e0b',
  pendiente: '#6366f1',
  abonada: '#22c55e',
  pagada: '#22c55e',
}

const ESTADO_LABEL: Record<string, string> = {
  critica: 'Crítica',
  mora: 'En mora',
  vencida: 'Vencida',
  pendiente: 'Pendiente',
  abonada: 'Abonada',
  pagada: 'Pagada',
}

function estadoPrincipal(porEstado: any): string {
  const orden = ['critica', 'mora', 'vencida', 'pendiente', 'abonada', 'pagada']
  for (const e of orden) {
    if (porEstado?.[e] > 0) return e
  }
  return 'pendiente'
}

export default function CarteraCard({ cartera: c, rol, fmt, onRecaudar }: CarteraCardProps) {
  const [open, setOpen] = useState(false)
  const esSupervisor = rol === 'empresa' || rol === 'supervisor'
  const sincronizado = c._fuente === 'sync'
  const estado = estadoPrincipal(c.porEstado)
  const color = c.empresaVinculada?.color || ESTADO_COLOR[estado] || '#6366f1'
  const deudas: DetalleDeuda[] = c.DetalleCartera || []

  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        background: '#111',
        border: `1px solid ${open ? '#52525b' : '#3f3f46'}`,
        borderRadius: 14,
        padding: '10px 12px',
        cursor: 'pointer',
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Pin color estado */}
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color, flexShrink: 0,
            boxShadow: `0 0 6px ${color}`,
          }} />
          {/* Nombre + icono sync */}
          <span style={{
            fontSize: 14, fontWeight: 700, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {c.cliente?.nombre}
          </span>
          {sincronizado && (
            <span title="Sincronizado" style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }}>⇄</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
            {fmt(Number(c.saldoPendiente))}
          </span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expandido */}
      {open && (
        <div onClick={e => e.stopPropagation()}>
          {/* NIT */}
          {c.cliente?.nit && (
            <p style={{ fontSize: 12, color: '#c4c4c4', marginTop: 6 }}>NIT: {c.cliente.nit}</p>
          )}

          {/* Vendedor (admin/supervisor) */}
          {esSupervisor && c.empleado?.nombre && (
            <p style={{ fontSize: 12, color: '#c4c4c4', marginTop: 2 }}>
              Vendedor: {c.empleado.nombre}
            </p>
          )}

          {/* Separador */}
          <div style={{ borderTop: '1px solid #27272a', margin: '8px 0' }} />

          {/* Deudas */}
          {deudas.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {deudas.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#18181b', borderRadius: 8, padding: '5px 8px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: '#c4c4c4' }}>
                      {d.numeroOrden ? `#${d.numeroOrden}` : d.numeroFactura ? `F${d.numeroFactura}` : `Deuda ${i+1}`}
                    </span>
                    {d.fechaVencimiento && (
                      <span style={{ fontSize: 11, color: '#c4c4c4', marginLeft: 6 }}>
                        Vence: {new Date(d.fechaVencimiento).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                      {fmt(d.saldo)}
                    </span>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: ESTADO_COLOR[d.estado] || '#6366f1', flexShrink: 0
                    }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#c4c4c4' }}>Sin detalle de deudas</p>
          )}

          {/* Botón recaudar */}
          {Number(c.saldoPendiente) > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onRecaudar?.() }}
              style={{
                marginTop: 10, width: '100%',
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              💳 Recaudar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
