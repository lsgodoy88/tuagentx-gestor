import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN } from '@/lib/auth-helpers'
import { invalidatePattern } from '@/lib/cache'
import { anioBogota, mesBogota } from '@/lib/fechas'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

/**
 * GET /api/metas?empleadoId=X&anio=2026
 * Retorna 12 meses de MetaRecaudo y MetaVenta para un empleado.
 *
 * Auto-persiste en BD:
 * 1. MetaRecaudo: meses sin registro se rellenan desde SnapshotMes tipo='cartera'
 *    del mes anterior (datos.total = cartera al cierre).
 * 2. MetaVenta: meses sin registro se propagan desde el último mes con valor.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const { searchParams } = new URL(req.url)
    const empleadoId = searchParams.get('empleadoId')
    const anio = parseInt(searchParams.get('anio') || String(anioBogota()))

    if (!empleadoId) return NextResponse.json({ error: 'empleadoId requerido' }, { status: 400 })

    // ── Obtener empleado para resolver vendedor_api_id ──────────────
    const empleado = await (prisma as any).empleado.findUnique({
      where: { id: empleadoId },
      select: { apiId: true },
    })

    // ── Leer MetaRecaudo, MetaVenta y Snapshots cartera en paralelo ──
    // Snapshots: traemos todos los meses del año Y el dic del año anterior
    // (para prellenar enero: necesita snapshot dic año-1)
    const snapMeses = [
      `${anio - 1}-12`,
      ...Array.from({ length: 11 }, (_, i) => {
        const m = i + 1  // 1..11 → snap de ene..nov para prellenar feb..dic
        return `${anio}-${String(m).padStart(2, '0')}`
      }),
    ]

    const [recaudoDB, ventaDB, snapsCartera] = await Promise.all([
      (prisma as any).metaRecaudo.findMany({
        where: { empleadoId, empresaId, anio },
        select: { mes: true, metaPesos: true, metaPct: true },
      }),
      (prisma as any).metaVenta.findMany({
        where: { empleadoId, empresaId, anio },
        select: { mes: true, metaPesos: true },
      }),
      empleado?.apiId
        ? (prisma as any).$queryRawUnsafe(`
            SELECT mes, datos FROM ${DB_SCHEMA}."SnapshotMes"
            WHERE tipo = 'cartera'
              AND empresa_id = $1
              AND vendedor_api_id = $2
              AND mes = ANY($3::text[])
          `, empresaId, empleado.apiId, snapMeses)
        : Promise.resolve([]),
    ])

    // Map: mes_snapshot → total cartera
    // snapMeses[0] = dic año-1 → prellena mes 1 (enero)
    // snapMeses[i] = mes i (1..11) → prellena mes i+1
    const snapMap = new Map<string, number>(
      (snapsCartera as any[]).map((s: any) => [
        s.mes,
        Number(s.datos?.total ?? s.datos?.pendiente ?? 0),
      ])
    )

    // Para el mes M del año consultado, el snapshot que lo prellena es M-1
    // M=1 → snap dic año-1 = `${anio-1}-12`
    // M=2..12 → snap `${anio}-${M-1}`
    function snapKeyParaMes(m: number): string {
      if (m === 1) return `${anio - 1}-12`
      return `${anio}-${String(m - 1).padStart(2, '0')}`
    }

    const recaudoMap = new Map<number, any>(recaudoDB.map((r: any) => [r.mes, r]))
    const ventaMap   = new Map<number, any>(ventaDB.map((v: any) => [v.mes, v]))

    // ── Auto-persistir MetaRecaudo: mes M ← snapshot cartera mes M-1 ─
    const upsertRecaudo: Promise<any>[] = []
    for (let m = 1; m <= 12; m++) {
      if (recaudoMap.has(m)) continue  // ya existe — no sobreescribir
      const snapKey = snapKeyParaMes(m)
      const total = snapMap.get(snapKey)
      if (!total) continue  // no hay snapshot para ese mes anterior
      upsertRecaudo.push(
        (prisma as any).metaRecaudo.upsert({
          where: { empleadoId_mes_anio: { empleadoId, mes: m, anio } },
          create: { empleadoId, empresaId, mes: m, anio, metaPesos: total, metaPct: null },
          update: { metaPesos: total },
        })
      )
      recaudoMap.set(m, { mes: m, metaPesos: total, metaPct: null })
    }

    // ── Auto-persistir MetaVenta por propagación hacia adelante ────────
    // Itera 1→12: al encontrar un mes con valor actualiza el valorPropagado.
    // Meses vacíos POSTERIORES heredan ese valor. Meses anteriores no se tocan.
    const upsertVenta: Promise<any>[] = []
    let valorPropagado: number | null = null
    for (let m = 1; m <= 12; m++) {
      if (ventaMap.has(m)) {
        valorPropagado = Number(ventaMap.get(m).metaPesos)
      } else if (valorPropagado !== null) {
        upsertVenta.push(
          (prisma as any).metaVenta.upsert({
            where: { empleadoId_mes_anio: { empleadoId, mes: m, anio } },
            create: { empleadoId, empresaId, mes: m, anio, metaPesos: valorPropagado },
            update: { metaPesos: valorPropagado },
          })
        )
        ventaMap.set(m, { mes: m, metaPesos: valorPropagado })
      }
    }

    // Persistir en paralelo (fire & no-wait en error — no bloquea la respuesta)
    if (upsertRecaudo.length || upsertVenta.length) {
      await Promise.all([...upsertRecaudo, ...upsertVenta]).catch(e =>
        console.error('[metas GET] upsert automático falló:', e)
      )
    }

    // ── Construir respuesta con los 12 meses ─────────────────────────
    const recaudo = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const r = recaudoMap.get(m)
      return { mes: m, metaPesos: r?.metaPesos ?? null, metaPct: r?.metaPct ?? null }
    })
    const venta = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const v = ventaMap.get(m)
      return { mes: m, metaPesos: v?.metaPesos ?? null }
    })

    return NextResponse.json({ recaudo, venta })
  } catch (err: any) {
    console.error('[metas GET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

/**
 * POST /api/metas
 * Upsert batch de MetaRecaudo y MetaVenta para un empleado/año
 * body: { empleadoId, anio, recaudo: [{mes, metaPesos}], venta: [{mes, metaPesos}] }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const body = await req.json()
    const { empleadoId, anio, recaudo = [], venta = [] } = body

    if (!empleadoId || !anio) return NextResponse.json({ error: 'empleadoId y anio requeridos' }, { status: 400 })

    const ops: Promise<any>[] = []

    for (const r of recaudo) {
      if (r.metaPesos === null || r.metaPesos === '') {
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
    await invalidatePattern(`g:v:${empleadoId}:*`).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[metas POST]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
