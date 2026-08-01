import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { Prisma } from '@/app/generated/prisma'
import { DB_SCHEMA } from '@/lib/prisma'
import { invalidarReglaCache } from '@/lib/notif-reglas'

// Catálogo fijo de reglas disponibles
export const REGLAS_CATALOGO = [
  { id: 'despacho_guia',    label: 'Bodega envía pedido por guía' },
  { id: 'despacho_local',   label: 'Bodega envía pedido local' },
  { id: 'impulso_entrada',  label: 'Impulsadora registra entrada en cliente' },
]

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const guardadas = await prisma.notifRegla.findMany({ where: { empresaId } })
  const guardadasMap = Object.fromEntries(guardadas.map(r => [r.id, r]))

  // Roles con al menos una suscripción activa
  const subs = await prisma.$queryRaw<{rol: string}[]>`
    SELECT DISTINCT e.rol FROM ${Prisma.raw(DB_SCHEMA)}."Empleado" e
    INNER JOIN ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion" p ON p."empleadoId" = e.id
    WHERE e."empresaId" = ${empresaId}`
  const rolesConSub = new Set(subs.map(s => s.rol))
  // Verificar si el admin tiene suscripción
  const adminSubs = await prisma.$queryRaw<{cnt: bigint}[]>`
    SELECT COUNT(*)::bigint AS cnt FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin"
    WHERE "empresaId" = ${empresaId}`
  if (adminSubs[0]?.cnt > 0) rolesConSub.add('empresa')

  // Merge catálogo con valores guardados (defaults si no existe)
  const reglas = REGLAS_CATALOGO.map(c => ({
    id: c.id,
    label: c.label,
    roles: guardadasMap[c.id]?.roles ?? [],
    activa: guardadasMap[c.id]?.activa ?? true,
  }))

  return NextResponse.json({ reglas, rolesConSub: [...rolesConSub] })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = getEmpresaId(user)

  const { id, roles, activa } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const regla = await prisma.notifRegla.upsert({
    where: { id_empresaId: { id, empresaId } },
    update: { roles, activa },
    create: { id, empresaId, label: REGLAS_CATALOGO.find(c => c.id === id)?.label ?? id, roles, activa },
  })

  await invalidarReglaCache(id, empresaId)
  return NextResponse.json({ ok: true, regla })
}
