'use client'
import { useEffect, useRef, useState } from 'react'

type Rol = 'vendedor' | 'entregador' | 'admin' | 'supervisor'
type TipoVisita = 'Visita' | 'Venta' | 'Cobro' | 'Entrega'

interface Cliente {
  id: string
  nombre: string
  nombreComercial?: string
  nit?: string
  telefono?: string
  ciudad?: string
  direccion?: string
  lat?: number | null
  lng?: number | null
  maps?: string | null
  apiId?: string | null
}

interface Props {
  cliente: Cliente
  rol: Rol
  onVisita?: (tipo: TipoVisita) => void
  onEntregar?: () => void
  onHistorial?: () => void
  onEditar?: () => void
  onSelect?: () => void
  isSelected?: boolean
}

const VISITA_OPCIONES: { tipo: TipoVisita; icon: string; color: string }[] = [
  { tipo: 'Visita',   icon: '🗓️', color: '#6366f1' },
  { tipo: 'Venta',    icon: '🛒', color: '#22c55e' },
  { tipo: 'Cobro',    icon: '💰', color: '#f59e0b' },
  { tipo: 'Entrega',  icon: '📦', color: '#a855f7' },
]

export default function ClienteCardRol({ cliente: c, rol, onVisita, onEntregar, onHistorial, onEditar, onSelect, isSelected }: Props) {
  const [open, setOpen] = useState(false)
  const [ddOpen, setDdOpen] = useState(false)
  const [ddPos, setDdPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const ddRef = useRef<HTMLDivElement>(null)

  const telLimpio = (c.telefono ?? '').replace(/\D/g, '')
  const tieneNombreComercial = c.nombreComercial && c.nombreComercial !== c.nombre
  const subtituloAbierto = [
    tieneNombreComercial ? c.nombreComercial : '',
    c.nit ? `NIT ${c.nit}` : '',
  ].filter(Boolean).join(' · ')

  function abrirDropdown(e: React.MouseEvent) {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const ddW = 168
    const ddH = 4 * 44 + 8
    let top = rect.bottom + 6
    let left = rect.left

    if (left + ddW > window.innerWidth - 8) left = window.innerWidth - ddW - 8
    if (left < 8) left = 8
    if (top + ddH > window.innerHeight - 8) top = rect.top - ddH - 6

    setDdPos({ top, left })
    setDdOpen(true)
  }

  useEffect(() => {
    if (!ddOpen) return
    function handle(e: MouseEvent) {
      if (
        ddRef.current && !ddRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setDdOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ddOpen])

  /* ── Header (shared between open/closed) ── */
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {c.nombre}
          </div>
          <span title={c.apiId ? 'Sincronizado con UpTres' : 'Sin sincronizar'} style={{
            fontSize: 13, flexShrink: 0,
            color: c.apiId ? '#22c55e' : '#3f3f46',
          }}>⇄</span>
        </div>
        {open && subtituloAbierto && (
          <div style={{ fontSize: 12, color: '#c4c4c4', marginTop: 2 }}>
            {subtituloAbierto}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
    </div>
  )

  /* ── Botones según rol ── */
  const botones = (
    <>
      {(rol === 'admin' || rol === 'supervisor') ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <a href={`tel:${telLimpio}`}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 4, flex: 1, padding: '7px 0', borderRadius: 9,
              background: '#18181b', color: '#9ca3af',
              border: '1px solid #27272a', textDecoration: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            📞 Llamar
          </a>
          <a href={`https://wa.me/57${telLimpio}`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 4, flex: 1, padding: '7px 0', borderRadius: 9,
              background: '#18181b', color: '#34d399',
              border: '1px solid #27272a', textDecoration: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            💬 WA
          </a>
          <button onClick={e => { e.stopPropagation(); onEditar?.() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 4, flex: 1, padding: '7px 0', borderRadius: 9,
              background: '#18181b', color: '#fbbf24',
              border: '1px solid #78350f',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            ✏️ Editar
          </button>
          <button onClick={e => { e.stopPropagation(); onHistorial?.() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 4, flex: 1, padding: '7px 0', borderRadius: 9,
              background: '#18181b', color: '#a78bfa',
              border: '1px solid #3730a3',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            📋 Historial
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`tel:${telLimpio}`}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 4, flex: 1, height: 36, borderRadius: 9,
              background: '#18181b', color: '#c4c4c4',
              border: '1px solid #27272a', textDecoration: 'none',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
            📞 Llamar
          </a>
          <a href={`https://wa.me/57${telLimpio}`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 4, flex: 1, height: 36, borderRadius: 9,
              background: '#18181b', color: '#4ade80',
              border: '1px solid #27272a', textDecoration: 'none',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
            💬 WA
          </a>
          {rol === 'vendedor' && (
            <button ref={btnRef} onClick={abrirDropdown}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 4, flex: 1, height: 36, borderRadius: 9,
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              + Visita ▾
            </button>
          )}
          {rol === 'entregador' && (
            <button onClick={e => { e.stopPropagation(); onEntregar?.() }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 4, flex: 1, height: 36, borderRadius: 9,
                background: 'linear-gradient(135deg, #6d28d9, #7c3aed)',
                color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              📦 Entregar
            </button>
          )}
        </div>
      )}
    </>
  )

  return (
    <>
      <div
        onClick={() => {
          if (onSelect && typeof window !== 'undefined' && window.innerWidth >= 1024) {
            onSelect()
          } else {
            setOpen(o => !o)
          }
        }}
        style={{
          background: isSelected ? '#0d1f12' : '#111',
          border: `1px solid ${isSelected ? '#22c55e' : (open ? '#52525b' : '#3f3f46')}`,
          borderRadius: 14,
          padding: '10px 12px',
          cursor: 'pointer',
        }}
      >
        {header}

        {open && (
          <>
            {/* Celular + Ciudad */}
            <div style={{ display: 'flex', gap: 8, margin: '8px 0 4px' }}>
              {c.telefono && (
                <div style={{ flex: 1, background: '#18181b', borderRadius: 9, padding: '5px 8px' }}>
                  <div style={{ fontSize: 11, color: '#c4c4c4' }}>Celular</div>
                  <div style={{ fontSize: 13, color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.telefono}
                  </div>
                </div>
              )}
              {c.ciudad && (
                <div style={{ flex: 1, background: '#18181b', borderRadius: 9, padding: '5px 8px' }}>
                  <div style={{ fontSize: 11, color: '#c4c4c4' }}>Ciudad</div>
                  <div style={{ fontSize: 13, color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.ciudad}
                  </div>
                </div>
              )}
            </div>

            {/* Dirección con botón mapa */}
            {c.direccion && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <span>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#c4c4c4' }}>Dirección</div>
                  <div style={{ fontSize: 13, color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.direccion}
                  </div>
                </div>
                {(() => {
                  const hasGps = c.lat != null && c.lng != null
                  const hasMaps = !!c.maps
                  const mapsUrl = c.maps || null
                  if (hasGps) {
                    return (
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          onClick={e => { e.stopPropagation(); if (mapsUrl) window.open(mapsUrl) }}
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: 'rgba(5,150,105,0.15)',
                            border: '1px solid rgba(5,150,105,0.3)',
                            color: '#34d399', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14,
                          }}
                        >🗺️</button>
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 13, height: 13, borderRadius: '50%',
                          background: '#059669', border: '2px solid #111',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 7, fontWeight: 900, color: '#fff', lineHeight: 1,
                        }}>✓</span>
                      </div>
                    )
                  }
                  if (hasMaps) {
                    return (
                      <button
                        onClick={e => { e.stopPropagation(); window.open(mapsUrl!) }}
                        style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(37,99,235,0.15)',
                          border: '1px solid rgba(37,99,235,0.3)',
                          color: '#60a5fa', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14,
                        }}
                      >🗺️</button>
                    )
                  }
                  return (
                    <button
                      disabled
                      style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: '#18181b',
                        border: '1px solid #27272a',
                        color: '#9ca3af', cursor: 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14,
                      }}
                    >🗺️</button>
                  )
                })()}
              </div>
            )}

            {botones}
          </>
        )}
      </div>

      {/* Dropdown portal para "+ Visita" */}
      {ddOpen && (
        <div
          ref={ddRef}
          style={{
            position: 'fixed',
            top: ddPos.top,
            left: ddPos.left,
            zIndex: 9999,
            background: '#1a1a1a',
            border: '1px solid #2d2d2d',
            borderRadius: 11,
            minWidth: 168,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '4px 0',
          }}
        >
          {VISITA_OPCIONES.map(({ tipo, icon, color }) => (
            <button
              key={tipo}
              onClick={() => { setDdOpen(false); onVisita?.(tipo) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 14px',
                background: 'transparent', border: 'none',
                color: '#e4e4e7', fontSize: 14, cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#252525')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 16, filter: `drop-shadow(0 0 4px ${color})` }}>{icon}</span>
              <span style={{ color: color, fontWeight: 600 }}>{tipo}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
