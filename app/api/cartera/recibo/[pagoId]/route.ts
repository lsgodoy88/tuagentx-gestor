import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ pagoId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { pagoId } = await params

  const pago = await prisma.pagoCartera.findUnique({
    where: { id: pagoId },
    include: {
      Cartera: {
        include: {
          Cliente: { select: { id: true, nombre: true, nit: true, telefono: true } },
          Empresa: { select: { id: true, nombre: true, telefono: true, configRecibos: true } },
          DetalleCartera: { orderBy: { createdAt: 'asc' } },
        }
      },
      Empleado: { select: { id: true, nombre: true, configRecibos: true } },
    }
  })

  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if ((pago.Cartera as any).empresaId !== empresaId) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const normalized = {
    ...pago,
    metodoPago: (pago as any).metodopago,
    cartera: {
      ...(pago.Cartera as any),
      cliente: (pago.Cartera as any).Cliente,
      empresa: (pago.Cartera as any).Empresa,
      detalles: (pago.Cartera as any).DetalleCartera || [],
    },
    empleado: pago.Empleado,
  }

  return NextResponse.json({ pago: normalized })
}
