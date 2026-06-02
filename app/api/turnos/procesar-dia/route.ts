import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ahoraBogota, fechaBogotaStr, inicioDiaBogota, finDiaBogota } from '@/lib/fecha'
import { audit } from '@/lib/audit'

function horaEnMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresas: Array<{
    id: string
    horaInicioRuta: string
    horaFinRuta: string
    autoAbrirTurno: boolean
    autoCerrarTurno: boolean
    diasCrearRuta: string
    diasCerrarRuta: string
  }> = await prisma.$queryRaw`
    SELECT id, "horaInicioRuta", "horaFinRuta",
           "autoAbrirTurno", "autoCerrarTurno",
           "diasCrearRuta", "diasCerrarRuta"
    FROM gestor."Empresa"
    WHERE activo = true
      AND ("autoAbrirTurno" = true OR "autoCerrarTurno" = true)`

  const ahoraBog   = ahoraBogota()
  const horaActMin = ahoraBog.getHours() * 60 + ahoraBog.getMinutes()
  const diaSemana  = ahoraBog.getDay()
  const hoyStr     = fechaBogotaStr()

  let turnosAbiertos = 0
  let turnosCerrados = 0
  let empresasProcesadas = 0

  for (const empresa of empresas) {
    const inicioMin  = horaEnMinutos(empresa.horaInicioRuta)
    const finMin     = horaEnMinutos(empresa.horaFinRuta)
    const diasAbrir  = empresa.diasCrearRuta.split(',').map(Number)
    const diasCerrar = empresa.diasCerrarRuta.split(',').map(Number)

    const empleados = await prisma.empleado.findMany({
      where: { empresaId: empresa.id, activo: true, rol: { in: ['vendedor', 'supervisor'] } },
      select: { id: true, nombre: true, email: true }
    })

    if (empleados.length === 0) { empresasProcesadas++; continue }

    const empIds = empleados.map(e => e.id)

    // APERTURA
    if (
      empresa.autoAbrirTurno &&
      diasAbrir.includes(diaSemana) &&
      horaActMin >= inicioMin &&
      horaActMin < inicioMin + 60
    ) {
      const conTurnoActivo = await prisma.turno.findMany({
        where: { empleadoId: { in: empIds }, activo: true },
        select: { empleadoId: true }
      })
      const yaAbiertos = new Set(conTurnoActivo.map(t => t.empleadoId))

      for (const emp of empleados) {
        if (yaAbiertos.has(emp.id)) continue
        await prisma.$transaction(async (tx) => {
          await tx.turno.updateMany({
            where: { empleadoId: emp.id, activo: true },
            data: { activo: false, fin: new Date() }
          })
          await tx.turno.create({
            data: { id: crypto.randomUUID(), empleadoId: emp.id, inicio: new Date(), activo: true }
          })
        })
        await audit('TURNO_AUTO_ABIERTO', emp.email,
          `Apertura automatica hora=${empresa.horaInicioRuta}`, emp.id, empresa.id)
        turnosAbiertos++
      }
    }

    // CIERRE
    if (
      empresa.autoCerrarTurno &&
      diasCerrar.includes(diaSemana) &&
      horaActMin >= finMin
    ) {
      const turnosActivos = await prisma.turno.findMany({
        where: {
          empleadoId: { in: empIds },
          activo: true,
          inicio: { gte: inicioDiaBogota(hoyStr), lte: finDiaBogota(hoyStr) }
        },
        select: { id: true, empleadoId: true }
      })

      for (const turno of turnosActivos) {
        await prisma.turno.update({
          where: { id: turno.id },
          data: { activo: false, fin: new Date() }
        })
        const emp = empleados.find(e => e.id === turno.empleadoId)
        await audit('TURNO_AUTO_CERRADO', emp?.email ?? turno.empleadoId,
          `Cierre automatico hora=${empresa.horaFinRuta}`, turno.empleadoId, empresa.id)
        turnosCerrados++
      }
    }

    empresasProcesadas++
  }

  return NextResponse.json({ ok: true, empresasProcesadas, turnosAbiertos, turnosCerrados })
}
