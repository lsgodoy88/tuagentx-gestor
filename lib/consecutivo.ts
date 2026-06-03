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

    // Iniciales del nombre del empleado: "CARLOS NORBERTO LOZADA" -> "CL"
    const iniciales = (empleado.nombre || '')
      .trim()
      .split(/\s+/)
      .filter((w: string) => w.length > 0 && !/^(de|del|la|el|los|las|y|da|do)$/i.test(w))
      .map((w: string) => w[0].toUpperCase())
    const primera = iniciales[0] || 'X'
    const ultima = iniciales.length > 1 ? iniciales[iniciales.length - 1] : ''
    const inicialesEmpleado = (primera + ultima) || 'XX'

    // Prefijo: explícito en empleado > explícito empresa > iniciales del empleado
    const prefijo = cfg.prefijo || inicialesEmpleado

    // Verificar colisión — protege contra inserciones manuales en BD
    // que no pasaron por getConsecutivo y dejaron el contador desactualizado
    let recibo = `${prefijo}${anio}${mes}${String(consecutivoActual).padStart(3, '0')}`
    let intentos = 0
    while (intentos < 50) {
      const existe = await tx.pagoCartera.findFirst({ where: { numeroRecibo: recibo } })
      if (!existe) break
      consecutivoActual += 1
      recibo = `${prefijo}${anio}${mes}${String(consecutivoActual).padStart(3, '0')}`
      intentos++
    }

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

    return recibo
  })

  return numero
}
