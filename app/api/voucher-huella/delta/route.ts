import { NextResponse } from 'next/server'
import { runVoucherHuellaDelta } from '@/lib/jobs/voucher-huella-delta'

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runVoucherHuellaDelta()
  return NextResponse.json({ ok: true, ...result })
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runVoucherHuellaDelta()
  return NextResponse.json({ ok: true, ...result })
}
