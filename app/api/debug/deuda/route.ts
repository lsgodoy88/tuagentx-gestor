import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const intg = await (prisma as any).integracion.findFirst({
    where: { id: 'intg-cmn7oiutk0001vmega46373b4-uptres2' },
    select: { config: true }
  })
  const config = intg.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await (adapter as any).login()
  const headers = (adapter as any).headers as Record<string, string>
  const BASE = 'https://serviceuptres.cloud/external/v1/api'

  // 1. Deuda individual sin filtro condition
  const r1 = await fetch(`${BASE}/cartera?id=69ff140fc3c17586a30b6a8a&includeTotal=false&fields=id,balance,total,employeeId,invoiceNumber`, { headers })
  const d1 = await r1.json()

  // 2. Carlos condition=false primeras 5
  const r2 = await fetch(`${BASE}/cartera/empleado/67a3da759c104c6e174b71ce?condition=false&limit=5&fields=id,balance,total,invoiceNumber&includeTotal=false`, { headers })
  const d2 = await r2.json()

  // 3. Total activas sin filtro de empleado
  const r3 = await fetch(`${BASE}/cartera?condition=true&limit=5&fields=id,balance,total,employeeId&includeTotal=false`, { headers })
  const d3 = await r3.json()

  return NextResponse.json({ deudaIndividual: d1, carlosCondFalse: d2, totalActivas: d3 })
}
