'use client'
import React, { useState, useEffect, useCallback } from 'react'

type Proveedor = {
  id: string
  api_id: string | null
  firstName: string
  lastName: string | null
  document: string | null
  documentType: string | null
  email: string | null
  phone: string | null
  address: string | null
  neighborhood: string | null
  note: string | null
}

const CAMPOS = [
  { key: 'firstName', label: 'Nombre', required: true },
  { key: 'lastName', label: 'Apellido', required: false },
  { key: 'document', label: 'NIT / Doc', required: false },
  { key: 'documentType', label: 'Tipo Doc', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Teléfono', required: false },
  { key: 'address', label: 'Dirección', required: false },
  { key: 'neighborhood', label: 'Barrio', required: false },
  { key: 'note', label: 'Nota', required: false },
]

const thStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d', background: '#0a1020' }
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'white', borderBottom: '1px solid #1e2a3d', whiteSpace: 'nowrap' }

function ModalProveedor({ proveedor, onClose, onGuardado }: { proveedor?: Proveedor | null; onClose: () => void; onGuardado: (p: Proveedor) => void }) {
  const esUpTres = !!proveedor?.api_id
  const [form, setForm] = useState<Record<string, string>>({
    firstName: proveedor?.firstName || '',
    lastName: proveedor?.lastName || '',
    document: proveedor?.document || '',
    documentType: proveedor?.documentType || '',
    email: proveedor?.email || '',
    phone: proveedor?.phone || '',
    address: proveedor?.address || '',
    neighborhood: proveedor?.neighborhood || '',
    note: proveedor?.note || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (!form.firstName.trim()) { setError('Nombre requerido'); return }
    setLoading(true); setError('')
    try {
      const res = proveedor?.id
        ? await fetch('/api/proveedores', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: proveedor.id, ...form }) })
        : await fetch('/api/proveedores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await res.json()
      if (!d.ok) { setError(d.error || 'Error al guardar'); return }
      onGuardado(d.proveedor)
      onClose()
    } catch { setError('Error de red') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-2xl p-5 space-y-3 w-full max-w-sm" style={{ background: '#0f1623', border: '1px solid rgba(255,255,255,0.12)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-white text-sm font-bold">{proveedor ? 'Proveedor' : 'Nuevo proveedor'}</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        {esUpTres && (
          <div style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '6px 10px' }}>
            <p className="text-blue-400 text-xs">Sincronizado desde UpTres — solo lectura</p>
          </div>
        )}
        {CAMPOS.map(c => (
          <div key={c.key}>
            <label className="text-zinc-400 text-xs">{c.label}{c.required && ' *'}</label>
            <input
              value={form[c.key]}
              onChange={e => { if (!esUpTres) setForm(p => ({ ...p, [c.key]: e.target.value })) }}
              placeholder={c.label}
              disabled={esUpTres}
              style={{ background: esUpTres ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: esUpTres ? '#64748b' : 'white', width: '100%', fontSize: 13, padding: '6px 10px', marginTop: 2, cursor: esUpTres ? 'not-allowed' : 'text' }}
            />
          </div>
        ))}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-2 pt-2">
          {!esUpTres && (
            <button onClick={guardar} disabled={loading}
              className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          )}
          <button onClick={onClose} className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold px-4 py-2 rounded-xl flex-1">
            {esUpTres ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TabProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; proveedor?: Proveedor | null }>({ open: false })

  const cargar = useCallback(async (busqueda = '') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/proveedores${busqueda ? `?q=${encodeURIComponent(busqueda)}` : ''}`)
      const d = await res.json()
      setProveedores(d.proveedores || [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const t = setTimeout(() => cargar(q), 300)
    return () => clearTimeout(t)
  }, [q, cargar])

  function onGuardado(p: Proveedor) {
    setProveedores(prev => {
      const idx = prev.findIndex(x => x.id === p.id)
      return idx >= 0 ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev]
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar proveedor..."
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: 'white', flex: 1, fontSize: 13, padding: '7px 12px' }}
        />
        <button onClick={() => setModal({ open: true, proveedor: null })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-semibold transition-colors"
          style={{ background: '#2563eb', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Nuevo
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
            <thead>
              <tr>
                {['NOMBRE', 'NIT / DOC', 'FUENTE'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#64748b', padding: 24 }}>Cargando...</td></tr>
              )}
              {!loading && proveedores.length === 0 && (
                <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#64748b', padding: 24 }}>Sin proveedores{q ? ` para "${q}"` : ''}</td></tr>
              )}
              {proveedores.map(p => (
                <tr key={p.id}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => setModal({ open: true, proveedor: p })}>
                  <td style={tdStyle}>{p.firstName}{p.lastName ? ` ${p.lastName}` : ''}</td>
                  <td style={{ ...tdStyle, color: '#94a3b8' }}>{p.document || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {p.api_id
                      ? <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>UpTres</span>
                      : <span style={{ background: 'rgba(161,161,170,0.15)', color: '#a1a1aa', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Manual</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #1e2a3d', background: '#0a1020' }}>
                <td colSpan={3} style={{ ...tdStyle, color: '#64748b', fontSize: 12, padding: '6px 10px' }}>
                  {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''} — doble clic para ver detalle
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {modal.open && (
        <ModalProveedor
          proveedor={modal.proveedor}
          onClose={() => setModal({ open: false })}
          onGuardado={onGuardado}
        />
      )}
    </div>
  )
}
