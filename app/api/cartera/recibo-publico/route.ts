import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const pago = await prisma.pagoCartera.findFirst({
    where: { reciboToken: token },
    include: {
      Cartera: {
        include: {
          Cliente: true,
          Empresa: true,
          DetalleCartera: { take: 1, orderBy: { createdAt: 'desc' } },
        }
      },
      Empleado: { select: { id: true, nombre: true } },
    }
  })

  if (!pago) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })

  // Verificar expiración
  if (pago.tokenExpira && new Date() > new Date(pago.tokenExpira)) {
    return NextResponse.json({ error: 'TOKEN_EXPIRADO', pagoId: pago.id }, { status: 410 })
  }

  const normalized = {
    ...pago,
    metodoPago: pago.metodopago,
    consecutivo: pago.numeroRecibo,
    cartera: {
      ...pago.Cartera,
      cliente: pago.Cartera?.Cliente,
      empresa: pago.Cartera?.Empresa,
      DetalleCartera: pago.Cartera?.DetalleCartera,
    },
    empleado: pago.Empleado,
  }

  return NextResponse.json({ pago: normalized })
}
