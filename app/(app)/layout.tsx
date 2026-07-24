'use client'
import React from 'react'
import AsistenteGestor from '@/components/AsistenteGestor'
import RobotIcon from '@/components/RobotIcon'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { GpsContext } from '@/lib/gps-context'
import Link from 'next/link'
import PermisosGuard from '@/components/PermisosGuard'
import { NetworkBanner } from '@/components/NetworkBanner'
import { clearAllCache } from '@/lib/offlineCache'

// ── Dashboards persistidos en layout ─────────────────────────────────────────
const DashboardVendedor  = dynamic(() => import('./inicio/_components/DashboardVendedor'),  { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardAdmin     = dynamic(() => import('./inicio/_components/DashboardAdmin'),     { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardBodega    = dynamic(() => import('./inicio/_components/DashboardBodega'),    { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardEntregas      = dynamic(() => import('./inicio/_components/DashboardEntregas'),      { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardImpulsadora   = dynamic(() => import('./inicio/_components/DashboardImpulsadora'),   { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  // BFCache: en lugar de reload forzado, disparar evento para que dashboards refresquen datos
  const dashboardRefreshRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) dashboardRefreshRef.current?.()
    }
    // Solo BFCache (pageshow persisted) — visibilitychange lo maneja el dashboard internamente
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  useEffect(() => {
    const titles: Record<string, string> = {
      '/inicio':        'Inicio',
      '/empresas':      'Empresas',
      '/monitor':       'Control',
      '/precios':       'Precios',
      '/code':          'Code',
      '/empleados':     'Activos',
      '/clientes':      'Clientes',
      '/cartera':       'Cartera',
      '/recaudos':      'Recaudos',
      '/gastos':        'Gastos',
      '/rutas':         'Visitas',
      '/impulsos':   'Impulsos',
      '/trazabilidad':  'Bodega',
      '/ordenes':       'Órdenes',
      '/stock':         'Stock',
      '/visitas':       'Mis Visitas',
      '/impulsadora':   'Mi Ruta',
      '/mi-ruta':       'Mi Ruta',
      '/turno':         'Turno',
      '/historial':     'Historial',
      '/mapa-ruta':     'Mapa',
      '/bodega':        'Bodega',
      '/configuracion': 'Configuración',
    }
    document.title = `${titles[pathname] || 'Gestor'} — TuAgentX`
    // Mostrar overlay al cambiar ruta, ocultar tras mínimo 400ms
    setNavigating(true)
    if (navTimer.current) clearTimeout(navTimer.current)
    navTimer.current = setTimeout(() => setNavigating(false), 400)
  }, [pathname])

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sidebarExpanded = sidebarOpen
  const collapsed = !sidebarOpen
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [asistenteAbierto, setAsistenteAbierto] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null)
  const [bannerCerrado, setBannerCerrado] = useState(false)
  const [menuUsuario, setMenuUsuario] = useState(false)
  const [sincronizandoGps, setSincronizandoGps] = useState(false)
  const user = session?.user as any
  const authUser = status === 'authenticated' ? user : null

    useEffect(() => {
    if (!user) return
    const role = user.role as string
    const necesitaNotif = ['empresa', 'supervisor', 'vendedor', 'entregas', 'impulsadora'].includes(role)
    const necesitaGps   = ['vendedor', 'entregas', 'impulsadora'].includes(role)
    async function pedirPermisos() {
      if (necesitaGps && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 })
      }
      if (necesitaNotif && 'serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js')
          const permiso = await Notification.requestPermission()
          if (permiso !== 'granted') return
          const existing = await reg.pushManager.getSubscription()
          const sub = existing || await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'BGM43jCYmNx71QbrprleQr4ob0WhwaZj65jrB4H7QzjDiOVpvxsOeciZSEEI3um1GN4LnXrhz_z8TI4wpt41-P8'
          })
          await fetch('/api/push/suscribir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
        } catch(e) { console.log('Push no disponible:', e) }
      }
    }
    pedirPermisos()
  }, [user])

  // Aplicar color de fondo personalizado del usuario (clave por userId)
  useEffect(() => {
    const uid   = (user as any)?.id
    const color = (user as any)?.colorFondo
    const keyColor = uid ? `colorFondo_${uid}` : 'colorFondo'
    const keyGrad  = uid ? `colorFondoGradient_${uid}` : 'colorFondoGradient'
    const applyColor = (hex: string) => {
      document.documentElement.style.setProperty('--background', hex)
      const savedGrad = localStorage.getItem(keyGrad)
      const grad = document.getElementById('bg-grad-base')
      if (grad && savedGrad && window.innerWidth < 768) grad.style.background = savedGrad
    }
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      applyColor(color)
      localStorage.setItem(keyColor, color)
    } else {
      const cached = localStorage.getItem(keyColor)
      if (cached && /^#[0-9a-fA-F]{6}$/.test(cached)) {
        applyColor(cached)
      }
    }
  }, [user])

  // Detecta cambio de USUARIO (no de empresa-en-general, no re-login del
  // mismo usuario) en el mismo navegador — limpia offlineCache para que el
  // usuario nuevo nunca vea, ni por un instante, datos cacheados del
  // usuario anterior (stale-while-revalidate de recaudos/clientes/cartera/
  // mi-ruta). Clave de control separada del PREFIX de offlineCache, para
  // no auto-limpiarse a sí misma.
  useEffect(() => {
    const uid = (user as any)?.id
    if (!uid) return
    try {
      const ultimoUid = localStorage.getItem('txa_ultimo_userid')
      if (ultimoUid && ultimoUid !== uid) {
        clearAllCache()
        sessionStorage.clear()
      }
      localStorage.setItem('txa_ultimo_userid', uid)
    } catch {
      // localStorage no disponible — ignorar silencioso
    }
  }, [user])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (!user || user.role === 'superadmin') return
    const cacheKey = 'txa_empresa_estado_' + (user.empresaId || user.id)
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const d = JSON.parse(cached)
        if (d.activa === false) setBloqueado(true)
        if (typeof d.diasRestantes === 'number') setDiasRestantes(d.diasRestantes)
        return
      }
    } catch {}
    fetch('/api/mi-empresa/estado')
      .then(r => r.json())
      .then(d => {
        if (d.activa === false) setBloqueado(true)
        if (typeof d.diasRestantes === 'number') setDiasRestantes(d.diasRestantes)
        try { sessionStorage.setItem(cacheKey, JSON.stringify(d)) } catch {}
      })
      .catch(() => {})
  }, [user])

  const isSuperAdmin  = user?.role === 'superadmin'
  const isEmpresa     = user?.role === 'empresa'
  const isSupervisor  = user?.role === 'supervisor'
  const isEmpleado    = ['vendedor', 'entregas'].includes(user?.role)
  const isBodega      = user?.role === 'bodega'
  const [empresasBodega, setEmpresasBodega] = useState<{href:string,label:string,icon:string}[]>([])
  useEffect(() => {
    if (!isBodega) return
    fetch('/api/bodega/empresas').then(r=>r.json()).then(d=>{
      const items = [
        { href: '/bodega/propia', label: d.propia?.nombre || 'Principal', icon: '🏢' },
        ...(d.vinculadas||[]).map((v:any) => ({ href: `/bodega/${v.slug}`, label: v.nombre, icon: '🏢' }))
      ]
      setEmpresasBodega(items)
    }).catch(()=>{})
  }, [isBodega])

  // ── Nav groups (desktop sidebar) ────────────────────────────────
  const navGroups = [
    {
      items: [
        ...(user?.role !== 'impulsadora' ? [{ href: '/inicio', label: 'Inicio', icon: '🏠' }] : []),
        ...(isSuperAdmin ? [
          { href: '/empresas',  label: 'Empresas', icon: '🏢' },
          { href: '/monitor',   label: 'Control',  icon: '📡' },
          { href: '/precios',   label: 'Precios',  icon: '💰' },
          { href: '/code',      label: 'Code',     icon: '🧬' },
        ] : []),
      ]
    },
    ...(isEmpresa || isSupervisor ? [{
      label: 'Operaciones',
      items: [
        { href: '/ingresos', label: 'Saldos', icon: '💵' },
        { href: '/egresos',  label: 'Egresos',  icon: '🛍️' },
        { href: '/empleados', label: 'Activos',   icon: '👥' },
        { href: '/clientes',  label: 'Clientes',  icon: '🏪' },
        { href: '/cartera',   label: 'Cartera',   icon: '💰' },
        { href: '/recaudos',  label: 'Recaudos',  icon: '💳' },
      ]
    }, {
      label: 'Visitas',
      items: [
        { href: '/rutas',        label: 'Visitas',       icon: '📋' },
        { href: '/impulsos',  label: 'Impulsos',      icon: '⚡' },
        { href: '/trazabilidad', label: 'Bodega',  icon: '🏭' },
      ]
    }, {
      label: 'Análisis',
      items: [
      ]
    }] : []),
    ...(isBodega ? [{
      items: [
        ...empresasBodega,
      ]
    }] : []),
    ...(isEmpleado && user?.role !== 'impulsadora' ? [{
      items: [
        { href: '/visitas', label: 'Visitas', icon: '📋' },
        ...(user?.role === 'vendedor' ? [
          { href: '/clientes',     label: 'Clientes',    icon: '🏪' },
          { href: '/cartera',      label: 'Cartera',     icon: '💰' },
          { href: '/trazabilidad', label: 'Despacho',icon: '🚚' },
        ] : []),
        ...(user?.role !== 'entregas' ? [{ href: '/impulsos', label: 'Impulsos', icon: '⚡' }] : []),
        ...(user?.role === 'entregas' ? [{ href: '/trazabilidad', label: 'Despacho', icon: '🚚' }] : []),
        ...(user?.role === 'vendedor' ? [{ href: '/gastos', label: 'Gastos', icon: '🧾' }] : []),
      ]
    }] : []),
    ...(user?.role === 'impulsadora' ? [{
      items: [
        { href: '/impulsadora', label: 'Inicio',    icon: '⚡' },
        { href: '/impulsos', label: 'Mi semana', icon: '📌' },
        { href: '/impulsar', label: 'Impulsar',  icon: '🎯' },
        { href: '/gastos', label: 'Gastos', icon: '🧾' },
      ]
    }] : []),
  ]

  // ── Nav items móvil (drawer) ─────────────────────────────────────
  const navMovil: { href: string; label: string; icon: string }[] = [
    ...(user?.role !== 'impulsadora' ? [{ href: '/inicio', label: 'Inicio', icon: '🏠' }] : []),
    ...(isSuperAdmin ? [
      { href: '/empresas',  label: 'Empresas', icon: '🏢' },
      { href: '/monitor',   label: 'Control',  icon: '📡' },
      { href: '/precios',   label: 'Precios',  icon: '💰' },
      { href: '/code',      label: 'Code',     icon: '🧬' },
    ] : []),
    ...(isEmpresa || isSupervisor ? [
      { href: '/ingresos', label: 'Saldos', icon: '💵' },
      { href: '/egresos',  label: 'Egresos',  icon: '🛍️' },
      { href: '/empleados',     label: 'Activos',      icon: '👥' },
      { href: '/clientes',      label: 'Clientes',     icon: '🏪' },
      { href: '/cartera',       label: 'Cartera',      icon: '💰' },
      { href: '/recaudos',      label: 'Recaudos',     icon: '💳' },
      { href: '/rutas',         label: 'Visitas',      icon: '📋' },
      { href: '/impulsos',   label: 'Impulsos',     icon: '⚡' },
      { href: '/trazabilidad',  label: 'Bodega', icon: '🏭' },
    ] : []),
    ...(isBodega ? [
      ...empresasBodega,
    ] : []),
    ...(isEmpleado && user?.role !== 'impulsadora' ? [
      { href: '/visitas', label: 'Visitas', icon: '📋' },
      ...(user?.role === 'vendedor' ? [
        { href: '/clientes',     label: 'Clientes',    icon: '🏪' },
        { href: '/cartera',      label: 'Cartera',     icon: '💰' },
        { href: '/trazabilidad', label: 'Despacho',icon: '🚚' },
      ] : []),
      ...(user?.role !== 'entregas' ? [{ href: '/impulsos', label: 'Impulsos', icon: '⚡' }] : []),
      ...(user?.role === 'vendedor' ? [{ href: '/gastos', label: 'Gastos', icon: '🧾' }] : []),
    ] : []),
    ...(user?.role === 'impulsadora' ? [
      { href: '/impulsadora', label: 'Inicio',    icon: '⚡' },
      { href: '/impulsos', label: 'Mi semana', icon: '📌' },
      { href: '/impulsar', label: 'Impulsar',  icon: '🎯' },
      { href: '/gastos', label: 'Gastos', icon: '🧾' },
    ] : []),
  ]

  const navActivo  = navMovil.find(item => pathname === item.href)
  const iconoActivo = navActivo?.icon  || '⚡'
  const labelActivo = navActivo?.label || 'Inicio'

  return (
    <>
    <div id="bg-grad-base" aria-hidden="true" className="md:opacity-0" style={{position:'fixed',top:0,left:0,right:0,height:'100lvh',zIndex:-1,background:'linear-gradient(160deg, #060f34 0%, #0a1628 12%, #1a3060 30%, #1e3a6e 48%, #0d1f45 65%, #07103a 82%, #0a1848 100%)'}} />
    <div aria-hidden="true" className="md:opacity-0" style={{position:'fixed',top:0,left:0,right:0,height:'100lvh',zIndex:-1,background:'radial-gradient(ellipse at 10% 20%, rgba(37,99,235,0.40) 0%, transparent 38%), radial-gradient(ellipse at 85% 10%, rgba(5,12,52,0.55) 0%, transparent 35%), radial-gradient(ellipse at 60% 50%, rgba(59,130,246,0.28) 0%, transparent 42%), radial-gradient(ellipse at 5% 80%, rgba(5,12,52,0.45) 0%, transparent 30%), radial-gradient(ellipse at 90% 75%, rgba(29,78,216,0.32) 0%, transparent 40%), radial-gradient(ellipse at 45% 90%, rgba(5,12,52,0.38) 0%, transparent 28%), radial-gradient(ellipse at 75% 35%, rgba(96,165,250,0.14) 0%, transparent 35%)'}} />
    {/* Ciudad — solo desktop. hidden en móvil = display:none = NO descarga la imagen */}
    <div aria-hidden="true" className="hidden md:block" style={{position:'fixed',top:0,left:0,right:0,height:'100lvh',zIndex:-1,backgroundImage:"url('/bg-city.webp')",backgroundSize:'cover',backgroundPosition:'center'}} />
    <div aria-hidden="true" className="hidden md:block" style={{position:'fixed',top:0,left:0,right:0,height:'100lvh',zIndex:-1,background:'rgba(4,12,40,0.40)'}} />

    <div className="flex min-h-screen" style={{background:'transparent'}}>

      <NetworkBanner />

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="flex-col hidden md:flex flex-shrink-0 fixed top-0 left-0 h-screen z-10" style={{width: sidebarExpanded ? 224 : 0, transition:"none", overflowX:"hidden", overflowY: sidebarExpanded ? "auto" : "hidden", background:'rgba(8,10,30,0.82)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRight:'1px solid rgba(255,255,255,0.10)'}}>

        <div className="flex items-center px-4 h-14 border-b border-[#1c1c20] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs" style={{background:'linear-gradient(135deg,#2563eb,#1d4ed8)',boxShadow:'0 0 12px #2563eb40'}}>🗺️</div>
            <span className="text-white font-bold text-sm tracking-tight">Gestor</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div className="my-2 mx-1 flex items-center gap-2">
                  <div className="flex-1 h-px bg-[#1c1c20]" />
                  {sidebarExpanded && group.label && (
                    <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest px-1 whitespace-nowrap">{group.label}</span>
                  )}
                  <div className="flex-1 h-px bg-[#1c1c20]" />
                </div>
              )}
              {group.items
                .filter(item => user?.role === 'impulsadora' ? item.href !== '/inicio' : true)
                .map(item => {
                  const isActive = pathname === item.href
                  return (
                    <Link key={item.href} href={item.href} prefetch
                                            title={!sidebarExpanded ? item.label : ''}
                      className={`relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${!sidebarExpanded ? 'justify-center' : ''} ${isActive ? 'text-white' : 'text-white hover:bg-[#0f2540]'}`}
                      style={isActive ? {background:'#1e3a5f'} : {}}>
                      <span className="text-base flex-shrink-0">{item.icon}</span>
                      {sidebarExpanded && (
                        <>
                          <span className="truncate flex-1">{item.label}</span>
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                        </>
                      )}
                    </Link>
                  )
                })}
            </div>
          ))}
        </nav>

        <div className="flex-shrink-0 border-t border-[#1c1c20] p-2 space-y-0.5">
          {(isEmpresa || isSupervisor || isEmpleado) && (
            <button onClick={() => setAsistenteAbierto(true)}
              title={!sidebarExpanded ? 'TaXBot' : ''}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-[#18181b] transition-colors ${!sidebarExpanded ? 'justify-center' : ''}`}>
              <span className="relative flex-shrink-0"><RobotIcon size={18} /><span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-[#0f0f11]" /></span>
              {sidebarExpanded && <span className="truncate">TaXBot</span>}
            </button>
          )}
          <div className="relative">
            <button onClick={() => setMenuUsuario(m => !m)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#18181b] transition-colors ${!sidebarExpanded ? 'justify-center' : 'bg-[#18181b]'}`}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{background:'linear-gradient(135deg,#3b82f6,#1d4ed8)'}}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
              {sidebarExpanded && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[#e4e4e7] text-xs font-semibold truncate">{user?.name}</div>
                    <div className="text-zinc-400 text-[10px] capitalize">{user?.role}</div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                </>
              )}
            </button>
            {menuUsuario && (
              <div className={`absolute ${sidebarExpanded ? 'bottom-full left-0 right-0' : 'bottom-0 left-full ml-2 w-48'} mb-1 rounded-xl overflow-hidden shadow-2xl`} style={{background:'#0d0d14',border:'1px solid rgba(255,255,255,0.12)'}}>
                <div className="px-4 py-2.5 border-b border-[#27272a]">
                  <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                  <p className="text-zinc-400 text-[10px] capitalize">{user?.role}</p>
                </div>
                <Link href="/configuracion" onClick={() => setMenuUsuario(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#27272a] transition-colors">
                  <span>⚙️</span> Configuración
                </Link>
                <button onClick={() => fetch('/api/auth/invalidate-cache', { method: 'POST' }).finally(() => signOut({ redirect: false }).then(() => { sessionStorage.clear(); window.location.href = '/login' }))}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-[#27272a] transition-colors">
                  <span>🚪</span> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Notch toggle sidebar — centrado vertical */}
      <button
        className="hidden md:flex fixed top-1/2 -translate-y-1/2 z-20 items-center justify-center"
        onClick={() => setSidebarOpen(o => !o)}
        style={{left: sidebarOpen ? 224 : 0, width:20, height:80, background:'rgba(8,10,30,0.82)', borderRadius:'0 10px 10px 0', border:'1px solid rgba(59,130,246,0.25)', borderLeft:'none', cursor:'pointer', color:'#7aa2c8', fontSize:16, fontWeight:'bold', transition:'none'}}>
        {sidebarOpen ? '‹' : '›'}
      </button>

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col min-w-0 main-content">
        {bloqueado && (
          <div className="bg-red-900/80 border-b border-red-700 flex items-center justify-between px-4 h-10 flex-shrink-0 overflow-hidden">
            <span className="text-red-100 text-sm truncate">🔴 Cuenta suspendida</span>
            <a href="https://wa.me/573164349389?text=Hola, necesito reactivar mi cuenta de TuAgentX" target="_blank" rel="noopener noreferrer"
              className="ml-4 flex-shrink-0 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
              💬 Contactar
            </a>
          </div>
        )}
        {!bloqueado && !bannerCerrado && diasRestantes !== null && diasRestantes >= 1 && diasRestantes <= 7 && (() => {
          const d = diasRestantes
          const cfg = d === 1
            ? { bg: 'bg-red-900/80 border-red-700',         txt: '🔴 Tu plan vence MAÑANA',       cta: 'Renovar ahora' }
            : d <= 3
            ? { bg: 'bg-orange-900/70 border-orange-700',   txt: `⚠️ Tu plan vence en ${d} días`, cta: 'Renovar ahora' }
            : { bg: 'bg-emerald-900/60 border-emerald-700', txt: `📅 Tu plan vence en ${d} días`, cta: '¿Renovar?' }
          return (
            <div className={`${cfg.bg} border-b flex items-center justify-between px-4 h-10 flex-shrink-0 overflow-hidden`}>
              <span className="text-white text-sm truncate">{cfg.txt}</span>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <a href="https://wa.me/573164349389?text=Hola, quiero renovar mi plan de TuAgentX" target="_blank" rel="noopener noreferrer"
                  className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
                  💳 {cfg.cta}
                </a>
                <button onClick={() => setBannerCerrado(true)} className="text-white/60 hover:text-white text-sm leading-none">✕</button>
              </div>
            </div>
          )
        })()}

        <div className={`flex-1 overflow-x-clip px-2 pt-2 pb-24 md:px-4 md:pt-4 md:pb-6${bloqueado ? ' pointer-events-none opacity-50' : ''}`}>
          <div className="max-w-screen-xl mx-auto w-full space-y-6">
            <PermisosGuard role={user?.role}>
              <GpsContext.Provider value={{ setSincronizandoGps }}>
                {/* Dashboard — persiste entre rutas, se desmonta solo al cambiar usuario */}
                {authUser && (
                  <div key={`${authUser.id}_${authUser.loginAt ?? 0}`} style={{display: (pathname === '/inicio' || (pathname === '/impulsadora' && authUser?.role === 'impulsadora')) ? 'block' : 'none'}}>
                    {authUser?.role === 'vendedor'    && React.createElement(DashboardVendedor  as any, { key: authUser.id, user: authUser, onRegisterRefresh: (fn: () => void) => { dashboardRefreshRef.current = fn } })}
                    {authUser?.role === 'bodega'      && React.createElement(DashboardBodega    as any, { key: authUser.id, user: authUser })}
                    {authUser?.role === 'entregas'    && React.createElement(DashboardEntregas  as any, { key: authUser.id, user: authUser })}
                    {(authUser?.role === 'empresa' || authUser?.role === 'admin' || authUser?.role === 'supervisor' || authUser?.role === 'superadmin') && React.createElement(DashboardAdmin as any, { key: authUser.id, user: authUser, onRegisterRefresh: (fn: () => void) => { dashboardRefreshRef.current = fn } })}
                    {authUser?.role === 'impulsadora' && React.createElement(DashboardImpulsadora as any, { key: authUser.id })}
                  </div>
                )}
                {/* page.tsx — oculto en /inicio, visible en otras rutas */}
                <div style={{display: (pathname === '/inicio' || (pathname === '/impulsadora' && authUser?.role === 'impulsadora')) ? 'none' : 'block'}}>
                  {children}
                </div>
              </GpsContext.Provider>
            </PermisosGuard>
          </div>
        </div>
      </main>

      {/* ── MUESCA MÓVIL — overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[2998] md:hidden"
          style={{background:'rgba(5,12,52,0.35)'}}
          onClick={() => setDrawerOpen(false)} />
      )}

      {/* ── DRAWER — siempre en DOM, GPU translateY ── */}
      <div className="fixed bottom-0 left-0 right-0 z-[2999] md:hidden"
        style={{
          background:'rgba(30,36,58,0.99)',
          borderTop:'1px solid rgba(59,130,246,0.30)',
          borderRadius:'24px 24px 0 0',
          padding:'12px 16px 28px',
          transform: drawerOpen ? 'translateY(0)' : 'translateY(100%)',
          transition:'none',
        }}>

        {/* Handle */}
        <div style={{display:'flex',justifyContent:'center',marginBottom:14}}>
          <div style={{width:40,height:4,background:'rgba(59,130,246,0.4)',borderRadius:2}} />
        </div>

        {/* Grid 4 columnas — scroll vertical */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:10,maxHeight:'55vh',overflowY:'auto'}}>
          {navMovil.map(item => {
            const isAct = pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                prefetch
                onClick={() => setDrawerOpen(false)}
                style={{
                  display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                  padding:'10px 4px',borderRadius:14,textDecoration:'none',
                  background: isAct ? 'rgba(59,130,246,0.18)' : 'rgba(63,63,70,0.55)',
                  border:`1px solid ${isAct ? 'rgba(59,130,246,0.40)' : 'rgba(59,130,246,0.12)'}`,
                }}>
                <span style={{fontSize:20}}>{item.href === '/inicio' || item.href === '/impulsadora' ? '🏠' : item.icon}</span>
                <span style={{fontSize:12,color:isAct ? '#3b82f6' : '#ffffff',fontWeight:isAct ? 600 : 400}}>
                  {item.label}
                </span>
              </Link>
            )
          })}
          {/* OCULTO 2026-06-20: Recibo manual offline aún no funciona sin red
              (recarga de página pierde el formulario). Restaurar cuando la
              solución offline (Service Worker u otra) esté lista.
          <a href="/recibo-manual.html" target="_blank" rel="noopener noreferrer"
            style={{
              display:'flex',flexDirection:'column',alignItems:'center',gap:4,
              padding:'10px 4px',borderRadius:14,textDecoration:'none',
              background:'rgba(63,63,70,0.55)',
              border:'1px solid rgba(59,130,246,0.12)',
            }}>
            <span style={{fontSize:20}}>🖨️</span>
            <span style={{fontSize:12,color:'#ffffff',fontWeight:400}}>
              Recibo
            </span>
          </a>
          */}
        </div>

        {/* Divider */}
        <div style={{height:1,background:'rgba(59,130,246,0.12)',margin:'8px 0'}} />

        {/* Usuario — 60% nombre / 17px config / 17px power */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'rgba(39,42,60,0.70)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:12}}>
          <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#3b82f6,#1d4ed8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:700,flexShrink:0}}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div style={{flex:'0 0 58%',minWidth:0,overflow:'hidden'}}>
            <div style={{fontSize:14,fontWeight:600,color:'#f1f5f9',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{user?.name}</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.35)',textTransform:'capitalize'}}>{user?.role}</div>
          </div>
          <div style={{flex:1}} />
          <Link href="/configuracion" onClick={() => setDrawerOpen(false)}
            style={{width:32,height:32,borderRadius:8,background:'rgba(59,130,246,0.10)',border:'1px solid rgba(59,130,246,0.20)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:17,textDecoration:'none'}}>
            ⚙️
          </Link>
          <button onClick={() => fetch('/api/auth/invalidate-cache', { method: 'POST' }).finally(() => signOut({ redirect: false }).then(() => { sessionStorage.clear(); window.location.href = '/login' }))}
            style={{width:32,height:32,borderRadius:8,background:'rgba(239,68,68,0.10)',border:'1px solid rgba(239,68,68,0.30)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer'}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v9" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M7.5 6.5A8 8 0 1 0 16.5 6.5" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── MUESCA + BANDA — se oculta cuando drawer abierto ── */}
      {!drawerOpen && (
        <>
          {/* Banda full-width */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[2999] md:hidden"
            style={{
              height:16,
              background:'rgba(30,36,58,0.99)',
              borderTop:'1.5px solid rgba(59,130,246,0.30)',
            }}
          />
          {/* Notch — solo texto blanco */}
          <button
            className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[3000] md:hidden"
            onClick={() => setDrawerOpen(true)}
            style={{background:'none',border:'none',padding:0,cursor:'pointer'}}>
            <div style={{
              width:106, height:42,
              background:'rgba(30,36,58,0.99)',
              border:'1.5px solid rgba(59,130,246,0.35)',
              borderBottom:'none',
              borderRadius:'24px 24px 0 0',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <span style={{fontSize:11,fontWeight:800,color:'#fff',letterSpacing:'.1em',textTransform:'uppercase'}}>
                {sincronizandoGps ? 'GPS...' : labelActivo}
              </span>
            </div>
          </button>

          {/* Robot TaXBot — banda derecha, solo en dashboard */}
          {(isEmpresa || isSupervisor || isEmpleado) && pathname === '/inicio' && (
            <button
              className="fixed z-[3001] md:hidden robot-taxbot"
              onClick={() => setAsistenteAbierto(true)}
              style={{
                bottom: 0, right: 16,
                width: 52, height: 42,
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}>
              <div style={{
                width: 52, height: 42,
                background: 'rgba(30,36,58,0.99)',
                border: '1.5px solid rgba(59,130,246,0.35)',
                borderBottom: 'none',
                borderRadius: '18px 18px 0 0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Antena */}
                  <line x1="12" y1="2" x2="12" y2="5" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="12" cy="1.5" r="1" fill="#60a5fa"/>
                  {/* Cabeza */}
                  <rect x="4" y="5" width="16" height="11" rx="3" fill="#1e3a6e" stroke="#3b82f6" strokeWidth="1.2"/>
                  {/* Ojos */}
                  <circle cx="9" cy="10" r="2" fill="#60a5fa"/>
                  <circle cx="15" cy="10" r="2" fill="#60a5fa"/>
                  <circle cx="9.7" cy="9.3" r="0.7" fill="white"/>
                  <circle cx="15.7" cy="9.3" r="0.7" fill="white"/>
                  {/* Boca */}
                  <rect x="8.5" y="13" width="7" height="1.2" rx="0.6" fill="#60a5fa"/>
                  {/* Cuerpo */}
                  <rect x="7" y="16" width="10" height="6" rx="2" fill="#1e3a6e" stroke="#3b82f6" strokeWidth="1.2"/>
                  {/* Botón cuerpo */}
                  <circle cx="12" cy="19" r="1.2" fill="#60a5fa"/>
                  {/* Brazos */}
                  <rect x="3" y="17" width="4" height="2.5" rx="1.2" fill="#1e3a6e" stroke="#3b82f6" strokeWidth="1"/>
                  <rect x="17" y="17" width="4" height="2.5" rx="1.2" fill="#1e3a6e" stroke="#3b82f6" strokeWidth="1"/>
                </svg>
                {/* Dot verde online */}
                <span style={{position:'absolute',top:6,right:10,width:8,height:8,background:'#34d399',borderRadius:'50%',border:'2px solid rgba(30,36,58,0.99)',boxShadow:'0 0 4px #34d399'}}/>
              </div>
            </button>
          )}
        </>
      )}


      {/* Overlay navegación */}
      {navigating && (
        <div style={{
          position:'fixed',inset:0,zIndex:9999,
          background:'rgba(8,10,30,0.88)',
          backdropFilter:'blur(3px)',
          display:'flex',alignItems:'center',justifyContent:'center'
        }}>
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <circle cx="26" cy="26" r="20" stroke="rgba(255,255,255,0.06)" strokeWidth="3"/>
            <circle cx="26" cy="26" r="20" stroke="#3b82f6" strokeWidth="3"
              strokeLinecap="round" strokeDasharray="32 94"
              style={{transformOrigin:'26px 26px', animation:'spin 1.1s linear infinite'}}/>
            <circle cx="26" cy="26" r="13" stroke="#6366f1" strokeWidth="3"
              strokeLinecap="round" strokeDasharray="18 64"
              style={{transformOrigin:'26px 26px', animation:'spinR 1.7s linear infinite'}}/>
          </svg>
          <style>{`@keyframes spinR { to { transform: rotate(-360deg) } }`}</style>
        </div>
      )}
      {(isEmpresa || isSupervisor || isEmpleado) && <AsistenteGestor onClose={() => setAsistenteAbierto(false)} rol={user?.role} visible={asistenteAbierto} />}

    </div>
    </>
  )
}
