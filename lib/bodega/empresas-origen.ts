import { prisma } from '@/lib/prisma'

export async function getEmpresasOrigen(empresaId: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true },
  })

  const vinculadas = await prisma.empresaVinculada.findMany({
    where: { empresaId, activa: true },
    select: { id: true, nombre: true },
    orderBy: { createdAt: 'asc' },
  })

  return [
    { id: 'propia', nombre: empresa?.nombre ?? 'Mi empresa', tipo: 'propia' },
    ...vinculadas.map(v => ({ id: v.id, nombre: v.nombre, tipo: 'vinculada' })),
  ]
}
