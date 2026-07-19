import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

/**
 * GET /api/empleados/primer-recibo?empleadoId=xxx
 * Devuelve el primer PagoCartera del vendedor.
 * Usado en popup sync inicial para pre-llenar la fecha.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const empresaId = getEmpresaId(user)
    if (!['empresa', 'superadmin'].includes(user.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const empleadoId = req.nextUrl.searchParams.get('empleadoId')
    if (!empleadoId) return NextResponse.json({ error: 'empleadoId requerido' }, { status: 400 })

    // Verificar que el empleado pertenece a la empresa
    const empleado = await prisma.empleado.findFirst({
      where: { id: empleadoId, empresaId },
      select: { id: true }
    })
    if (!empleado) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Primer recibo del vendedor (chronológico)
    const primer = await (prisma as any).pagoCartera.findFirst({
      where: { empleadoId },
      orderBy: { createdAt: 'asc' },
      select: { numeroRecibo: true, createdAt: true }
    })

    if (!primer) return NextResponse.json({ numeroRecibo: null, fecha: null })

    return NextResponse.json({
      numeroRecibo: primer.numeroRecibo,
      fecha: primer.createdAt.toISOString()
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
