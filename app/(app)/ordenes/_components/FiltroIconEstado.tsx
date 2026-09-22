'use client'
import { FILTRO_ESTADOS } from '../_lib/tipos'

interface Props {
  value: string
  onChange: (v: string) => void
  open: boolean
  setOpen: (v: boolean) => void
}

const BarcodeIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" style={{ width: size, height: size, fill: 'currentColor' }}>
    <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
    <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
    <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
    <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
    <rect x="22" y="4" width="1" height="16"/>
  </svg>
)

export default function FiltroIconEstado({ value, onChange, open, setOpen }: Props) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 28, height: 28, borderRadius: 6,
          border: value ? '1px solid #ef4444' : '1px solid #1e2a3d',
          background: '#111827', cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        {value === 'BARCODE' ? <BarcodeIcon /> : value || '🟢'}
      </button>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 999,
          background: '#111827', border: '1px solid #1e2a3d', borderRadius: 8,
          overflow: 'hidden', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          {FILTRO_ESTADOS.map(({ ic, lbl }) => (
            <button
              key={ic}
              onClick={() => { onChange(ic); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 12px',
                background: value === ic ? 'rgba(59,130,246,0.15)' : 'none',
                border: 'none', borderBottom: '1px solid #1a2235',
                color: ic ? 'white' : '#9ca3af', fontSize: 13,
                cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
              }}>
              {ic === 'BARCODE'
                ? <BarcodeIcon size={15} />
                : <span style={{ fontSize: 15 }}>{ic || '✕'}</span>
              } {lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
