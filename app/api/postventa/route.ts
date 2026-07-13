// app/api/postventa/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DEFAULT_PLANTILLA = 'Sr(a) {nombre}, hemos facturado tu pedido No.{factura} por ${valor}. Agradecemos tu pago antes del {vencimiento}.'
const DEFAULT_FIRMA = ''

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { empresaId, role } = session.user as any
  if (!['empresa', 'supervisor'].includes(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const clienteId = new URL(req.url).searchParams.get('clienteId')
  const config = await (prisma as any).smsConfig.findUnique({ where: { empresaId } })

  let stats = null
  if (clienteId) {
    const cliente = await (prisma as any).cliente.findUnique({
      where: { id: clienteId }, select: { apiId: true }
    })
    const apiId = cliente?.apiId
    const [enviados, entregados, fallidos] = await Promise.all([
      (prisma as any).smsLog.count({ where: { empresaId, estadoEnvio: 'ok', orden: { clienteApiId: apiId } } }),
      (prisma as any).smsLog.count({ where: { empresaId, estadoEntrega: 'entregado', orden: { clienteApiId: apiId } } }),
      (prisma as any).smsLog.findMany({
        where: { empresaId, OR: [{ estadoEnvio: { in: ['error_num','error_api'] } }, { estadoEntrega: 'fallido' }], orden: { clienteApiId: apiId } },
        select: { id: true, telefono: true, errorCodigo: true, estadoEnvio: true, createdAt: true, orden: { select: { numeroFactura: true } } },
        orderBy: { createdAt: 'desc' }, take: 10,
      }),
    ])
    stats = { enviados, entregados, fallidos }
  }

  return NextResponse.json({
    config: config ?? { activo: false, dias: '1,2,3,4,5', firma: DEFAULT_FIRMA, plantilla: DEFAULT_PLANTILLA },
    stats,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { empresaId, role } = session.user as any
  if (role !== 'empresa') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  console.log('[postventa POST] body:', JSON.stringify(body), 'empresaId:', empresaId)
  const { activo, dias, firma, plantilla } = body

  const config = await (prisma as any).smsConfig.upsert({
    where: { empresaId },
    create: { id: crypto.randomUUID(), empresaId, activo: !!activo, dias: dias || '1,2,3,4,5', firma: firma || DEFAULT_FIRMA, plantilla: plantilla || DEFAULT_PLANTILLA },
    update: { activo: !!activo, dias: dias || '1,2,3,4,5', firma: firma || DEFAULT_FIRMA, plantilla: plantilla || DEFAULT_PLANTILLA, updatedAt: new Date() },
  })

  return NextResponse.json({ ok: true, config })
}
