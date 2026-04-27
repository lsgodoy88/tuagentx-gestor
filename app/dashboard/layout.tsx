'use client'
import AsistenteGestor from '@/components/AsistenteGestor'

function gearPath(cx: number, cy: number, outerR: number, innerR: number, teeth: number): string {
  const pts: string[] = []
  for (let i = 0; i < teeth * 2; i++) {
    const angle = (i * Math.PI) / teeth - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    pts.push(`${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`)
  }
  return pts.join(' ') + ' Z'
}
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { GpsContext } from '@/lib/gps-context'
import Link from 'next/link'
import PermisosGuard from '@/components/PermisosGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [menuMovil, setMenuMovil] = useState(false)
  const [asistenteAbierto, setAsistenteAbierto] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null)
  const [bannerCerrado, setBannerCerrado] = useState(false)
  const [menuUsuario, setMenuUsuario] = useState(false)
  const [modoEquipo, setModoEquipo] = useState<string | null | undefined>(undefined)
  const [supervisoresActivos, setSupervisoresActivos] = useState(0)
  const [guardandoModo, setGuardandoModo] = useState(false)
  const [sincronizandoGps, setSincronizandoGps] = useState(false)
  const user = session?.user as any

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    async function suscribirPush() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const permiso = await Notification.requestPermission()
        if (permiso !== 'granted') return
        const existing = await reg.pushManager.getSubscription()
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: 'BGM43jCYmNx71QbrprleQr4ob0WhwaZj65jrB4H7QzjDiOVpvxsOeciZSEEI3um1GN4LnXrhz_z8TI4wpt41-P8'
        })
        await fetch('/api/push/suscribir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        })
      } catch(e) { console.log('Push no disponible:', e) }
    }
    if (user) suscribirPush()
  }, [user])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (!user || user.role === 'superadmin') return
    fetch('/api/mi-empresa/estado')
      .then(r => r.json())
      .then(d => {
        if (d.activa === false) setBloqueado(true)
        if (typeof d.diasRestantes === 'number') setDiasRestantes(d.diasRestantes)
        setModoEquipo(d.modoEquipo ?? null)
        setSupervisoresActivos(d.supervisoresActivos ?? 0)
      })
      .catch(() => {})
  }, [user])

  async function elegirModo(modo: string) {
    setGuardandoModo(true)
    try {
      const res = await fetch('/api/mi-empresa/modo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo }),
      })
      if (res.ok) window.location.reload()
    } finally {
      setGuardandoModo(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Cargando...</div>
      </div>
    )
  }

  const isSuperAdmin = user?.role === 'superadmin'

  const isEmpresa = user?.role === 'empresa'
  const isSupervisor = user?.role === 'supervisor'
  const isEmpleado = ['vendedor', 'entregas'].includes(user?.role)
  const isBodega = user?.role === 'bodega'

  const navItems = [
    { href: '/dashboard', label: 'Inicio', icon: '⚡' },
    ...(isSuperAdmin ? [
      { href: '/dashboard/empresas', label: 'Empresas', icon: '🏢' },
      { href: '/dashboard/monitor', label: 'Control', icon: '📡' },
      { href: '/dashboard/precios', label: 'Precios', icon: '💰' },
    ] : []),
    ...(isEmpresa || isSupervisor ? [
      { href: '/dashboard/empleados', label: 'Empleados', icon: '👥' },
      { href: '/dashboard/clientes', label: 'Clientes', icon: '🏪' },
      { href: '/dashboard/cartera', label: 'Cartera', icon: '💰' },
      { href: '/dashboard/recaudos', label: 'Recaudos', icon: '💳' },
      { href: '/dashboard/rutas', label: 'Rutas', icon: '🗺️' },
      { href: '/dashboard/rutas-fijas', label: 'Impulsos', icon: '⚡' },
      { href: '/dashboard/mapa', label: 'Mapa en vivo', icon: '📍' },
      { href: '/dashboard/visitas-admin', label: 'Visitas', icon: '📋' },
      { href: '/dashboard/trazabilidad', label: 'Trazabilidad', icon: '📊' },
      { href: '/dashboard/reportes', label: 'Reportes', icon: '📈' },
    ] : []),
    ...(isBodega ? [
      { href: '/dashboard/bodega', label: 'Bodega', icon: '📦' },
    ] : []),
    ...(isEmpleado && user?.role !== 'impulsadora' ? [
      { href: '/dashboard/visitas', label: 'Visitas', icon: '📋' },
      { href: '/dashboard/mapa', label: 'Mapa en vivo', icon: '📍' },
      ...(user?.role === 'vendedor' ? [
        { href: '/dashboard/clientes', label: 'Clientes', icon: '🏪' },
        { href: '/dashboard/cartera', label: 'Cartera', icon: '💰' },
      ] : []),
      ...(user?.role !== 'entregas' ? [{ href: '/dashboard/rutas-fijas', label: 'Mis impulsos', icon: '⚡ ' }] : []),
    ] : []),
    ...(user?.role === 'impulsadora' ? [
      { href: '/dashboard/impulsadora', label: 'Inicio', icon: '⚡' },
      { href: '/dashboard/rutas-fijas', label: 'Mi semana', icon: '📌' },
    ] : []),
  ]
  const iconoActivo = navItems.find(item => pathname === item.href)?.icon || '⚡'

  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      {/* Overlay menu movil */}
      {menuMovil && (
        <div className="fixed inset-0 z-[2000] md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMenuMovil(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col z-[2001]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-sm">🗺️</span>
                </div>
                <span className="text-white font-bold">Gestor</span>
              </div>
              <button onClick={() => setMenuMovil(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.filter(item => user?.role === 'impulsadora' ? item.href !== '/dashboard' : true).map(item => (
                <Link key={item.href} href={item.href} onClick={() => setMenuMovil(false)}
                  className={"flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors " + (pathname === item.href ? "bg-blue-600/10 text-blue-400 border border-blue-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800")}>
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-zinc-800 space-y-1">
              {isEmpresa && <button onClick={() => { setMenuMovil(false); setAsistenteAbierto(true) }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full text-zinc-400 hover:text-white hover:bg-zinc-800">
                <span className="relative">🤖<span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /></span>
                TuAgentX
              </button>}
              <div className="relative">
                <button onClick={() => setMenuUsuario(m => !m)}
                  className="flex items-center gap-3 px-3 py-2 w-full hover:bg-zinc-800 rounded-xl transition-colors">
                  <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-white text-sm font-medium truncate">{user?.name}</div>
                    <div className="text-zinc-500 text-xs capitalize">{user?.role}</div>
                  </div>
                  <span className="text-zinc-500 text-xs">{menuUsuario ? '▲' : '▼'}</span>
                </button>
                {menuUsuario && (
                  <div className="mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                    <Link href="/dashboard/configuracion" onClick={() => { setMenuMovil(false); setMenuUsuario(false) }}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors">
                    </Link>

                    <Link href="/dashboard/configuracion" onClick={() => { setMenuMovil(false); setMenuUsuario(false) }}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors">
                      <span>⚙️</span> Configuracion
                    </Link>
                    <button onClick={() => signOut({ callbackUrl: '/login' })}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-700 transition-colors w-full">
                      <span>🚪</span> Cerrar sesion
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Boton flotante movil */}
      <div className={`fixed bottom-6 left-4 z-[990] md:hidden ${menuMovil ? "hidden" : ""}`}>
        <button onClick={() => setMenuMovil(true)}
          className="flex flex-col items-center gap-1 bg-black/50 backdrop-blur-sm border border-blue-500/40 rounded-2xl px-3 py-2.5 shadow-2xl">
          <span className={"text-2xl" + (sincronizandoGps ? " animate-pulse" : "")}>{sincronizandoGps ? "📍" : iconoActivo}</span>
        </button>
      </div>
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-zinc-900 border-r border-zinc-800 flex-col transition-all duration-300 h-full overflow-y-auto hidden md:flex`}>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-sm">🗺️</span>
              </div>
              <span className="text-white font-bold tracking-tight">Gestor</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
              <span className="text-sm">🗺️</span>
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="mx-auto mt-3 text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-800">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        )}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.filter(item => user?.role === 'impulsadora' ? item.href !== '/dashboard' : true).map(item => (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : ''}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''} ${
                pathname === item.href
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}>
              <span className="text-base">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          ))}
        </nav>
                        <div className="p-3 border-t border-zinc-800 space-y-1">
          {isEmpresa && <button onClick={() => setAsistenteAbierto(true)} title={collapsed ? 'TuAgentX' : ''}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full ${collapsed ? 'justify-center' : ''} text-zinc-400 hover:text-white hover:bg-zinc-800`}>
            <span className="relative">🤖<span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /></span>
            {!collapsed && 'TuAgentX'}
          </button>}
          {!collapsed ? (
            <div className="relative">
              <button onClick={() => setMenuUsuario(!menuUsuario)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-800 transition-colors">
                <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-white text-sm font-medium truncate">{user?.name}</div>
                  <div className="text-zinc-500 text-xs truncate capitalize">{user?.role}</div>
                </div>
                <span className="text-zinc-500 text-xs">{menuUsuario ? '▲' : '▼'}</span>
              </button>
              {menuUsuario && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
                  <Link href="/dashboard/configuracion" onClick={() => setMenuUsuario(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors">
                    <span>⚙️</span> Configuración
                  </Link>
                  <button onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors text-left">
                    <span>🚪</span> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => signOut({ callbackUrl: '/login' })} title="Cerrar sesión"
              className="w-full flex justify-center text-zinc-500 hover:text-white py-2 rounded-xl hover:bg-zinc-800 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 w-0 overflow-hidden">
        {bloqueado && (
          <div className="bg-red-900/80 border-b border-red-700 flex items-center justify-between px-4 h-10 flex-shrink-0 overflow-hidden">
            <span className="text-red-100 text-sm truncate">
              <span className="hidden sm:inline">🔴 Cuenta suspendida</span>
              <span className="sm:hidden">🔴 Cuenta suspendida</span>
            </span>
            <a href="https://wa.me/573164349389?text=Hola, necesito reactivar mi cuenta de TuAgentX"
              target="_blank" rel="noopener noreferrer"
              className="ml-4 flex-shrink-0 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
              💬 Contactar
            </a>
          </div>
        )}
        {!bloqueado && !bannerCerrado && diasRestantes !== null && diasRestantes >= 1 && diasRestantes <= 7 && (() => {
          const d = diasRestantes
          const cfg = d === 1
            ? { bg: 'bg-red-900/80 border-red-700',         txt: '🔴 Tu plan vence MAÑANA',          cta: 'Renovar ahora' }
            : d <= 3
            ? { bg: 'bg-orange-900/70 border-orange-700',   txt: `⚠️ Tu plan vence en ${d} días`,    cta: 'Renovar ahora' }
            : { bg: 'bg-emerald-900/60 border-emerald-700', txt: `📅 Tu plan vence en ${d} días`,    cta: '¿Renovar?' }
          return (
            <div className={`${cfg.bg} border-b flex items-center justify-between px-4 h-10 flex-shrink-0 overflow-hidden`}>
              <span className="text-white text-sm truncate">{cfg.txt}</span>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <a href="https://wa.me/573164349389?text=Hola, quiero renovar mi plan de TuAgentX"
                  target="_blank" rel="noopener noreferrer"
                  className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
                  💳 {cfg.cta}
                </a>
                <button onClick={() => setBannerCerrado(true)} className="text-white/60 hover:text-white text-sm leading-none">✕</button>
              </div>
            </div>
          )
        })()}
        {isEmpresa && modoEquipo === 'supervisores' && supervisoresActivos === 0 && (
          <div className="bg-amber-900/70 border-b border-amber-700 flex items-center justify-between px-4 h-10 flex-shrink-0 overflow-hidden">
            <span className="text-amber-100 text-sm truncate">⚠️ Crea tu primer supervisor en Empleados para habilitar vendedores y entregas</span>
            <Link href="/dashboard/empleados" className="ml-4 flex-shrink-0 bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
              Ir →
            </Link>
          </div>
        )}
        <div className={`flex-1 overflow-x-auto overflow-y-auto p-4 md:p-6 pb-32 md:pb-6${bloqueado ? ' pointer-events-none opacity-50' : ''}`}>
          <div className="max-w-screen-xl mx-auto w-full space-y-6">
            <PermisosGuard role={user?.role}><GpsContext.Provider value={{ setSincronizandoGps }}>{children}</GpsContext.Provider></PermisosGuard>
          </div>
        </div>
      </main>
    {asistenteAbierto && <AsistenteGestor onClose={() => setAsistenteAbierto(false)} />}

    {/* Overlay configuración inicial de equipo */}
    {modoEquipo === null && isEmpresa && (
      <div className="fixed inset-0 z-[9999] bg-zinc-950/95 backdrop-blur-sm flex items-start justify-center pt-8 p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <style>{`
              @keyframes gear-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              @keyframes gear-spin-reverse { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
            `}</style>
            <div className="flex items-center justify-center mb-4" style={{ height: 68 }}>
              <svg width="52" height="52" viewBox="0 0 40 40"
                style={{ animation: 'gear-spin 4s linear infinite', transformBox: 'fill-box' as any, transformOrigin: 'center', marginRight: -7 }}>
                <path d={gearPath(20, 20, 18, 13, 8)} fill="#3b82f6" />
                <circle cx="20" cy="20" r="6" fill="#09090b" />
              </svg>
              <svg width="40" height="40" viewBox="0 0 40 40"
                style={{ animation: 'gear-spin-reverse 3s linear infinite', transformBox: 'fill-box' as any, transformOrigin: 'center', marginLeft: -3 }}>
                <path d={gearPath(20, 20, 17, 12, 6)} fill="#a1a1aa" />
                <circle cx="20" cy="20" r="5.5" fill="#09090b" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Configura la estructura de tu equipo</h2>
            <p className="text-zinc-400 text-sm">Elige cómo quieres organizar a tus empleados</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              disabled={guardandoModo}
              onClick={() => elegirModo('supervisores')}
              className="group bg-zinc-900 border border-zinc-700 hover:border-violet-500 hover:bg-violet-500/5 rounded-2xl p-5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="text-3xl mb-3">👥</div>
              <div className="text-white font-semibold mb-1">Con supervisores</div>
              <div className="text-zinc-400 text-xs leading-relaxed">Estructura por capas: supervisores gestionan vendedores y entregas</div>
            </button>
            <button
              disabled={guardandoModo}
              onClick={() => elegirModo('simple')}
              className="group bg-zinc-900 border border-zinc-700 hover:border-emerald-500 hover:bg-emerald-500/5 rounded-2xl p-5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="text-3xl mb-3">⚡</div>
              <div className="text-white font-semibold mb-1">Sin supervisores</div>
              <div className="text-zinc-400 text-xs leading-relaxed">Estructura directa: tú gestionas a todos los empleados</div>
            </button>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-center">
            <p className="text-amber-400 text-xs font-medium">⚠️ Esta configuración no se puede cambiar después</p>
          </div>

          {guardandoModo && (
            <div className="mt-4 text-center text-zinc-400 text-sm">Guardando configuración...</div>
          )}
        </div>
      </div>
    )}
    </div>
  )
}
