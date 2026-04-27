'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
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
    if (status === 'authenticated') router.replace('/dashboard')
  }, [status, router])

  if (status === 'loading' || status === 'authenticated') return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await signIn('credentials', {
      email: usuario,
      password,
      redirect: false,
    })
    if (res?.error) {
      setError('Usuario o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <>
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-5">
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontWeight:800,fontSize:'1.8rem',marginBottom:'1rem'}}>
              <div style={{width:34,height:34,background:'#2563eb',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontSize:16}}>🗺️</span>
              </div>
              <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                <span style={{letterSpacing:0,color:'#fff'}}>{'TuAgent'}<span style={{color:'#2563eb'}}>X</span></span>
                <span style={{fontSize:'.8rem',color:'#93c5fd',fontWeight:600,verticalAlign:'baseline'}}>Gestor</span>
              </div>
            </div>
            <span style={{display:'inline-block',background:'rgba(37,99,235,.1)',border:'1px solid rgba(37,99,235,.22)',borderRadius:16,padding:'4px 14px',fontSize:'.68rem',fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#93c5fd'}}>📍 Gestión de fuerza de campo</span>
          </div>
          <div className="bg-[#080818] border border-blue-900/30 rounded-2xl p-8">
            <h2 className="text-white font-semibold text-xl mb-6">Iniciar sesión</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm mb-1.5 block">Usuario</label>
                <input
                  type="text"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  className="w-full bg-[#0d0d1a] border border-blue-900/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="admin@miempresa"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1.5 block">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-[#0d0d1a] border border-blue-900/50 rounded-xl px-4 py-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                    {showPass
                      ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors mt-2"
              >
                {loading ? 'Ingresando...' : 'Ingresar →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
