import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCache } from '@/lib/cache'
import { fechaHoyBogota, inicioDiaBogota } from '@/lib/fechas'

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const start = Date.now()
  const empresas = await prisma.empresa.findMany({
    where: { activo: true },
    select: { id: true, email: true }
  })

  const resultados: any[] = []

  for (const empresa of empresas) {
    const empresaId = empresa.id
    try {
      // Calentar /api/stats
      const statsKey = `g:${empresaId}:stats:${fechaHoyBogota()}`
      await withCache(statsKey, 300, async () => {
        const [empleados, clientes, turnosActivos, vendedoresEnTurno, totalVendedores] = await Promise.all([
          prisma.empleado.count({ where: { empresaId, activo: true } }),
          prisma.cliente.count({ where: { empresaId } }),
          prisma.turno.count({ where: { empleado: { empresaId }, activo: true } }),
          prisma.turno.count({ where: { empleado: { empresaId, rol: 'vendedor' }, activo: true } }),
          prisma.empleado.count({ where: { empresaId, rol: 'vendedor', activo: true } }),
        ])
        return { empleados, clientes, turnosActivos, vendedoresEnTurno, totalVendedores, _warmup: true }
      })

      // Calentar /api/cartera/resumen
      const carteraKey = `g:${empresaId}:cartera:resumen:${fechaHoyBogota()}`
      await withCache(carteraKey, 300, async () => {
        const integracion = await prisma.integracion.findFirst({
          where: { empresaId, tipo: 'uptres', activa: true },
          select: { id: true }
        })
        if (!integracion) return { total: 0, saldoPendiente: 0, _warmup: true }
        const resumen = await (prisma as any).syncDeuda.aggregate({
          where: { integracionId: integracion.id, saldo: { gt: 0 } },
          _sum: { saldo: true },
          _count: { id: true }
        })
        return {
          total: resumen._count.id ?? 0,
          saldoPendiente: resumen._sum.saldo ?? 0,
          _warmup: true
        }
      })

      resultados.push({ empresa: empresa.email, ok: true })
    } catch (e: any) {
      resultados.push({ empresa: empresa.email, ok: false, error: e.message })
    }
  }

  return NextResponse.json({
    ok: true,
    empresas: resultados.length,
    ms: Date.now() - start,
    resultados
  })
}
