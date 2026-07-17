'use client'
import { useEffect, useState } from 'react'
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
}

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor', supervisor: 'Supervisor',
  entregas: 'Entregas', impulsadora: 'Impulsadora',
}

function PagoExitosoContent() {
  const params = useSearchParams()
  const [info, setInfo]     = useState<PagoInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = params.get('id')
    if (!id) { setLoading(false); return }
    fetch(`/api/pago-info?id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setInfo(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params])

  // Derivar textos según tipo de pago
  const titulo = '¡Pago recibido!'
  let subtitulo = 'Tu pago fue procesado correctamente.'
  let pasos: string[] = []
  let detalle = ''

  if (!loading && info) {
    const nombre = info.empresaNombre

    if (info.esUpgrade && info.rolUpgrade) {
      let rolesStr = info.rolUpgrade
      try {
        const obj: Record<string, number> = JSON.parse(info.rolUpgrade)
        rolesStr = Object.entries(obj).map(([r, c]) => `${c} ${ROL_LABELS[r] ?? r}`).join(', ')
      } catch {}
      detalle = rolesStr
      subtitulo = `Se agregaron ${rolesStr} al equipo de ${nombre}. Ya disponibles en tu panel.`
      pasos = [
        'Ingresa al Gestor TuAgentX con tu cuenta actual.',
        `Crea los nuevos usuarios desde Empleados → ${rolesStr}.`,
        'Asigna rutas y empieza a operar.',
      ]
    } else if (info.esUpgrade && info.planNuevo) {
      const planLabel = info.planNuevo.charAt(0).toUpperCase() + info.planNuevo.slice(1)
      subtitulo = `El plan de ${nombre} fue actualizado a ${planLabel}. Los nuevos accesos estarán disponibles en minutos.`
      pasos = [
        'Ingresa al Gestor TuAgentX con tu cuenta actual.',
        `Verifica que tu plan muestra ${planLabel} en configuración.`,
        'Activa los nuevos módulos disponibles.',
      ]
    } else if (info.producto === 'GESTOR') {
      subtitulo = `Tu pago fue procesado. En los próximos minutos recibirás un WhatsApp con las credenciales para acceder al Gestor TuAgentX.`
      pasos = [
        'Revisa tu WhatsApp — recibirás usuario y contraseña.',
        'Ingresa a gestor.tuagentx.com con tus credenciales.',
        'Invita a tu equipo de campo y empieza a asignar rutas.',
      ]
    } else if (info.producto === 'CRM') {
      subtitulo = `Tu pago fue procesado. En los próximos minutos recibirás un WhatsApp con el acceso al CRM TuAgentX.`
      pasos = [
        'Revisa tu WhatsApp — recibirás el enlace de acceso.',
        'Configura tu primer agente y conecta tu WhatsApp.',
        'Empieza a gestionar tus clientes desde el CRM.',
      ]
    } else {
      subtitulo = 'Tu pago fue procesado correctamente. En los próximos minutos recibirás instrucciones por WhatsApp.'
      pasos = [
        'Revisa tu WhatsApp para las instrucciones de activación.',
        'Accede a tu plataforma con las credenciales recibidas.',
        'Comienza a operar con tu equipo.',
      ]
    }
  } else if (!loading && !info) {
    // Sin datos — fallback genérico
    subtitulo = 'Tu pago fue procesado correctamente. En los próximos minutos recibirás instrucciones por WhatsApp.'
    pasos = [
      'Revisa tu WhatsApp para las instrucciones de activación.',
      'Accede a tu plataforma con las credenciales recibidas.',
      'Comienza a operar con tu equipo.',
    ]
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080c18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        {loading ? (
          <div style={{ color: '#9ca3af', fontSize: '1rem' }}>Cargando...</div>
        ) : (
          <>
            <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: 12 }}>{titulo}</h1>
            <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.7, marginBottom: 32 }}>{subtitulo}</p>

            {pasos.length > 0 && (
              <div style={{ background: 'rgba(37,99,235,.06)', border: '1px solid rgba(37,99,235,.2)', borderRadius: 14, padding: '20px 24px', marginBottom: 32, textAlign: 'left' }}>
                <div style={{ fontSize: '.72rem', color: '#93c5fd', fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>PRÓXIMOS PASOS</div>
                {pasos.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                    <span style={{ color: '#bfdbfe', fontSize: '.88rem', lineHeight: 1.5 }}>{step}</span>
                  </div>
                ))}
              </div>
            )}

            <a href="https://gestor.tuagentx.com"
              style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '.95rem', textDecoration: 'none' }}>
              {info?.esUpgrade ? 'Ir al Gestor' : 'Ir al Gestor TuAgentX'}
            </a>

            <p style={{ marginTop: 20, fontSize: '.78rem', color: '#4b5563' }}>
              ¿Algún problema? Escríbenos por{' '}
              <a href="https://wa.me/573505207975" target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd' }}>WhatsApp</a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function PagoExitoso() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080c18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9ca3af' }}>Cargando...</div>
      </div>
    }>
      <PagoExitosoContent />
    </Suspense>
  )
}
