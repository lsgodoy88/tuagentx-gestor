'use client'
import { useEffect, useRef, useState } from 'react'

// ── Tipos ────────────────────────────────────────────────────────
type PermisoEstado = 'verificando' | 'ok' | 'bloqueado'

interface PermisosEstado {
  gps:  boolean | null  // null = no aplica a este rol
  notif: boolean
}

const ROLES_GPS = ['vendedor', 'entregas', 'impulsadora']

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Verifica GPS vía Permissions API solamente — sin activar hardware.
 * 'granted' → ok   'denied' → bloqueado   'prompt' → pendiente (necesita solicitud)
 */
async function estadoPermisoGps(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (!navigator.geolocation) return 'unsupported'
  if (!('permissions' in navigator)) return 'prompt' // fallback: pedir al usuario
  try {
    const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return r.state as 'granted' | 'denied' | 'prompt'
  } catch {
    return 'prompt'
  }
}

/**
 * Solicita GPS al usuario — activa hardware SOLO cuando el usuario toca el botón.
 * No llamar en verificación automática.
 */
async function solicitarGps(timeoutMs = 12000): Promise<boolean> {
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

function notifOk(): boolean {
  if (!('Notification' in window)) return true // sin soporte → no bloquear
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
  const [estado, setEstado]     = useState<PermisoEstado>('verificando')
  const [permisos, setPermisos] = useState<PermisosEstado>({ gps: null, notif: false })
  const [solicitando, setSolicitando] = useState(false)
  const gpsStatusRef = useRef<PermissionStatus | null>(null)

  useEffect(() => {
    verificar()
    return () => {
      if (gpsStatusRef.current) {
        gpsStatusRef.current.onchange = null
        gpsStatusRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Verificación ligera — solo Permissions API y Notification.permission.
   * Sin getCurrentPosition → sin activar GPS hardware → sin costo de batería.
   */
  async function verificar() {
    setEstado('verificando')

    let gpsOk: boolean | null = necesitaGps ? false : null

    if (necesitaGps) {
      const estado = await estadoPermisoGps()
      gpsOk = estado === 'granted'

      // Suscribir onchange — detección instantánea de revocación, sin polling
      if ('permissions' in navigator) {
        try {
          if (!gpsStatusRef.current) {
            const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
            gpsStatusRef.current = status
            status.onchange = () => {
              if (status.state !== 'granted') {
                setPermisos(p => ({ ...p, gps: false }))
                setEstado('bloqueado')
              }
            }
          }
        } catch { /* sin soporte */ }
      }
    }

    const ok = notifOk()
    setPermisos({ gps: gpsOk, notif: ok })
    setEstado((necesitaGps ? gpsOk === true : true) && ok ? 'ok' : 'bloqueado')
  }

  /**
   * Solicita permisos — se ejecuta SOLO cuando el usuario toca el botón.
   * getCurrentPosition se activa aquí, nunca en verificación automática.
   */
  async function solicitar() {
    setSolicitando(true)

    // GPS — dispara diálogo del browser y activa hardware solo aquí
    if (necesitaGps && !permisos.gps) {
      const ok = await solicitarGps()
      setPermisos(p => ({ ...p, gps: ok }))
      if (!ok) {
        setSolicitando(false)
        // Re-verificar estado del permiso para mostrar mensaje correcto
        const estadoActual = await estadoPermisoGps()
        setPermisos(p => ({ ...p, gps: estadoActual === 'granted' }))
        setSolicitando(false)
        return
      }
    }

    // Notificaciones
    if (!permisos.notif && 'Notification' in window) {
      const r = await Notification.requestPermission()
      setPermisos(p => ({ ...p, notif: r === 'granted' }))
    }

    setSolicitando(false)
    await verificar()
  }

  // ── Render ────────────────────────────────────────────────────
  // Mientras verifica — mostrar children directamente, sin bloquear
  // Solo bloquear si hay problema real (estado === 'bloqueado')
  if (estado === 'verificando') return <>{children}</>

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
              <span className={'text-xs font-semibold ' + (permisos.gps ? 'text-emerald-400' : 'text-red-400')}>
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
            <span className={'text-xs font-semibold ' + (permisos.notif ? 'text-emerald-400' : 'text-red-400')}>
              {permisos.notif ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        <button
          onClick={solicitar}
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
