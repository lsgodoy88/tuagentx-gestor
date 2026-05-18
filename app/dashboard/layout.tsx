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
import { useEffect, useState, useRef } from 'react'
import { GpsContext } from '@/lib/gps-context'
import Link from 'next/link'
import PermisosGuard from '@/components/PermisosGuard'
import { NetworkBanner } from '@/components/NetworkBanner'


function RouteCanvasMini() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let animId: number
    const setSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    const resize = setSize
    resize()
    window.addEventListener('resize', resize)
    const N = 18
    const nodes = Array.from({length: N}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }))
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx*dx + dy*dy)
          if (dist < 140) {
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(59,130,246,${(1 - dist/140) * 0.15})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
        }
      }
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(59,130,246,0.2)'
        ctx.fill()
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} style={{display:"block",width:"100%",height:"100%"}} />
}


const FRASES_ROL: Record<string, {icon:string, lineas:string[]}[]> = {
  vendedor: [
    { icon: '🌟', lineas: ['Hoy es tu', 'día, sal', 'y vende'] },
    { icon: '🤝', lineas: ['Cada cliente', 'es una', 'oportunidad'] },
    { icon: '🎯', lineas: ['Tu meta', 'está cerca,', '¡vamos!'] },
    { icon: '🏆', lineas: ['El mejor', 'vendedor', 'eres tú'] },
  ],
  impulsadora: [
    { icon: '🗺️', lineas: ['Tu ruta', 'de hoy', 'te espera'] },
    { icon: '🚀', lineas: ['Cada visita', 'suma,', '¡adelante!'] },
    { icon: '⚡', lineas: ['Tú mueves', 'el negocio', 'hoy'] },
    { icon: '💪', lineas: ['Constancia', 'es tu', 'superpoder'] },
  ],
  bodega: [
    { icon: '📦', lineas: ['Cada orden', 'bien hecha', 'cuenta'] },
    { icon: '🏭', lineas: ['Tu trabajo', 'mueve la', 'empresa'] },
    { icon: '⚡', lineas: ['Precisión', 'y rapidez,', '¡tú puedes!'] },
    { icon: '🌟', lineas: ['Hoy despacha', 'con', 'orgullo'] },
  ],
  entregas: [
    { icon: '🚚', lineas: ['El cliente', 'espera,', 'tú llegas'] },
    { icon: '🗺️', lineas: ['Tu ruta', 'es tu', 'misión hoy'] },
    { icon: '🤝', lineas: ['Cada entrega', 'es una', 'promesa'] },
    { icon: '🏆', lineas: ['Puntual,', 'confiable,', 'imparable'] },
  ],
  default: [
    { icon: '🌟', lineas: ['Tu visión', 'mueve', 'el equipo'] },
    { icon: '💡', lineas: ['Hoy lideras', 'con', 'propósito'] },
    { icon: '🚀', lineas: ['Grandes', 'resultados', 'te esperan'] },
    { icon: '🏆', lineas: ['Tu equipo', 'necesita', 'lo mejor'] },
  ],
}
const FRASES = FRASES_ROL
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const sidebarExpanded = !collapsed || hovered
  const [menuMovil, setMenuMovil] = useState(false)
  const [fraseIdx, setFraseIdx] = useState(0)
  const [asistenteAbierto, setAsistenteAbierto] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null)
  const [bannerCerrado, setBannerCerrado] = useState(false)
  const [menuUsuario, setMenuUsuario] = useState(false)
  const [sincronizandoGps, setSincronizandoGps] = useState(false)
  const user = session?.user as any

  useEffect(() => {
    if (!user) return
    const role = user.role as string
    const necesitaNotif = ['empresa', 'supervisor', 'vendedor', 'entregas', 'impulsadora'].includes(role)
    const necesitaGps = ['vendedor', 'entregas', 'impulsadora'].includes(role)

    async function pedirPermisos() {
      // GPS
      if (necesitaGps && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => {}, // éxito — permiso concedido
          () => {}, // error — usuario rechazó
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        )
      }
      // Notificaciones push
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
          await fetch('/api/push/suscribir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub.toJSON()),
          })
        } catch(e) { console.log('Push no disponible:', e) }
      }
    }
    pedirPermisos()
  }, [user])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (!menuMovil) return
    const t = setInterval(() => setFraseIdx(i => (i + 1) % 4), 4000)
    return () => clearInterval(t)
  }, [menuMovil])

  useEffect(() => {
    if (!user || user.role === 'superadmin') return
    // Cachear en sessionStorage — no cambia durante la sesión
    const cacheKey = 'txa_empresa_estado_' + (user.empresaId || user.id)
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const d = JSON.parse(cached)
        if (d.activa === false) setBloqueado(true)
        if (typeof d.diasRestantes === 'number') setDiasRestantes(d.diasRestantes)
        return // no hacer fetch si ya tenemos el estado
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



  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background:"transparent"}}>
        <div className="text-zinc-200">Cargando...</div>
      </div>
    )
  }

  const isSuperAdmin = user?.role === 'superadmin'

  const isEmpresa = user?.role === 'empresa'
  const isSupervisor = user?.role === 'supervisor'
  const isEmpleado = ['vendedor', 'entregas'].includes(user?.role)
  const isBodega = user?.role === 'bodega'

  const navGroups = [
    {
      items: [
        { href: '/dashboard', label: 'Inicio', icon: '⚡' },
        ...(isSuperAdmin ? [
          { href: '/dashboard/empresas', label: 'Empresas', icon: '🏢' },
          { href: '/dashboard/monitor', label: 'Control', icon: '📡' },
          { href: '/dashboard/precios', label: 'Precios', icon: '💰' },
          { href: '/dashboard/code', label: 'Code', icon: '🧬' },
        ] : []),
      ]
    },
    ...(isEmpresa || isSupervisor ? [{
      label: 'Operaciones',
      items: [
        { href: '/dashboard/empleados', label: 'Activos', icon: '👥' },
        { href: '/dashboard/clientes', label: 'Clientes', icon: '🏪' },
        { href: '/dashboard/cartera', label: 'Cartera', icon: '💰' },
        { href: '/dashboard/recaudos', label: 'Recaudos', icon: '💳' },
      ]
    }, {
      label: 'Visitas',
      items: [
        { href: '/dashboard/rutas', label: 'Visitas', icon: '📋' },
        { href: '/dashboard/rutas-fijas', label: 'Impulsos', icon: '⚡' },

        { href: '/dashboard/trazabilidad', label: 'Trazabilidad', icon: '📊' },
      ]
    }, {
      label: 'Análisis',
      items: [
        { href: '/dashboard/reportes', label: 'Reportes', icon: '📈' },
      ]
    }] : []),
    ...(isBodega ? [{
      items: [
        { href: '/dashboard/ordenes', label: 'Órdenes', icon: '📦' },
        { href: '/dashboard/inventario', label: 'Inventario', icon: '🏭' },
      ]
    }] : []),
    ...(isEmpleado && user?.role !== 'impulsadora' ? [{
      items: [
        { href: '/dashboard/visitas', label: 'Visitas', icon: '📋' },
        ...(user?.role === 'vendedor' ? [
          { href: '/dashboard/clientes', label: 'Clientes', icon: '🏪' },
          { href: '/dashboard/cartera', label: 'Cartera', icon: '💰' },
          { href: '/dashboard/trazabilidad', label: 'Trazabilidad', icon: '📊' },
        ] : []),
        ...(user?.role !== 'entregas' ? [{ href: '/dashboard/rutas-fijas', label: 'Mis impulsos', icon: '⚡' }] : []),
        ...(user?.role === 'entregas' ? [{ href: '/dashboard/trazabilidad', label: 'Trazabilidad', icon: '📊' }] : []),
      ]
    }] : []),
    ...(user?.role === 'impulsadora' ? [{
      items: [
        { href: '/dashboard/impulsadora', label: 'Inicio', icon: '⚡' },
        { href: '/dashboard/rutas-fijas', label: 'Mi semana', icon: '📌' },
      ]
    }] : []),
  ]
  const navItems = [
    { href: '/dashboard', label: 'Inicio', icon: '⚡' },
    ...(isSuperAdmin ? [
      { href: '/dashboard/empresas', label: 'Empresas', icon: '🏢' },
      { href: '/dashboard/monitor', label: 'Control', icon: '📡' },
      { href: '/dashboard/precios', label: 'Precios', icon: '💰' },
      { href: '/dashboard/code', label: 'Code', icon: '🧬' },
    ] : []),
    ...(isEmpresa || isSupervisor ? [
      { href: '/dashboard/empleados', label: 'Activos', icon: '👥' },
      { href: '/dashboard/clientes', label: 'Clientes', icon: '🏪' },
      { href: '/dashboard/cartera', label: 'Cartera', icon: '💰' },
      { href: '/dashboard/recaudos', label: 'Recaudos', icon: '💳' },
      { href: '/dashboard/rutas', label: 'Rutas', icon: '🗺️' },
      { href: '/dashboard/rutas-fijas', label: 'Impulsos', icon: '⚡' },
      { href: '/dashboard/visitas-admin', label: 'Visitas', icon: '📋' },
      { href: '/dashboard/trazabilidad', label: 'Trazabilidad', icon: '📊' },
      { href: '/dashboard/reportes', label: 'Reportes', icon: '📈' },
    ] : []),
    ...(isBodega ? [
      { href: '/dashboard/ordenes', label: 'Órdenes', icon: '📦' },
      { href: '/dashboard/inventario', label: 'Inventario', icon: '🏭' },
    ] : []),
    ...(isEmpleado && user?.role !== 'impulsadora' ? [
      { href: '/dashboard/visitas', label: 'Visitas', icon: '📋' },
      ...(user?.role === 'vendedor' ? [
        { href: '/dashboard/clientes', label: 'Clientes', icon: '🏪' },
        { href: '/dashboard/cartera', label: 'Cartera', icon: '💰' },
      ] : []),
      ...(user?.role !== 'entregas' ? [{ href: '/dashboard/rutas-fijas', label: 'Mis impulsos', icon: '⚡ ' }] : []),
      ...(user?.role === 'entregas' ? [{ href: '/dashboard/trazabilidad', label: 'Trazabilidad', icon: '📊' }] : []),
    ] : []),
    ...(user?.role === 'impulsadora' ? [
      { href: '/dashboard/impulsadora', label: 'Inicio', icon: '⚡' },
      { href: '/dashboard/rutas-fijas', label: 'Mi semana', icon: '📌' },
    ] : []),
  ]
  const iconoActivo = navItems.find(item => pathname === item.href)?.icon || '⚡'

  return (
    <>
    {/* Capa de fondo fija */}
    {/* Fondo fijo — 100lvh no se redimensiona con browser bar en mobile */}
    <div aria-hidden="true" style={{
      position:'fixed', top:0, left:0, right:0,
      height:'100lvh', zIndex:-1,
      backgroundImage:"url('/bg-city.webp')",
      backgroundSize:'cover', backgroundPosition:'center',
    }} />
    <div aria-hidden="true" style={{
      position:'fixed', top:0, left:0, right:0,
      height:'100lvh', zIndex:-1,
      background:'rgba(2,2,10,0.55)',
    }} />
    {/* Círculos de color estáticos — profundidad para el glass */}


    <div className="min-h-screen flex" style={{background:'transparent'}}>
      {/* Drawer móvil — estilo B */}
      {menuMovil && (
        <div className="fixed inset-0 z-[2000] md:hidden">
          <div className="absolute top-0 bottom-0 right-0" style={{left:"224px", background:"rgba(4,6,20,0.88)"}} onClick={() => setMenuMovil(false)}>
            {/* Mensajes de ánimo — salen del sidebar hacia la derecha */}
            <div className="absolute overflow-hidden" style={{left:0, right:0, top:'18%'}} onClick={e => e.stopPropagation()}>
              <div key={fraseIdx} className="px-5 select-none pointer-events-none" style={{
                animation: 'slideInFromLeft 0.5s cubic-bezier(0.22,1,0.36,1) forwards',
              }}>
                <div className="text-4xl mb-3">{(FRASES_ROL[user?.role as string] || FRASES_ROL.default)[fraseIdx].icon}</div>
                <p className="text-blue-300 text-sm font-medium mb-2">
                  Hola {(user?.name || '').split(' ')[0]},
                </p>
                {(FRASES_ROL[user?.role as string] || FRASES_ROL.default)[fraseIdx].lineas.map((l, i) => (
                  <p key={i} className="text-white font-bold text-2xl leading-tight">{l}</p>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute left-0 top-0 bottom-0 w-56 border-r flex flex-col z-[2001] shadow-2xl" style={{background:"#0a0a1e",borderColor:"rgba(255,255,255,0.08)"}}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-[#1c1c20]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style={{background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 0 12px #2563eb40'}}>🗺️</div>
                <span className="text-white font-bold text-sm tracking-tight">Gestor</span>
              </div>
              <button onClick={() => setMenuMovil(false)} className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-[#18181b] transition-colors">✕</button>
            </div>

            {/* Nav con grupos */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" style={{scrollbarWidth:"none",msOverflowStyle:"none"}}>
              {navGroups.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && (
                    <div className="my-2 mx-1 flex items-center gap-2">
                      <div className="flex-1 h-px bg-[#1c1c20]" />
                      {group.label && <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest px-1 whitespace-nowrap">{group.label}</span>}
                      <div className="flex-1 h-px bg-[#1c1c20]" />
                    </div>
                  )}
                  {group.items
                    .filter(item => user?.role === 'impulsadora' ? item.href !== '/dashboard' : true)
                    .map(item => {
                      const isActive = pathname === item.href
                      return (
                        <Link key={item.href} href={item.href} onClick={() => setMenuMovil(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            isActive ? 'text-white border border-[#2563eb40]' : 'text-zinc-300 hover:text-white hover:bg-[#18181b]'
                          }`}
                          style={isActive ? { background: '#1e3a5f', boxShadow: '0 1px 8px #2563eb20' } : {}}>
                          <span className="text-base flex-shrink-0">{item.icon}</span>
                          <span className="flex-1">{item.label}</span>
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                        </Link>
                      )
                    })}
                </div>
              ))}
            </nav>

            {/* Footer */}
            <div className="border-t border-[#1c1c20] p-2 space-y-0.5">
              {isEmpresa && (
                <button onClick={() => { setMenuMovil(false); setAsistenteAbierto(true) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:text-white hover:bg-[#18181b] transition-colors">
                  <span className="relative text-base">🤖<span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-[#0f0f11]" /></span>
                  TuAgentX
                </button>
              )}
              <button onClick={() => setMenuUsuario(m => !m)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#18181b] transition-colors bg-[#18181b]">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 relative" style={{background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'}}>
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[#e4e4e7] text-sm font-semibold truncate">{user?.name}</div>
                  <div className="text-zinc-400 text-xs capitalize">{user?.role}</div>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              </button>
              {menuUsuario && (
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
                  <Link href="/dashboard/configuracion" onClick={() => { setMenuMovil(false); setMenuUsuario(false) }}
                    className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#a1a1aa] hover:text-white hover:bg-[#27272a] transition-colors">
                    <span>⚙️</span> Configuración
                  </Link>
                  <button onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-[#27272a] transition-colors">
                    <span>🚪</span> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <NetworkBanner />
      {/* Boton flotante movil */}
      <div className={`fixed bottom-6 left-4 z-[990] md:hidden ${menuMovil ? "hidden" : ""}`}>
        <button onClick={() => setMenuMovil(true)}
          className="flex flex-col items-center gap-1 bg-black/50 backdrop-blur-sm border border-blue-500/40 rounded-2xl px-3 py-2.5 shadow-2xl">
          <span className={"text-2xl" + (sincronizandoGps ? " animate-pulse" : "")}>{sincronizandoGps ? "📍" : iconoActivo}</span>
        </button>
      </div>
      <aside
        className="w-64 flex-col h-full hidden md:flex flex-shrink-0"
        style={{background:"#0a0a1e",borderRight:"1px solid rgba(255,255,255,0.08)"}}>

        {/* Header */}
        <div className="flex items-center px-4 h-14 border-b border-[#1c1c20] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs" style={{background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 0 12px #2563eb40'}}>🗺️</div>
            <span className="text-white font-bold text-sm tracking-tight">Gestor</span>
          </div>
        </div>

        {/* Nav con grupos */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {/* Separador entre grupos */}
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
                .filter(item => user?.role === 'impulsadora' ? item.href !== '/dashboard' : true)
                .map(item => {
                  const isActive = pathname === item.href
                  return (
                    <Link key={item.href} href={item.href}
                      title={!sidebarExpanded ? item.label : ''}
                      className={`relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                        !sidebarExpanded ? 'justify-center' : ''
                      } ${isActive
                        ? 'text-white border border-[#2563eb40]'
                        : 'text-zinc-300 hover:text-white hover:bg-[#18181b]'
                      }`}
                      style={isActive ? { background: '#1e3a5f', boxShadow: '0 1px 8px #2563eb20' } : {}}>
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

        {/* Footer sticky */}
        <div className="flex-shrink-0 border-t border-[#1c1c20] p-2 space-y-0.5">
          {/* TuAgentX */}
          {isEmpresa && (
            <button onClick={() => setAsistenteAbierto(true)}
              title={!sidebarExpanded ? 'TuAgentX' : ''}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-[#18181b] transition-colors ${!sidebarExpanded ? 'justify-center' : ''}`}>
              <span className="relative flex-shrink-0">
                🤖
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-[#0f0f11]" />
              </span>
              {sidebarExpanded && <span className="truncate">TuAgentX</span>}
            </button>
          )}

          {/* Avatar usuario */}
          <div className="relative">
            <button onClick={() => setMenuUsuario(m => !m)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#18181b] transition-colors ${!sidebarExpanded ? 'justify-center' : 'bg-[#18181b]'}`}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 relative" style={{background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'}}>
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
              <div className={`absolute ${sidebarExpanded ? 'bottom-full left-0 right-0' : 'bottom-0 left-full ml-2 w-48'} mb-1 bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden shadow-2xl`}>
                <div className="px-4 py-2.5 border-b border-[#27272a]">
                  <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                  <p className="text-zinc-400 text-[10px] capitalize">{user?.role}</p>
                </div>
                <Link href="/dashboard/configuracion" onClick={() => setMenuUsuario(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#27272a] transition-colors">
                  <span>⚙️</span> Configuración
                </Link>
                <button onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-[#27272a] transition-colors">
                  <span>🚪</span> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 w-0">
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

        <div className={`flex-1 overflow-x-hidden p-4 md:p-6 pb-20 md:pb-6${bloqueado ? ' pointer-events-none opacity-50' : ''}`}>
          <div className="max-w-screen-xl mx-auto w-full space-y-6">
            <PermisosGuard role={user?.role}><GpsContext.Provider value={{ setSincronizandoGps }}>{children}</GpsContext.Provider></PermisosGuard>
          </div>
        </div>
      </main>
    {asistenteAbierto && <AsistenteGestor onClose={() => setAsistenteAbierto(false)} />}

    {/* Overlay configuración inicial de equipo */}
        </div>
    </>
  )
}
