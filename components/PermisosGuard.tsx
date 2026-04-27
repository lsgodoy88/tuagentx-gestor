'use client'
import { useEffect, useState } from 'react'

export default function PermisosGuard({ children, role }: { children: React.ReactNode, role?: string }) {
  const necesitaGps = ['vendedor','entregas','impulsadora'].includes(role || '')
  const [gps, setGps] = useState<boolean | null>(null)
  const [notif, setNotif] = useState<boolean | null>(null)
  const [verificando, setVerificando] = useState(true)
  const [solicitando, setSolicitando] = useState(false)

  useEffect(() => { verificar() }, [])

  async function verificar() {
    if (sessionStorage.getItem('permisos_ok') === 'true') {
      setGps(true)
      setNotif(true)
      setVerificando(false)
      return
    }
    setVerificando(true)
    let gpsOk = true
    if (necesitaGps && 'permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        gpsOk = result.state === 'granted'
      } catch {
        gpsOk = false
      }
    }
    let notifOk = false
    if ('Notification' in window) {
      notifOk = Notification.permission === 'granted'
    }
    setGps(gpsOk)
    setNotif(notifOk)
    setVerificando(false)
    if ((necesitaGps ? gpsOk : true) && notifOk) {
      sessionStorage.setItem('permisos_ok', 'true')
    }
  }

  async function solicitarPermisos() {
    sessionStorage.removeItem('permisos_ok')
    setSolicitando(true)
    if (necesitaGps && !gps) {
      try {
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => reject(),
            { timeout: 10000, enableHighAccuracy: true }
          )
        })
        setGps(true)
      } catch {
        setGps(false)
        setSolicitando(false)
        await verificar()
        return
      }
    }
    if (!notif) {
      const permiso = await Notification.requestPermission()
      setNotif(permiso === 'granted')
    }
    setSolicitando(false)
    await verificar()
  }

  if (verificando) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-zinc-400 text-sm">Verificando permisos...</div>
    </div>
  )

  const todoOk = (necesitaGps ? gps : true) && notif
  if (!todoOk) return (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-white font-bold text-lg">Permisos requeridos</h2>
          <p className="text-zinc-400 text-sm mt-1">Para usar Gestor necesitas activar los siguientes permisos</p>
        </div>
        <div className="space-y-3">
          {necesitaGps && (
            <div className={"flex items-center gap-3 p-3 rounded-xl border " + (gps ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10")}>
              <span className="text-xl">{gps ? '✅' : '❌'}</span>
              <div className="flex-1">
                <p className="text-white text-sm font-semibold">Ubicación precisa (GPS)</p>
                <p className="text-zinc-400 text-xs">Necesaria para registrar visitas</p>
              </div>
              <span className={"text-xs font-semibold " + (gps ? "text-emerald-400" : "text-red-400")}>{gps ? 'Activo' : 'Inactivo'}</span>
            </div>
          )}
          <div className={"flex items-center gap-3 p-3 rounded-xl border " + (notif ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10")}>
            <span className="text-xl">{notif ? '✅' : '❌'}</span>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">Notificaciones</p>
              <p className="text-zinc-400 text-xs">Para recibir actualizaciones de ruta</p>
            </div>
            <span className={"text-xs font-semibold " + (notif ? "text-emerald-400" : "text-red-400")}>{notif ? 'Activo' : 'Inactivo'}</span>
          </div>
        </div>
        <button onClick={solicitarPermisos} disabled={solicitando}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
          {solicitando ? 'Solicitando...' : '🔓 Activar permisos'}
        </button>
        <p className="text-zinc-500 text-xs text-center">
          Si el navegador no pregunta, ve a Configuracion del navegador y activa {necesitaGps ? 'Ubicacion y ' : ''}Notificaciones para este sitio
        </p>
      </div>
    </div>
  )
  return <>{children}</>
}
