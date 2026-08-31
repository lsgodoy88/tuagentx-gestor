import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const user = session.user as any
    const empresaId = user.empresaId || user.id

    const url = new URL(req.url)
    const raw = url.searchParams.get('clienteIds') || ''
    const clienteIds = raw.split(',').filter(Boolean)
    if (clienteIds.length === 0) return NextResponse.json({ ventas: [] })

    // 3 meses rolling
    const ahora = new Date(Date.now() - 5*60*60*1000)
    const meses: { mes: string; inicio: Date; fin: Date }[] = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      const fin = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0, 23, 59, 59)
      meses.push({ mes: d.toISOString().slice(0, 7), inicio, fin })
    }

    // Traer apiIds de los clientes
    const clientes = await (prisma as any).cliente.findMany({
      where: { id: { in: clienteIds }, empresaId },
      select: { id: true, apiId: true }
    })
    const apiIdToClienteId = Object.fromEntries(
      clientes.filter((c: any) => c.apiId).map((c: any) => [c.apiId, c.id])
    )
    const apiIds = Object.keys(apiIdToClienteId)

    // Leer directo de OrdenDespacho — siempre fresco
    const ordenes = await (prisma as any).ordenDespacho.findMany({
      where: {
        empresaId,
        clienteApiId: { in: apiIds },
        isActiva: true,
        fechaFactura: { gte: meses[meses.length - 1].inicio }
      },
      select: { clienteApiId: true, fechaFactura: true, balance: true }
    })

    // Agrupar por clienteId + mes
    const mapa = new Map<string, { clienteId: string; mes: string; total: number; count: number }>()
    for (const o of ordenes) {
      const clienteId = apiIdToClienteId[o.clienteApiId]
      if (!clienteId || !o.fechaFactura) continue
      const mes = new Date(o.fechaFactura).toISOString().slice(0, 7)
      const key = `${clienteId}::${mes}`
      if (!mapa.has(key)) mapa.set(key, { clienteId, mes, total: 0, count: 0 })
      const e = mapa.get(key)!
      e.total += Number(o.balance || 0)
      e.count += 1
    }

    const ventas = Array.from(mapa.values()).map(e => ({
      clienteId: e.clienteId,
      mes: e.mes,
      totalVenta: e.total,
      cantidadVisitas: e.count,
    }))

    return NextResponse.json({ ventas, meses: meses.map(m => m.mes) })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
