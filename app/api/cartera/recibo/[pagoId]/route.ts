import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { CLIENTE_BASICO, EMPRESA_RECIBO, EMPLEADO_RECIBO } from '@/lib/prisma-selects'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pagoId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const { pagoId } = await params

  const pago = await prisma.pagoCartera.findUnique({
    where: { id: pagoId },
    include: {
      Cartera: {
        include: {
          Cliente: { select: CLIENTE_BASICO },
          Empresa: { select: EMPRESA_RECIBO },
          DetalleCartera: { orderBy: { createdAt: 'asc' } },
        }
      },
      Empleado: { select: EMPLEADO_RECIBO },
      Aplicaciones: true,
    }
  })

  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  // Permitir acceso si la cartera del pago pertenece a la empresa, O
  // si el pago es modo sync (sin Cartera) — empleado de la empresa
  if (pago.Cartera) {
    if ((pago.Cartera as any).empresaId !== empresaId) {
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
    }
  } else {
    // Validar via empleado
    const emp = await prisma.empleado.findUnique({
      where: { id: pago.empleadoId },
      select: { empresaId: true }
    })
    if (!emp || emp.empresaId !== empresaId) {
      return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
    }
  }

  // Hidratar cliente — prioridad: congelado en PagoCartera, fallback a Cartera.Cliente o SyncDeuda
  let cliente: any = (pago.Cartera as any)?.Cliente || null
  if (!cliente && (pago as any).clienteApiId) {
    cliente = await prisma.cliente.findFirst({
      where: { apiId: (pago as any).clienteApiId, empresaId },
      select: { ...CLIENTE_BASICO }
    })
  }
  if (!cliente && (pago as any).clienteNombre) {
    cliente = { nombre: (pago as any).clienteNombre }
  }

  // Empresa para pagos modo sync (sin Cartera)
  let empresa = (pago.Cartera as any)?.Empresa || null
  if (!empresa) {
    empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: EMPRESA_RECIBO
    })
  }

  const normalized = {
    ...pago,
    metodoPago: (pago as any).metodopago,
    cartera: pago.Cartera ? {
      ...(pago.Cartera as any),
      cliente,
      empresa,
      detalles: (pago.Cartera as any).DetalleCartera || [],
    } : {
      cliente,
      empresa,
      detalles: [],
    },
    empleado: pago.Empleado,
  }

  return NextResponse.json({ pago: normalized })
}
