import { prisma } from '@/lib/prisma'

export async function getConsecutivo(empleadoId: string): Promise<string> {
  const now = new Date()
  const mes = String(now.getMonth() + 1).padStart(2, '0')
  const anio = String(now.getFullYear()).slice(-2)
  const mmaa = `${mes}${anio}`

  const numero = await prisma.$transaction(async (tx) => {
    const empleado = await tx.empleado.findUnique({
      where: { id: empleadoId },
      include: { empresa: { select: { configRecibos: true } } },
    })
    if (!empleado) throw new Error('Empleado no encontrado')

    const cfg: any = empleado.configRecibos ?? {}
    const empCfg: any = (empleado.empresa as any)?.configRecibos ?? {}

    let consecutivoActual = Number(cfg.consecutivoActual ?? 0)
    let consecutivoMes: string | null = cfg.consecutivoMes ?? null

    if (consecutivoMes !== mmaa) {
      consecutivoActual = 0
      consecutivoMes = mmaa
    }
    consecutivoActual += 1

    const usarEmpresa = cfg.usarConfigEmpresa !== false
    const prefijo = (!usarEmpresa && cfg.prefijo) ? cfg.prefijo : (empCfg.prefijo || 'REC')

    await tx.empleado.update({
      where: { id: empleadoId },
      data: {
        configRecibos: {
          ...cfg,
          consecutivoActual,
          consecutivoMes,
        } as any,
      },
    })

    return `${prefijo}-${mmaa}-${String(consecutivoActual).padStart(3, '0')}`
  })

  return numero
}
