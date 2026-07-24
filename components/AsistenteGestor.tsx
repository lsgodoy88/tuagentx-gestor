'use client'
import { useState, useRef, useEffect } from 'react'
import RobotIcon from '@/components/RobotIcon'

type Msg = { rol: 'user' | 'bot'; texto: string; accion?: string; requiereConfirm?: boolean }

interface Props { onClose: () => void; rol?: string; visible?: boolean }



export default function AsistenteGestor({ onClose, rol, visible }: Props) {
  const esVendedor = ['vendedor','entregas','impulsadora'].includes(rol || '')
  const bienvenida = esVendedor
    ? '¡Hola! Soy TaXBot\nTu asistente de TuAgentX. Puedo consultarte tu recaudo, clientes con saldo, visitas y pagos.\n\n¿En qué te ayudo?'
    : '¡Hola! Soy TaXBot\nTu asistente inteligente de TuAgentX. Puedo consultar el estado de tu empresa, limpiar caché, revisar sincronizaciones y más.\n\n¿En qué te ayudo?'
  const [msgs, setMsgs] = useState<Msg[]>([{ rol: 'bot', texto: bienvenida }])
  const [input, setInput]         = useState('')
  const [cargando, setCargando]   = useState(false)
  const [pendiente, setPendiente] = useState<{ accion: string; texto: string } | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Contexto pre-cargado en daemon — sin resumen proactivo
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function enviar(textoOverride?: string) {
    const texto = (textoOverride ?? input).trim()
    if (!texto || cargando) return
    setInput('')
    const nuevaMsgs: Msg[] = [...msgs, { rol: 'user', texto }]
    setMsgs(nuevaMsgs)
    setCargando(true)

    try {
      const res = await fetch('/api/taxbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: texto }),
      })
      const data = await res.json()

      setMsgs(prev => [...prev, { rol: 'bot', texto: data.respuesta ?? data.error ?? 'Error al procesar' }])
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

  return (
    <>
      {!visible && <div style={{display:"none"}} />}
      <div className="fixed inset-0 bg-black/60 z-[9998]" style={{display: visible ? undefined : "none"}} />
      <div className="fixed top-0 right-0 w-full md:w-[380px] h-full z-[9999] flex flex-col shadow-2xl border-l border-white/10" style={{ background: "#080a1c", display: visible ? undefined : "none" }}>

        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{background:"rgba(30,36,58,0.99)",border:"1.5px solid rgba(59,130,246,0.35)"}}>
            <RobotIcon size={28} />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-zinc-900" />
          </div>
          <div className="flex-1">
            <div className="text-white font-bold text-sm">TaXBot</div>
            <div className="text-zinc-400 text-xs">Asistente inteligente · En línea</div>
          </div>
          {/* Power — resetea y desmonta */}
          <button onClick={async () => {
            await fetch('/api/taxbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensaje: '__reset__', reset: true }) }).catch(() => {})
            setMsgs([{ rol: 'bot', texto: bienvenida }])
            setPendiente(null)
            onClose()
          }} title="Apagar" className="w-10 h-10 bg-zinc-800 hover:bg-red-900/40 rounded-xl flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
          </button>
          {/* Minimizar */}
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
              <div className="flex flex-col gap-2 max-w-[80%]">
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                  m.rol === 'user'
                    ? 'bg-violet-600 text-white rounded-br-sm'
                    : 'bg-zinc-800/70 text-zinc-100 rounded-bl-sm'
                }`}>
                  {m.texto}
                </div>
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
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder="Pregunta o pide una acción…"
              className="flex-1 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none placeholder-zinc-500"
              style={{ background: '#1e2030', border: '1.5px solid rgba(59,130,246,0.55)' }}
            />
            <button onClick={() => enviar()} disabled={!input.trim() || cargando}
              className="w-11 h-11 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors flex-shrink-0" style={{background:'rgba(59,130,246,0.85)',border:'1.5px solid #3b82f6',boxShadow:'0 0 8px rgba(59,130,246,0.4)'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

      </div>
    </>
  )
}
