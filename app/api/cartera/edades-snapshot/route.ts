import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'

const EDADES = ['0-30','31-60','61-90','91-120','+120'] as const
type Edad = typeof EDADES[number]

// GET — consulta snapshots por rango mes/año
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const empresaId = getEmpresaId(user)
    const { searchParams } = new URL(req.url)
    const mesInicio = parseInt(searchParams.get('mesInicio') || '1')
    const anioInicio = parseInt(searchParams.get('anioInicio') || String(new Date().getFullYear()))
    const mesFin = parseInt(searchParams.get('mesFin') || String(new Date().getMonth() + 1))
    const anioFin = parseInt(searchParams.get('anioFin') || String(new Date().getFullYear()))

    // Traer todos y filtrar en memoria — más simple y correcto
    const todos = await (prisma as any).carteraEdadSnapshot.findMany({
      where: { empresa_id: empresaId },
      orderBy: [{ anio: 'asc' }, { mes: 'asc' }],
      select: { mes: true, anio: true, datos: true, creado_en: true },
    })

    const snapshots = todos.filter((s: any) => {
      const val = s.anio * 100 + s.mes
      const desde = anioInicio * 100 + mesInicio
      const hasta = anioFin * 100 + mesFin
      return val >= desde && val <= hasta
    })

    return NextResponse.json({ snapshots })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — genera y guarda snapshot del mes actual (o mes/año indicado)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'empresa' && user.role !== 'supervisor') {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const empresaId = getEmpresaId(user)
    const body = await req.json().catch(() => ({}))
    const now = new Date()
    const mes = body.mes ?? (now.getMonth() + 1)
    const anio = body.anio ?? now.getFullYear()

    const integracion = await (prisma as any).integracion.findFirst({
      where: { empresaId, tipo: 'uptres', activa: true }
    })
    if (!integracion) return NextResponse.json({ error: 'Sin integración' }, { status: 400 })

    const deudas: any[] = await (prisma as any).syncDeuda.findMany({
      where: { integracionId: integracion.id, condition: true, saldo: { gt: 0 } },
      select: { empleadoExternalId: true, saldo: true, fechaVencimiento: true, data: true },
    })

    const empleados: any[] = await (prisma as any).empleado.findMany({
      where: { empresaId, activo: true },
      select: { apiId: true, nombre: true },
    })
    const empMap = new Map(empleados.map((e: any) => [e.apiId, e.nombre]))

    const porVendedor: Record<string, any> = {}
    for (const d of deudas) {
      const apiid = d.empleadoExternalId
      if (!apiid) continue
      const nombre = empMap.get(apiid)
      if (!nombre) continue  // excluir vendedores sin nombre en BD
      if (!porVendedor[apiid]) {
        porVendedor[apiid] = { nombre, apiid, '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '+120': 0 }
      }
      const saldo = Math.round(parseFloat(d.saldo ?? '0'))
      const raw = d.data as any
      const venceDate = d.fechaVencimiento || (raw?.fPago ? new Date(raw.fPago) : null)
      const diasv = calcularDiasV(venceDate)
      const edad = calcularEdadCartera(diasv) as Edad
      porVendedor[apiid][edad] = (porVendedor[apiid][edad] ?? 0) + saldo
    }

    const vendedores = Object.values(porVendedor).map((v: any) => ({
      ...v,
      total: EDADES.reduce((s, e) => s + (v[e] ?? 0), 0),
    }))

    await (prisma as any).carteraEdadSnapshot.upsert({
      where: { empresa_id_mes_anio: { empresa_id: empresaId, mes, anio } },
      create: { id: crypto.randomUUID(), empresa_id: empresaId, integracion_id: integracion.id, mes, anio, datos: { vendedores } },
      update: { datos: { vendedores }, creado_en: new Date(), integracion_id: integracion.id },
    })

    return NextResponse.json({ ok: true, mes, anio, vendedores: vendedores.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
