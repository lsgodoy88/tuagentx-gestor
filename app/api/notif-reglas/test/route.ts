import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { getRegla } from '@/lib/notif-reglas'
import { enviarPushEmpleados, enviarPushAdmin } from '@/lib/push'
import { prisma } from '@/lib/prisma'

const TEST_NOTIF: Record<string, { title: string; body: string }> = {
  despacho_guia:   { title: '🚛 Guía: Cliente Prueba',      body: 'Fact 6828 · 3 cajas · Envío Bogotá' },
  despacho_local:  { title: '🏠 Nueva entrega local',       body: 'Cliente Prueba · Fact 6828' },
  impulso_entrada: { title: '📍 IMPULSO: María González',   body: 'Entrada en: Cliente Prueba · Sin novedad' },
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = getEmpresaId(user)

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const regla = await getRegla(id, empresaId)
  if (!regla.activa || regla.roles.length === 0)
    return NextResponse.json({ ok: true, enviados: 0 })

  const destinatarios = await prisma.empleado.findMany({
    where: { empresaId, rol: { in: regla.roles } },
    select: { id: true }
  })

  const notif = TEST_NOTIF[id] ?? { title: `🔔 Test: ${id}`, body: 'Notificación de prueba' }

  await enviarPushEmpleados(
    destinatarios.map(e => e.id),
    notif.title,
    notif.body,
    '/empleados'
  )

  if (regla.roles.includes('empresa')) {
    await enviarPushAdmin(empresaId, notif.title, notif.body, '/empleados')
  }

  return NextResponse.json({ ok: true, enviados: destinatarios.length })
}
