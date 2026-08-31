import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { Prisma } from '@/app/generated/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!['empresa', 'supervisor'].includes(user?.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const empresaId = getEmpresaId(user)
  const rows = await prisma.$queryRaw<[{ fechaInicioBodega: Date | null }]>`
    SELECT "fechaInicioBodega" FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE id = ${empresaId} LIMIT 1`
  return NextResponse.json({ fechaInicioBodega: rows[0]?.fechaInicioBodega ?? null })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!['empresa', 'supervisor'].includes(user?.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const empresaId = getEmpresaId(user)
  const { fechaInicioBodega } = await req.json()
  const fecha = fechaInicioBodega ? new Date(fechaInicioBodega) : null

  // Guardar fecha en Empresa
  await prisma.$executeRawUnsafe(
    `UPDATE ${DB_SCHEMA}."Empresa" SET "fechaInicioBodega" = $1 WHERE id = $2`,
    fecha, empresaId
  )

  // Sincronización inicial: cancelar pendientes anteriores a la fecha
  let canceladas = 0
  if (fecha) {
    canceladas = Number(await prisma.$executeRawUnsafe(
      `UPDATE ${DB_SCHEMA}."OrdenDespacho" SET estado = 'cancelado' WHERE "empresaId" = $1 AND estado = 'pendiente' AND COALESCE("fechaOrdenBogota", "createdAt") < $2`,
      empresaId, fecha
    ))
  }

  return NextResponse.json({ ok: true, canceladas })
}
