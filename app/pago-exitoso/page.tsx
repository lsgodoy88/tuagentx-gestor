'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface PagoInfo {
  producto: string
  esUpgrade: boolean
  rolUpgrade?: string | null
  planNuevo?: string | null
  empresaNombre: string
  plan?: string | null
  planDias: number
  monto: number
  voucherNum?: string | null
  voucherTipo?: string | null
  wompiId?: string | null
  medioPago?: string | null
  estado?: string
  referencia?: string
  createdAt?: string
  empresaId?: string | null
}

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor', supervisor: 'Supervisor',
  entregas: 'Entregas', impulsadora: 'Impulsadora',
}

function VoucherCard({ info, voucherNum }: { info: PagoInfo; voucherNum: string }) {
  const ref = useRef<HTMLDivElement>(null)

  async function descargar() {
    const { default: html2canvas } = await import('html2canvas').catch(() => ({ default: null })) as any
    if (!html2canvas || !ref.current) {
      // Fallback: imprimir
      window.print()
      return
    }
    const canvas = await html2canvas(ref.current, { backgroundColor: '#0d1220', scale: 2 })
    const link = document.createElement('a')
    link.download = `${voucherNum}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const _dt = info.createdAt ? new Date(info.createdAt) : new Date()
  const fecha = _dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
  const hora  = _dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })

  const MEDIO_LABEL: Record<string, string> = { NEQUI: 'Nequi', BANCOLOMBIA_TRANSFER: 'Bancolombia', PSE: 'PSE', CARD: 'Tarjeta', DAVIPLATA: 'Daviplata', BANCOLOMBIA_QR: 'QR Bancolombia' }
  const medioLabel = info.medioPago ? (MEDIO_LABEL[info.medioPago] ?? info.medioPago) : null

  const TIPO_LABEL: Record<string, string> = {
    PAIDMES: 'Renovación mensual',
    NEWPLAN: 'Activación nueva',
    ADDROL: 'Ampliación de roles',
  }
  const concepto = TIPO_LABEL[info.voucherTipo ?? 'PAIDMES'] ?? 'Pago TuAgentX'

  return (
    <div className="w-full max-w-xs mx-auto space-y-3">
      {/* Tirilla */}
      <div ref={ref} style={{
        background: '#0d1220',
        border: '1px solid rgba(37,99,235,.3)',
        borderRadius: 16,
        padding: '24px 20px',
        fontFamily: 'monospace',
      }}>
        {/* Datos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Voucher', voucherNum],
            ['Empresa', info.empresaNombre],
            ['Concepto', concepto],
            ['Fecha', fecha],
            ['Hora', hora],
            ['Monto', `$${info.monto.toLocaleString('es-CO')}`],

            ...(medioLabel ? [['Medio', medioLabel]] : []),
            ...(info.wompiId ? [['ID transacción', info.wompiId]] : []),
            ['Estado', '✅ Aprobado'],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#ffffff', fontSize: 11 }}>{label}</span>
              <span style={{ color: label === 'Voucher' ? '#93c5fd' : label === 'Estado' ? '#10b981' : label === 'ID transacción' ? '#6b7280' : '#ffffff', fontSize: label === 'ID transacción' ? 11 : 13, fontWeight: label === 'Voucher' ? 700 : 400, textAlign: 'right', maxWidth: 160, wordBreak: 'break-all' as const }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Separador */}
        <div style={{ borderTop: '1px dashed rgba(255,255,255,.1)', margin: '12px 0' }} />

        {/* Footer */}
        <div style={{ textAlign: 'center', color: '#4b5563', fontSize: 10 }}>
          Gracias por confiar en TuAgentX<br />Colombia · {new Date().getFullYear()}
        </div>
      </div>

    </div>
  )
}

// Confeti CSS puro — sin dependencias
function Confeti() {
  const colores = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
  const piezas = Array.from({length: 40}, (_, i) => ({
    id: i,
    color: colores[i % colores.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1.5}s`,
    size: `${6 + Math.random() * 8}px`,
    duration: `${2 + Math.random() * 2}s`,
  }))
  return (
    <div style={{position:'fixed',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:999}}>
      <style>{`
        @keyframes confeti-caer {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {piezas.map(p => (
        <div key={p.id} style={{
          position:'absolute', top:0, left:p.left,
          width:p.size, height:p.size,
          background:p.color, borderRadius:'2px',
          animation:`confeti-caer ${p.duration} ${p.delay} ease-in forwards`,
        }} />
      ))}
    </div>
  )
}

function PagoExitosoContent() {
  const params = useSearchParams()
  const [info, setInfo] = useState<PagoInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const { data: session, status: sessionStatus } = useSession()
  const [taxbotNumero, setTaxbotNumero] = useState<string>('573168303842')

  useEffect(() => {
    fetch('/api/taxbot/numero').then(r => r.json()).then(d => { if (d.numero) setTaxbotNumero(d.numero) }).catch(() => {})
    const id = params.get('id')
    if (!id) { setLoading(false); return }
    fetch(`/api/pago-info?id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setInfo(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params])

  let subtitulo = 'Tu pago fue procesado correctamente.'
  if (!loading && info) {
    const nombre = info.empresaNombre
    if (info.esUpgrade && info.rolUpgrade) {
      let rolesStr = info.rolUpgrade
      try {
        const obj: Record<string, number> = JSON.parse(info.rolUpgrade)
        rolesStr = Object.entries(obj).map(([r, c]) => `${c} ${ROL_LABELS[r] ?? r}`).join(', ')
      } catch {}
      subtitulo = `Se agregaron ${rolesStr} al equipo de ${nombre}. Ya disponibles en tu panel.`
    } else if (info.esUpgrade && info.planNuevo) {
      subtitulo = `El plan de ${nombre} fue actualizado. Los nuevos accesos estarán disponibles en minutos.`
    } else if (!info.esUpgrade) {
      subtitulo = `Gracias ${nombre} — tu plan está activo. En los próximos minutos recibirás confirmación por WhatsApp.`
    }
  }

  // Esperar sesión antes de renderizar
  // Verificar acceso cuando sesión e info estén disponibles
  useEffect(() => {
    if (loading || sessionStatus === 'loading') return
    if (sessionStatus === 'unauthenticated') {
      window.location.href = '/login?callbackUrl=' + encodeURIComponent(window.location.href)
      return
    }
    if (!info?.empresaId || !session?.user) return
    const user = session.user as any
    const empresaIdSesion = user.empresaId ?? user.empresa?.id ?? null
    if (empresaIdSesion && empresaIdSesion !== info.empresaId) {
      window.location.href = '/inicio'
    }
  }, [info, session, sessionStatus, loading])

  if (sessionStatus === 'loading') return (
    <div style={{ minHeight:'100vh', background:'#06050f', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ color:'#6b7280', fontSize:14 }}>Verificando acceso...</span>
    </div>
  )

  return (
    <><Confeti />
    <div style={{ minHeight: '100vh', background: '#06050f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', paddingTop: '4vh', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {loading ? (
          <span style={{ color: '#6b7280', fontSize: 14 }}>Cargando...</span>
        ) : (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h1 style={{ color: '#fff', fontWeight: 800, fontSize: 26, margin: 0 }}>¡Pago recibido!</h1>
              <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{subtitulo}</p>
            </div>

            {/* Voucher si existe */}
            {info?.voucherNum && <VoucherCard info={info} voucherNum={info.voucherNum} />}

            {/* Pasos */}
            {/* CTA */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <a href="/login" style={{ width: '100%', background: '#2563eb', color: '#fff', fontWeight: 700, padding: '14px 0', borderRadius: 12, textDecoration: 'none', textAlign: 'center', fontSize: 15, boxShadow: '0 0 24px rgba(37,99,235,.4)' }}>
                Ir al Gestor TuAgentX
              </a>
              <a href={`https://wa.me/${taxbotNumero}`} target="_blank" rel="noopener noreferrer"
                style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none' }}>
                ¿Algún problema? Escríbenos por <span style={{ color: '#93c5fd', fontWeight: 600 }}>WhatsApp</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  </> )
}

export default function PagoExitoso() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#06050f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#6b7280' }}>Cargando...</span></div>}>
      <PagoExitosoContent />
    </Suspense>
  )
}
