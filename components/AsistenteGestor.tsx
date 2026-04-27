'use client'
import { useState, useRef, useEffect } from 'react'

type Msg = { rol: 'user' | 'bot'; texto: string }

interface Props {
  onClose: () => void
}

export default function AsistenteGestor({ onClose }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([{
    rol: 'bot',
    texto: '¡Hola! Soy TuAgentX, tu asistente del Gestor. Puedo ayudarte con información de rutas, visitas, empleados, clientes y rendimiento del equipo. ¿En qué te puedo ayudar?'
  }])
  const [input, setInput] = useState('')
  const [cargando, setCargando] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/asistente/historial').then(r => r.json()).then(hist => {
      if (Array.isArray(hist) && hist.length > 0) {
        setMsgs(hist.map((m: any) => ({ rol: m.rol as 'user' | 'bot', texto: m.texto })))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/asistente/historial').then(r => r.json()).then(hist => {
      if (Array.isArray(hist) && hist.length > 0) {
        setMsgs(hist.map((m: any) => ({ rol: m.rol as 'user' | 'bot', texto: m.texto })))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/asistente/historial').then(r => r.json()).then(hist => {
      if (Array.isArray(hist) && hist.length > 0) {
        setMsgs(hist.map((m: any) => ({ rol: m.rol as 'user' | 'bot', texto: m.texto })))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function enviar() {
    const texto = input.trim()
    if (!texto || cargando) return
    setInput('')
    setMsgs(prev => [...prev, { rol: 'user', texto }])
    setCargando(true)
    try {
      const historial: any[] = []
      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: texto, historial }),
      })
      const data = await res.json()
      setMsgs(prev => [...prev, { rol: 'bot', texto: data.respuesta || data.error || 'Error al procesar' }])
    } catch {
      setMsgs(prev => [...prev, { rol: 'bot', texto: 'Error de conexion. Intenta de nuevo.' }])
    }
    setCargando(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[998]" onClick={onClose} />
      <div className="fixed top-0 right-0 w-full md:w-[380px] h-full bg-zinc-900 border-l border-zinc-800 z-[999] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="relative w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
            🤖
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-zinc-900" />
          </div>
          <div className="flex-1">
            <div className="text-white font-bold text-sm">TuAgentX</div>
            <div className="text-zinc-400 text-xs">Asistente del Gestor · En línea</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
              {m.rol === 'bot' && (
                <div className="w-7 h-7 bg-blue-600 rounded-xl flex items-center justify-center text-sm flex-shrink-0 mt-1">🤖</div>
              )}
              <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                m.rol === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
              }`}>
                {m.texto}
              </div>
              {m.rol === 'user' && (
                <div className="w-7 h-7 bg-zinc-700 rounded-xl flex items-center justify-center text-sm flex-shrink-0 mt-1">👤</div>
              )}
            </div>
          ))}
          {cargando && (
            <div className="flex justify-start gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-xl flex items-center justify-center text-sm">🤖</div>
              <div className="bg-zinc-800 px-4 py-2.5 rounded-2xl rounded-bl-sm">
                <span className="text-zinc-400 text-sm animate-pulse">Pensando...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="p-4 border-t border-zinc-800">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder="Haz una pregunta..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-zinc-500"
            />
            <button onClick={enviar} disabled={!input.trim() || cargando}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors">
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
