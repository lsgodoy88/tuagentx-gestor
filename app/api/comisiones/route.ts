import type { ComisionesResponse } from '@/lib/types/cartera'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN } from '@/lib/auth-helpers'
import { inicioDiaBogota, mesBogota, anioBogota } from '@/lib/fechas'

// GET — configs + último cálculo del mes
export async function GET(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const mes  = parseInt(searchParams.get('mes')  || String(mesBogota()))
  const anio = parseInt(searchParams.get('anio') || String(anioBogota()))

  const [vendedores, configs, calculo] = await Promise.all([
    prisma.empleado.findMany({
      where: { empresaId, rol: 'vendedor', activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    (prisma as any).comisionConfig.findMany({
      where: { empresaId },
      select: { empleadoId: true, porcentaje: true, formula: true },
    }),
    (prisma as any).comisionCalculo.findFirst({
      where: { empresaId, mes, anio },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Stats recaudo del mes por vendedor
  const inicioMes = new Date(`${anio}-${String(mes).padStart(2,'0')}-01T05:00:00.000Z`)
  const finMes    = new Date(inicioMes)
  finMes.setMonth(finMes.getMonth() + 1)

  const recaudos = await prisma.pagoCartera.groupBy({
    by: ['empleadoId', 'metodopago'],
    where: {
      OR: [
        { Cartera: { empresaId } },
        { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
      ],
      createdAt: { gte: inicioMes, lt: finMes },
    },
    _sum: { monto: true, descuento: true },
    _count: { id: true },
  })

  const configMap = Object.fromEntries(configs.map((c: any) => [c.empleadoId, c]))

  // Agrega por vendedor: efectivo / transferencia / otro (todo lo demás, incluido null)
  const porVendedor: Record<string, { efectivo: number; transferencia: number; otro: number; descuentos: number; pagosCount: number }> = {}
  for (const r of recaudos as any[]) {
    const id = r.empleadoId
    if (!porVendedor[id]) porVendedor[id] = { efectivo: 0, transferencia: 0, otro: 0, descuentos: 0, pagosCount: 0 }
    const monto = Number(r._sum?.monto || 0)
    if (r.metodopago === 'efectivo') porVendedor[id].efectivo += monto
    else if (r.metodopago === 'transferencia') porVendedor[id].transferencia += monto
    else porVendedor[id].otro += monto
    porVendedor[id].descuentos += Number(r._sum?.descuento || 0)
    porVendedor[id].pagosCount += r._count?.id || 0
  }

  const vendedoresData = vendedores.map((v: any) => {
    const cfg = configMap[v.id] || { porcentaje: 0, formula: 'total/1.19*porcentaje' }
    const agg = porVendedor[v.id] || { efectivo: 0, transferencia: 0, otro: 0, descuentos: 0, pagosCount: 0 }
    const total = agg.efectivo + agg.transferencia + agg.otro
    const porcentaje = Number(cfg.porcentaje || 0)
    const formula = cfg.formula || 'total/1.19*porcentaje'
    let comision = 0
    try {
      const { Parser } = require('expr-eval')
      comision = Math.round(new Parser().parse(formula).evaluate({ total, porcentaje }))
    } catch {
      comision = 0
    }
    return {
      id: v.id,
      nombre: v.nombre,
      porcentaje,
      formula,
      efectivo: agg.efectivo,
      transferencia: agg.transferencia,
      otro: agg.otro,
      total,
      descuentos: agg.descuentos,
      comision,
    }
  })

  return NextResponse.json({ vendedores: vendedoresData, calculo })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST — guardar configs + calcular comisión del mes
export async function POST(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const body = await req.json()
  const { accion, mes, anio, nombre, vendedores, formula } = body

  if (accion === 'guardar_config') {
    // Upsert porcentajes por vendedor
    await Promise.all(
      (vendedores || []).map((v: any) =>
        (prisma as any).comisionConfig.upsert({
          where: { empresaId_empleadoId: { empresaId, empleadoId: v.id } },
          create: { empresaId, empleadoId: v.id, porcentaje: v.porcentaje, formula: v.formula },
          update: { porcentaje: v.porcentaje, formula: v.formula },
        })
      )
    )
    return NextResponse.json({ ok: true })
  }

  if (accion === 'calcular') {
    // Calcular y guardar comisión del mes
    const resultados: any = {}
    for (const v of vendedores || []) {
      resultados[v.id] = {
        nombre: v.nombre,
        efectivo: v.efectivo,
        transferencia: v.transferencia,
        otro: v.otro,
        total: v.total,
        descuentos: v.descuentos,
        porcentaje: v.porcentaje,
        formula: v.formula,
        comision: v.comision,
      }
    }
    const calculo = await (prisma as any).comisionCalculo.upsert({
      where: { empresaId_mes_anio: { empresaId, mes, anio } },
      create: { empresaId, nombre: nombre || `Comision${mes}/${anio}`, mes, anio, formula, resultados },
      update: { nombre: nombre || `Comision${mes}/${anio}`, formula, resultados },
    })
    return NextResponse.json({ ok: true, calculo })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
