import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { buildSemana } from '@/lib/impulsoMetricas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  const inicioMes = new Date(fecha.slice(0, 7) + '-01T00:00:00.000Z')
  const finMes = new Date(new Date(inicioMes).setMonth(inicioMes.getMonth() + 1) - 1)
  const mesLabel = inicioMes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  let whereImp: any = { empresaId, rol: 'impulsadora', activo: true }
  if (user.role === 'vendedor') whereImp.vendedorId = user.id
  if (user.role === 'impulsadora') whereImp = { id: user.id, rol: 'impulsadora', activo: true }

  const impulsadoras = await prisma.empleado.findMany({
    where: whereImp,
    orderBy: { nombre: 'asc' }
  })

  const resultados = await Promise.all(impulsadoras.map(async (imp: any) => { try {
    const rutasFijas = await prisma.rutaFija.findMany({
      where: { empleados: { some: { empleadoId: imp.id } } },
      include: { clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } } }
    })

    if (rutasFijas.length === 0) return null

    // Todos los clienteIds únicos de sus rutas
    const clienteIds = [...new Set(rutasFijas.flatMap((r: any) => r.clientes.map((c: any) => c.clienteId)))]

    // Traer clientes con apiId para saber cuáles tienen ERP
    const clientes = await prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: { id: true, apiId: true }
    })

    const ventasPorCliente: Record<string, number> = {}

    // Clientes con ERP → SyncDeuda
    const conApiId = clientes.filter((c: any) => c.apiId)
    const sinApiId = clientes.filter((c: any) => !c.apiId)

    if (conApiId.length > 0) {
      const apiIds = conApiId.map((c: any) => c.apiId)
      const apiIdToClienteId = Object.fromEntries(conApiId.map((c: any) => [c.apiId, c.id]))

      const deudas = await (prisma as any).syncDeuda.findMany({
        where: {
          clienteApiId: { in: apiIds },
          modificadoEn: { gte: inicioMes, lte: finMes },
          condition: true,
        },
        select: { clienteApiId: true, valor: true }
      })

      for (const d of deudas) {
        const cid = apiIdToClienteId[d.clienteApiId]
        if (!cid) continue
        ventasPorCliente[cid] = (ventasPorCliente[cid] || 0) + Number(d.valor)
      }
    }

    // Clientes sin ERP → Visita
    if (sinApiId.length > 0) {
      const ids = sinApiId.map((c: any) => c.id)
      const visitas = await prisma.visita.findMany({
        where: {
          clienteId: { in: ids },
          empleadoId: imp.id,
          tipo: { in: ['venta', 'cobro'] },
          fechaBogota: { gte: inicioMes, lte: finMes }
        },
        select: { clienteId: true, monto: true }
      })
      for (const v of visitas) {
        ventasPorCliente[v.clienteId] = (ventasPorCliente[v.clienteId] || 0) + Number(v.monto || 0)
      }
    }

    const semana = buildSemana(rutasFijas, ventasPorCliente).filter(Boolean)
    const totalMeta = semana.reduce((a: number, d: any) => a + d.totalMeta, 0)
    const totalMes = semana.reduce((a: number, d: any) => a + d.totalMes, 0)
    const pctTotal = totalMeta > 0 ? Math.round((totalMes / totalMeta) * 100) : null

    return { id: imp.id, nombre: imp.nombre, semana, totalMeta, totalMes, pctTotal }
  } catch(e: any) { console.error('[pdf]', imp.nombre, e.message); return null } }))

  return NextResponse.json({
    mes: mesLabel,
    fecha,
    impulsadoras: resultados.filter(Boolean)
  })
}
