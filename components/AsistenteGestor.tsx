'use client'
import { useState, useRef, useEffect } from 'react'
import RobotIcon from '@/components/RobotIcon'

type Msg = {
  rol: 'user' | 'bot'
  texto: string
  accion?: string
  requiereConfirm?: boolean
  chips?: string[]
}

interface Props { onClose: () => void; rol?: string; visible?: boolean; userId?: string; onStartTour?: () => void; robotHovered?: boolean }

// ── Chips por rol (menú inicial) ─────────────────────────────────────────────
// Chips operativos por rol (los primeros que ve el usuario)
const CHIPS_ROL: Record<string, string[]> = {
  vendedor:    ['¿Cuánto llevo hoy?', '¿Cuánto llevo este mes?'],
  entregas:    ['¿Cuánto llevo hoy?', '¿Pedidos sin entregar?'],
  impulsadora: ['¿Cuánto llevo hoy?', '¿Cómo van mis metas?'],
  empresa:     ['¿Cómo vamos hoy?', '¿Quién lleva más hoy?', '¿Sin actividad hoy?', '¿Gastos del mes?'],
  admin:       ['¿Cómo vamos hoy?', '¿Cuánto recaudamos este mes?', '¿Gastos del mes?', '¿Sin actividad hoy?'],
  supervisor:  ['¿Cómo vamos hoy?', '¿Quién lleva más hoy?', '¿Esta semana cuánto?', '¿Sin actividad hoy?'],
}
// Chips fijos al final del menú inicial para todos los roles
const CHIPS_FIJOS = ['🚀 Guía interactiva', '🚨 Reportar problema']

const MENU_INICIAL: Record<string, string[]> = Object.fromEntries(
  Object.entries(CHIPS_ROL).map(([k, v]) => [k, [...CHIPS_FIJOS, ...v]])
)

// ── Quick replies contextuales post-respuesta ─────────────────────────────────
function chipsParaRespuesta(texto: string, rol: string): string[] {
  const t = texto.toLowerCase()
  const esAdmin = ['empresa','admin','supervisor'].includes(rol)
  if (t.includes('plan') && t.includes('pendiente')) return ['¿Cómo pagar?', '¿Cuándo vence?', '¿Cómo vamos hoy?']
  if (t.includes('recaudo') && t.includes('hoy'))    return esAdmin ? ['¿Quién lleva más?', '¿Sin actividad hoy?', '¿Cuánto este mes?'] : ['¿Qué clientes tienen saldo?', '¿Cuánto este mes?']
  if (t.includes('este mes'))    return ['¿Cómo vamos hoy?', '¿Esta semana?', '¿Gastos del mes?']
  if (t.includes('esta semana')) return ['¿Cómo vamos hoy?', '¿Cuánto este mes?']
  if (t.includes('ranking') || t.includes('lleva más')) return ['¿Sin actividad hoy?', '¿Cómo vamos hoy?']
  if (t.includes('sin actividad'))  return ['¿Quién lleva más hoy?', '¿Cómo vamos hoy?']
  if (t.includes('ruta') || t.includes('clientes'))   return ['¿Cuánto llevo hoy?', '¿Cuánto este mes?']
  if (t.includes('cartera') || t.includes('saldo'))   return ['¿Cuánto llevo hoy?', '¿Cuál es mi ruta?']
  if (t.includes('ayer'))        return ['¿Cómo vamos hoy?', '¿Cuánto este mes?']
  return []
}

