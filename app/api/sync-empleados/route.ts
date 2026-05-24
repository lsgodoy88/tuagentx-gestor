import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function GET() {
  try {

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  if (!integracion) return NextResponse.json({ ok: true, tieneIntegracion: false, empleados: [] })

  const empleados = await (prisma as any).syncEmpleado.findMany({
    where: { integracionId: integracion.id },
    select: { externalId: true, nombre: true },
    orderBy: { nombre: 'asc' }
  })

  return NextResponse.json({ ok: true, tieneIntegracion: true, empleados })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
