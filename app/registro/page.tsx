'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

const PLANES = [
  { id: 'basico', label: 'Básico', desc: 'Hasta 5 empleados' },
  { id: 'pro', label: 'Pro', desc: 'Hasta 20 empleados' },
  { id: 'business', label: 'Business', desc: 'Ilimitado' },
]

export default function RegistroPage() {
  const router = useRouter()
  const [paso, setPaso] = useState(1)
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [plan, setPlan] = useState('basico')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<any>(null)
  const [showPass, setShowPass] = useState(false)
  const [showPass2, setShowPass2] = useState(false)

  function slugify(n: string) {
    return n.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20)
  }

  const emailPreview = nombre ? `admin@${slugify(nombre)}` : 'admin@tuempresa'

  async function registrar() {
    if (password !== password2) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, password, plan })
    })
    const data = await res.json()
    setLoading(false)
    if (data.ok) {
      setResultado(data)
      setPaso(4)
    } else {
      setError(data.error || 'Error al registrar')
    }
  }

  async function entrar() {
    const res = await signIn('credentials', {
      email: resultado.email,
      password,
      redirect: false
    })
    if (res?.ok) router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🗺️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Gestor TuAgentX</h1>
          <p className="text-zinc-400 text-sm mt-1">Crea tu cuenta</p>
        </div>

        {/* Barra progreso */}
        {paso < 4 && (
          <div className="flex gap-1 mb-6">
            {[1,2,3].map(s => (
              <div key={s} className={"h-1 flex-1 rounded-full transition-all " + (paso >= s ? "bg-emerald-500" : "bg-zinc-700")} />
            ))}
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">

          {/* Paso 1 - Nombre empresa */}
          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-white font-semibold mb-1">Nombre de tu empresa</p>
                <p className="text-zinc-400 text-sm">Define el identificador de tu cuenta</p>
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre empresa *</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Distribuidora XYZ"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
              </div>
              {nombre && (
                <div className="bg-zinc-800 rounded-xl p-3">
                  <p className="text-zinc-400 text-xs mb-1">Tu usuario admin será:</p>
                  <p className="text-emerald-400 font-mono text-sm">{emailPreview}</p>
                </div>
              )}
            </div>
          )}

          {/* Paso 2 - Contraseña */}
          {paso === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-white font-semibold mb-1">Contraseña</p>
                <p className="text-zinc-400 text-sm">Mínimo 6 caracteres</p>
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Contraseña *</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 pr-10 text-white text-sm outline-none focus:border-emerald-500" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                    {showPass
                      ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Confirmar contraseña *</label>
                <div className="relative">
                  <input type={showPass2 ? 'text' : 'password'} value={password2} onChange={e => setPassword2(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 pr-10 text-white text-sm outline-none focus:border-emerald-500" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPass2(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                    {showPass2
                      ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          )}

          {/* Paso 3 - Plan */}
          {paso === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-white font-semibold mb-1">Selecciona tu plan</p>
                <p className="text-zinc-400 text-sm">Puedes cambiarlo después</p>
              </div>
              <div className="space-y-2">
                {PLANES.map(p => (
                  <button key={p.id} onClick={() => setPlan(p.id)}
                    className={"w-full p-4 rounded-xl border-2 text-left transition-all " + (plan === p.id ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800")}>
                    <div className="text-white font-semibold text-sm">{p.label}</div>
                    <div className="text-zinc-400 text-xs mt-0.5">{p.desc}</div>
                  </button>
                ))}
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          )}

          {/* Paso 4 - Éxito */}
          {paso === 4 && resultado && (
            <div className="space-y-4 text-center">
              <div className="text-4xl">🎉</div>
              <p className="text-white font-semibold">Empresa creada</p>
              <div className="bg-zinc-800 rounded-xl p-4 text-left">
                <p className="text-zinc-400 text-xs mb-1">Tu usuario de acceso:</p>
                <p className="text-emerald-400 font-mono text-sm">{resultado.email}</p>
              </div>
              <button onClick={entrar}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl text-sm">
                Entrar al panel →
              </button>
            </div>
          )}

          {/* Navegación */}
          {paso < 4 && (
            <div className="flex gap-2 pt-2">
              {paso > 1 && (
                <button onClick={() => setPaso(p => p - 1)}
                  className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">
                  Atrás
                </button>
              )}
              {paso < 3 ? (
                <button onClick={() => setPaso(p => p + 1)}
                  disabled={paso === 1 && !nombre}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                  Siguiente →
                </button>
              ) : (
                <button onClick={registrar}
                  disabled={loading || !password || password.length < 6}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                  {loading ? 'Creando...' : 'Crear empresa'}
                </button>
              )}
            </div>
          )}
        </div>

        {paso < 4 && (
          <p className="text-center text-zinc-600 text-xs mt-4">
            ¿Ya tienes cuenta? <a href="/login" className="text-emerald-400 hover:underline">Ingresar</a>
          </p>
        )}
      </div>
    </div>
  )
}
