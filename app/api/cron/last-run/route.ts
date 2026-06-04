import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const tipo = req.nextUrl.searchParams.get('tipo')
  if (!tipo) return NextResponse.json({ ok: false }, { status: 400 })

  const log = await prisma.syncLog.findFirst({
    where: { tipo, estado: 'ok', disparadoPor: 'cron' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true },
  })

  if (!log) return NextResponse.json({ ok: false })
  return NextResponse.json({ ok: true, id: log.id, createdAt: log.createdAt })
}
