import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN, ROLES_VENDEDOR_RUTAS } from '@/lib/auth-helpers'
import { fechaHoyBogota } from '@/lib/fechas'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

const ROLES_PERMITIDOS = ROLES_VENDEDOR_RUTAS
const MAX_SYNC_DIA = 2

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { syncVentasHoy: true, syncVentasFecha: true, syncVentasUltimo: true } as any
  }) as any

  const hoyBogota = fechaHoyBogota()
  const mismaFecha = empresa?.syncVentasFecha?.toISOString().split('T')[0] === hoyBogota
  const usadosHoy = mismaFecha ? (empresa?.syncVentasHoy ?? 0) : 0
  const restantes = MAX_SYNC_DIA - usadosHoy

  return NextResponse.json({
    usadosHoy,
    restantes,
    ultimoSync: empresa?.syncVentasUltimo ?? null,
    puedeSync: restantes > 0,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (!ROLES_PERMITIDOS.includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const empresaId = getEmpresaId(user)
  const hoyBogota = fechaHoyBogota()

  // Verificar límite
  // Límite por empleado (vendedor/impulsadora) o por empresa (admin)
  const esAdmin2 = ROLES_ADMIN.includes(user.role)
  const limiteKey = !esAdmin2 ? `sync-ventas:${user.id}:${hoyBogota}` : `sync-ventas:${empresaId}:${hoyBogota}`

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { syncVentasHoy: true, syncVentasFecha: true } as any
  }) as any

  // Para vendedor: verificar límite en Empleado
  let usadosHoy = 0
  if (!esAdmin2) {
    const emp = await (prisma as any).empleado.findUnique({
      where: { id: user.id },
      select: { syncVentasHoy: true, syncVentasFecha: true }
    })
    const mismaFechaEmp = emp?.syncVentasFecha?.toISOString().split('T')[0] === hoyBogota
    usadosHoy = mismaFechaEmp ? (emp?.syncVentasHoy ?? 0) : 0
  } else {
    const mismaFecha = empresa?.syncVentasFecha?.toISOString().split('T')[0] === hoyBogota
    usadosHoy = mismaFecha ? (empresa?.syncVentasHoy ?? 0) : 0
  }

  if (usadosHoy >= MAX_SYNC_DIA) {
    return NextResponse.json({ error: 'Límite de 2 sync diarios alcanzado', restantes: 0 }, { status: 429 })
  }

  // Filtrar por empleado si es vendedor/impulsadora — solo sus rutas fijas
  const esAdmin = ROLES_ADMIN.includes(user.role)
  const empleadoId = !esAdmin ? user.id : undefined

  const rutasFijas = await (prisma as any).rutaFija.findMany({
    where: { empresaId, ...(empleadoId ? { empleadoId } : {}) },
    include: { clientes: { include: { cliente: { select: { id: true, apiId: true } } } } }
  })

  const clienteIds = [...new Set(
    rutasFijas.flatMap((r: any) => r.clientes.map((rc: any) => rc.clienteId))
  )] as string[]

  const clientes = await prisma.cliente.findMany({
    where: { id: { in: clienteIds }, apiId: { not: null } },
    select: { id: true, apiId: true }
  })

  if (clientes.length === 0) {
    return NextResponse.json({ ok: true, mensaje: 'Sin clientes con integración', actualizados: 0 })
  }

  // Integración UpTres
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  if (!integracion) {
    return NextResponse.json({ error: 'Sin integración activa' }, { status: 400 })
  }

  const cfg = integracion.config as any
  const apiSecret = decrypt(cfg.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(cfg.apiKey, apiSecret)
  await adapter.login()

  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1) // 3 meses
  const mapa = new Map<string, { clienteId: string; mes: string; total: number; count: number }>()

  // Por cada cliente con apiId, traer sus ventas/órdenes del mes via fetchVentas
  for (const cli of clientes) {
    try {
      const ventas = await adapter.fetchVentas(inicioMes, cli.apiId!)
      // Filtrar por cliente en caso de que UpTres ignore el parámetro customerId
      const ventasFiltradas = ventas.filter((v: any) => v.cliente?.uid === cli.apiId)
      for (const v of ventasFiltradas) {
        const fechaRaw = v.fCreado || v.fModificado
        if (!fechaRaw) continue
        const fecha = new Date(fechaRaw)
        if (isNaN(fecha.getTime())) continue
        const mes = fecha.toISOString().slice(0, 7)
        const key = `${cli.id}::${mes}`
        if (!mapa.has(key)) mapa.set(key, { clienteId: cli.id, mes, total: 0, count: 0 })
        const e = mapa.get(key)!
        e.total += Number(v.vTotal || 0)
        e.count += 1
      }
    } catch { /* cliente sin ventas */ }
  }

  // Upsert VentaMesCliente
  if (mapa.size > 0) {
    const ops = Array.from(mapa.values()).map(e =>
      (prisma as any).ventaMesCliente.upsert({
        where: { clienteId_mes: { clienteId: e.clienteId, mes: e.mes } },
        create: { clienteId: e.clienteId, empresaId, mes: e.mes, totalVenta: e.total, cantidadVisitas: e.count },
        update: { totalVenta: e.total, cantidadVisitas: e.count },
      })
    )
    await (prisma as any).$transaction(ops)
  }

  // Actualizar contador — por empleado o por empresa
  if (!esAdmin2) {
    await (prisma as any).empleado.update({
      where: { id: user.id },
      data: {
        syncVentasHoy: usadosHoy + 1,
        syncVentasFecha: new Date(hoyBogota),
      } as any
    }).catch(() => {}) // si el campo no existe, ignorar
  } else {
    await (prisma as any).empresa.update({
      where: { id: empresaId },
      data: {
        syncVentasHoy: usadosHoy + 1,
        syncVentasFecha: new Date(hoyBogota),
        syncVentasUltimo: new Date(),
      } as any
    })
  }

  return NextResponse.json({
    ok: true,
    actualizados: mapa.size,
    restantes: MAX_SYNC_DIA - (usadosHoy + 1),
    ultimoSync: new Date(),
  })
}
