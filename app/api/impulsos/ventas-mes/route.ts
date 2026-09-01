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

    // 3 meses rolling en Bogotá
    const ahoraBogota = new Date(Date.now() - 5 * 60 * 60 * 1000)
    const meses: string[] = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(ahoraBogota.getFullYear(), ahoraBogota.getMonth() - i, 1)
      meses.push(d.toISOString().slice(0, 7))
    }

    // Fuente única: VentaMesCliente — misma que usa calcularImpulsadorasMes
    const rows = await (prisma as any).ventaMesCliente.findMany({
      where: {
        clienteId: { in: clienteIds },
        mes: { in: meses },
        empresaId,
      },
      select: { clienteId: true, mes: true, totalVenta: true }
    })

    const ventas = rows.map((r: any) => ({
      clienteId: r.clienteId,
      mes: r.mes,
      totalVenta: Number(r.totalVenta || 0),
      cantidadVisitas: 0,
    }))

    return NextResponse.json({ ventas, meses })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
