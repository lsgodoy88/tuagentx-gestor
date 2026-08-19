import { NextRequest, NextResponse } from 'next/server'
import { prisma, DB_SCHEMA } from '@/lib/prisma'

const TIPO_PREFIJO: Record<string, string> = { PAIDMES: 'PM', NEWPLAN: 'NP', ADDROL: 'NR' }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-master-secret')
  if (secret !== process.env.MASTER_API_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { tipo, empresaId, pagoId } = await req.json()
  if (!tipo || !empresaId) return NextResponse.json({ error: 'tipo y empresaId requeridos' }, { status: 400 })

  const ahora = new Date()
  const yy = String(ahora.getFullYear()).slice(2)
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const prefijo = `${TIPO_PREFIJO[tipo] ?? tipo}${yy}${mm}`

  // Consecutivo mensual global por tipo
  const rows = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT COUNT(*)::int AS cnt FROM ${DB_SCHEMA}."PlanEmpresa" WHERE "voucherNum" LIKE $1`,
    `${prefijo}%`
  )
  const siguiente = (rows[0]?.cnt ?? 0) + 1
  const voucherNum = `${prefijo}${String(siguiente).padStart(3, '0')}`

  // Para NEWPLAN/ADDROL no hay PlanEmpresa asociado directamente
  // Guardamos en una fila dummy si no existe, o simplemente retornamos el número
  // El voucherNum se guarda en master.Pago por el webhook
  console.log(`[voucher] ${tipo} → ${voucherNum} | empresa: ${empresaId} | pago: ${pagoId}`)

  return NextResponse.json({ voucherNum })
}
