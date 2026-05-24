import type { ComisionesResponse } from '@/lib/types/cartera'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN } from '@/lib/auth-helpers'
import { inicioDiaBogota } from '@/lib/fechas'

// GET — configs + último cálculo del mes
export async function GET(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const mes  = parseInt(searchParams.get('mes')  || String(new Date().getMonth() + 1))
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()))

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
    by: ['empleadoId'],
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
  const recaudoMap = Object.fromEntries(recaudos.map((r: any) => [r.empleadoId, r]))

  const vendedoresData = vendedores.map((v: any) => {
    const cfg = configMap[v.id] || { porcentaje: 0, formula: 'recaudado * porcentaje / 100' }
    const rec = recaudoMap[v.id]
    const recaudado = Number(rec?._sum?.monto || 0)
    const descuentos = Number(rec?._sum?.descuento || 0)
    const porcentaje = Number(cfg.porcentaje || 0)
    const comision = Math.round(recaudado * porcentaje / 100)
    return {
      id: v.id,
      nombre: v.nombre,
      porcentaje,
      formula: cfg.formula || 'recaudado * porcentaje / 100',
      recaudado,
      descuentos,
      pagosCount: rec?._count?.id || 0,
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
        recaudado: v.recaudado,
        descuentos: v.descuentos,
        porcentaje: v.porcentaje,
        comision: v.comision,
        pagosCount: v.pagosCount,
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
