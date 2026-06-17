import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MODELOS: Record<string, string> = {
  efectivo: 'saldoEfectivo',
  bancos: 'saldoBancos',
  otros: 'saldoOtros',
}

// fecha = 'YYYY-MM-DD' → objeto Date medianoche UTC (para columna fecha UTC)
function toFechaUTC(str: string) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0)) // medianoche Bogotá en UTC
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || 'efectivo'
  const fechaStr = searchParams.get('fecha') // 'YYYY-MM-DD' o null
  const empresaId = user.empresaId
  const modelo = MODELOS[tab]
  if (!modelo) return NextResponse.json({ error: 'Tab inválido' }, { status: 400 })

  const db = (prisma as any)[modelo]

  if (!fechaStr) {
    // Último día con datos — fechaBogota es DATE, Prisma lo devuelve como Date
    const ultimo = await db.findFirst({
      where: { empresaId },
      orderBy: { fechaBogota: 'desc' },
      select: { fechaBogota: true }
    })
    if (!ultimo?.fechaBogota) return NextResponse.json({ ultimaFecha: null })
    // DATE en Prisma → Date a medianoche UTC → slice directo
    const str = ultimo.fechaBogota.toISOString().slice(0, 10)
    return NextResponse.json({ ultimaFecha: str })
  }

  // Buscar movimientos del día — fechaBogota DATE = string 'YYYY-MM-DD'
  const fechaDate = new Date(fechaStr + 'T00:00:00.000Z') // DATE sin zona

  const movimientos = await db.findMany({
    where: { empresaId, fechaBogota: fechaDate },
    orderBy: { orden: 'asc' },
    select: { id: true, concepto: true, ingreso: true, egreso: true, categoria: true, relacionTexto: true, orden: true }
  })

  // Saldo anterior — días anteriores a fechaStr
  const anteriores = await db.findMany({
    where: { empresaId, fechaBogota: { lt: fechaDate } },
    select: { ingreso: true, egreso: true }
  })
  const saldoAnterior = anteriores.reduce((s: number, m: any) =>
    s + Number(m.ingreso || 0) - Number(m.egreso || 0), 0)

  return NextResponse.json({ movimientos, saldoAnterior })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tab, fecha, orden, concepto, ingreso, egreso, categoria, relacionTexto, id } = await req.json()
  const empresaId = user.empresaId
  const modelo = MODELOS[tab]
  if (!modelo || !fecha) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  if (!concepto && !ingreso && !egreso) {
    if (id) await (prisma as any)[modelo].delete({ where: { id } }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  const db = (prisma as any)[modelo]
  const fechaBogota = new Date(fecha + 'T00:00:00.000Z') // DATE

  const data = {
    empresaId,
    fecha: toFechaUTC(fecha),
    fechaBogota,
    orden,
    concepto: concepto || '',
    ingreso: ingreso ? Number(ingreso) : null,
    egreso: egreso ? Number(egreso) : null,
    categoria: categoria || null,
    relacionTexto: relacionTexto || null,
  }

  let record
  if (id) {
    record = await db.update({ where: { id }, data })
  } else {
    const existing = await db.findFirst({
      where: { empresaId, orden, fechaBogota }
    })
    if (existing) {
      record = await db.update({ where: { id: existing.id }, data })
    } else {
      record = await db.create({ data })
    }
  }

  return NextResponse.json({ ok: true, id: record.id })
}
