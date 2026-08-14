import { prisma } from '@/lib/prisma'
import { generarReciboToken } from '@/lib/cartera/recibos'

export async function generarTokenParaPago(empresaId: string, pagoId: string) {
  const pago = await (prisma as any).pagoCartera.findFirst({
    where: {
      id: pagoId,
      OR: [
        { Cartera: { empresaId } },
        { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
      ],
    },
    include: {
      Cartera: { include: { Empresa: { select: { configRecibos: true } } } },
      Empleado: { include: { empresa: { select: { configRecibos: true } } } },
    },
  })
  if (!pago) return null

  const { reciboToken, tokenExpira } = generarReciboToken()
  await prisma.pagoCartera.update({ where: { id: pagoId }, data: { reciboToken, tokenExpira } })

  const cfg = (pago?.Cartera?.Empresa?.configRecibos || pago?.Empleado?.empresa?.configRecibos) as any
  return { reciboToken, tokenExpira, anchoPapel: cfg?.anchoPapel || '80mm' }
}
