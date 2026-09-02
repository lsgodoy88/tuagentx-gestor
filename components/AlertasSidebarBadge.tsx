'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

type Alerta = { id: string; tipo: string; icono: string; mensaje: string; url: string; severidad: string; vistaPor: string | null }

const SEV_COLOR: Record<string, string> = {
  critica: '#ef4444', advertencia: '#f97316', info: '#3b82f6'
}

export default function AlertasSidebarBadge() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loadingPago, setLoadingPago] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/alertas').then(r => r.json()).then(d => setAlertas(d.alertas ?? [])).catch(() => {})
    const iv = setInterval(() => {
      fetch('/api/alertas').then(r => r.json()).then(d => setAlertas(d.alertas ?? [])).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  async function handlePagar(alertaId: string) {
    setLoadingPago(true)
    try {
      await fetch('/api/alertas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: alertaId }) }).catch(() => {})
      const gen = await fetch('/api/plan-empresa/generar', { method: 'POST' })
      const gd = await gen.json()
      const monto = gd.deudaTotal > 0 ? gd.deudaTotal : gd.monto
      if (!monto) return
      const res = await fetch('/api/pagos/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto }) })
      const d = await res.json()
      if (d.linkPago) window.open(d.linkPago, '_blank', 'noopener,noreferrer')
    } catch {} finally { setLoadingPago(false); setAbierto(false) }
  }

  if (alertas.length === 0) return null

  const maxSev = alertas.some(a => a.severidad === 'critica') ? 'critica'
    : alertas.some(a => a.severidad === 'advertencia') ? 'advertencia' : 'info'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Botón campana */}
      <button onClick={() => setAbierto(v => !v)}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(249,115,22,0.15)',
          border: `1.5px solid ${SEV_COLOR[maxSev]}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', flexShrink: 0,
        }}>
        <span style={{ fontSize: 14 }}>🔔</span>
        <span style={{
          position: 'absolute', top: -4, right: -4,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white', color: '#000',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(0,0,0,0.1)',
        }}>{alertas.length}</span>
      </button>

      {/* Popup flotante en contenido — top-right desvinculado del sidebar */}
      {abierto && typeof document !== 'undefined' && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setAbierto(false)} />
          <div style={{
            position: 'fixed',
            top: 16,
            right: 16,
            width: 280, zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 6,
            background: 'rgba(13,16,35,0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 14, padding: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 2 }}>
              Alertas
            </div>
            {alertas.map((a, i) => (
              <button key={i}
                onClick={() => {
                  if (a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora') { handlePagar(a.id) }
                  else { setAbierto(false); fetch('/api/alertas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) }).catch(() => {}); router.push(a.url) }
                }}
                disabled={loadingPago && (a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 10,
                  background: `rgba(${a.severidad === 'critica' ? '239,68,68' : a.severidad === 'advertencia' ? '249,115,22' : '59,130,246'},0.12)`,
                  border: `1px solid ${SEV_COLOR[a.severidad]}40`,
                  cursor: 'pointer', textAlign: 'left',
                  opacity: loadingPago && (a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora') ? 0.5 : 1,
                  width: '100%',
                }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{a.icono}</span>
                <span style={{ color: 'white', fontSize: 12, lineHeight: 1.4, flex: 1 }}>{a.mensaje}</span>
                {(a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora') && (
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: a.tipo === 'billing_mora' ? '#7f1d1d' : '#92400e', padding: '3px 8px', borderRadius: 6 }}>
                    {loadingPago ? '...' : 'Paga hoy'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
