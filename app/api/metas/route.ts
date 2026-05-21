import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN } from '@/lib/auth-helpers'

/**
 * GET /api/metas?empleadoId=X&anio=2026
 * Retorna 12 meses de MetaRecaudo y MetaVenta para un empleado
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const empleadoId = searchParams.get('empleadoId')
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()))

  if (!empleadoId) return NextResponse.json({ error: 'empleadoId requerido' }, { status: 400 })

  const [recaudo, venta] = await Promise.all([
    (prisma as any).metaRecaudo.findMany({
      where: { empleadoId, empresaId, anio },
      select: { mes: true, metaPesos: true, metaPct: true },
    }),
    (prisma as any).metaVenta.findMany({
      where: { empleadoId, empresaId, anio },
      select: { mes: true, metaPesos: true },
    }),
  ])

  return NextResponse.json({ recaudo, venta })
}

/**
 * POST /api/metas
 * Upsert batch de MetaRecaudo y MetaVenta para un empleado/año
 * body: { empleadoId, anio, recaudo: [{mes, metaPesos}], venta: [{mes, metaPesos}] }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const body = await req.json()
  const { empleadoId, anio, recaudo = [], venta = [] } = body

  if (!empleadoId || !anio) return NextResponse.json({ error: 'empleadoId y anio requeridos' }, { status: 400 })

  // Upsert en paralelo — solo meses que vienen en el body
  const ops: Promise<any>[] = []

  for (const r of recaudo) {
    if (r.metaPesos === null || r.metaPesos === '') {
      // Borrar si viene vacío
      ops.push((prisma as any).metaRecaudo.deleteMany({ where: { empleadoId, empresaId, mes: r.mes, anio } }))
    } else {
      ops.push((prisma as any).metaRecaudo.upsert({
        where: { empleadoId_mes_anio: { empleadoId, mes: r.mes, anio } },
        create: { empleadoId, empresaId, mes: r.mes, anio, metaPesos: r.metaPesos, metaPct: r.metaPct ?? null },
        update: { metaPesos: r.metaPesos, metaPct: r.metaPct ?? null },
      }))
    }
  }

  for (const v of venta) {
    if (v.metaPesos === null || v.metaPesos === '') {
      ops.push((prisma as any).metaVenta.deleteMany({ where: { empleadoId, empresaId, mes: v.mes, anio } }))
    } else {
      ops.push((prisma as any).metaVenta.upsert({
        where: { empleadoId_mes_anio: { empleadoId, mes: v.mes, anio } },
        create: { empleadoId, empresaId, mes: v.mes, anio, metaPesos: v.metaPesos },
        update: { metaPesos: v.metaPesos },
      }))
    }
  }

  await Promise.all(ops)
  return NextResponse.json({ ok: true })
}
