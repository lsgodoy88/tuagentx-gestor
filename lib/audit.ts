import { prisma } from './prisma'

export async function audit(
  accion: string,
  usuario?: string,
  detalle?: string,
  empleadoId?: string,
  empresaId?: string
) {
  try {
    await prisma.auditLog.create({
      data: { accion, usuario, detalle, empleadoId, empresaId }
    })
  } catch(e) {
    console.log('Audit error:', e)
  }
}
