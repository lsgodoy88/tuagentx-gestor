import { prisma } from '@/lib/prisma'
import { CLIENTE_BASICO, EMPRESA_RECIBO, EMPLEADO_RECIBO } from '@/lib/prisma-selects'

export async function getReciboDetalle(empresaId: string, pagoId: string) {
  const pago = await prisma.pagoCartera.findUnique({
    where: { id: pagoId },
    include: {
      Cartera: {
        include: {
          Cliente: { select: CLIENTE_BASICO },
          Empresa: { select: EMPRESA_RECIBO },
          DetalleCartera: { orderBy: { createdAt: 'asc' } },
        },
      },
      Empleado: { select: EMPLEADO_RECIBO },
      Aplicaciones: true,
    },
  })
  if (!pago) return null

  if (pago.Cartera) {
    if ((pago.Cartera as any).empresaId !== empresaId) return { error: 'Sin acceso' }
  } else {
    const emp = await prisma.empleado.findUnique({
      where: { id: pago.empleadoId },
      select: { empresaId: true },
    })
    if (!emp || emp.empresaId !== empresaId) return { error: 'Sin acceso' }
  }

  let cliente: any = (pago.Cartera as any)?.Cliente || null
  if (!cliente && (pago as any).clienteApiId) {
    cliente = await prisma.cliente.findFirst({
      where: { apiId: (pago as any).clienteApiId, empresaId },
      select: { ...CLIENTE_BASICO },
    })
  }
  if (!cliente && (pago as any).clienteNombre) {
    cliente = { nombre: (pago as any).clienteNombre }
  }

  let empresa = (pago.Cartera as any)?.Empresa || null
  if (!empresa) {
    empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: EMPRESA_RECIBO })
  }

  return {
    pago: {
      ...pago,
      metodoPago: (pago as any).metodopago,
      cartera: pago.Cartera
        ? { ...(pago.Cartera as any), cliente, empresa, detalles: (pago.Cartera as any).DetalleCartera || [] }
        : { cliente, empresa, detalles: [] },
      empleado: pago.Empleado,
    },
  }
}
