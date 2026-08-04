import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermiso } from '@/lib/permisos'

function toFechaUTC(str: string) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (user.role !== 'empresa' && !checkPermiso(session, 'verBitacora'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tab       = searchParams.get('tab') || ''
  const fechaStr  = searchParams.get('fecha')
  const hastaStr  = searchParams.get('fechaHasta')
  const empresaId = user.empresaId
  const db        = (prisma as any).saldoMovimiento

  // Validar tab existe para esta empresa
  if (tab) {
    const tabCfg = await (prisma as any).saldoConfig.findFirst({
      where: { empresaId, tipo: 'tab', key: tab }
    })
    if (!tabCfg) return NextResponse.json({ error: 'Tab inválido' }, { status: 400 })
  }

  const whereBase: any = { empresaId }
  if (tab) whereBase.tab_key = tab

  // Sin fecha → último día con datos
  if (!fechaStr) {
    const ultimo = await db.findFirst({
      where: whereBase,
      orderBy: { fecha_bogota: 'desc' },
      select: { fecha_bogota: true },
    })
    if (!ultimo?.fecha_bogota) return NextResponse.json({ ultimaFecha: null })
    return NextResponse.json({ ultimaFecha: ultimo.fecha_bogota.toISOString().slice(0, 10) })
  }

  const fechaDesde = new Date(fechaStr  + 'T00:00:00.000Z')
  const fechaHasta = hastaStr ? new Date(hastaStr + 'T00:00:00.000Z') : fechaDesde
  const esRango    = hastaStr && hastaStr !== fechaStr

  const whereRango = {
    ...whereBase,
    fecha_bogota: esRango
      ? { gte: fechaDesde, lte: fechaHasta }
      : fechaDesde
  }

  const movimientos = await db.findMany({
    where: whereRango,
    orderBy: [{ fecha_bogota: 'asc' }, { orden: 'asc' }],
    select: { id: true, fecha_bogota: true, tab_key: true, concepto: true, ingreso: true, egreso: true, categoria: true, relacionTexto: true, orden: true },
  })

  const anteriores = await db.findMany({
    where: { ...whereBase, fecha_bogota: { lt: fechaDesde } },
    select: { ingreso: true, egreso: true },
  })
  const saldoAnterior = anteriores.reduce((s: number, m: any) =>
    s + Number(m.ingreso || 0) - Number(m.egreso || 0), 0)

  if (esRango) {
    const grupos: Record<string, any[]> = {}
    for (const m of movimientos) {
      const key = m.fecha_bogota.toISOString().slice(0, 10)
      if (!grupos[key]) grupos[key] = []
      grupos[key].push({
        id: m.id, concepto: m.concepto, tab_key: m.tab_key,
        ingreso: m.ingreso ? String(m.ingreso) : '',
        egreso:  m.egreso  ? String(m.egreso)  : '',
        categoria: m.categoria || '', relacionTexto: m.relacionTexto || '', orden: m.orden,
      })
    }
    return NextResponse.json({ grupos, saldoAnterior })
  }

  return NextResponse.json({
    movimientos: movimientos.map((m: any) => ({
      id: m.id, concepto: m.concepto, tab_key: m.tab_key,
      ingreso: m.ingreso ? String(m.ingreso) : '',
      egreso:  m.egreso  ? String(m.egreso)  : '',
      categoria: m.categoria || '', relacionTexto: m.relacionTexto || '', orden: m.orden,
    })),
    saldoAnterior,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tab, fecha, orden, concepto, ingreso, egreso, categoria, relacionTexto, id } = await req.json()
  const empresaId = user.empresaId
  if (!tab || !fecha) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  // Validar tab
  const tabCfg = await (prisma as any).saldoConfig.findFirst({
    where: { empresaId, tipo: 'tab', key: tab }
  })
  if (!tabCfg) return NextResponse.json({ error: 'Tab inválido' }, { status: 400 })

  const db = (prisma as any).saldoMovimiento

  if (!concepto && !ingreso && !egreso) {
    if (id) await db.delete({ where: { id } }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  const fechaBogota = new Date(fecha + 'T00:00:00.000Z')
  const data = {
    empresaId, tab_key: tab, fecha: toFechaUTC(fecha), fecha_bogota: fechaBogota, orden,
    concepto: concepto || '',
    ingreso:  ingreso ? Number(ingreso) : null,
    egreso:   egreso  ? Number(egreso)  : null,
    categoria:     categoria     || null,
    relacionTexto: relacionTexto || null,
  }

  let record
  if (id) {
    record = await db.update({ where: { id }, data })
  } else {
    const existing = await db.findFirst({ where: { empresaId, tab_key: tab, orden, fecha_bogota: fechaBogota } })
    if (existing) record = await db.update({ where: { id: existing.id }, data })
    else          record = await db.create({ data })
  }

  return NextResponse.json({ ok: true, id: record.id })
}
