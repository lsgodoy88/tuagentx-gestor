'use client'
import { useEffect, useRef, useState } from 'react'

// ── Tipos ────────────────────────────────────────────────────────
type PermisoEstado = 'verificando' | 'ok' | 'bloqueado'

interface PermisosEstado {
  gps:   boolean | null  // null = no aplica
  notif: boolean
}

const ROLES_GPS  = ['vendedor', 'entregas', 'impulsadora']
const RECHECK_MS = 3 * 60 * 1000  // re-verifica cada 3 min en background

// ── Helpers ──────────────────────────────────────────────────────

/** Verifica GPS obteniendo una posición real — no confía solo en permission.state */
async function verificarGpsReal(timeoutMs = 8000): Promise<boolean> {
  if (!navigator.geolocation) return false
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(false), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      () => { clearTimeout(t); resolve(true) },
      () => { clearTimeout(t); resolve(false) },
      { timeout: timeoutMs, enableHighAccuracy: true, maximumAge: 0 },
    )
  })
}

/** Verifica solo el permiso declarado — para re-checks rápidos sin consumir batería */
async function verificarPermisoGps(): Promise<boolean> {
  if (!navigator.geolocation) return false
  if (!('permissions' in navigator)) {
    // Fallback: confiar en intento real
    return verificarGpsReal(3000)
  }
  try {
    const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (r.state === 'denied') return false
    if (r.state === 'granted') return true
    // 'prompt' → el usuario no ha decidido → no está OK
    return false
  } catch {
    return false
  }
}

function verificarNotif(): boolean {
  if (!('Notification' in window)) return false
  return Notification.permission === 'granted'
}

// ── Componente ───────────────────────────────────────────────────
export default function PermisosGuard({
  children,
  role,
}: {
  children: React.ReactNode
  role?: string
}) {
  const necesitaGps = ROLES_GPS.includes(role || '')
  const [estado, setEstado] = useState<PermisoEstado>('verificando')
  const [permisos, setPermisos] = useState<PermisosEstado>({ gps: null, notif: false })
  const [solicitando, setSolicitando] = useState(false)
  const recheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Verificación inicial ───────────────────────────────────────
  useEffect(() => {
    verificarTodo(true)
    return () => { if (recheckRef.current) clearInterval(recheckRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function verificarTodo(inicial = false) {
    if (inicial) setEstado('verificando')

    // GPS — primera vez: posición real. Re-checks: solo permiso (ahorra batería)
    let gpsOk: boolean | null = necesitaGps ? false : null
    if (necesitaGps) {
      gpsOk = inicial
        ? await verificarGpsReal()
        : await verificarPermisoGps()
    }

    const notifOk = verificarNotif()
    const nuevos: PermisosEstado = { gps: gpsOk, notif: notifOk }
    setPermisos(nuevos)

    const todoOk = (necesitaGps ? gpsOk === true : true) && notifOk
    setEstado(todoOk ? 'ok' : 'bloqueado')

    // Re-check periódico solo si todo estaba ok
    if (todoOk && inicial) {
      if (recheckRef.current) clearInterval(recheckRef.current)
      recheckRef.current = setInterval(() => verificarTodo(false), RECHECK_MS)
    } else if (!todoOk && recheckRef.current) {
      clearInterval(recheckRef.current)
      recheckRef.current = null
    }
  }

  // ── Solicitar permisos ────────────────────────────────────────
  async function solicitarPermisos() {
    setSolicitando(true)

    // GPS — solicitar posición real (dispara el diálogo del browser)
    if (necesitaGps && permisos.gps !== true) {
      const ok = await verificarGpsReal(12000)
      setPermisos(p => ({ ...p, gps: ok }))
      if (!ok) {
        setSolicitando(false)
        await verificarTodo(true)
        return
      }
    }

    // Notificaciones
    if (!permisos.notif) {
      if (!('Notification' in window)) {
        // Browser sin soporte — dejar pasar
        setPermisos(p => ({ ...p, notif: true }))
      } else {
        const r = await Notification.requestPermission()
        setPermisos(p => ({ ...p, notif: r === 'granted' }))
      }
    }

    setSolicitando(false)
    await verificarTodo(true)
  }

  // ── Render ────────────────────────────────────────────────────
  if (estado === 'verificando') return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Verificando permisos...</p>
      </div>
    </div>
  )

  if (estado === 'bloqueado') return (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-5">

        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-white font-bold text-lg">Permisos requeridos</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Para usar Gestor necesitas activar los siguientes permisos
          </p>
        </div>

        <div className="space-y-3">
          {necesitaGps && (
            <div className={
              'flex items-center gap-3 p-3 rounded-xl border ' +
              (permisos.gps ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10')
            }>
              <span className="text-xl">{permisos.gps ? '✅' : '❌'}</span>
              <div className="flex-1">
                <p className="text-white text-sm font-semibold">Ubicación precisa (GPS)</p>
                <p className="text-zinc-400 text-xs">Necesaria para registrar visitas y cobros</p>
              </div>
              <span className={
                'text-xs font-semibold ' +
                (permisos.gps ? 'text-emerald-400' : 'text-red-400')
              }>
                {permisos.gps ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          )}

          <div className={
            'flex items-center gap-3 p-3 rounded-xl border ' +
            (permisos.notif ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10')
          }>
            <span className="text-xl">{permisos.notif ? '✅' : '❌'}</span>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">Notificaciones</p>
              <p className="text-zinc-400 text-xs">Para recibir actualizaciones de ruta e impulsos</p>
            </div>
            <span className={
              'text-xs font-semibold ' +
              (permisos.notif ? 'text-emerald-400' : 'text-red-400')
            }>
              {permisos.notif ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        <button
          onClick={solicitarPermisos}
          disabled={solicitando}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
          {solicitando ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Solicitando...
            </span>
          ) : '🔓 Activar permisos'}
        </button>

        <p className="text-zinc-500 text-xs text-center">
          Si el navegador no pregunta, ve a Configuración {'>'} Privacidad y activa{' '}
          {necesitaGps ? 'Ubicación y ' : ''}Notificaciones para este sitio
        </p>
      </div>
    </div>
  )

  return <>{children}</>
}
