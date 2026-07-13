// app/api/sms/polling/route.ts — actualiza estadoEntrega via Onurix message_state
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { consultarEstadoSMS } from '@/lib/notificaciones/sms'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  

  // Solo logs pendientes con msgId, de últimas 24h
  const logs = await (prisma as any).smsLog.findMany({
    where: {
      estadoEntrega: 'pendiente',
      estadoEnvio: 'ok',
      onurixMsgId: { not: null },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, onurixMsgId: true },
    take: 50,
  })

  if (!logs.length) return NextResponse.json({ ok: true, actualizados: 0 })

  let actualizados = 0
  for (const log of logs) {
    const estado = await consultarEstadoSMS(log.onurixMsgId)
    if (estado !== 'pendiente') {
      await (prisma as any).smsLog.update({
        where: { id: log.id },
        data: { estadoEntrega: estado, updatedAt: new Date() },
      })
      actualizados++
    }
  }

  return NextResponse.json({ ok: true, actualizados })
}
