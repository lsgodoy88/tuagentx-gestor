import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const esRanking = searchParams.get('ranking') === 'true'
  const periodo = searchParams.get('periodo') || 'semana'

  if (esRanking) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ ranking: [] })
    const user = session.user as any
    const empresaId = user.role === 'empresa' ? user.id : user.empresaId

    const ahora = new Date()
    const inicioRanking = new Date()
    if (periodo === 'semana') {
      inicioRanking.setDate(ahora.getDate() - 7)
    } else {
      inicioRanking.setDate(1)
    }

    const visitas = await prisma.visita.findMany({
      where: { empleado: { empresaId }, createdAt: { gte: inicioRanking } },
      include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } }
    })

    const mapaEmpleados: any = {}
    for (const v of visitas) {
      if (!mapaEmpleados[v.empleadoId]) {
        mapaEmpleados[v.empleadoId] = { empleadoId: v.empleadoId, nombre: v.empleado.nombre, rol: v.empleado.rol, totalVisitas: 0, totalVentas: 0 }
      }
      mapaEmpleados[v.empleadoId].totalVisitas++
      if (v.tipo === 'venta' && v.monto) mapaEmpleados[v.empleadoId].totalVentas += Number(v.monto)
    }

    const ranking = Object.values(mapaEmpleados).sort((a: any, b: any) => b.totalVentas - a.totalVentas)
    return NextResponse.json({ ranking })
  }
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  const empleadoId = searchParams.get('empleadoId') || null

  const inicio = new Date(fecha)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(fecha)
  fin.setHours(23, 59, 59, 999)

  const visitas = await prisma.visita.findMany({
    where: {
      empleado: { empresaId },
      createdAt: { gte: inicio, lte: fin },
      ...(empleadoId ? { empleadoId } : {})
    },
    include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } }, cliente: true },
    orderBy: { createdAt: 'asc' }
  })

  const empleados = await prisma.empleado.findMany({
    where: { empresaId, activo: true }
  })

  const turnos = await prisma.turno.findMany({
    where: {
      empleado: { empresaId },
      inicio: { gte: inicio, lte: fin },
      ...(empleadoId ? { empleadoId } : {})
    },
    include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } }
  })

  // Resumen por empleado
  const resumenPorEmpleado = empleados.map(e => {
    const visitasEmp = visitas.filter(v => v.empleadoId === e.id)
    const turnoEmp = turnos.find(t => t.empleadoId === e.id)
    return {
      empleado: e,
      total: visitasEmp.length,
      visitas: visitasEmp.filter(v => v.tipo === 'visita').length,
      ventas: visitasEmp.filter(v => v.tipo === 'venta').length,
      cobros: visitasEmp.filter(v => v.tipo === 'cobro').length,
      entregas: visitasEmp.filter(v => v.tipo === 'entrega').length,
      montoVentas: visitasEmp.filter(v => v.tipo === 'venta').reduce((a, v) => a + (v.monto || 0), 0),
      montoCobros: visitasEmp.filter(v => v.tipo === 'cobro').reduce((a, v) => a + (v.monto || 0), 0),
      enTurno: turnoEmp?.activo || false,
      inicioTurno: turnoEmp?.inicio || null,
    }
  }).filter(r => r.total > 0 || r.enTurno)

  // Totales generales
  const totales = {
    visitas: visitas.filter(v => v.tipo === 'visita').length,
    ventas: visitas.filter(v => v.tipo === 'venta').length,
    cobros: visitas.filter(v => v.tipo === 'cobro').length,
    entregas: visitas.filter(v => v.tipo === 'entrega').length,
    montoVentas: visitas.filter(v => v.tipo === 'venta').reduce((a, v) => a + (v.monto || 0), 0),
    montoCobros: visitas.filter(v => v.tipo === 'cobro').reduce((a, v) => a + (v.monto || 0), 0),
    total: visitas.length,
  }

  return NextResponse.json({ visitas, empleados, resumenPorEmpleado, totales, turnos })
}
