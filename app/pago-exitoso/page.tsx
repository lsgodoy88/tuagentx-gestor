export default function PagoExitoso() {
  return (
    <div style={{ minHeight: '100vh', background: '#080c18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: 12 }}>
          ¡Pago recibido!
        </h1>
        <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.7, marginBottom: 32 }}>
          Tu pago fue procesado correctamente. En los próximos minutos recibirás un correo con las instrucciones para activar tu empresa en el Gestor TuAgentX.
        </p>

        <div style={{ background: 'rgba(37,99,235,.06)', border: '1px solid rgba(37,99,235,.2)', borderRadius: 14, padding: '20px 24px', marginBottom: 32, textAlign: 'left' }}>
          <div style={{ fontSize: '.72rem', color: '#93c5fd', fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>PRÓXIMOS PASOS</div>
          {[
            'Revisa tu bandeja de entrada (y spam) para el correo de activación.',
            'Haz clic en el enlace del correo para crear tu empresa y contraseña.',
            'Invita a tu equipo de campo y empieza a asignar rutas.',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
              <span style={{ color: '#bfdbfe', fontSize: '.88rem', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>

        <a href="/"
          style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '.95rem', textDecoration: 'none' }}>
          Volver al inicio
        </a>

        <p style={{ marginTop: 20, fontSize: '.78rem', color: '#4b5563' }}>
          ¿Algún problema? Escríbenos por{' '}
          <a href="https://wa.me/573164349389" target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd' }}>WhatsApp</a>
        </p>
      </div>
    </div>
  )
}
