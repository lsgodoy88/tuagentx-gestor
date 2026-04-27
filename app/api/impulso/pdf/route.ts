import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildSemana } from '@/lib/impulsoMetricas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  const inicioMes = new Date(fecha.slice(0, 7) + '-01T00:00:00.000Z')
  const finMes = new Date(new Date(inicioMes).setMonth(inicioMes.getMonth() + 1) - 1)
  const mesLabel = inicioMes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  let whereImp: any = { empresaId, rol: 'impulsadora', activo: true }
  if (user.role === 'vendedor') whereImp.vendedorId = user.id
  if (user.role === 'impulsadora') whereImp = { id: user.id, rol: 'impulsadora', activo: true }
  const impulsadoras = await prisma.empleado.findMany({ where: whereImp, orderBy: { nombre: 'asc' } })
  const resultados = await Promise.all(impulsadoras.map(async (imp: any) => {
    const rutasFijas = await prisma.rutaFija.findMany({
      where: { empleados: { some: { empleadoId: imp.id } } },
      include: { clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } } }
    })
    const visitasMes = await prisma.visita.findMany({
      where: { empleadoId: imp.id, tipo: { in: ['venta', 'cobro'] }, fechaBogota: { gte: inicioMes, lte: finMes } },
      take: 500
    })
    const semana = buildSemana(rutasFijas, visitasMes).filter(Boolean)
    const totalMeta = semana.reduce((a: number, d: any) => a + d.totalMeta, 0)
    const totalMes = semana.reduce((a: number, d: any) => a + d.totalMes, 0)
    const pctTotal = totalMeta > 0 ? Math.round((totalMes / totalMeta) * 100) : null
    return { id: imp.id, nombre: imp.nombre, semana, totalMeta, totalMes, pctTotal }
  }))
  return NextResponse.json({ mes: mesLabel, fecha, impulsadoras: resultados })
}
