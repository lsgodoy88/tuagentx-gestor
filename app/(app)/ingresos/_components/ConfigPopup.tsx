'use client'

import { useState } from 'react'
import { TabConfig, Categoria } from '../_lib/tipos'

const EMOJIS = ['💵','🏦','📱','💳','🏧','📦','💰','🔄','🏪','🧾']

interface Props {
  tabs: TabConfig[]
  categorias: Categoria[]
  tabActual: string
  onClose: () => void
  onTabsChange: (tabs: TabConfig[]) => void
  onCategoriasChange: (cats: Categoria[]) => void
  onTabActualChange: (key: string) => void
}

export function ConfigPopup({
  tabs, categorias, tabActual, onClose,
  onTabsChange, onCategoriasChange, onTabActualChange,
}: Props) {
  const [newTabLabel, setNewTabLabel]   = useState('')
  const [newTabEmoji, setNewTabEmoji]   = useState('📦')
  const [editandoTab, setEditandoTab]   = useState<TabConfig | null>(null)
  const [nuevaCat, setNuevaCat]         = useState({ tipo: 'ingreso', nombre: '' })
  const [cuentas, setCuentas]           = useState<any[]>([])
  const [cuentasLoaded, setCuentasLoaded] = useState(false)
  const [nuevaCuenta, setNuevaCuenta]   = useState({ label: '', titular: '', banco: '', numeroCuenta: '' })
  const [editandoCuenta, setEditandoCuenta] = useState<any | null>(null)
  const [editForm, setEditForm]         = useState({ label: '', titular: '', banco: '', numeroCuenta: '' })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Carga cuentas lazy al montar
  useState(() => {
    fetch('/api/cuentas-bancarias').then(r => r.json()).then(d => {
      setCuentas(Array.isArray(d) ? d : [])
      setCuentasLoaded(true)
    })
  })

  async function reloadConfig() {
    const d = await fetch('/api/saldos/config').then(r => r.json())
    onTabsChange(d.tabs || [])
    onCategoriasChange(d.categorias || [])
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px 16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' }}
      >

        {/* ── Medios de pago ── */}
        <p style={{ color: 'white', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Medios de pago</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => { const idx = EMOJIS.indexOf(newTabEmoji); setNewTabEmoji(EMOJIS[(idx + 1) % EMOJIS.length]) }}
            style={{ fontSize: 20, background: '#141c2e', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >{newTabEmoji}</button>
          <input
            value={newTabLabel}
            onChange={e => setNewTabLabel(e.target.value)}
            placeholder="Ej: Nequi, Daviplata..."
            style={{ flex: 1, background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' }}
          />
          <button
            onClick={async () => {
              const label = newTabLabel.trim()
              if (!label) return
              const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
              const res = await fetch('/api/saldos/config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo: 'tab', nombre: label, key, emoji: newTabEmoji }),
              }).then(r => r.json())
              if (res.error) { alert(res.error); return }
              await reloadConfig()
              setNewTabLabel('')
            }}
            style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 15, cursor: 'pointer', fontWeight: 700 }}
          >+</button>
        </div>

        {tabs.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #1e2a3d' }}>
            <button
              onClick={async () => {
                const idx = EMOJIS.indexOf(t.emoji)
                const emoji = EMOJIS[(idx + 1) % EMOJIS.length]
                await fetch('/api/saldos/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, emoji }) })
                await reloadConfig()
              }}
              style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}
            >{t.emoji}</button>

            {editandoTab?.id === t.id ? (
              <input
                autoFocus
                defaultValue={t.nombre}
                onBlur={async e => {
                  const nombre = e.target.value.trim() || t.nombre
                  await fetch('/api/saldos/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, nombre }) })
                  await reloadConfig()
                  setEditandoTab(null)
                }}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ flex: 1, background: '#141c2e', color: 'white', border: '1px solid #3b82f6', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }}
              />
            ) : (
              <span onClick={() => setEditandoTab(t)} style={{ flex: 1, color: 'white', fontSize: 13, cursor: 'text' }}>{t.nombre}</span>
            )}

            <button
              onClick={async () => {
                if (tabs.length <= 1) { alert('Debe haber al menos 1 medio de pago'); return }
                const res = await fetch('/api/saldos/config', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) }).then(r => r.json())
                if (res.error) { alert(res.error); return }
                await reloadConfig()
                if (tabActual === t.key) {
                  const fresh = await fetch('/api/saldos/config').then(r => r.json())
                  if (fresh.tabs?.length) onTabActualChange(fresh.tabs[0].key)
                }
              }}
              style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
            >✕</button>
          </div>
        ))}

        {/* ── Categorías ── */}
        <div style={{ borderTop: '1px solid #1e2a3d', marginTop: 16, paddingTop: 16 }}>
          <p style={{ color: 'white', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Categorías</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              value={nuevaCat.tipo}
              onChange={e => setNuevaCat(p => ({ ...p, tipo: e.target.value }))}
              style={{ background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 8px', fontSize: 13, outline: 'none' }}
            >
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
            <input
              value={nuevaCat.nombre}
              onChange={e => setNuevaCat(p => ({ ...p, nombre: e.target.value.toUpperCase() }))}
              placeholder="Nombre"
              style={{ flex: 1, background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={async () => {
                if (!nuevaCat.nombre.trim()) return
                await fetch('/api/saldos/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevaCat) })
                await reloadConfig()
                setNuevaCat(p => ({ ...p, nombre: '' }))
              }}
              style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 15, cursor: 'pointer', fontWeight: 700 }}
            >+</button>
          </div>

          {(['ingreso', 'egreso'] as const).map(tipo => (
            <div key={tipo} style={{ marginBottom: 10 }}>
              <p style={{ color: tipo === 'ingreso' ? '#34d399' : '#f87171', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {tipo === 'ingreso' ? 'INGRESOS' : 'EGRESOS'}
              </p>
              {categorias.filter(c => c.tipo === tipo).map(cat => (
                <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1e2a3d' }}>
                  <span style={{ color: 'white', fontSize: 13 }}>{cat.nombre}</span>
                  <button
                    onClick={async () => {
                      await fetch('/api/saldos/config', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cat.id }) })
                      onCategoriasChange(categorias.filter(c => c.id !== cat.id))
                    }}
                    style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                  >✕</button>
                </div>
              ))}
              {!categorias.filter(c => c.tipo === tipo).length && (
                <p style={{ color: '#374151', fontSize: 12, fontStyle: 'italic' }}>Sin categorías</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Cuentas Bancarias ── */}
        <div style={{ borderTop: '1px solid #1e2a3d', marginTop: 16, paddingTop: 16 }}>
          <p style={{ color: 'white', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Cuentas Bancarias</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {(['label:Nombre personalizado (Ej: Cuenta Principal)', 'titular:Titular (Ej: HECTOR DURAN G)', 'banco:Banco (Ej: Bancolombia, Nequi...)'] as const).map(s => {
              const [campo, placeholder] = s.split(':') as [keyof typeof nuevaCuenta, string]
              return (
                <input
                  key={campo}
                  value={nuevaCuenta[campo]}
                  onChange={e => setNuevaCuenta(p => ({ ...p, [campo]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' }}
                />
              )
            })}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={nuevaCuenta.numeroCuenta}
                onChange={e => setNuevaCuenta(p => ({ ...p, numeroCuenta: e.target.value }))}
                placeholder="Número de cuenta o celular"
                style={{ flex: 1, background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={async () => {
                  if (!nuevaCuenta.label.trim() || !nuevaCuenta.banco.trim() || !nuevaCuenta.numeroCuenta.trim()) return
                  const res = await fetch('/api/cuentas-bancarias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevaCuenta) }).then(r => r.json())
                  if (!res.error) { setCuentas(p => [...p, res]); setNuevaCuenta({ label: '', titular: '', banco: '', numeroCuenta: '' }) }
                }}
                style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 15, cursor: 'pointer', fontWeight: 700 }}
              >+</button>
            </div>
          </div>

          {cuentas.map(c => (
            <div key={c.id}>
              {editandoCuenta?.id === c.id ? (
                <div style={{ padding: '10px 0', borderBottom: '1px solid #1e2a3d' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {(['label', 'titular', 'banco', 'numeroCuenta'] as const).map(campo => (
                      <input
                        key={campo}
                        value={editForm[campo]}
                        onChange={e => setEditForm(p => ({ ...p, [campo]: e.target.value }))}
                        placeholder={campo}
                        style={{ background: '#141c2e', color: 'white', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none' }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        if (!editForm.label.trim() || !editForm.banco.trim() || !editForm.numeroCuenta.trim()) return
                        const res = await fetch('/api/cuentas-bancarias', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, ...editForm }) }).then(r => r.json())
                        if (!res.error) { setCuentas(p => p.map(x => x.id === c.id ? { ...x, ...editForm } : x)); setEditandoCuenta(null) }
                      }}
                      style={{ flex: 1, background: 'rgba(16,185,129,0.2)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '8px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >Guardar</button>
                    <button
                      onClick={() => setEditandoCuenta(null)}
                      style={{ flex: 1, background: 'rgba(100,116,139,0.2)', color: '#94a3b8', border: '1px solid #1e2a3d', borderRadius: 8, padding: '8px', fontSize: 14, cursor: 'pointer' }}
                    >Cancelar</button>
                  </div>
                  {confirmDeleteId === c.id ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <button
                        onClick={async () => {
                          await fetch('/api/cuentas-bancarias', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
                          setCuentas(p => p.filter(x => x.id !== c.id))
                          setEditandoCuenta(null); setConfirmDeleteId(null)
                        }}
                        style={{ flex: 1, background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      >Sí, eliminar</button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        style={{ flex: 1, background: 'none', color: '#94a3b8', border: '1px solid #1e2a3d', borderRadius: 8, padding: '8px', fontSize: 14, cursor: 'pointer' }}
                      >No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      style={{ marginTop: 8, width: '100%', background: 'none', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left', padding: '4px 0' }}
                    >🗑 Eliminar cuenta</button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e2a3d' }}>
                  <div>
                    <p style={{ color: 'white', fontSize: 14, margin: 0, fontWeight: 500 }}>{c.label}</p>
                    <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>{c.titular ? `${c.titular} · ` : ''}{c.banco} · {c.numeroCuenta}</p>
                  </div>
                  <button
                    onClick={() => { setEditandoCuenta(c); setEditForm({ label: c.label, titular: c.titular || '', banco: c.banco, numeroCuenta: c.numeroCuenta }); setConfirmDeleteId(null) }}
                    style={{ color: '#93c5fd', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                  >✏️</button>
                </div>
              )}
            </div>
          ))}
          {!cuentas.length && cuentasLoaded && (
            <p style={{ color: '#374151', fontSize: 13, fontStyle: 'italic' }}>Sin cuentas registradas</p>
          )}
        </div>
      </div>
    </div>
  )
}
