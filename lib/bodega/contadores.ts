import { prisma } from '@/lib/prisma'
import { inicioDiaBogota } from '@/lib/fechas'

export async function getContadoresBodega(empresaId: string) {
  const hoy = inicioDiaBogota()

  const vinculadas = await (prisma as any).empresaVinculada.findMany({
    where: { empresaId, activa: true },
    select: { id: true, nombre: true, empresaClienteId: true },
  })

  const propiaEmpresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true },
  })

  // Leer fechaInicioBodega de la empresa propia (aplica también a vinculadas)
  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const empresaData = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: { fechaInicioBodega: true },
  })
  const fechaInicio: Date = empresaData?.fechaInicioBodega ?? hace30dias

  const empresas = [
    { id: empresaId, nombre: propiaEmpresa?.nombre || 'Principal', slug: 'propia', clienteId: empresaId },
    ...vinculadas.map((v: any) => ({
      id: v.id,
      nombre: v.nombre,
      slug: v.nombre.toLowerCase().replace(/\s+/g, '-'),
      clienteId: v.empresaClienteId,
    })),
  ]

  const contadores = await Promise.all(
    empresas.map(async e => {
      const [pendientes, alistados, entregados, agotados, stockBajo] = await Promise.all([
        prisma.ordenDespacho.count({ where: { empresaId: e.clienteId, estado: 'pendiente', isActiva: true, fechaOrden: { gte: fechaInicio } } }),
        prisma.ordenDespacho.count({ where: { empresaId: e.clienteId, estado: 'alistado' } }),
        prisma.ordenDespacho.count({ where: { empresaId: e.clienteId, estado: { in: ['en_entrega', 'entregado'] }, entregadoEl: { gte: hoy } } }),
        (prisma as any).stockSnapshot.findMany({
          where: { empresaId: e.clienteId, estado: 'agotado' },
          select: { nombre: true, inventory: true },
          orderBy: { createdAt: 'desc' },
          take: 3,
        }),
        (prisma as any).stockSnapshot.findMany({
          where: { empresaId: e.clienteId, estado: 'stock_bajo' },
          select: { nombre: true, inventory: true, stockMinimo: true },
          orderBy: { createdAt: 'desc' },
          take: 3,
        }),
      ])
      return { ...e, pendientes, alistados, entregados, agotados, stockBajo }
    })
  )

  return { empresas: contadores }
}
