'use client'
import React, { useState, useEffect, useCallback } from 'react'

type Proveedor = {
  id: string
  api_id: string | null
  firstName: string
  lastName: string | null
  document: string | null
  phone: string | null
  address: string | null
  aplica_retencion: boolean
  porcentaje_retencion: string | null
  banco: string | null
  numero_cuenta: string | null
  whatsapp: string | null
  // Agregados
  deuda?: number
  pagos?: number
  saldo?: number
}

const thStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d', background: '#0a1020' }
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'white', borderBottom: '1px solid #1e2a3d', whiteSpace: 'nowrap' }
const inputStyle = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8,
  color: disabled ? '#64748b' : 'white', width: '100%', fontSize: 13,
  padding: '6px 10px', cursor: disabled ? 'not-allowed' : 'text',
})
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

function fmt(n?: number) {
  if (!n || isNaN(n)) return '$0'
  return '$' + Math.abs(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function Campo({ label, value, onChange, disabled, type = 'text', placeholder }: {
  label: string; value: string; onChange?: (v: string) => void
  disabled?: boolean; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} placeholder={placeholder || label}
        onChange={e => onChange?.(e.target.value)} disabled={disabled}
        style={{ ...inputStyle(!!disabled), marginTop: 3 }} />
    </div>
  )
}

function ModalProveedor({ proveedor, onClose, onGuardado }: {
  proveedor?: Proveedor | null; onClose: () => void; onGuardado: (p: Proveedor) => void
}) {
  const esUpTres = !!proveedor?.api_id
  const [form, setForm] = useState({
    firstName: proveedor?.firstName || '',
    lastName: proveedor?.lastName || '',
    document: proveedor?.document || '',
    phone: proveedor?.phone || '',
    address: proveedor?.address || '',
    aplica_retencion: proveedor?.aplica_retencion ?? false,
    porcentaje_retencion: proveedor?.porcentaje_retencion || '',
    banco: proveedor?.banco || '',
    numero_cuenta: proveedor?.numero_cuenta || '',
    whatsapp: proveedor?.whatsapp || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  function set(k: string, v: any) { setForm(p => ({ ...p, [k]: v })) }

  async function guardar() {
    if (!esUpTres && !form.firstName.trim()) { setError('Nombre requerido'); return }
    setLoading(true); setError('')
    try {
      const body = esUpTres
        ? { id: proveedor!.id, aplica_retencion: form.aplica_retencion, porcentaje_retencion: form.porcentaje_retencion, banco: form.banco, numero_cuenta: form.numero_cuenta, whatsapp: form.whatsapp }
        : { ...form }
      const method = proveedor?.id ? 'PATCH' : 'POST'
      const payload = proveedor?.id ? { id: proveedor.id, ...body } : body
      const res = await fetch('/api/proveedores', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json()
      if (!d.ok) { setError(d.error || 'Error al guardar'); return }
      onGuardado(d.proveedor); onClose()
    } catch { setError('Error de red') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-2xl p-5 w-full max-w-sm overflow-y-auto" style={{ background: '#0f1623', border: '1px solid rgba(255,255,255,0.12)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white text-sm font-bold">{proveedor ? 'Proveedor' : 'Nuevo proveedor'}</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        {esUpTres && (
          <div style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '5px 10px', marginBottom: 8 }}>
            <p className="text-blue-400 text-xs">Datos UpTres — solo lectura</p>
          </div>
        )}
        <div className="space-y-2 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Nombre" value={form.firstName} onChange={v => set('firstName', v)} disabled={esUpTres} />
            <Campo label="Apellido" value={form.lastName} onChange={v => set('lastName', v)} disabled={esUpTres} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="NIT / Doc" value={form.document} onChange={v => set('document', v)} disabled={esUpTres} />
            <Campo label="Teléfono" value={form.phone} onChange={v => set('phone', v)} disabled={esUpTres} />
          </div>
          <Campo label="Dirección" value={form.address} onChange={v => set('address', v)} disabled={esUpTres} />
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }} />
        <p style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Datos internos</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Aplica retención</span>
              <button onClick={() => set('aplica_retencion', !form.aplica_retencion)}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.aplica_retencion ? '#2563eb' : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: form.aplica_retencion ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
              </button>
            </div>
            {form.aplica_retencion && (
              <input type="number" value={form.porcentaje_retencion} onChange={e => set('porcentaje_retencion', e.target.value)}
                placeholder="% ej: 3.5" style={{ ...inputStyle(false), width: 90, textAlign: 'center' }} />
            )}
          </div>
          <Campo label="Banco" value={form.banco} onChange={v => set('banco', v)} />
          <Campo label="Número de cuenta" value={form.numero_cuenta} onChange={v => set('numero_cuenta', v)} />
          <Campo label="WhatsApp" value={form.whatsapp} onChange={v => set('whatsapp', v)} placeholder="Ej: 3001234567" />
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={guardar} disabled={loading}
            className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={onClose} className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm px-4 py-2 rounded-xl">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function TabProveedores({ mes, anio, onChangeFecha }: { mes: number; anio: number; onChangeFecha: (m: number, a: number) => void }) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<{ open: boolean; proveedor?: Proveedor | null }>({ open: false })
  const [showCal, setShowCal] = React.useState(false)
  const calRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClick(e: MouseEvent) { if (calRef.current && !calRef.current.contains(e.target as Node)) setShowCal(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const cargar = useCallback(async (busqueda = '') => {
    try {
      const res = await fetch(`/api/proveedores?modo=pendientes${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ''}`)
      const d = await res.json()
      setProveedores(d.proveedores || [])
    } catch {}
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    if (!q) { cargar(); return }
    const t = setTimeout(() => cargar(q), 300)
    return () => clearTimeout(t)
  }, [q, cargar])

  function onGuardado(p: Proveedor) {
    setProveedores(prev => {
      const idx = prev.findIndex(x => x.id === p.id)
      return idx >= 0 ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev]
    })
  }

  const totalDeuda = proveedores.reduce((s, p) => s + (p.deuda || 0), 0)
  const totalPagos = proveedores.reduce((s, p) => s + (p.pagos || 0), 0)
  const totalSaldo = proveedores.reduce((s, p) => s + (p.saldo || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar proveedor..."
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: 'white', flex: 1, fontSize: 13, padding: '7px 12px' }} />
        <button onClick={() => setModal({ open: true, proveedor: null })}
          className="text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition-colors border border-zinc-700 hover:border-zinc-500"
          style={{ background: 'rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
          👤 Nuevo
        </button>
        <div className="relative" ref={calRef}>
          <button onClick={() => setShowCal(s => !s)}
            className="flex items-center justify-center bg-zinc-800 border border-zinc-700 text-white text-lg font-semibold px-3 py-2 rounded-xl hover:bg-zinc-700 transition-colors">
            📅
          </button>
          {showCal && (
            <div className="absolute right-0 top-10 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-xl space-y-3" style={{minWidth: 220}}>
              <div className="flex items-center justify-between gap-2">
                <select value={mes} onChange={e => onChangeFecha(+e.target.value, anio)}
                  className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2 py-1.5 flex-1">
                  {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((ml,i) => <option key={i} value={i+1}>{ml}</option>)}
                </select>
                <select value={anio} onChange={e => onChangeFecha(mes, +e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2 py-1.5">
                  {[2024,2025,2026,2027].map(yr => <option key={yr} value={yr}>{yr}</option>)}
                </select>
              </div>
              <button onClick={() => setShowCal(false)} className="w-full bg-blue-600 text-white text-xs font-semibold py-2 rounded-xl">Cerrar</button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
            <thead>
              <tr>{['PROVEEDOR', 'DEUDA', 'PAGOS', 'SALDO'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {proveedores.length === 0 && (
                <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#64748b', padding: 24 }}>
                  Sin proveedores pendientes
                </td></tr>
              )}
              {proveedores.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onDoubleClick={() => setModal({ open: true, proveedor: p })}>
                  <td style={tdStyle}>{p.firstName}{p.lastName ? ` ${p.lastName}` : ''}</td>
                  <td style={{ ...tdStyle, color: '#f59e0b' }}>{fmt(p.deuda)}</td>
                  <td style={{ ...tdStyle, color: '#34d399' }}>{fmt(p.pagos)}</td>
                  <td style={{ ...tdStyle, color: (p.saldo || 0) > 0 ? '#f87171' : '#34d399', fontWeight: 700 }}>{fmt(p.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #1e2a3d', background: '#0a1020' }}>
                <td style={{ ...tdStyle, color: '#64748b', fontSize: 12 }}>{proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}</td>
                <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: 700 }}>{fmt(totalDeuda)}</td>
                <td style={{ ...tdStyle, color: '#34d399', fontWeight: 700 }}>{fmt(totalPagos)}</td>
                <td style={{ ...tdStyle, color: '#f87171', fontWeight: 700 }}>{fmt(totalSaldo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {modal.open && <ModalProveedor proveedor={modal.proveedor} onClose={() => setModal({ open: false })} onGuardado={onGuardado} />}
    </div>
  )
}
