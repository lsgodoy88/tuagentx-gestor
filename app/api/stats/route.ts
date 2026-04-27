import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const hace7dias = new Date(Date.now() - 7 * 86400000)
  const hace30dias = new Date(Date.now() - 30 * 86400000)
  const hace7meses = new Date(); hace7meses.setMonth(hace7meses.getMonth() - 6); hace7meses.setDate(1); hace7meses.setHours(0,0,0,0)

  const [empleados, clientes, enTurno, visitas30dias, visitas7meses, rutasActivas] = await Promise.all([
    prisma.empleado.count({ where: { empresaId, activo: true } }),
    prisma.cliente.count({ where: { empresaId } }),
    prisma.turno.count({ where: { empleado: { empresaId }, activo: true } }),
    prisma.visita.findMany({
      where: { empleado: { empresaId }, fechaBogota: { gte: hace30dias } },
      select: { tipo: true, monto: true, fechaBogota: true, empleado: { select: { nombre: true } } },
      orderBy: { fechaBogota: 'desc' },
      take: 1000
    }),
    prisma.visita.findMany({
      where: { empleado: { empresaId }, fechaBogota: { gte: hace7meses } },
      select: { tipo: true, monto: true, fechaBogota: true, empleado: { select: { nombre: true } } },
      orderBy: { fechaBogota: 'desc' },
      take: 1000
    }),
    prisma.ruta.findMany({ where: { empresaId, cerrada: false }, select: { id: true } }),
  ])

  const visitasHoy = visitas30dias.filter((v: any) => new Date(v.fechaBogota) >= hoy).length
  const porTipo = visitas30dias.reduce((acc: any, v: any) => { acc[v.tipo] = (acc[v.tipo] || 0) + 1; return acc }, {})
  const ventasTotal = visitas30dias.filter((v: any) => v.tipo === 'venta').reduce((a: number, v: any) => a + (v.monto || 0), 0)
  const cobrosTotal = visitas30dias.filter((v: any) => v.tipo === 'cobro').reduce((a: number, v: any) => a + (v.monto || 0), 0)
  const ventasHoy = visitas30dias.filter((v: any) => v.tipo === 'venta' && new Date(v.fechaBogota) >= hoy).reduce((a: number, v: any) => a + (v.monto || 0), 0)

  // Top empleados
  const empleadosMap: Record<string, { ventas: number, monto: number }> = {}
  visitas30dias.forEach((v: any) => {
    const nombre = v.empleado?.nombre || 'Sin nombre'
    if (!empleadosMap[nombre]) empleadosMap[nombre] = { ventas: 0, monto: 0 }
    if (v.tipo === 'venta') { empleadosMap[nombre].ventas++; empleadosMap[nombre].monto += v.monto || 0 }
  })
  const topEmpleados = Object.entries(empleadosMap).sort((a, b) => b[1].monto - a[1].monto).slice(0, 5).map(([nombre, data]) => ({ nombre, ...data }))

  // Visitas por dia (7 dias)
  const visitasPorDia: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })
    visitasPorDia[key] = 0
  }
  visitas30dias.filter((v: any) => new Date(v.fechaBogota) >= hace7dias).forEach((v: any) => {
    const key = new Date(v.fechaBogota).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })
    if (visitasPorDia[key] !== undefined) visitasPorDia[key]++
  })

  // Tabla 7 dias x vendedor
  const vendedores7 = [...new Set(visitas30dias.filter((v: any) => new Date(v.fechaBogota) >= hace7dias).map((v: any) => v.empleado?.nombre).filter(Boolean))] as string[]
  const dias7: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    dias7.push(d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }))
  }
  const tabla7dias = dias7.map(dia => {
    const row: Record<string, any> = { dia }
    vendedores7.forEach(v => { row[v] = 0 })
    visitas30dias.filter((v: any) => new Date(v.fechaBogota) >= hace7dias).forEach((v: any) => {
      const key = new Date(v.fechaBogota).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })
      if (key === dia && v.empleado?.nombre && vendedores7.includes(v.empleado.nombre)) row[v.empleado.nombre]++
    })
    return row
  })

  // Tabla 7 meses x vendedor
  const vendedores7m = [...new Set(visitas7meses.map((v: any) => v.empleado?.nombre).filter(Boolean))] as string[]
  const meses7: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    meses7.push(d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }))
  }
  const tabla7meses = meses7.map(mes => {
    const row: Record<string, any> = { mes }
    vendedores7m.forEach(v => { row[v] = 0 })
    visitas7meses.forEach((v: any) => {
      const key = new Date(v.fechaBogota).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
      if (key === mes && v.empleado?.nombre && vendedores7m.includes(v.empleado.nombre)) row[v.empleado.nombre]++
    })
    return row
  })

  return NextResponse.json({
    empleados, clientes, enTurno, visitasHoy, ventasHoy,
    ventasMes: ventasTotal, cobrosMes: cobrosTotal, porTipo,
    topEmpleados, rutasActivas: rutasActivas.length,
    visitasPorDia: Object.entries(visitasPorDia).map(([dia, cantidad]) => ({ dia, cantidad })),
    tabla7dias, vendedores7,
    tabla7meses, vendedores7m,
  })
}
