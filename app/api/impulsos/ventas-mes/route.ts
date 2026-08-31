import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const user = session.user as any
    const empresaId = getEmpresaId(user)

    const url = new URL(req.url)
    const raw = url.searchParams.get('clienteIds') || ''
    const clienteIds = raw.split(',').filter(Boolean)
    if (clienteIds.length === 0) return NextResponse.json({ ventas: [] })

    // 3 meses rolling
    const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000) // hora Bogotá
    const meses: string[] = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      meses.push(d.toISOString().slice(0, 7))
    }

    // Leer de VentaMesCliente — totalVenta real sincronizado con UpTres
    const registros = await (prisma as any).ventaMesCliente.findMany({
      where: {
        clienteId: { in: clienteIds },
        empresaId,
        mes: { in: meses },
      },
      select: { clienteId: true, mes: true, totalVenta: true, cantidadVisitas: true },
    })

    return NextResponse.json({
      ventas: registros.map((r: any) => ({
        clienteId: r.clienteId,
        mes: r.mes,
        totalVenta: Number(r.totalVenta),
        cantidadVisitas: r.cantidadVisitas,
      })),
      meses,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
