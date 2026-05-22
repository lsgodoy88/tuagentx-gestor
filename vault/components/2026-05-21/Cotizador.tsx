'use client'
import { useState } from 'react'

const ROLES_CONFIG = [
  { key: 'supervisor',  label: 'Supervisores',  icon: '👔', desc: 'Monitorean rutas y equipos' },
  { key: 'vendedor',    label: 'Vendedores',    icon: '🛒', desc: 'Visitas y toma de pedidos' },
  { key: 'impulsadora', label: 'Impulsadoras',  icon: '⚡', desc: 'Activaciones en punto de venta' },
  { key: 'entregas',    label: 'Entregas',      icon: '🚚', desc: 'Repartidores con GPS' },
]

const WA_NUMBER = '573505207975'

export default function CotizadorGestor({ precios, loading }: { precios: Record<string, number>; loading: boolean }) {
  const [counts, setCounts]                 = useState<Record<string, number>>({ supervisor: 1, vendedor: 1, impulsadora: 1, entregas: 1 })
  const [mostrarResumen, setMostrarResumen] = useState(false)
  const [loadingPago, setLoadingPago]       = useState(false)
  const [errorPago, setErrorPago]           = useState('')
  const [mostrarModalPDF, setMostrarModalPDF] = useState(false)
  const [pdfForm, setPdfForm]               = useState({ empresa: '', nit: '', contacto: '', telefono: '' })

  const [errorPDF, setErrorPDF]             = useState('')

  const total      = Object.entries(counts).reduce((s, [rol, n]) => s + (precios[rol] ?? 0) * n, 0)
  const totalPers  = Object.values(counts).reduce((a, b) => a + b, 0)
  const rolesActivos = ROLES_CONFIG.filter(r => counts[r.key] > 0)

  function change(key: string, delta: number) {
    setCounts(prev => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }))
  }

  function handlePagarWompi() {
    const params = new URLSearchParams({ producto: 'gestor', monto: String(total) })
    window.location.href = `https://master.tuagentx.com/checkout?${params.toString()}`
  }

  function handleWhatsApp() {
    const msg = encodeURIComponent(
      `Hola! Me interesa el Gestor TuAgentX.\n` +
      `Mi equipo: ${rolesActivos.map(r => `${counts[r.key]} ${r.label.toLowerCase()}`).join(', ')}.\n` +
      `Total estimado: $${total.toLocaleString('es-CO')}/mes`
    )
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  function handleGenerarPDF() {
    if (!pdfForm.empresa.trim() || !pdfForm.contacto.trim()) {
      setErrorPDF('Nombre de empresa y contacto son requeridos.')
      return
    }

    const rolesData: Record<string, { cantidad: number; precio: number }> = {}
    for (const r of rolesActivos) rolesData[r.key] = { cantidad: counts[r.key], precio: precios[r.key] ?? 0 }

    const params = new URLSearchParams({
      empresa:  pdfForm.empresa.trim(),
      nit:      pdfForm.nit.trim(),
      contacto: pdfForm.contacto.trim(),
      telefono: pdfForm.telefono.trim(),
      roles:    JSON.stringify(rolesData),
      total:    String(total),
    })
    window.open('/pdf-cotizacion?' + params.toString(), '_blank', 'noopener,noreferrer')
    setMostrarModalPDF(false)
    setPdfForm({ empresa: '', nit: '', contacto: '', telefono: '' })
  }

  return (
    <div id="cotizador" style={{ background: 'rgba(0,0,0,.25)', padding: '72px 24px', borderTop: '1px solid rgba(37,99,235,.1)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#93c5fd', marginBottom: 6 }}>🧮 COTIZADOR</div>
          <div style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 800 }}>¿Cuánto cuesta<br /><span style={{ color: '#93c5fd' }}>tu equipo en campo?</span></div>
          <p style={{ color: '#9ca3af', fontSize: '.9rem', lineHeight: 1.6, marginTop: 10 }}>Ajusta los roles y ve el precio exacto al instante.</p>
        </div>

        {/* Contadores por rol */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {ROLES_CONFIG.map(rol => {
            const precio   = precios[rol.key] ?? 0
            const count    = counts[rol.key] ?? 0
            const subtotal = precio * count
            return (
              <div key={rol.key} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{rol.icon}</span>
                <div style={{ flex: 1, minWidth: 80, maxWidth: 140 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{rol.label}</div>
                  <div style={{ fontSize: '.65rem', color: '#9ca3af' }}>{rol.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => change(rol.key, -1)}
                    style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(37,99,235,.15)', border: '1px solid rgba(37,99,235,.3)', color: '#93c5fd', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1 }}>−</button>
                  <span style={{ fontSize: '1rem', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{count}</span>
                  <button onClick={() => change(rol.key, 1)}
                    style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(37,99,235,.15)', border: '1px solid rgba(37,99,235,.3)', color: '#93c5fd', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1 }}>+</button>
                </div>
                <div style={{ minWidth: 55, textAlign: 'right', fontSize: '.78rem', fontWeight: 700, color: count > 0 ? '#93c5fd' : '#374151', flexShrink: 0 }}>
                  {loading ? '...' : `$${subtotal.toLocaleString('es-CO')}`}
                </div>
              </div>
            )
          })}
        </div>

        {/* Total */}
        <div style={{ background: 'rgba(37,99,235,.08)', border: '1px solid rgba(37,99,235,.25)', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '.72rem', color: '#93c5fd', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>TOTAL ESTIMADO / MES</div>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{loading ? '...' : `$${total.toLocaleString('es-CO')}`}</div>
            <div style={{ fontSize: '.7rem', color: '#9ca3af', marginTop: 2 }}>{totalPers} persona{totalPers !== 1 ? 's' : ''} en equipo</div>
          </div>
          <div style={{ fontSize: '2.5rem' }}>🗺️</div>
        </div>

        <button onClick={() => setMostrarResumen(true)} disabled={loading || total <= 0}
          style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '1rem', textAlign: 'center', border: 'none', cursor: loading || total <= 0 ? 'not-allowed' : 'pointer', boxShadow: '0 0 24px rgba(37,99,235,.3)', boxSizing: 'border-box', opacity: loading || total <= 0 ? 0.6 : 1, marginBottom: 10 }}>
          🚀 Solicitar demo →
        </button>

        <button onClick={() => { setMostrarModalPDF(true); setErrorPDF('') }} disabled={loading || total <= 0}
          style={{ display: 'block', width: '100%', padding: '12px', borderRadius: 10, background: 'transparent', color: total <= 0 ? '#374151' : '#93c5fd', fontWeight: 600, fontSize: '.9rem', textAlign: 'center', border: '1px solid rgba(37,99,235,.25)', cursor: loading || total <= 0 ? 'not-allowed' : 'pointer', boxSizing: 'border-box', opacity: loading || total <= 0 ? 0.4 : 1 }}>
          🖨️ Imprimir cotización
        </button>

        <p style={{ textAlign: 'center', fontSize: '.72rem', color: '#6b7280', marginTop: 12 }}>Respuesta en menos de 5 minutos · Sin compromiso</p>
      </div>

      {/* Modal de resumen */}
      {mostrarResumen && (
        <div onClick={() => setMostrarResumen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#111827', border: '1px solid rgba(37,99,235,.25)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 20 }}>📋 Resumen de tu equipo</div>

            {/* Roles */}
            <div style={{ background: 'rgba(37,99,235,.06)', border: '1px solid rgba(37,99,235,.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: '.72rem', color: '#93c5fd', fontWeight: 700, marginBottom: 8 }}>EQUIPO</div>
              {rolesActivos.length === 0 ? (
                <div style={{ fontSize: '.85rem', color: '#6b7280' }}>Agrega al menos una persona</div>
              ) : rolesActivos.map(r => (
                <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', marginBottom: 4 }}>
                  <span>{r.icon} {counts[r.key]} {r.label.toLowerCase()}</span>
                  <span style={{ color: '#93c5fd' }}>${((precios[r.key] ?? 0) * counts[r.key]).toLocaleString('es-CO')}/mes</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.07)', marginBottom: 20 }}>
              <span style={{ fontWeight: 700 }}>Total mensual</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#93c5fd' }}>${total.toLocaleString('es-CO')}</span>
            </div>

            {errorPago && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '.82rem', color: '#fca5a5' }}>
                {errorPago}
              </div>
            )}

            {/* Botones */}
            <button onClick={handlePagarWompi} disabled={loadingPago || rolesActivos.length === 0}
              style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '.95rem', border: 'none', cursor: loadingPago || rolesActivos.length === 0 ? 'not-allowed' : 'pointer', marginBottom: 10, opacity: loadingPago || rolesActivos.length === 0 ? 0.6 : 1 }}>
              {loadingPago ? 'Generando link...' : '💳 Pagar ahora con Wompi'}
            </button>

            <button onClick={handleWhatsApp}
              style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 10, background: 'rgba(255,255,255,.06)', color: '#fff', fontWeight: 600, fontSize: '.95rem', border: '1px solid rgba(255,255,255,.12)', cursor: 'pointer', marginBottom: 10 }}>
              💬 Contactar por WhatsApp
            </button>

            <button onClick={() => { setMostrarResumen(false); setErrorPago('') }}
              style={{ display: 'block', width: '100%', padding: '10px', borderRadius: 10, background: 'transparent', color: '#6b7280', fontSize: '.82rem', border: 'none', cursor: 'pointer' }}>
              Volver al cotizador
            </button>
          </div>
        </div>
      )}

      {/* Modal PDF */}
      {mostrarModalPDF && (
        <div onClick={() => { setMostrarModalPDF(false); setErrorPDF('') }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#111827', border: '1px solid rgba(37,99,235,.25)', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 6 }}>🖨️ Generar cotización PDF</div>
            <p style={{ fontSize: '.8rem', color: '#9ca3af', marginBottom: 20 }}>Ingresa los datos para personalizar el documento.</p>

            {/* Campos */}
            {[
              { key: 'empresa',  label: 'Nombre empresa *', placeholder: 'Ej: Distribuidora Norte S.A.S' },
              { key: 'nit',      label: 'NIT (opcional)',   placeholder: 'Ej: 900.123.456-7' },
              { key: 'contacto', label: 'Nombre contacto *',placeholder: 'Ej: Carlos Ramírez' },
              { key: 'telefono', label: 'Teléfono',          placeholder: 'Ej: 3001234567' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '.75rem', color: '#9ca3af', marginBottom: 5, fontWeight: 600 }}>{f.label}</label>
                <input
                  type="text"
                  value={pdfForm[f.key as keyof typeof pdfForm]}
                  onChange={e => setPdfForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', fontSize: '.85rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}

            {errorPDF && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '.82rem', color: '#fca5a5' }}>
                {errorPDF}
              </div>
            )}

            <button onClick={handleGenerarPDF}
              style={{ display: 'block', width: '100%', padding: '13px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '.95rem', border: 'none', cursor: 'pointer', marginBottom: 10 }}>
              🖨️ Imprimir / Guardar PDF
            </button>

            <button onClick={() => { setMostrarModalPDF(false); setErrorPDF('') }}
              style={{ display: 'block', width: '100%', padding: '10px', borderRadius: 10, background: 'transparent', color: '#6b7280', fontSize: '.82rem', border: 'none', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
