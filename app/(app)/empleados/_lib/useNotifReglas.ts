'use client'
import { useState } from 'react'

export function useNotifReglas() {
  const [notifReglas, setNotifReglas] = useState<any[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifGuardando, setNotifGuardando] = useState<string | null>(null)
  const [notifTesting, setNotifTesting] = useState<string | null>(null)
  const [rolesConSub, setRolesConSub] = useState<string[]>([])
  const [subsDispositivos, setSubsDispositivos] = useState<{empleados: any[], admin: any[]}>({empleados: [], admin: []})
  const [ayudaNotif, setAyudaNotif] = useState(false)
  const [subsBorrando, setSubsBorrando] = useState<string | null>(null)

  async function testNotifRegla(reglaId: string) {
    setNotifTesting(reglaId)
    await fetch('/api/notif-reglas/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reglaId }) })
    setNotifTesting(null)
  }

  async function cargarNotifReglas() {
    setNotifLoading(true)
    const d = await fetch('/api/notif-reglas').then(r => r.json()).catch(() => ({ reglas: [] }))
    setNotifReglas(d.reglas || [])
    setRolesConSub(d.rolesConSub || [])
    const s = await fetch('/api/push/suscribir').then(r => r.json()).catch(() => ({ empleados: [], admin: [] }))
    setSubsDispositivos({ empleados: s.empleados || [], admin: s.admin || [] })
    setNotifLoading(false)
  }

  async function toggleNotifRol(reglaId: string, rol: string, checked: boolean) {
    const regla = notifReglas.find((r: any) => r.id === reglaId)
    if (!regla) return
    const roles = checked ? [...regla.roles, rol] : regla.roles.filter((r: string) => r !== rol)
    setNotifReglas(prev => prev.map((r: any) => r.id === reglaId ? { ...r, roles } : r))
    setNotifGuardando(reglaId)
    await fetch('/api/notif-reglas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reglaId, roles, activa: regla.activa }) })
    setNotifGuardando(null)
  }

  async function borrarSub(id: string, tipo: 'admin' | 'empleado') {
    setSubsBorrando(id)
    await fetch('/api/push/suscribir', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, tipo }) })
    setSubsDispositivos(prev => ({
      empleados: tipo === 'empleado' ? prev.empleados.filter((s: any) => s.id !== id) : prev.empleados,
      admin: tipo === 'admin' ? prev.admin.filter((s: any) => s.id !== id) : prev.admin,
    }))
    setSubsBorrando(null)
  }

  async function toggleNotifActiva(reglaId: string, activa: boolean) {
    const regla = notifReglas.find((r: any) => r.id === reglaId)
    if (!regla) return
    setNotifReglas(prev => prev.map((r: any) => r.id === reglaId ? { ...r, activa } : r))
    setNotifGuardando(reglaId)
    await fetch('/api/notif-reglas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reglaId, roles: regla.roles, activa }) })
    setNotifGuardando(null)
  }

  return {
    notifReglas, setNotifReglas,
    notifLoading, setNotifLoading,
    notifGuardando, setNotifGuardando,
    notifTesting, setNotifTesting,
    rolesConSub, setRolesConSub,
    subsDispositivos, setSubsDispositivos,
    ayudaNotif, setAyudaNotif,
    subsBorrando, setSubsBorrando,
    testNotifRegla,
    cargarNotifReglas,
    toggleNotifRol,
    borrarSub,
    toggleNotifActiva,
  }
}

export type UseNotifReglas = ReturnType<typeof useNotifReglas>
