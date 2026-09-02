'use client'
import AlertasNotch from '@/components/AlertasNotch'
import AlertasSidebarBadge from '@/components/AlertasSidebarBadge'
import React from 'react'
import AsistenteGestor from '@/components/AsistenteGestor'
import RobotIcon from '@/components/RobotIcon'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import TuAgentXOverlay from '@/components/TuAgentXOverlay'
import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { GpsContext } from '@/lib/gps-context'
import Link from 'next/link'
import { checkPermiso } from '@/lib/permisos'
import PermisosGuard from '@/components/PermisosGuard'
import { NetworkBanner } from '@/components/NetworkBanner'
import { clearAllCache } from '@/lib/offlineCache'

// ── Dashboards persistidos en layout ─────────────────────────────────────────
const DashboardVendedor  = dynamic(() => import('./inicio/_components/DashboardVendedor'),  { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardAdmin     = dynamic(() => import('./inicio/_components/DashboardAdmin'),     { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardBodega    = dynamic(() => import('./inicio/_components/DashboardBodega'),    { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardEntregas      = dynamic(() => import('./inicio/_components/DashboardEntregas'),      { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })
const DashboardImpulsadora   = dynamic(() => import('./inicio/_components/DashboardImpulsadora'),   { ssr: false, loading: () => <div className="animate-pulse space-y-3 p-4"><div className="h-24 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/><div className="h-32 bg-white/5 rounded-2xl"/></div> })




function BillingBanner({ estado, count, setCount, onClose, loadingPago, onPagar }: {
  estado: 'pendiente' | 'mora'
  count: number
  setCount: (n: number) => void
  onClose: () => void
  loadingPago: boolean
  onPagar: () => void
}) {
  const isMora = estado === 'mora'
  const CIRCUM = 100.53
  const offset = CIRCUM * (1 - count / 7)
  React.useEffect(() => {
    if (count <= 0) { onClose(); return }
    const t = setTimeout(() => setCount(count - 1), 1000)
    return () => clearTimeout(t)
  }, [count])

  const ringColor = isMora ? '#ef4444' : '#d97706'
  const ringBg = isMora ? '#3a1010' : '#3a2e0a'
  const btnBg = isMora ? '#7f1d1d' : '#92400e'
  const toastBg = isMora ? 'rgba(26,15,15,0.97)' : 'rgba(28,26,15,0.97)'
  const toastBorder = isMora ? '#7f1d1d' : '#92400e'
  const subColor = isMora ? '#f87171' : '#d97706'
  const title = isMora ? 'Tu pago está en mora' : 'Pago pendiente'
  const sub = isMora ? 'Te invitamos a pagar hoy' : 'Hasta el 5 de cada mes'

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const posStyle = isMobile
    ? { bottom:24, left:16, right:16, borderRadius:18, width:'auto' }
    : { top:24, right:24, width:320, borderRadius:16 }
  const btnStyle = isMobile
    ? { flexShrink:0,width:36,height:36,borderRadius:'50%',background:btnBg,border:'none',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }
    : { flexShrink:0,padding:'7px 14px',borderRadius:10,background:btnBg,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,color:'#fff',whiteSpace:'nowrap' as const }

  return (
    <div style={{
      position:'fixed', zIndex:9999,
      background:toastBg, border:`0.5px solid ${toastBorder}`,
      padding:'14px 16px', display:'flex', alignItems:'center', gap:12,
      boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
      transition:'opacity .4s', opacity: count === 0 ? 0 : 1,
      ...posStyle,
    }}>
      <div style={{width:40,height:40,flexShrink:0,position:'relative'}}>
        <svg width="40" height="40" viewBox="0 0 40 40" style={{transform:'rotate(-90deg)'}}>
          <circle cx="20" cy="20" r="16" fill="none" stroke={ringBg} strokeWidth="3"/>
          <circle cx="20" cy="20" r="16" fill="none" stroke={ringColor} strokeWidth="3"
            strokeDasharray="100.53" strokeDashoffset={offset} strokeLinecap="round"/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:500,color:ringColor}}>{count}</div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:'#fff',fontSize:13,fontWeight:500,lineHeight:1.3}}>{title}</div>
        <div style={{fontSize:11,marginTop:2,color:subColor}}>{sub}</div>
      </div>
      <button onClick={onPagar} disabled={loadingPago} aria-label="Pagar" style={{...btnStyle, opacity:loadingPago?0.5:1}}>
        {isMobile ? '💳' : '💳 Pagar'}
      </button>
    </div>
  )
}

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

  // Auto-colapsar sidebar según ancho de ventana (< 70% de 1280px ref = 896px)
  useEffect(() => {
    const THRESHOLD = 0.70
    const check = () => {
      const ratio = window.innerWidth / window.screen.width
      setSidebarOpen(ratio >= THRESHOLD)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [moduloAbierto, setModuloAbierto] = useState(false)

  useEffect(() => {
    const open  = () => setModuloAbierto(true)
    const close = () => setModuloAbierto(false)
    window.addEventListener('module:open', open)
    window.addEventListener('module:close', close)
    return () => {
      window.removeEventListener('module:open', open)
      window.removeEventListener('module:close', close)
    }
  }, [])
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [asistenteAbierto, setAsistenteAbierto] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [diasRestantes, setDiasRestantes] = useState<number | null>(null)
  const [bannerCerrado, setBannerCerrado] = useState(() => {
    if (typeof window === 'undefined') return false
    const hoy = new Date().toISOString().split('T')[0]
    return localStorage.getItem(`banner-vence-${hoy}`) === '1'
  })
  const [loadingRenovar, setLoadingRenovar] = useState(false)
  const [menuUsuario, setMenuUsuario] = useState(false)
  const [billingEstado, setBillingEstado] = useState<'al_dia'|'pendiente'|'mora'|'sin_plan'|null>(null)
  const [bannerVisible, setBannerVisible] = useState(false)
  const [bannerCount, setBannerCount] = useState(7)
  const [loadingPago, setLoadingPago] = useState(false)
  const [sincronizandoGps, setSincronizandoGps] = useState(false)
  const user = session?.user as any
  const authUser = status === 'authenticated' ? user : null

    useEffect(() => {
    if (!user) return
    const role = user.role as string
    const necesitaNotif = ['empresa', 'supervisor', 'vendedor', 'entregas', 'impulsadora', 'bodega'].includes(role)
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
          // Si la suscripción existente usa endpoint legacy (fcm/send), descartarla
          if (existing?.endpoint?.includes('/fcm/send/')) {
            await existing.unsubscribe()
          }
          const validSub = existing?.endpoint?.includes('/fcm/send/') ? null : existing
          const sub = validSub || await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'BLXWmGYFrBMHAAOLKh44MWtEK5qYgfR0-pDbOjLbX1gq5h79wr9RtX6zFQmKvp3oaRzsuzWopssq8J_6AJHpFCg'
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
    // Banner de estado billing
    fetch('/api/plan-empresa')
      .then(r => r.json())
      .then(d => {
        if (d.billingEstado) {
          setBillingEstado(d.billingEstado)
          if (d.billingEstado === 'pendiente' || d.billingEstado === 'mora') setBannerVisible(true)
        }
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
        ...(isEmpresa || checkPermiso(session, 'verSaldos')    ? [{ href: '/ingresos',  label: 'Saldos',    icon: '💵' }] : []),
        ...(isEmpresa || checkPermiso(session, 'verEgresos')   ? [{ href: '/egresos',   label: 'Egresos',   icon: '🛍️' }] : []),
        ...(isEmpresa || checkPermiso(session, 'verEmpleados') ? [{ href: '/empleados', label: 'Activos',   icon: '👥' }] : []),
        ...(isEmpresa || checkPermiso(session, 'verClientes')  ? [{ href: '/clientes',  label: 'Clientes',  icon: '🏪' }] : []),
        ...(isEmpresa || checkPermiso(session, 'verCartera')   ? [{ href: '/cartera',   label: 'Cartera',   icon: '💰' }] : []),
        ...(isEmpresa || checkPermiso(session, 'verRecaudos')  ? [{ href: '/recaudos',  label: 'Recaudos',  icon: '💳' }] : []),
      ]
    }, {
      label: 'Visitas',
      items: [
        ...(isEmpresa || checkPermiso(session, 'verVisitas')  ? [{ href: '/rutas',        label: 'Visitas', icon: '📋' }] : []),
        ...(isEmpresa || checkPermiso(session, 'verImpulsos') ? [{ href: '/impulsos',      label: 'Impulsos', icon: '⚡' }] : []),
        ...(isEmpresa || checkPermiso(session, 'verBodega')   ? [{ href: '/trazabilidad', label: 'Bodega',  icon: '🏭' }] : []),
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
        ...(user?.role === 'entregas' ? [{ href: '/rutas-entregas', label: 'Entregas', icon: '🚚' }] : []),
        { href: '/visitas', label: 'Visitas', icon: '📋' },
        ...(user?.role === 'vendedor' ? [
          { href: '/clientes',     label: 'Clientes',    icon: '🏪' },
          { href: '/cartera',      label: 'Cartera',     icon: '💰' },
          { href: '/trazabilidad', label: 'Despacho',icon: '🚚' },
        ] : []),
        ...(user?.role !== 'entregas' ? [{ href: '/impulsos', label: 'Impulsos', icon: '⚡' }] : []),
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
      ...(isEmpresa || checkPermiso(session, 'verSaldos')    ? [{ href: '/ingresos',      label: 'Saldos',    icon: '💵' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verEgresos')   ? [{ href: '/egresos',       label: 'Egresos',   icon: '🛍️' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verEmpleados') ? [{ href: '/empleados',     label: 'Activos',   icon: '👥' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verClientes')  ? [{ href: '/clientes',      label: 'Clientes',  icon: '🏪' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verCartera')   ? [{ href: '/cartera',       label: 'Cartera',   icon: '💰' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verRecaudos')  ? [{ href: '/recaudos',      label: 'Recaudos',  icon: '💳' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verVisitas')   ? [{ href: '/rutas',         label: 'Visitas',   icon: '📋' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verImpulsos')  ? [{ href: '/impulsos',      label: 'Impulsos',  icon: '⚡' }] : []),
      ...(isEmpresa || checkPermiso(session, 'verBodega')    ? [{ href: '/trazabilidad',  label: 'Bodega',    icon: '🏭' }] : []),
    ] : []),
    ...(isBodega ? [
      ...empresasBodega,
    ] : []),
    ...(isEmpleado && user?.role !== 'impulsadora' ? [
      ...(user?.role === 'entregas' ? [{ href: '/rutas-entregas', label: 'Entregas', icon: '🚚' }] : []),
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
      <aside className="flex-col hidden md:flex flex-shrink-0 fixed top-0 left-0 h-screen z-10" style={{width: sidebarExpanded ? 224 : 56, transition:"none", overflowX:"hidden", overflowY:"auto", background:'rgba(8,10,30,0.82)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRight:'1px solid rgba(255,255,255,0.10)'}}>

        <div className="flex items-center justify-between px-4 h-14 border-b border-[#1c1c20] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs" style={{background:'linear-gradient(135deg,#2563eb,#1d4ed8)',boxShadow:'0 0 12px #2563eb40'}}>🗺️</div>
            <span className="text-white font-bold text-sm tracking-tight">Gestor</span>
          </div>
          {(isEmpresa || isSupervisor) && <AlertasSidebarBadge />}
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
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Ocultar' : 'Expandir'}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-[#0f2540] transition-colors ${!sidebarOpen ? 'justify-center' : ''}`}>
            <span style={{fontSize:16, lineHeight:1}}>{sidebarOpen ? '«' : '»'}</span>
            {sidebarOpen && <span className="truncate">Ocultar</span>}
          </button>

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
                <button onClick={() => (async () => {
                    try {
                      const reg = await navigator.serviceWorker?.getRegistration()
                      const sub = await reg?.pushManager?.getSubscription()
                      if (sub) await fetch('/api/push/desuscribir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
                    } catch {}
                    await fetch('/api/auth/invalidate-cache', { method: 'POST' }).catch(() => {})
                    await signOut({ redirect: false })
                    sessionStorage.clear()
                    window.location.href = '/login'
                  })()}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-[#27272a] transition-colors">
                  <span>🚪</span> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>

      </aside>

      

      {/* ── MAIN ── */}
      <main className={`flex-1 flex flex-col min-w-0 ${sidebarExpanded ? "md:ml-[224px]" : "md:ml-[56px]"}`}>
        {bloqueado && (
          <div className="bg-red-900/80 border-b border-red-700 flex items-center justify-between px-4 h-10 flex-shrink-0 overflow-hidden">
            <span className="text-red-100 text-sm truncate">🔴 Cuenta suspendida</span>
            <a href="https://wa.me/573164349389?text=Hola, necesito reactivar mi cuenta de TuAgentX" target="_blank" rel="noopener noreferrer"
              className="ml-4 flex-shrink-0 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
              💬 Contactar
            </a>
          </div>
        )}
        {!bloqueado && !bannerCerrado && user?.role === 'empresa' && diasRestantes === 1 && (() => {
          // Solo rol empresa, solo el último día del mes (diasRestantes=1)
          async function handleRenovar() {
            setLoadingRenovar(true)
            try {
              const gen = await fetch('/api/plan-empresa/generar', { method: 'POST' })
              const gd = await gen.json()
              if (!gd.ok) return
              const monto = gd.deudaTotal > 0 ? gd.deudaTotal : gd.monto
              if (!monto) return
              const res = await fetch('/api/pagos/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto }) })
              const d = await res.json()
              if (d.linkPago) window.open(d.linkPago, '_blank', 'noopener,noreferrer')
            } catch {}
            finally { setLoadingRenovar(false) }
          }
          return (
            <div className="bg-emerald-900/60 border-b border-emerald-700 flex items-center justify-between px-4 h-10 flex-shrink-0 overflow-hidden">
              <span className="text-white text-sm truncate">📅 Tu plan vence hoy — recuerda renovar</span>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <button onClick={handleRenovar} disabled={loadingRenovar}
                  className="bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">
                  {loadingRenovar ? '...' : '💳 ¿Renovar?'}
                </button>
                <button onClick={() => {
                  const hoy = new Date().toISOString().split('T')[0]
                  localStorage.setItem(`banner-vence-${hoy}`, '1')
                  setBannerCerrado(true)
                }} className="text-white/60 hover:text-white text-sm leading-none">✕</button>
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
          <button onClick={() => (async () => {
                    try {
                      const reg = await navigator.serviceWorker?.getRegistration()
                      const sub = await reg?.pushManager?.getSubscription()
                      if (sub) await fetch('/api/push/desuscribir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
                    } catch {}
                    await fetch('/api/auth/invalidate-cache', { method: 'POST' }).catch(() => {})
                    await signOut({ redirect: false })
                    sessionStorage.clear()
                    window.location.href = '/login'
                  })()}
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

          {/* TaXBot flotante PC — estilo WhatsApp */}
      {(isEmpresa || isSupervisor || isEmpleado) && !asistenteAbierto && (
        <button
          onClick={() => setAsistenteAbierto(true)}
          title="TaXBot"
          className="hidden md:flex"
          style={{
            position:'fixed', bottom:16, right:16, zIndex:3001,
            width:56, height:56, borderRadius:'50%',
            background:'linear-gradient(135deg,#1e3a6e,#1d4ed8)',
            border:'2px solid rgba(59,130,246,0.5)',
            boxShadow:'0 4px 20px rgba(59,130,246,0.4)',
            alignItems:'center', justifyContent:'center',
            cursor:'pointer',
          }}>
          <span className="relative">
            <RobotIcon size={26} />
            <span style={{position:'absolute',top:-2,right:-2,width:10,height:10,background:'#34d399',borderRadius:'50%',border:'2px solid #1e3a6e',boxShadow:'0 0 4px #34d399'}} />
          </span>
        </button>
      )}

      {/* Alertas Notch — banda derecha, a la izquierda del TaxBot */}
      <div className="md:hidden">{(isEmpresa || isSupervisor) && <AlertasNotch />}</div>

      {/* Robot TaXBot — banda derecha, solo en dashboard */}
          <div className="md:hidden">{(isEmpresa || isSupervisor || isEmpleado) && pathname === '/inicio' && !asistenteAbierto && !moduloAbierto && (
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
          )}</div>
        </>
      )}


      {/* Overlay navegación */}
      {navigating && <TuAgentXOverlay />}

      {(isEmpresa || isSupervisor || isEmpleado) && <AsistenteGestor onClose={() => setAsistenteAbierto(false)} rol={user?.role} visible={asistenteAbierto} userId={user?.id} />}

      {isEmpresa && bannerVisible && (billingEstado === 'pendiente' || billingEstado === 'mora') && (
        <BillingBanner
          estado={billingEstado}
          count={bannerCount}
          setCount={setBannerCount}
          onClose={() => setBannerVisible(false)}
          loadingPago={loadingPago}
          onPagar={async () => {
            setLoadingPago(true)
            try {
              const gen = await fetch('/api/plan-empresa/generar', { method: 'POST' })
              const gd = await gen.json()
              const montoCheckout = gd.deudaTotal > 0 ? gd.deudaTotal : gd.monto
              if (!montoCheckout) return
              const res = await fetch('/api/pagos/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto: montoCheckout }) })
              const d = await res.json()
              if (d.linkPago) window.open(d.linkPago, '_blank', 'noopener,noreferrer')
            } catch {} finally { setLoadingPago(false) }
          }}
        />
      )}

    </div>
    </>
  )
}
