import { prisma } from '@/lib/prisma'

export async function getMetasCartera(params: {
  empresaId: string
  role: string
  userId: string
  mes: number
  anio: number
}) {
  const { empresaId, role, userId, mes, anio } = params

  if (role === 'vendedor') {
    const metas = await prisma.metaRecaudo.findMany({
      where: { empleadoId: userId, anio: { gte: anio - 1 } },
    })
    return { metas }
  }

  if (role === 'supervisor') {
    const sv = await prisma.supervisorVendedor.findMany({
      where: { supervisorId: userId },
      select: { vendedorId: true },
    })
    const ids = sv.map((s: any) => s.vendedorId)
    const metas = await prisma.metaRecaudo.findMany({
      where: { empleadoId: { in: ids }, mes, anio },
      include: { empleado: { select: { id: true, nombre: true } } },
    })
    return { metas }
  }

  const metas = await prisma.metaRecaudo.findMany({
    where: { empresaId, mes, anio },
    include: { empleado: { select: { id: true, nombre: true } } },
  })
  return { metas }
}

export async function upsertMetaCartera(params: {
  empresaId: string
  empleadoId: string
  mes: number
  anio: number
  metaPesos: number
  metaPct?: number | null
}) {
  const { empresaId, empleadoId, mes, anio, metaPesos, metaPct } = params

  const meta = await prisma.metaRecaudo.upsert({
    where: { empleadoId_mes_anio: { empleadoId, mes, anio } },
    update: { metaPesos, metaPct: metaPct || null, updatedAt: new Date() },
    create: { empleadoId, empresaId, mes, anio, metaPesos, metaPct: metaPct || null },
  })
  return { meta }
}
