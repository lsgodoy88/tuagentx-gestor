'use client'

const PLANES = [
  {
    name: 'Básico',
    desc: 'Para equipos pequeños en campo',
    roles: { supervisor: 1, vendedor: 1, impulsadora: 1, entregas: 0 },
    popular: false,
  },
  {
    name: 'Popular',
    desc: 'El más elegido por nuestros clientes',
    roles: { supervisor: 1, vendedor: 3, impulsadora: 3, entregas: 1 },
    popular: true,
  },
  {
    name: 'Business',
    desc: 'Para operaciones de alto volumen',
    roles: { supervisor: 2, vendedor: 5, impulsadora: 5, entregas: 1 },
    popular: false,
  },
]

const ROL_LABELS: Record<string, string> = {
  supervisor:  'Supervisor',
  vendedor:    'Vendedor',
  impulsadora: 'Impulsadora',
  entregas:    'Entrega',
}

const ROL_ICONS: Record<string, string> = {
  supervisor:  '👔',
  vendedor:    '🛒',
  impulsadora: '⚡',
  entregas:    '🚚',
}

export default function PlanesDinamicos({ precios, loading }: { precios: Record<string, number>; loading: boolean }) {

  function calcTotal(roles: Record<string, number>) {
    return Object.entries(roles).reduce((s, [rol, n]) => s + (precios[rol] ?? 0) * n, 0)
  }

  function scrollCotizador() {
    document.getElementById('cotizador')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ background: 'rgba(0,0,0,.3)', padding: '72px 24px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
      <div className="max-w-screen-xl mx-auto">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#93c5fd', marginBottom: 6 }}>Planes Gestor</div>
          <div style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 800 }}>Escala tu equipo de campo.</div>
          <p style={{ color: '#9ca3af', fontSize: '.85rem', marginTop: 8 }}>Precios por persona activa al mes · Sin permanencia</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANES.map(plan => {
            const total = calcTotal(plan.roles)
            const rolesActivos = Object.entries(plan.roles).filter(([, n]) => n > 0)
            return (
              <div key={plan.name} style={{
                background: plan.popular ? 'rgba(37,99,235,.07)' : 'rgba(255,255,255,.025)',
                border: plan.popular ? '1px solid rgba(37,99,235,.4)' : '1px solid rgba(255,255,255,.06)',
                borderRadius: 16,
                padding: '28px 22px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}>
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: '#2563eb', color: '#fff', fontSize: '.64rem', fontWeight: 700,
                    padding: '3px 14px', borderRadius: 10, whiteSpace: 'nowrap',
                  }}>⭐ Más popular</div>
                )}

                <div style={{ fontSize: '.7rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: '.78rem', color: '#6b7280', marginBottom: 16, lineHeight: 1.4 }}>{plan.desc}</div>

                {/* Total */}
                <div style={{ marginBottom: 18 }}>
                  {loading ? (
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#374151' }}>...</div>
                  ) : (
                    <>
                      <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>
                        ${total.toLocaleString('es-CO')}
                        <span style={{ fontSize: '.74rem', fontWeight: 400, color: '#9ca3af' }}>/mes</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Desglose */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 22, flex: 1 }}>
                  {rolesActivos.map(([rol, n]) => {
                    const precio = precios[rol] ?? 0
                    const sub = precio * n
                    return (
                      <div key={rol} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.75rem' }}>
                        <span>{ROL_ICONS[rol]}</span>
                        <span style={{ flex: 1, color: 'rgba(255,255,255,.65)' }}>
                          {n} {ROL_LABELS[rol]}{n > 1 ? (rol === 'impulsadora' ? 's' : 'es') : ''}
                        </span>
                        <span style={{ color: loading ? '#374151' : '#93c5fd', fontWeight: 600 }}>
                          {loading ? '...' : `$${sub.toLocaleString('es-CO')}`}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={scrollCotizador}
                  style={{
                    display: 'block', width: '100%', padding: '10px',
                    borderRadius: 9,
                    background: plan.popular ? '#2563eb' : 'transparent',
                    color: plan.popular ? '#fff' : '#93c5fd',
                    border: plan.popular ? 'none' : '1px solid rgba(37,99,235,.3)',
                    fontWeight: 700, fontSize: '.82rem', cursor: 'pointer',
                    boxSizing: 'border-box',
                    boxShadow: plan.popular ? '0 0 20px rgba(37,99,235,.25)' : 'none',
                  }}
                >
                  Cotizar ahora →
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
