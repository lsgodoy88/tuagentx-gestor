import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DIAS } from '@/lib/constants'

function fechaBogotaHoy() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'vendedor') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const ahora = fechaBogotaHoy()
  const hoyStr = ahora.toISOString().split('T')[0]

  // Inicio y fin de hoy en Bogota
  const inicioDia = new Date(hoyStr + 'T05:00:00.000Z')
  const finDia = new Date(hoyStr + 'T05:00:00.000Z')
  finDia.setDate(finDia.getDate() + 1)

  // Todas las visitas del vendedor
  const todasVisitas = await prisma.visita.findMany({
    where: { empleadoId: user.id },
    orderBy: { fechaBogota: 'asc' },
    take: 500
  })

  // Visitas de hoy
  const visitasHoy = todasVisitas.filter(v => {
    const fv = v.fechaBogota ? new Date(v.fechaBogota).toISOString().split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
    return fv === hoyStr
  })

  const hoy = {
    total: visitasHoy.length,
    visitas: visitasHoy.filter(v => v.tipo === 'visita').length,
    ventas: visitasHoy.filter(v => v.tipo === 'venta').length,
    cobros: visitasHoy.filter(v => v.tipo === 'cobro').length,
    entregas: visitasHoy.filter(v => v.tipo === 'entrega').length,
    montoVentas: visitasHoy.filter(v => v.tipo === 'venta').reduce((a, v) => a + Number(v.monto || 0), 0),
    montoCobros: visitasHoy.filter(v => v.tipo === 'cobro').reduce((a, v) => a + Number(v.monto || 0), 0),
  }

  // Ultimos 6 dias
  const dias = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.now() - 5*60*60*1000 - i * 86400000)
    const dStr = d.toISOString().split('T')[0]
    const vDia = todasVisitas.filter(v => {
      const fv = v.fechaBogota ? new Date(v.fechaBogota).toISOString().split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === dStr
    })
    dias.push({
      fecha: dStr,
      label: new Date(dStr + 'T12:00:00Z').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }),
      total: vDia.length,
      montoVentas: vDia.filter(v => v.tipo === 'venta').reduce((a, v) => a + Number(v.monto || 0), 0),
      montoCobros: vDia.filter(v => v.tipo === 'cobro').reduce((a, v) => a + Number(v.monto || 0), 0),
    })
  }

  // Ultimos 6 meses
  const meses = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    const anio = d.getFullYear()
    const mes = d.getMonth()
    const vMes = todasVisitas.filter(v => {
      const fv = v.fechaBogota ? new Date(v.fechaBogota) : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000)
      return fv.getFullYear() === anio && fv.getMonth() === mes
    })
    meses.push({
      label: d.toLocaleDateString('es-CO', { month: 'short' }).replace('.','') + ' ' + String(d.getFullYear()).slice(-2),
      total: vMes.length,
      montoVentas: vMes.filter(v => v.tipo === 'venta').reduce((a, v) => a + Number(v.monto || 0), 0),
      montoCobros: vMes.filter(v => v.tipo === 'cobro').reduce((a, v) => a + Number(v.monto || 0), 0),
    })
  }

  // Impulsadoras a cargo
  const impulsadoras = await prisma.empleado.findMany({
    where: { vendedorId: user.id, rol: 'impulsadora', activo: true }
  })

  const cumplimiento = await Promise.all(impulsadoras.map(async (imp) => {
    // Ruta fija de hoy
    const diaSemana = ahora.getDay()
    const rutaFija = await prisma.rutaFija.findFirst({
      where: {
        diaSemana,
        empleados: { some: { empleadoId: imp.id } }
      },
      include: {
        clientes: { include: { cliente: true } }
      }
    })

    const visitasImp = await prisma.visita.findMany({
      where: { empleadoId: imp.id },
      take: 500,
      orderBy: { fechaBogota: 'desc' }
    })

    const visitasHoyImp = visitasImp.filter(v => {
      const fv = v.fechaBogota ? new Date(v.fechaBogota).toISOString().split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === hoyStr && (v.tipo === 'entrada' || v.tipo === 'salida')
    })

    const totalPuntos = rutaFija?.clientes?.length || 0
    const clientesVisitados = new Set(visitasHoyImp.map(v => v.clienteId)).size
    const pct = totalPuntos > 0 ? Math.round((clientesVisitados / totalPuntos) * 100) : null

    const turnoActivo = await prisma.turno.findFirst({
      where: { empleadoId: imp.id, activo: true }
    })

    // Punto actual y próximo
    let puntoActual = null
    let proximoPunto = null
    if (rutaFija?.clientes) {
      for (const rc of rutaFija.clientes) {
        const entradas = visitasHoyImp.filter(v => v.rutaFijaClienteId === rc.id && v.tipo === 'entrada')
        const salidas = visitasHoyImp.filter(v => v.rutaFijaClienteId === rc.id && v.tipo === 'salida')
        if (entradas.length > 0 && salidas.length === 0) {
          puntoActual = { nombre: rc.cliente.nombre, nombreComercial: rc.cliente.nombreComercial, orden: rc.orden }
        } else if (entradas.length === 0 && !puntoActual) {
          proximoPunto = { nombre: rc.cliente.nombre, nombreComercial: rc.cliente.nombreComercial, orden: rc.orden }
        }
      }
    }

    // Alertas GPS del día
    const alertasGps = await prisma.auditLog.findMany({
      where: {
        empleadoId: imp.id,
        accion: 'GPS_FUERA_RANGO',
        createdAt: { gte: inicioDia, lt: finDia }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Próximo día con ruta fija (paralelo en lugar de loop secuencial)
    const daysToCheck = Array.from({ length: 7 }, (_, i) => (ahora.getDay() + i + 1) % 7)
    const rutasFijasDias = await Promise.all(
      daysToCheck.map((diaCheck: number) =>
        prisma.rutaFija.findFirst({
          where: { diaSemana: diaCheck, empleados: { some: { empleadoId: imp.id } } }
        })
      )
    )
    const firstIdx = rutasFijasDias.findIndex((r: any) => r !== null)
    const proximoDia = firstIdx >= 0 ? DIAS[daysToCheck[firstIdx]] : null

    return {
      id: imp.id,
      nombre: imp.nombre,
      turnoActivo: !!turnoActivo,
      totalPuntos,
      visitados: clientesVisitados,
      pct,
      alerta: pct !== null && pct < 50 && !turnoActivo,
      puntoActual,
      proximoPunto,
      alertasGps: alertasGps.map(a => ({ detalle: a.detalle, hora: a.createdAt })),
      proximoDia,
    }
  }))

  return NextResponse.json({ hoy, dias, meses, cumplimiento })
}
