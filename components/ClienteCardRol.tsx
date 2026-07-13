'use client'
import { useEffect, useRef, useState } from 'react'

type Rol = 'vendedor' | 'entregador' | 'admin' | 'supervisor' | 'empresa'
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
  ubicacionReal?: boolean | null
  latTmp?: number | null
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
  const [tab, setTab] = useState<'info'|'postventa'>('info')
  const [smsConfig, setSmsConfig] = useState<any>(null)
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsStats, setSmsStats] = useState<any>(null)
  const [smsForm, setSmsForm] = useState<{activo:boolean,dias:string,plantilla:string}|null>(null)
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
  const [confirmBorrarGps, setConfirmBorrarGps] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function iniciarLongPress() {
    if (!c.lat && !c.latTmp) return
    longPressTimer.current = setTimeout(() => setConfirmBorrarGps(true), 600)
  }
  function cancelarLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }
  async function borrarGps() {
    setConfirmBorrarGps(false)
    await fetch('/api/clientes/gps', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
    window.location.reload()
  }

  const tieneGpsReal = !!c.ubicacionReal && c.lat != null
  const tieneGpsTmp = !c.ubicacionReal && (c.lat != null || c.latTmp != null)

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4, minWidth:0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.nombre}
            </div>
            {(tieneGpsReal || tieneGpsTmp) && (
              <span
                onMouseDown={e => { e.stopPropagation(); iniciarLongPress() }}
                onMouseUp={cancelarLongPress}
                onMouseLeave={cancelarLongPress}
                onTouchStart={e => { e.stopPropagation(); iniciarLongPress() }}
                onTouchEnd={cancelarLongPress}
                title={tieneGpsReal ? 'GPS real confirmado — mantén para borrar' : 'GPS temporal — mantén para borrar'}
                style={{ fontSize:13, flexShrink:0, cursor:'pointer', opacity: tieneGpsReal ? 1 : 0.3, userSelect:'none' }}
              >📍</span>
            )}
          </div>
        </div>
        {open && subtituloAbierto && (
          <div style={{ fontSize: 12, color: '#ffffff', marginTop: 2 }}>
            {subtituloAbierto}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, color: '#ffffff', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
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
              background: '#18181b', color: '#ffffff',
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
              background: '#18181b', color: '#ffffff',
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
            const next = !open
            setOpen(next)
            if (next && rol === 'empresa' && !smsConfig) {
              fetch(`/api/postventa?clienteId=${c.id}`)
                .then(r => r.json())
                .then(d => {
                  setSmsConfig(d.config)
                  setSmsForm({ activo: d.config.activo, dias: d.config.dias, plantilla: d.config.plantilla })
                  setSmsStats(d.stats)
                })
            }
          }
        }}
        style={{
          background: '#09091f',
          border: `1px solid ${isSelected ? '#3b82f6' : (open ? '#52525b' : '#3f3f46')}`,
          boxShadow: isSelected ? '0 0 0 1px #3b82f6' : 'none',
          borderRadius: 14,
          padding: '10px 12px',
          cursor: 'pointer',
        }}
      >
        {header}

        {open && (
          <>
            {/* Tabs admin */}
            {rol === 'empresa' && (
              <div style={{ display:'flex', gap:6, margin:'8px 0 4px', borderBottom:'1px solid #27272a', paddingBottom:6 }}>
                {(['info','postventa'] as const).map(t => (
                  <button key={t} onClick={e => { e.stopPropagation(); setTab(t) }}
                    style={{
                      fontSize:12, fontWeight:600, padding:'4px 12px', borderRadius:8,
                      border:'none', cursor:'pointer',
                      background: tab===t ? '#1d4ed8' : '#18181b',
                      color: tab===t ? '#fff' : '#9ca3af',
                    }}>
                    {t === 'info' ? '📋 Info' : '📱 Postventa'}
                  </button>
                ))}
              </div>
            )}

            {/* Tab Postventa — solo empresa */}
            {rol === 'empresa' && tab === 'postventa' && (
              <div onClick={e => e.stopPropagation()} style={{ paddingTop:4 }}>
                {!smsForm ? (
                  <div style={{ color:'#6b7280', fontSize:13, textAlign:'center', padding:'16px 0' }}>Cargando...</div>
                ) : (
                  <>
                    {/* Toggle + Días */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <span style={{ fontSize:13, color:'#d1d5db', fontWeight:600 }}>SMS automáticos</span>
                      <button onClick={() => setSmsForm(f => f ? {...f, activo:!f.activo} : f)}
                        style={{
                          width:44, height:24, borderRadius:12, border:'none', cursor:'pointer',
                          background: smsForm.activo ? '#1d4ed8' : '#3f3f46',
                          position:'relative', transition:'background 0.2s',
                        }}>
                        <span style={{
                          position:'absolute', top:3, left: smsForm.activo ? 22 : 2,
                          width:18, height:18, borderRadius:'50%', background:'#fff',
                          transition:'left 0.2s',
                        }}/>
                      </button>
                    </div>

                    {/* Selector días */}
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11, color:'#6b7280', marginBottom:5 }}>Días activos</div>
                      <div style={{ display:'flex', gap:5 }}>
                        {[{v:1,l:'L'},{v:2,l:'M'},{v:3,l:'X'},{v:4,l:'J'},{v:5,l:'V'},{v:6,l:'S'},{v:0,l:'D'}].map(({v,l}) => {
                          const activos = smsForm.dias.split(',').map(Number)
                          const on = activos.includes(v)
                          return (
                            <button key={v} onClick={() => {
                              const cur = smsForm.dias.split(',').map(Number)
                              const next = on ? cur.filter(x => x!==v) : [...cur,v].sort()
                              setSmsForm(f => f ? {...f, dias: next.join(',')} : f)
                            }}
                              style={{
                                width:30, height:30, borderRadius:8, border:'none', cursor:'pointer',
                                fontSize:11, fontWeight:700,
                                background: on ? '#1d4ed8' : '#18181b',
                                color: on ? '#fff' : '#6b7280',
                              }}>
                              {l}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Plantilla */}
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Plantilla ({smsForm.plantilla.length}/160 caracteres)</div>
                      <textarea
                        value={smsForm.plantilla}
                        onChange={e => setSmsForm(f => f ? {...f, plantilla: e.target.value.slice(0,160)} : f)}
                        rows={3}
                        style={{
                          width:'100%', background:'#18181b', border:'1px solid #27272a',
                          borderRadius:8, color:'#d1d5db', fontSize:12, padding:'6px 8px',
                          resize:'none', boxSizing:'border-box', fontFamily:'inherit',
                        }}
                      />
                      <div style={{ fontSize:10, color:'#4b5563' }}>Variables: {'{nombre} {factura} {valor} {vencimiento}'}</div>
                    </div>

                    {/* Guardar */}
                    <button
                      disabled={smsSaving}
                      onClick={async () => {
                        setSmsSaving(true)
                        const r = await fetch('/api/postventa', {
                          method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify(smsForm),
                        })
                        const d = await r.json()
                        if (d.ok) setSmsConfig(d.config)
                        setSmsSaving(false)
                      }}
                      style={{
                        width:'100%', padding:'8px 0', borderRadius:9,
                        background: smsSaving ? '#27272a' : '#1d4ed8',
                        border:'none', color:'#fff', fontSize:13, fontWeight:600,
                        cursor: smsSaving ? 'not-allowed' : 'pointer', marginBottom:12,
                      }}>
                      {smsSaving ? 'Guardando...' : '💾 Guardar config'}
                    </button>

                    {/* Stats */}
                    {smsStats && (
                      <>
                        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                          {[
                            {l:'Enviados', v:smsStats.enviados, c:'#6b7280'},
                            {l:'Entregados', v:smsStats.entregados, c:'#22c55e'},
                            {l:'Fallidos', v:smsStats.fallidos?.length ?? 0, c:'#ef4444'},
                          ].map(({l,v,c:col}) => (
                            <div key={l} style={{ flex:1, background:'#18181b', borderRadius:9, padding:'6px 8px', textAlign:'center' }}>
                              <div style={{ fontSize:18, fontWeight:700, color:col }}>{v}</div>
                              <div style={{ fontSize:10, color:'#6b7280' }}>{l}</div>
                            </div>
                          ))}
                        </div>

                        {/* Fallidos */}
                        {smsStats.fallidos?.length > 0 && (
                          <div>
                            <div style={{ fontSize:11, color:'#ef4444', fontWeight:600, marginBottom:6 }}>⚠️ Números con problemas</div>
                            {smsStats.fallidos.map((f:any) => (
                              <div key={f.id} style={{ background:'#18181b', borderRadius:9, padding:'7px 10px', marginBottom:6, border:'1px solid #3f1a1a' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                  <div>
                                    <div style={{ fontSize:12, color:'#fca5a5' }}>#{f.orden?.numeroFactura} · {f.telefono}</div>
                                    <div style={{ fontSize:11, color:'#6b7280' }}>
                                      {f.estadoEnvio === 'error_num' ? 'Número inválido' : 'Error de envío'}
                                      {' · '}{new Date(f.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit'})}
                                    </div>
                                  </div>
                                  <a href={`/clientes`}
                                    onClick={e => e.stopPropagation()}
                                    style={{ fontSize:11, color:'#60a5fa', textDecoration:'none', fontWeight:600 }}>
                                    ✏️ Corregir
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Tab info (siempre visible si no es postventa) */}
            {(rol !== 'empresa' || tab === 'info') && (
            <>
            {/* Celular + Ciudad */}
            <div style={{ display: 'flex', gap: 8, margin: '8px 0 4px' }}>
              {c.telefono && (
                <div style={{ flex: 1, background: '#18181b', borderRadius: 9, padding: '5px 8px' }}>
                  <div style={{ fontSize: 11, color: '#ffffff' }}>Celular</div>
                  <div style={{ fontSize: 13, color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.telefono}
                  </div>
                </div>
              )}
              {c.ciudad && (
                <div style={{ flex: 1, background: '#18181b', borderRadius: 9, padding: '5px 8px' }}>
                  <div style={{ fontSize: 11, color: '#ffffff' }}>Ciudad</div>
                  <div style={{ fontSize: 13, color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.ciudad}
                  </div>
                </div>
              )}
            </div>

            {/* Dirección con botón mapa */}
            {c.direccion && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <span style={{ fontSize:16, flexShrink:0 }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#ffffff' }}>Dirección</div>
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
                        color: '#ffffff', cursor: 'not-allowed',
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
      {confirmBorrarGps && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setConfirmBorrarGps(false)}>
          <div style={{ background:'#1e2030', border:'1px solid rgba(239,68,68,0.4)', borderRadius:16, padding:24, width:280, textAlign:'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:32, marginBottom:12 }}>📍</div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:15, marginBottom:8 }}>¿Eliminar GPS?</div>
            <div style={{ color:'#9ca3af', fontSize:13, marginBottom:20 }}>Se borrará la ubicación guardada de <b style={{color:'#fff'}}>{c.nombre}</b></div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmBorrarGps(false)}
                style={{ flex:1, padding:'10px 0', borderRadius:10, background:'#27272a', border:'none', color:'#fff', fontWeight:600, cursor:'pointer', fontSize:14 }}>
                No
              </button>
              <button onClick={borrarGps}
                style={{ flex:1, padding:'10px 0', borderRadius:10, background:'#dc2626', border:'none', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:14 }}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
