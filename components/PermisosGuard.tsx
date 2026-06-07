'use client'
import { useEffect, useRef, useState } from 'react'

// ── Tipos ────────────────────────────────────────────────────────
type PermisoEstado = 'verificando' | 'ok' | 'bloqueado'

interface PermisosEstado {
  gps:  boolean | null  // null = no aplica
  notif: boolean
}

const ROLES_GPS = ['vendedor', 'entregas', 'impulsadora']

// ── Helpers ──────────────────────────────────────────────────────

/** Primera verificación: obtiene posición real — no confía en permission.state */
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

function verificarNotif(): boolean {
  if (!('Notification' in window)) return true // browser sin soporte → no bloquear
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
  // Ref para el listener de revocación — limpieza en unmount
  const gpsStatusRef = useRef<PermissionStatus | null>(null)

  useEffect(() => {
    verificarTodo()
    return () => {
      // Limpiar listener nativo al desmontar
      if (gpsStatusRef.current) {
        gpsStatusRef.current.onchange = null
        gpsStatusRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function verificarTodo() {
    setEstado('verificando')

    // GPS — posición real para la verificación inicial
    let gpsOk: boolean | null = necesitaGps ? false : null
    if (necesitaGps) {
      gpsOk = await verificarGpsReal()

      // Suscribir al evento nativo de cambio de permiso (cero polling)
      if ('permissions' in navigator) {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
          gpsStatusRef.current = status
          status.onchange = () => {
            // El browser notifica instantáneamente si el usuario revoca el permiso
            if (status.state !== 'granted') {
              setPermisos(p => ({ ...p, gps: false }))
              setEstado('bloqueado')
            }
          }
        } catch { /* browser sin soporte de permissions API */ }
      }
    }

    const notifOk = verificarNotif()
    const nuevos: PermisosEstado = { gps: gpsOk, notif: notifOk }
    setPermisos(nuevos)
    setEstado((necesitaGps ? gpsOk === true : true) && notifOk ? 'ok' : 'bloqueado')
  }

  // ── Solicitar permisos ────────────────────────────────────────
  async function solicitarPermisos() {
    setSolicitando(true)

    if (necesitaGps && permisos.gps !== true) {
      const ok = await verificarGpsReal(12000)
      if (!ok) {
        setPermisos(p => ({ ...p, gps: false }))
        setSolicitando(false)
        return
      }
      setPermisos(p => ({ ...p, gps: true }))
    }

    if (!permisos.notif && 'Notification' in window) {
      const r = await Notification.requestPermission()
      setPermisos(p => ({ ...p, notif: r === 'granted' }))
    }

    setSolicitando(false)
    await verificarTodo()
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
