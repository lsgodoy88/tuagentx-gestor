import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (user.role === 'empresa' || user.role === 'superadmin') {
    const empresa = await prisma.empresa.findUnique({
      where: { id: user.id },
      select: { id: true, nombre: true, email: true, plan: true, activo: true,
                maxSupervisores: true, maxVendedores: true, maxEntregas: true,
                maxImpulsadoras: true, createdAt: true },
    })
    return NextResponse.json(empresa || {})
  } else {
    const empleado = await prisma.empleado.findUnique({
      where: { id: user.id },
      select: { id: true, nombre: true, email: true, telefono: true, rol: true,
                activo: true, vendedorId: true, puedeCapturarGps: true,
                empresaId: true, createdAt: true },
    })
    return NextResponse.json(empleado || {})
  }
}
