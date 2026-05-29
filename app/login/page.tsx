'use client'
import { useState, useEffect, useRef } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const { status } = useSession()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') router.replace('/inicio')
  }, [status, router])

  if (status === 'loading' || status === 'authenticated') return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await signIn('credentials', { email: usuario, password, redirect: false })
      if (!res) {
        setError('Error de conexión. Intenta de nuevo.')
        setLoading(false)
        return
      }
      if (res.error) {
        setError('Usuario o contraseña incorrectos')
        setLoading(false)
      } else {
        router.push('/inicio')
      }
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">

      {/* Fondo — misma imagen que desktop */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg-city.webp')" }}
      />
      {/* Overlay azul — mismo tono que desktop */}
      <div className="absolute inset-0" style={{background:'rgba(4,12,40,0.40)'}} />

      {/* Card glassmorphism */}
      <div className="relative z-10 w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/40">
              <span className="text-lg">🗺️</span>
            </div>
            <span className="text-white font-extrabold text-3xl tracking-tight">
              TuAgent<span className="text-blue-400">X</span>
              <span className="text-blue-300 text-base font-semibold ml-1.5">Gestor</span>
            </span>
          </div>
          <span className="inline-block bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1 text-xs font-bold tracking-widest uppercase text-blue-200">
            📍 Gestión de fuerza de campo
          </span>
        </div>

        {/* Panel glass */}
        <div
          className="rounded-3xl p-8 shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          <h2 className="text-white font-semibold text-xl mb-6">Iniciar sesión</h2>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Usuario</label>
              <input
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
                onFocus={e => e.currentTarget.style.border = '1px solid rgba(99,179,237,0.7)'}
                onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.15)'}
                placeholder="admin@miempresa"
                required
              />
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 pr-11 text-white placeholder-white/30 focus:outline-none transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                  onFocus={e => e.currentTarget.style.border = '1px solid rgba(99,179,237,0.7)'}
                  onBlur={e => e.currentTarget.style.border = '1px solid rgba(255,255,255,0.15)'}
                  placeholder="••••••••"
                  required
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                  {showPass
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/15 border border-red-400/30 rounded-xl px-4 py-3 text-red-300 text-sm backdrop-blur-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-blue-600/90 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-all mt-2 shadow-lg shadow-blue-600/30 ${loading ? 'btn-shimmer' : ''}`}
              style={{ backdropFilter: 'blur(8px)' }}
            >
              {loading ? 'Ingresando...' : 'Ingresar →'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/25 text-xs mt-6">
          © {new Date().getFullYear()} TuAgentX · Todos los derechos reservados
        </p>
      </div>
    </div>
  )
}
