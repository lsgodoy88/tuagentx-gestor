import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getMonitorData(empresaId: string, hoy: Date) {
  const turnos = await prisma.turno.findMany({
    where: { empleado: { empresaId }, activo: true },
    select: {
      id: true, inicio: true, latInicio: true, lngInicio: true,
      empleado: { select: { id: true, nombre: true, rol: true } }
    }
  })

  if (turnos.length === 0) return []

  const empIds = turnos.map((t: any) => t.empleado.id)

  const [todasVisitasHoy, rutasHoy] = await Promise.all([
    prisma.visita.findMany({
      where: { empleadoId: { in: empIds }, fechaBogota: { gte: hoy } },
      select: {
        empleadoId: true, clienteId: true, fechaBogota: true,
        lat: true, lng: true, tipo: true,
        cliente: { select: { nombre: true, nombreComercial: true } }
      },
      orderBy: { fechaBogota: 'desc' }
    }),
    prisma.ruta.findMany({
      where: {
        empresaId,
        fecha: { gte: hoy },
        cerrada: false,
        empleados: { some: { empleadoId: { in: empIds } } }
      },
      select: {
        nombre: true,
        empleados: { select: { empleadoId: true } },
        clientes: {
          orderBy: { orden: 'asc' },
          select: {
            orden: true,
            cliente: { select: { id: true, nombre: true, nombreComercial: true } }
          }
        }
      }
    })
  ])

  return turnos.map((t: any) => {
    const visitasEmp = todasVisitasHoy.filter((v: any) => v.empleadoId === t.empleado.id)
    const ultimaVisita = visitasEmp[0] || null
    const visitadosIds = new Set(visitasEmp.map((v: any) => v.clienteId))

    const ruta = rutasHoy.find((r: any) =>
      r.empleados.some((e: any) => e.empleadoId === t.empleado.id)
    ) || null

    const proximoPendiente = ruta?.clientes?.find((rc: any) => !visitadosIds.has(rc.cliente.id))

    return {
      empleado: t.empleado.nombre,
      rol: t.empleado.rol,
      inicioTurno: t.inicio,
      latInicio: t.latInicio,
      lngInicio: t.lngInicio,
      ultimaVisita: ultimaVisita ? {
        hora: ultimaVisita.fechaBogota,
        cliente: ultimaVisita.cliente?.nombreComercial || ultimaVisita.cliente?.nombre || 'Sin cliente',
        tipo: ultimaVisita.tipo,
        lat: ultimaVisita.lat,
        lng: ultimaVisita.lng,
      } : null,
      ruta: ruta?.nombre || null,
      proximoPendiente: proximoPendiente ? proximoPendiente.cliente.nombreComercial || proximoPendiente.cliente.nombre : null,
      visitados: visitadosIds.size,
      totalRuta: ruta?.clientes?.length || 0,
    }
  })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)

  if (user.role === 'superadmin') {
    const empresas = await prisma.empresa.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, plan: true }
    })

    const resultados = await Promise.all(
      empresas.map(async (empresa: any) => {
        const empleados = await getMonitorData(empresa.id, hoy)
        const visitasHoy = empleados.reduce((acc: number, e: any) => acc + e.visitados, 0)
        return {
          empresaId: empresa.id,
          empresa: empresa.nombre,
          plan: empresa.plan,
          empleadosEnTurno: empleados.length,
          visitasHoy,
          empleados,
        }
      })
    )

    return NextResponse.json(resultados)
  }

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const resultado = await getMonitorData(empresaId, hoy)
  return NextResponse.json(resultado)
}
