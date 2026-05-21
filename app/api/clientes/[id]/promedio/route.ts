import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.empresaId || user.id
  const { id } = await params

  const cliente = await prisma.cliente.findFirst({
    where: { id, empresaId },
    select: { id: true, nombre: true, metaVenta: true, apiId: true }
  })
  if (!cliente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const hace3meses = new Date(Date.now() - 5*60*60*1000)
  hace3meses.setMonth(hace3meses.getMonth() - 3)

  // Buscar en VentaMesCliente si tiene integración ERP (datos reales de ventas)
  if (cliente.apiId) {
    const mesInicio = hace3meses.toISOString().slice(0, 7)
    const ventasMes = await (prisma as any).ventaMesCliente.findMany({
      where: { clienteId: cliente.id, mes: { gte: mesInicio } },
      select: { totalVenta: true, cantidadVisitas: true, mes: true }
    })

    if (ventasMes.length > 0) {
      const totalVentas = ventasMes.reduce((s: number, v: any) => s + Number(v.totalVenta), 0)
      const meses = ventasMes.length
      const cantidadVisitas = ventasMes.reduce((s: number, v: any) => s + (v.cantidadVisitas || 0), 0)
      const promedio = Math.round(totalVentas / meses)
      return NextResponse.json({
        promedio,
        totalVentas,
        meses,
        cantidadVisitas,
        metaActual: cliente.metaVenta,
        fuente: 'erp'
      })
    }
  }

  // Fallback: visitas del app
  const visitas = await prisma.visita.findMany({
    where: {
      clienteId: id,
      tipo: 'venta',
      monto: { gt: 0 },
      fechaBogota: { gte: hace3meses }
    },
    select: { monto: true, fechaBogota: true }
  })

  if (visitas.length === 0) {
    return NextResponse.json({ promedio: null, totalVentas: 0, meses: 0, metaActual: cliente.metaVenta })
  }

  const porMes: Record<string, number> = {}
  for (const v of visitas) {
    const mes = v.fechaBogota ? new Date(v.fechaBogota).toISOString().slice(0, 7) : 'unknown'
    porMes[mes] = (porMes[mes] || 0) + Number(v.monto)
  }
  const meses = Object.keys(porMes).length
  const totalVentas = Object.values(porMes).reduce((a, b) => a + b, 0)
  const promedio = Math.round(totalVentas / meses)

  return NextResponse.json({
    promedio,
    totalVentas,
    meses,
    cantidadVisitas: visitas.length,
    metaActual: cliente.metaVenta,
    fuente: 'app'
  })
}
