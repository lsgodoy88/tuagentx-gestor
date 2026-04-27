import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { searchParams } = new URL(req.url)
  const mes  = parseInt(searchParams.get('mes')  || String(new Date().getMonth() + 1))
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()))

  // Vendedor: todas sus metas (el cliente filtra por mes)
  if (user.role === 'vendedor') {
    const metas = await prisma.metaRecaudo.findMany({
      where: { empleadoId: user.id }
    })
    return NextResponse.json({ metas })
  }

  // Supervisor: metas de sus vendedores
  if (user.role === 'supervisor') {
    const sv = await prisma.supervisorVendedor.findMany({
      where: { supervisorId: user.id },
      select: { vendedorId: true }
    })
    const ids = sv.map((s: any) => s.vendedorId)
    const metas = await prisma.metaRecaudo.findMany({
      where: { empleadoId: { in: ids }, mes, anio },
      include: { empleado: { select: { id: true, nombre: true } } }
    })
    return NextResponse.json({ metas })
  }

  // Admin/empresa: todas
  const metas = await prisma.metaRecaudo.findMany({
    where: { empresaId, mes, anio },
    include: { empleado: { select: { id: true, nombre: true } } }
  })
  return NextResponse.json({ metas })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role === 'vendedor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { empleadoId, mes, anio, metaPesos, metaPct } = await req.json()
  if (!empleadoId || !mes || !anio || !metaPesos)
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const meta = await prisma.metaRecaudo.upsert({
    where: { empleadoId_mes_anio: { empleadoId, mes, anio } },
    update: { metaPesos, metaPct: metaPct || null, updatedAt: new Date() },
    create: { empleadoId, empresaId, mes, anio, metaPesos, metaPct: metaPct || null }
  })
  return NextResponse.json({ meta })
}
