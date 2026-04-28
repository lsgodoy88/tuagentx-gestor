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
  onWhatsApp?: () => void
}

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }} xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

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

export default function CarteraCard({ cartera: c, rol, fmt, onRecaudar, onWhatsApp }: CarteraCardProps) {
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

          {/* Botones recaudar + WhatsApp */}
          {Number(c.saldoPendiente) > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={e => { e.stopPropagation(); onRecaudar?.() }}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                💳 Recaudar
              </button>
              <button
                onClick={e => { e.stopPropagation(); onWhatsApp?.() }}
                title="Enviar recordatorio por WhatsApp"
                style={{
                  background: '#25D366', border: 'none', borderRadius: 10,
                  padding: '8px 12px', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <WhatsAppIcon />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
