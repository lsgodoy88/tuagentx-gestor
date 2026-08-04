'use client'
import { useState } from 'react'
import { PERMISOS_CATALOGO, PermisoModulo } from '@/lib/permisos'

interface Props {
  nombreEmpleado: string
  permisosIniciales: Record<string, boolean>
  onGuardar: (permisos: Record<string, boolean>) => void
  onCerrar: () => void
}

export default function PopupPermisos({ nombreEmpleado, permisosIniciales, onGuardar, onCerrar }: Props) {
  const [permisos, setPermisos] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    PERMISOS_CATALOGO.forEach(m => {
      [m.ver, m.editar, m.admin].forEach(p => { if (p) init[p.key] = permisosIniciales[p.key] ?? false })
    })
    return init
  })

  function toggle(key: string, requiere?: string) {
    if (requiere && !permisos[requiere]) return
    setPermisos(prev => {
      const next = { ...prev, [key]: !prev[key] }
      if (!next[key]) {
        PERMISOS_CATALOGO.forEach(m => {
          [m.editar, m.admin].forEach(p => {
            if (p?.requiere === key) next[p.key] = false
          })
        })
      }
      return next
    })
  }

  const COLORS = {
    ver:    { track: '#2563eb' },
    editar: { track: '#059669' },
    admin:  { track: '#9333ea' },
  }

  const COL = 60
  const BORDER = '1px solid rgba(255,255,255,0.10)'

  function Switch({ p, tipo }: { p?: { key: string; label: string; requiere?: string }, tipo: 'ver' | 'editar' | 'admin' }) {
    const padreOff = p?.requiere ? !permisos[p.requiere] : false
    const on = !!p && permisos[p.key] && !padreOff
    const c = COLORS[tipo]
    return (
      <div style={{ width: COL, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px 0' }}>
        {p && (
          <button
            onClick={() => toggle(p.key, p.requiere)}
            disabled={padreOff}
            title={p.label}
            style={{
              width: 48, height: 26, borderRadius: 13,
              background: on ? c.track : 'rgba(255,255,255,0.10)',
              border: 'none', cursor: padreOff ? 'not-allowed' : 'pointer',
              position: 'relative', transition: 'background .2s',
              opacity: padreOff ? 0.3 : 1, padding: 0, flexShrink: 0,
            }}>
            <span style={{
              position: 'absolute', top: 4, left: on ? 26 : 4,
              width: 18, height: 18, borderRadius: '50%',
              background: 'white', transition: 'left .2s', display: 'block',
            }} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-sm rounded-2xl flex flex-col" style={{ background: '#0d1220', border: '1px solid rgba(139,92,246,0.20)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(139,92,246,0.20)' }}>
          <div>
            <p style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Permisos</p>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>{nombreEmpleado}</p>
          </div>
          <button onClick={onCerrar} style={{ color: '#6b7280', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabla */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#9ca3af', borderBottom: BORDER }} />
                <th style={{ width: COL, textAlign: 'center', fontWeight: 700, fontSize: 12, color: '#93c5fd', borderBottom: BORDER, borderLeft: BORDER, padding: '10px 0' }}>VER</th>
                <th style={{ width: COL, textAlign: 'center', fontWeight: 700, fontSize: 12, color: '#6ee7b7', borderBottom: BORDER, borderLeft: BORDER, padding: '10px 0' }}>EDITAR</th>
                <th style={{ width: COL, textAlign: 'center', fontWeight: 700, fontSize: 12, color: '#d8b4fe', borderBottom: BORDER, borderLeft: BORDER, padding: '10px 0' }}>ADMIN</th>
              </tr>
            </thead>
            <tbody>
              {PERMISOS_CATALOGO.map((m, i) => (
                <tr key={m.modulo} style={{ borderBottom: i < PERMISOS_CATALOGO.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <td style={{ padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{m.icon}</span>
                    <span style={{ fontSize: 15, color: '#e5e7eb', fontWeight: 600 }}>{m.modulo}</span>
                  </td>
                  <td style={{ width: COL, borderLeft: BORDER, textAlign: 'center', padding: 0 }}><Switch p={m.ver}    tipo="ver"    /></td>
                  <td style={{ width: COL, borderLeft: BORDER, textAlign: 'center', padding: 0 }}><Switch p={m.editar} tipo="editar" /></td>
                  <td style={{ width: COL, borderLeft: BORDER, textAlign: 'center', padding: 0 }}><Switch p={m.admin}  tipo="admin"  /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(139,92,246,0.20)', display: 'flex', gap: 8 }}>
          <button onClick={onCerrar} style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={() => onGuardar(permisos)} style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(139,92,246,0.25)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.40)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
