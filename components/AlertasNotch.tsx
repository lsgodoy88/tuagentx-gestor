'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

type Alerta = {
  id: string
  tipo: string
  icono: string
  mensaje: string
  url: string
  severidad: 'info' | 'advertencia' | 'critica'
  vistaPor: string | null
}

const SEV_BG:     Record<string, string> = { critica: '#7f1d1d',    advertencia: '#431407',  info: '#1e3a5f' }
const SEV_BORDER: Record<string, string> = { critica: '#ef4444',     advertencia: '#f97316',   info: '#3b82f6' }
const SEV_ICON:   Record<string, string> = { critica: '#ef4444',                 advertencia: '#f97316',                info: '#93c5fd' }
const SEV_BADGE:  Record<string, string> = { critica: '#ef4444',                 advertencia: '#f97316',                info: '#3b82f6' }

export default function AlertasNotch() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [abierto, setAbierto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [loadingPago, setLoadingPago] = useState(false)
  const router   = useRouter()
  const pathname = usePathname()
  const ref      = useRef<HTMLDivElement>(null)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function cargar() {
    fetch('/api/alertas').then(r => r.json()).then(d => setAlertas(d.alertas ?? [])).catch(() => {})
  }

  useEffect(() => {
    cargar()
    const iv = setInterval(cargar, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  // Notch siempre visible mientras haya alertas — no auto-ocultar al cargar

  // Mostrar de nuevo solo al tocar el notch

  // Auto-cerrar panel a los 5s; al cerrar mostrar notch siempre
  useEffect(() => {
    if (abierto) {
      // Pausar hide timer mientras está abierto
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      timerRef.current = setTimeout(() => setAbierto(false), 5000)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
      // Al cerrar, mostrar notch y reiniciar hide timer
      setSaliendo(false)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [abierto])

  // Cerrar al tocar fuera
  useEffect(() => {
    if (!abierto) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [abierto])

  if (alertas.length === 0) return null
  if (pathname !== '/inicio') return null

  const maxSev = alertas.some(a => a.severidad === 'critica') ? 'critica'
    : alertas.some(a => a.severidad === 'advertencia') ? 'advertencia' : 'info'

  return (
    <div ref={ref} className={`md:hidden ${saliendo ? 'alertas-notch-salida' : 'alertas-notch'}`} style={{ position: 'fixed', bottom: 0, left: 16, zIndex: 3001, pointerEvents: 'all' }}>

      {/* Panel — un solo popup con todas las alertas */}
      <div style={{
        position: 'absolute', bottom: 48, left: 0,
        pointerEvents: abierto ? 'all' : 'none',
        transform: abierto ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.95)',
        opacity: abierto ? 1 : 0,
        transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        transformOrigin: 'bottom left',
        background: '#0d1220',
        border: '1.5px solid #f59e0b',
        borderRadius: 12,
        overflow: 'hidden',
        width: 210,
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
      }}>
        {alertas.map((a, i) => (
          <button key={i}
            onClick={() => {
              if (a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora') { handlePagar(a.id) }
              else { setAbierto(false); fetch('/api/alertas',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:a.id})}).catch(()=>{}); router.push(a.url) }
            }}
            disabled={loadingPago && (a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora')}
            style={{
              width: '100%',
              borderBottom: i < alertas.length - 1 ? '1px solid rgba(245,158,11,0.2)' : 'none',
              padding: '7px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              textAlign: 'left', cursor: 'pointer',
              background: 'none', border: 'none',
              opacity: loadingPago && (a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora') ? 0.5 : 1,
            }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{a.icono}</span>
            <span style={{ color: 'white', fontSize: 12, lineHeight: 1.2, fontWeight: 500, flex: 1 }}>{a.mensaje}</span>
            {(a.tipo === 'billing_pendiente' || a.tipo === 'billing_mora') && (
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: a.tipo === 'billing_mora' ? '#7f1d1d' : '#92400e', padding: '3px 8px', borderRadius: 8 }}>
                {loadingPago ? '...' : 'Pagar'}
              </span>
            )}

          </button>
        ))}
      </div>

      {/* Notch */}
      <button
        onClick={() => setAbierto(v => !v)}
        style={{
          width: 52, height: 42,
          background: 'rgba(30,36,58,0.99)',
          border: '1.5px solid rgba(59,130,246,0.35)',
          borderBottom: 'none',
          borderRadius: '18px 18px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative',
        }}>
        {/* Campana */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            fill={SEV_ICON[maxSev]} />
        </svg>
        {/* Badge */}
        <span style={{
          position: 'absolute', top: 6, right: 8,
          width: 16, height: 16, borderRadius: '50%',
          background: 'white', border: `2px solid ${SEV_BORDER[maxSev]}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#000',
        }}>
          {alertas.length}
        </span>
      </button>
    </div>
  )
}
