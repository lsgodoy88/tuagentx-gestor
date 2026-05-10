import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DIAS } from '@/lib/constants'
import { buildSemana } from '@/lib/impulsoMetricas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const impulsadoraId = searchParams.get('impulsadoraId')
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  if (!impulsadoraId) return NextResponse.json({ error: 'Falta impulsadoraId' }, { status: 400 })

  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const inicioMes = new Date(fecha.slice(0, 7) + '-01T00:00:00.000Z')
  const finMes = new Date(new Date(inicioMes).setMonth(inicioMes.getMonth() + 1) - 1)

  // Todas las rutas fijas del empleado
  const rutasFijas = await prisma.rutaFija.findMany({
    where: { empleados: { some: { empleadoId: impulsadoraId } } },
    include: { clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } } }
  })

  // Detectar integracion UpTres activa
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  const ventasPorCliente: Record<string, number> = {}
  let comprasMes: any[] = []
  let modoSync = false

  if (integracion) {
    modoSync = true
    // Obtener apiIds de los clientes en rutas fijas
    const clienteIds = rutasFijas.flatMap((r: any) =>
      (r.clientes || []).map((c: any) => c.clienteId)
    )
    const clientes = await (prisma as any).cliente.findMany({
      where: { id: { in: clienteIds }, apiId: { not: null } },
      select: { id: true, apiId: true }
    })
    const apiIds = clientes.map((c: any) => c.apiId).filter(Boolean)

    // Traer compras del mes desde SyncCompra
    if (apiIds.length > 0) {
      comprasMes = await (prisma as any).syncCompra.findMany({
        where: {
          integracionId: integracion.id,
          clienteApiId: { in: apiIds },
          condition: true,
          fecha: { gte: inicioMes, lte: finMes }
        }
      })
    }

    // Mapear apiId -> clienteId
    const apiIdToClienteId: Record<string, string> = {}
    clientes.forEach((c: any) => { if (c.apiId) apiIdToClienteId[c.apiId] = c.id })

    // Construir ventasPorCliente desde SyncDeuda
    for (const d of comprasMes) {
      const cid = apiIdToClienteId[d.clienteApiId]
      if (cid) ventasPorCliente[cid] = (ventasPorCliente[cid] || 0) + Number(d.valor)
    }

    // Clientes sin apiId → Visita
    const sinApiId = clientes.filter((c: any) => !c.apiId).map((c: any) => c.id)
    if (sinApiId.length > 0) {
      const vis = await prisma.visita.findMany({
        where: { clienteId: { in: sinApiId }, empleadoId: impulsadoraId, tipo: { in: ['venta','cobro'] }, fechaBogota: { gte: inicioMes, lte: finMes } },
        select: { clienteId: true, monto: true }
      })
      for (const v of vis) ventasPorCliente[v.clienteId] = (ventasPorCliente[v.clienteId] || 0) + Number(v.monto || 0)
    }
  } else {
    // Modo manual — visitas registradas por la impulsadora
    const vis = await prisma.visita.findMany({
      where: { empleadoId: impulsadoraId, tipo: { in: ['venta', 'cobro'] }, fechaBogota: { gte: inicioMes, lte: finMes } },
      take: 500, select: { clienteId: true, monto: true }
    })
    for (const v of vis) ventasPorCliente[v.clienteId] = (ventasPorCliente[v.clienteId] || 0) + Number(v.monto || 0)
  }

  const semana = buildSemana(rutasFijas, ventasPorCliente).map((d, i) => {
    const dia = [1, 2, 3, 4, 5, 6, 0][i]
    if (!d) return { dia, nombre: DIAS[dia], configurado: false, puntos: [], totalMeta: 0, totalMes: 0, pctTotal: null }
    return { ...d, configurado: true }
  })

  const totalMetaGeneral = semana.reduce((a, d) => a + d.totalMeta, 0)
  const totalMesGeneral = semana.reduce((a, d) => a + d.totalMes, 0)
  const pctGeneral = totalMetaGeneral > 0 ? Math.round((totalMesGeneral / totalMetaGeneral) * 100) : null

  return NextResponse.json({
    semana,
    totalMeta: totalMetaGeneral,
    totalMes: totalMesGeneral,
    pctTotal: pctGeneral,
    _modo: modoSync ? 'sync' : 'manual'
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { impulsadoraId, clienteId, tipo, monto, nota } = await req.json()
  if (!impulsadoraId || !clienteId || !monto) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  const visita = await prisma.visita.create({
    data: {
      id: crypto.randomUUID(),
      empleadoId: impulsadoraId,
      clienteId,
      tipo: tipo || 'venta',
      monto: Number(monto),
      nota: nota || null,
      fechaBogota: new Date(Date.now() - 5 * 60 * 60 * 1000),
    }
  })
  return NextResponse.json({ ok: true, visita })
}
