import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { enviarPushAdmin } from '@/lib/admin/push'

export async function enviarRecordatorioPago(dia: number) {
  const ahora = new Date()
  const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`

  const planes = await (prisma as any).planEmpresa.findMany({
    where: { mes, estado: 'pendiente' },
    select: { empresaId: true, monto: true },
  })

  const resultados: any[] = []

  for (const plan of planes) {
    try {
      if (dia === 3) {
        await enviarPushAdmin(
          plan.empresaId,
          '💳 Recordatorio de pago',
          `Tu plan vence el día 5. Recuerda realizar el pago a tiempo.`,
          '/empleados'
        )
      } else if (dia === 6) {
        await enviarPushAdmin(
          plan.empresaId,
          '⚠️ Pago vencido',
          'Tu pago mensual no fue registrado. Por favor realiza el pago lo antes posible.',
          '/empleados'
        )
        await (prisma as any).planEmpresa.update({
          where: { empresaId_mes: { empresaId: plan.empresaId, mes } },
          data: { estado: 'vencido', updatedAt: new Date() },
        })
      } else if (dia === 7) {
        await enviarPushAdmin(
          plan.empresaId,
          '⚠️ Pago aún pendiente',
          'Tu plan sigue sin pago. Contáctanos para evitar interrupciones.',
          '/empleados'
        )
      }
      resultados.push({ empresaId: plan.empresaId, dia, ok: true })
    } catch (err: any) {
      resultados.push({ empresaId: plan.empresaId, dia, error: err.message })
    }
  }

  return { ok: true, dia, total: planes.length, resultados }
}

export async function activarBannerPago() {
  const ahora = new Date()
  const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`

  const { count } = await (prisma as any).planEmpresa.updateMany({
    where: { mes, estado: { in: ['pendiente', 'vencido'] }, bannerActivo: false },
    data: { bannerActivo: true, updatedAt: new Date() },
  })

  return { ok: true, activados: count }
}
