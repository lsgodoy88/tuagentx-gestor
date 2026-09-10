import { prisma } from '@/lib/prisma'

export async function getConsecutivo(empleadoId: string): Promise<string> {
  const now = new Date()
  const mes = String(now.getMonth() + 1).padStart(2, '0')
  const anio = String(now.getFullYear()).slice(-2)
  const mmaa = `${mes}${anio}`

  // Serializable isolation — serializa transacciones concurrentes del consecutivo
  // Evita gaps cuando dos pagos simultáneos generan consecutivos al mismo tiempo
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

    // Iniciales: primera letra del primer nombre + primera letra del primer apellido
    // "HEIDY ANGELICA DURAN MARNTINEZ" -> [H,A,D,M] -> primera=H, penúltima=D -> "HD"
    // "CARLOS NORBERTO LOZADA"         -> [C,N,L]   -> primera=C, penúltima=L -> "CL"
    // "ANA GARCIA"                     -> [A,G]     -> primera=A, penúltima=A -> "AG" (2 palabras: [0] y [-2] = [0])
    const iniciales = (empleado.nombre || '')
      .trim()
      .split(/\s+/)
      .filter((w: string) => w.length > 0 && !/^(de|del|la|el|los|las|y|da|do)$/i.test(w))
      .map((w: string) => w[0].toUpperCase())
    const primera = iniciales[0] || 'X'
    // Regla Colombia: primer nombre + primer apellido
    // 2-3 palabras: último  | 4+ palabras: penúltimo (hay segundo nombre)
    // 1 palabra (nombre sin apellido): usar solo la primera inicial
    const idxApellido = Math.max(1, iniciales.length >= 4 ? iniciales.length - 2 : iniciales.length - 1)
    const apellido = iniciales.length > 1 ? (iniciales[idxApellido] || primera) : null
    const inicialesEmpleado = apellido ? (primera + apellido) : primera

    // Prefijo: explícito en empleado > iniciales del empleado
    const prefijo = cfg.prefijo || inicialesEmpleado

    // Anti-colisión scoped por empresa + rol vendedor
    // Cada empresa tiene espacio de numeración independiente;
    // impulsadoras/supervisores con mismo prefijo no interfieren
    const empresaId = empleado.empresaId
    let recibo = `${prefijo}${anio}${mes}${String(consecutivoActual).padStart(3, '0')}`
    let intentos = 0
    while (intentos < 50) {
      const existe = await tx.pagoCartera.findFirst({
        where: {
          numeroRecibo: recibo,
          Empleado: { empresaId, rol: 'vendedor' },
        },
      })
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
  }, { isolationLevel: 'Serializable', timeout: 10000 })

  return numero
}
