import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (user.role === 'superadmin') return NextResponse.json({ activa: true })

  const empresaId = getEmpresaId(user)
  if (!empresaId) return NextResponse.json({ activa: true })

  // planFin fue agregado via ALTER TABLE — rawSQL para compatibilidad
  const rows = await prisma.$queryRaw<[{ activo: boolean; planFin: Date | null }]>`
    SELECT activo, "planFin" FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE id = ${empresaId} LIMIT 1
  `
  const row = rows[0]
  const planFin = row?.planFin ?? null
  const diasRestantes = planFin
    ? Math.ceil((new Date(planFin).getTime() - Date.now()) / 86400000)
    : null
  const supervisoresActivos = await prisma.empleado.count({
    where: { empresaId, rol: 'supervisor', activo: true },
  })

  return NextResponse.json({
    activa: row?.activo ?? true,
    planFin,
    diasRestantes,
    supervisoresActivos,
  })
}
