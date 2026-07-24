import type { AdminStats } from '@/lib/types/admin'
import { NextResponse } from 'next/server'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { withCache } from '@/lib/cache'
import { calcularSaldoActual, calcularEgresosMes } from '@/lib/saldos'

export async function GET() {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const cacheKey = `g:${empresaId}:stats:${fechaHoyBogota()}`

  const stats = await withCache(cacheKey, 60, async () => {
  const hoy = inicioDiaBogota()
  const hace7dias = haceNDiasBogota(7)
  const hace30dias = haceNDiasBogota(30)
  const hace7meses = haceNMesesBogota(6)

  const mesActual = hoy.getMonth() + 1
  const anioActual = hoy.getFullYear()

  const [empleados, clientes, enTurno, visitas30dias, visitas7meses, rutasActivas,
         vendedoresActivos, totalVendedores,
         ordenesDespachadasHoy, ordenesFact,
         impulsosActivos, totalImpulsos,
         recaudoHoy, recaudoMesAgg,
         metaVentaRows, metaRecaudoRows,
         ventasMesAgg] = await Promise.all([
    prisma.empleado.count({ where: { empresaId, activo: true } }),
    prisma.cliente.count({ where: { empresaId } }),
    prisma.turno.count({ where: { empleado: { empresaId }, activo: true } }),
    prisma.visita.findMany({
      where: { empleado: { empresaId }, fechaBogota: { gte: hace30dias } },
      select: { tipo: true, monto: true, fechaBogota: true, empleado: { select: { nombre: true, rol: true } } },
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
    // Card 1: Vendedores en turno hoy / total vendedores activos
    prisma.turno.count({ where: { empleado: { empresaId, rol: 'vendedor' }, activo: true } }),
    prisma.empleado.count({ where: { empresaId, rol: 'vendedor', activo: true } }),
    // Card 3: Órdenes despachadas hoy / facturadas hoy
    (prisma as any).ordenDespacho.count({ where: { empresaId, estado: { in: ['en_entrega','entregado'] }, entregadoEl: { gte: hoy } } }),
    (prisma as any).ordenDespacho.count({ where: { empresaId, createdAt: { gte: hoy } } }),
    // Card 2: Impulsadoras con ruta hoy / total impulsadoras activas
    (prisma as any).ruta.count({ where: { empresaId, cerrada: false, empleados: { some: { empleado: { rol: 'impulsadora' } } } } }),
    prisma.empleado.count({ where: { empresaId, rol: 'impulsadora', activo: true } }),
    // Card 4: Recaudo hoy / recaudado mes
    prisma.visita.aggregate({ where: { empleado: { empresaId }, tipo: 'cobro', fechaBogota: { gte: hoy } }, _sum: { monto: true } }),
    prisma.visita.aggregate({ where: { empleado: { empresaId }, tipo: 'cobro', fechaBogota: { gte: new Date(hoy.getFullYear(), hoy.getMonth(), 1) } }, _sum: { monto: true } }),
    // Metas mes actual — suma de todos los vendedores de la empresa
    (prisma as any).metaVenta.findMany({ where: { empresaId, mes: mesActual, anio: anioActual }, select: { metaPesos: true, empleado: { select: { nombre: true } } } }),
    (prisma as any).metaRecaudo.findMany({ where: { empresaId, mes: mesActual, anio: anioActual }, select: { metaPesos: true, empleado: { select: { nombre: true } } } }),
    (prisma as any).ordenDespacho.aggregate({ where: { empresaId, createdAt: { gte: new Date(hoy.getFullYear(), hoy.getMonth(), 1) } }, _sum: { totalOrden: true } }),
  ])

  const visitasHoy = visitas30dias.filter((v: any) => new Date(v.fechaBogota) >= hoy).length
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1)
  const visitasAyer = visitas30dias.filter((v: any) => { const f = new Date(v.fechaBogota); return f >= ayer && f < hoy }).length
  const porTipo = visitas30dias.reduce((acc: any, v: any) => { acc[v.tipo] = (acc[v.tipo] || 0) + 1; return acc }, {})
  const ventasTotal = Number((ventasMesAgg as any)?._sum?.totalOrden || 0)
  const cobrosTotal = visitas30dias.filter((v: any) => v.tipo === 'cobro').reduce((a: number, v: any) => a + (v.monto || 0), 0)
  const ventasHoy = visitas30dias.filter((v: any) => v.tipo === 'venta' && new Date(v.fechaBogota) >= hoy).reduce((a: number, v: any) => a + (v.monto || 0), 0)

  // Top empleados
  const empleadosMap: Record<string, { ventas: number, monto: number }> = {}
  visitas30dias.filter((v: any) => v.empleado?.rol === 'vendedor').forEach((v: any) => {
    const nombre = v.empleado?.nombre || 'Sin nombre'
    if (!empleadosMap[nombre]) empleadosMap[nombre] = { ventas: 0, monto: 0 }
    if (v.tipo === 'venta') { empleadosMap[nombre].ventas++; empleadosMap[nombre].monto += v.monto || 0 }
  })
  const metaVentaByNombre: Record<string,number> = {}
  metaVentaRows.forEach((r: any) => { if (r.empleado?.nombre) metaVentaByNombre[r.empleado.nombre] = Number(r.metaPesos||0) })
  const metaRecaudoByNombre: Record<string,number> = {}
  metaRecaudoRows.forEach((r: any) => { if (r.empleado?.nombre) metaRecaudoByNombre[r.empleado.nombre] = Number(r.metaPesos||0) })

  const topEmpleados = Object.entries(empleadosMap).sort((a, b) => b[1].monto - a[1].monto).slice(0, 5).map(([nombre, data]) => ({ nombre, ...data, meta: metaVentaByNombre[nombre] ?? null }))

  // Recaudo del mes por vendedor
  const recaudoMap: Record<string, number> = {}
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  visitas30dias.filter((v: any) => v.tipo === 'cobro' && v.empleado?.rol === 'vendedor' && new Date(v.fechaBogota) >= inicioMes).forEach((v: any) => {
    const nombre = v.empleado?.nombre || 'Sin nombre'
    recaudoMap[nombre] = (recaudoMap[nombre] || 0) + (v.monto || 0)
  })
  const recaudoPorVendedor = Object.entries(recaudoMap).sort((a, b) => b[1] - a[1]).map(([nombre, monto]) => ({ nombre, monto, meta: metaRecaudoByNombre[nombre] ?? null }))

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
    const d = nowBogota()
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

  // Metas mes: suma de todos los vendedores configurados
  const metaVentaMes = metaVentaRows.reduce((a: number, r: any) => a + Number(r.metaPesos || 0), 0)
  const metaRecaudoMes = metaRecaudoRows.reduce((a: number, r: any) => a + Number(r.metaPesos || 0), 0)

  const stats = {
    empleados, clientes, enTurno, visitasHoy, ventasHoy,
    ventasMes: ventasTotal, cobrosMes: cobrosTotal, porTipo,
    topEmpleados, rutasActivas: rutasActivas.length,
    visitasPorDia: Object.entries(visitasPorDia).map(([dia, cantidad]) => ({ dia, cantidad })),
    tabla7dias, vendedores7,
    tabla7meses, vendedores7m,
    // Nuevas métricas
    vendedoresActivos, totalVendedores,
    visitasHoyTotal: visitasHoy,
    visitasAyer,
    ordenesDespachadasHoy, ordenesFact,
    impulsosActivos, totalImpulsos,
    recaudoHoy: Number(recaudoHoy._sum.monto || 0),
    recaudoMes: Number(recaudoMesAgg._sum.monto || 0),
    metaVentaMes,
    metaRecaudoMes,
    recaudoPorVendedor,
  }
  return stats satisfies AdminStats
  }) // withCache

  // Saldos y egresos siempre frescos — fuera del cache para garantizar primera carga
  const [saldos, egresos] = await Promise.all([
    calcularSaldoActual(empresaId),
    calcularEgresosMes(empresaId, mesBogota(), anioBogota()),
  ])

  const res = NextResponse.json({ ...stats, saldos, egresos })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

