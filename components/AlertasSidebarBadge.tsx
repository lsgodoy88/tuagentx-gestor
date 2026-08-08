'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Alerta = { id: string; tipo: string; icono: string; mensaje: string; url: string; severidad: string; vistaPor: string | null }

const SEV_COLOR: Record<string, string> = {
  critica: '#ef4444', advertencia: '#f97316', info: '#3b82f6'
}

export default function AlertasSidebarBadge() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [abierto, setAbierto] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/alertas').then(r => r.json()).then(d => setAlertas(d.alertas ?? [])).catch(() => {})
    const iv = setInterval(() => {
      fetch('/api/alertas').then(r => r.json()).then(d => setAlertas(d.alertas ?? [])).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  if (alertas.length === 0) return null

  const maxSev = alertas.some(a => a.severidad === 'critica') ? 'critica'
    : alertas.some(a => a.severidad === 'advertencia') ? 'advertencia' : 'info'

  return (
    <div style={{ position: 'relative' }}>
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

      {abierto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setAbierto(false)} />
          <div style={{
            position: 'absolute', top: 36, right: 0,
            width: 240, zIndex: 50,
            display: 'flex', flexDirection: 'column', gap: 6,
            background: 'rgba(13,14,28,0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {alertas.map((a, i) => (
              <button key={i}
                onClick={() => { setAbierto(false); fetch('/api/alertas',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:a.id})}).catch(()=>{}); router.push(a.url) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 10,
                  background: `rgba(${a.severidad === 'critica' ? '239,68,68' : a.severidad === 'advertencia' ? '249,115,22' : '59,130,246'},0.12)`,
                  border: `1px solid ${SEV_COLOR[a.severidad]}40`,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{a.icono}</span>
                <span style={{ color: 'white', fontSize: 11, lineHeight: 1.4 }}>{a.mensaje}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
