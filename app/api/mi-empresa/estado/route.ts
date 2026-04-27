import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (user.role === 'superadmin') return NextResponse.json({ activa: true })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  if (!empresaId) return NextResponse.json({ activa: true })

  // planFin y modoEquipo fueron agregados via ALTER TABLE — rawSQL para planFin
  const rows = await prisma.$queryRaw<[{ activo: boolean; planFin: Date | null; modoEquipo: string | null }]>`
    SELECT activo, "planFin", "modoEquipo" FROM gestor."Empresa" WHERE id = ${empresaId} LIMIT 1
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
    modoEquipo: row?.modoEquipo ?? null,
    supervisoresActivos,
  })
}