export default function AsistenteGestor({ onClose, rol, visible, userId, onStartTour, robotHovered }: Props) {
  const rolKey = rol || 'vendedor'
  const esVendedor = ['vendedor','entregas','impulsadora'].includes(rolKey)

  const bienvenida = esVendedor
    ? '¡Hola! Soy TaXBot 👋\nTu asistente en TuAgentX.\n\n¿Qué quieres consultar hoy?'
    : '¡Hola! Soy TaXBot 👋\nTu asistente inteligente.\n\n¿Qué quieres revisar?'

  const menuInicial = MENU_INICIAL[rolKey] || MENU_INICIAL['vendedor']

  const [msgs, setMsgs]         = useState<Msg[]>([{ rol: 'bot', texto: bienvenida, chips: menuInicial }])
  const [input, setInput]       = useState('')
  const [cargando, setCargando] = useState(false)
  const LIMITE_DIARIO = 20

  const [enviados, setEnviados] = useState(() => {
    try {
      const hoy = new Date().toISOString().slice(0,10)
      const raw = localStorage.getItem('taxbot_cnt_' + (userId || 'u'))
      if (!raw) return 0
      const { fecha, count } = JSON.parse(raw)
      return fecha === hoy ? count : 0
    } catch { return 0 }
  })

  function incrementarContador() {
    try {
      const hoy = new Date().toISOString().slice(0,10)
      const next = enviados + 1
      localStorage.setItem('taxbot_cnt_' + (userId || 'u'), JSON.stringify({ fecha: hoy, count: next }))
      setEnviados(next)
    } catch {}
  }

  const [pendiente, setPendiente] = useState<{ accion: string; texto: string } | null>(null)

  // Bubble "Hola, Estoy aquí" — una vez por sesión
  const [showBubble, setShowBubble] = useState(false)
  useEffect(() => {
    const key = 'taxbot_bubble_' + (userId || 'u')
    if (sessionStorage.getItem(key)) return
    const t = setTimeout(() => {
      setShowBubble(true)
      sessionStorage.setItem(key, '1')
      setTimeout(() => setShowBubble(false), 4000)
    }, 2000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function enviar(textoOverride?: string) {
    const texto = (textoOverride ?? input).trim()
    if (!texto || cargando) return

    // Visita guiada — activar tour overlay sin consumir mensaje
    if (/visita guiada|guia interactiva|guía interactiva|🗺️|🚀/i.test(texto)) {
      setInput('')
      onClose()  // minimizar TaXBot
      onStartTour?.()
      return
    }

    if (enviados >= LIMITE_DIARIO) {
      setMsgs(prev => [...prev, { rol: 'bot', texto: 'Alcanzaste el límite de ' + LIMITE_DIARIO + ' mensajes por hoy. Vuelve mañana.' }])
      return
    }
    incrementarContador()
    setInput('')
    setMsgs(prev => [...prev, { rol: 'user', texto }])
    setCargando(true)

    try {
      const res = await fetch('/api/taxbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: texto }),
      })
      const data = await res.json()
      const respuesta = data.respuesta ?? data.error ?? 'Error al procesar'
      // Chips del servidor (desambiguación) tienen prioridad sobre los locales (seguimiento)
      const chipsServidor: string[] = data.chips || []
      const chipsLocales = chipsServidor.length === 0 ? chipsParaRespuesta(respuesta, rolKey) : []
      const chipsFinales = chipsServidor.length > 0 ? chipsServidor : chipsLocales
      setMsgs(prev => [...prev, { rol: 'bot', texto: respuesta, chips: chipsFinales.length ? chipsFinales : undefined }])
    } catch {
      setMsgs(prev => [...prev, { rol: 'bot', texto: 'Error de conexión. Intenta de nuevo.' }])
    }
    setCargando(false)
  }

  async function confirmarAccion(confirma: boolean) {
    if (!pendiente) return
    setPendiente(null)
    if (!confirma) {
      setMsgs(prev => [...prev, { rol: 'bot', texto: 'Entendido, no ejecuté ninguna acción.' }])
      return
    }
    setCargando(true)
    const res = await fetch('/api/taxbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: '', accionDirecta: pendiente.accion, accionParams: {} }),
    })
    const data = await res.json()
    setMsgs(prev => [...prev, { rol: 'bot', texto: data.accionResultado?.msg ?? '✅ Acción ejecutada.' }])
    setCargando(false)
  }

  const chatInner = (
    <>{/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
        <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{background:"rgba(30,36,58,0.99)",border:"1.5px solid rgba(59,130,246,0.35)"}}>
          <RobotIcon size={28} />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-zinc-900" />
        </div>
        <div className="flex-1">
          <div className="text-white font-bold text-sm">TaXBot</div>
          <div className="text-zinc-400 text-xs">Asistente inteligente · En línea</div>
        </div>
        <button onClick={async () => {
          await fetch('/api/taxbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensaje: '__reset__', reset: true }) }).catch(() => {})
          setMsgs([{ rol: 'bot', texto: bienvenida, chips: menuInicial }])
          setPendiente(null)
          onClose()
        }} title="Apagar" className="w-10 h-10 bg-zinc-800 hover:bg-red-900/40 rounded-xl flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
        </button>
        <button onClick={onClose} title="Minimizar" className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
            {m.rol === 'bot' && (
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-1" style={{background:"rgba(30,36,58,0.99)",border:"1px solid rgba(59,130,246,0.30)"}}><RobotIcon size={16} /></div>
            )}
            <div className="flex flex-col gap-2 max-w-[82%]">
              <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                m.rol === 'user'
                  ? 'bg-violet-600 text-white rounded-br-sm'
                  : 'bg-zinc-800/70 text-zinc-100 rounded-bl-sm'
              }`}>
                {m.texto}
              </div>

              {/* Chips acción rápida */}
              {m.rol === 'bot' && m.chips && m.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {m.chips.map((chip, ci) => (
                    <button
                      key={ci}
                      onClick={() => enviar(chip)}
                      disabled={cargando || enviados >= LIMITE_DIARIO}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-40 hover:brightness-125 active:scale-95"
                      style={{
                        background: 'rgba(59,130,246,0.12)',
                        border: '1px solid rgba(59,130,246,0.35)',
                        color: '#93c5fd',
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              {/* Botones confirmación */}
              {m.requiereConfirm && pendiente && i === msgs.length - 1 && (
                <div className="flex gap-2">
                  <button onClick={() => confirmarAccion(true)}
                    className="flex-1 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition-colors">
                    ✅ Sí, ejecutar
                  </button>
                  <button onClick={() => confirmarAccion(false)}
                    className="flex-1 py-1.5 rounded-xl bg-zinc-700 text-zinc-300 text-xs font-bold hover:bg-zinc-600 transition-colors">
                    ✕ Cancelar
                  </button>
                </div>
              )}
            </div>
            {m.rol === 'user' && (
              <div className="w-7 h-7 bg-zinc-700 rounded-xl flex items-center justify-center text-sm flex-shrink-0 mt-1">👤</div>
            )}
          </div>
        ))}

        {cargando && (
          <div className="flex justify-start gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{background:"rgba(30,36,58,0.99)",border:"1px solid rgba(59,130,246,0.30)"}}><RobotIcon size={16} /></div>
            <div className="bg-zinc-800 px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800">
        <div className="flex gap-2 items-center">
          <div style={{position:'relative',width:40,height:40,flexShrink:0}}>
            <svg width="40" height="40" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5"/>
              <circle cx="18" cy="18" r="15" fill="none"
                stroke={enviados >= LIMITE_DIARIO ? '#ef4444' : '#3b82f6'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${(enviados / LIMITE_DIARIO) * 94.2} 94.2`}
                style={{transformOrigin:'18px 18px', transform:'rotate(-90deg)'}}
              />
            </svg>
            <span style={{
              position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:11,fontWeight:800,color: enviados >= LIMITE_DIARIO ? '#ef4444' : '#94a3b8',
              letterSpacing:'-0.5px'
            }}>{enviados}/{LIMITE_DIARIO}</span>
          </div>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
            placeholder="Pregunta o pide una acción…"
            className="flex-1 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none placeholder-zinc-500"
            style={{ background: '#1e2030', border: '1.5px solid rgba(59,130,246,0.55)' }}
          />
          <button onClick={() => enviar()} disabled={!input.trim() || cargando}
            className="w-11 h-11 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
            style={{background:'rgba(59,130,246,0.85)',border:'1.5px solid #3b82f6',boxShadow:'0 0 8px rgba(59,130,246,0.4)'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Bubble "Hola, Estoy aquí" — una vez por sesión */}
      {/* Bubble — solo PC, hover sobre el botón robot */}
      {!visible && (
        <div
          className="taxbot-bubble-wrapper hidden md:block"
          style={{ position:'fixed', bottom:16, right:16, zIndex:9994, width:'auto', height:'auto', pointerEvents:'none' }}
        >
          <div
            className="taxbot-bubble"
            onClick={(e) => { e.stopPropagation(); setShowBubble(false); onClose() }}
            style={{
              position: 'absolute',
              bottom: 76,
              right: 0,
              opacity: (showBubble || robotHovered) ? 1 : 0,
              transform: (showBubble || robotHovered) ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.92)',
              transition: 'opacity 0.28s ease, transform 0.28s ease',
              pointerEvents: 'auto',
              cursor: 'pointer',
              filter: 'drop-shadow(0 4px 16px rgba(96,165,250,0.30))',
            }}
          >
            <svg width="160" height="52" viewBox="0 0 160 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Burbuja principal */}
              <rect x="1" y="1" width="158" height="40" rx="14" fill="transparent" stroke="#60a5fa" strokeWidth="1.5"/>
              {/* Cola orgánica apuntando abajo-derecha hacia el robot */}
              <path d="M130 41 Q138 48 148 51 Q140 44 132 41 Z" fill="transparent" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round"/>
              {/* Texto */}
              <text x="50%" y="22" textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontFamily="system-ui,-apple-system,sans-serif" fontSize="13" fontWeight="600">👋 Hola, estoy aquí</text>
            </svg>
          </div>
        </div>
      )}
      <style>{`
        @keyframes taxbot-bubble-in {
          from { opacity: 0; transform: translateY(8px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }

      `}</style>

      {/* Móvil: full screen */}
      <div className="md:hidden">
        <div className="fixed inset-0 bg-black/60 z-[9998]" style={{display: visible ? undefined : "none"}} onClick={onClose} />
        <div className="fixed top-0 right-0 w-full h-full z-[9999] flex flex-col shadow-2xl border-l border-white/10" style={{background:"#080a1c", display: visible ? undefined : "none"}}>
          {chatInner}
        </div>
      </div>

      {/* PC: ventana flotante */}
      <div className="hidden md:flex">
        {visible && <div className="fixed inset-0 z-[9998]" onClick={onClose} />}
        <div style={{
          position:'fixed', bottom:16, right:16, zIndex:9999,
          width:380, height:580,
          display:'flex', flexDirection:'column',
          borderRadius:20, overflow:'hidden',
          background:'#080a1c',
          border:'1px solid rgba(59,130,246,0.25)',
          boxShadow:'0 24px 60px rgba(0,0,0,0.7)',
          transformOrigin:'bottom right',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.3) translateY(60px)',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition:'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease',
        }}>
          {chatInner}
        </div>
      </div>
    </>
  )
}
