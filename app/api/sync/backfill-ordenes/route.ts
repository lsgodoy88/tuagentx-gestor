import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

function toBogota(d: Date | null): Date | null {
  return d ? new Date(d.getTime() - 5 * 60 * 60 * 1000) : null
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const dias = Math.min(Number(body.dias || 60), 365)
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados = []
  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()

      const ordenes = await adapter.fetchVentas(desde)
      let rellenadas = 0

      for (const orden of ordenes) {
        const origenId = String(orden.uid || orden._id)
        const campos = {
          paymentType: (orden as any).paymentType || null,
          paymentMethod: (orden as any).paymentMethod || null,
          isDelivered: (orden as any).isDelivered ?? null,
          isShipped: (orden as any).isShipped ?? null,
          isCompleted: (orden as any).isCompleted ?? null,
          balance: (orden as any).balance ? parseFloat((orden as any).balance) : null,
          discount: (orden as any).discount ? parseFloat((orden as any).discount) : null,
          amountItems: (orden as any).amountItems ? Number((orden as any).amountItems) : null,
          fechaOrdenBogota: orden.fCreado ? toBogota(new Date(String(orden.fCreado))) : null,
        }
        const updated = await (prisma as any).ordenDespacho.updateMany({
          where: { origenId, empresaId: intg.empresaId, paymentType: null },
          data: campos,
        })
        if (updated.count > 0) rellenadas++
      }

      resultados.push({ empresaId: intg.empresaId, ordenes: ordenes.length, rellenadas })
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
