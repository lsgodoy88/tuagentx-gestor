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

  const hace3meses = new Date()
  hace3meses.setMonth(hace3meses.getMonth() - 3)

  // Buscar en SyncDeuda si tiene integración ERP
  if (cliente.apiId) {
    const deudas = await (prisma as any).syncDeuda.findMany({
      where: {
        clienteApiId: cliente.apiId,
        modificadoEn: { gte: hace3meses },
        condition: true,
      },
      select: { valor: true, modificadoEn: true }
    })

    if (deudas.length > 0) {
      const porMes: Record<string, number> = {}
      for (const d of deudas) {
        const mes = d.modificadoEn
          ? new Date(d.modificadoEn).toISOString().slice(0, 7)
          : 'unknown'
        porMes[mes] = (porMes[mes] || 0) + Number(d.valor)
      }
      const meses = Object.keys(porMes).length
      const totalVentas = Object.values(porMes).reduce((a, b) => a + b, 0)
      const promedio = Math.round(totalVentas / meses)
      return NextResponse.json({
        promedio,
        totalVentas,
        meses,
        cantidadVisitas: deudas.length,
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
