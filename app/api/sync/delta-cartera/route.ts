import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidatePattern } from '@/lib/cache'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

// Delta cartera — solo deudas con pagos registrados desde última sync
// Usa receivableAt como ventana (hora Bogotá, sin conversión)
// Corre cada 30min junto con sync-delta de órdenes

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados: any[] = []

  for (const intg of integraciones) {
    try {
      // MAX(receivableAt) de esta empresa → ventana del delta
      const ultima = await (prisma as any).syncDeuda.aggregate({
        where: { integracionId: intg.id },
        _max: { receivableAt: true }
      })

      const desde: Date = ultima._max.receivableAt
        ? new Date(new Date(ultima._max.receivableAt).getTime() - 5 * 60 * 1000) // -5min buffer
        : new Date(Date.now() - 24 * 60 * 60 * 1000) // fallback: último día

      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()

      // Fetch solo deudas modificadas desde última sync
      const deudas = await adapter.fetchDeudasDesde(desde)

      if (!deudas.length) {
        resultados.push({ empresaId: intg.empresaId, actualizadas: 0, sin_cambios: true })
        continue
      }

      // Solo update — delta-cartera no inserta nuevas (eso es tarea del nocturno)
      const externalIds = deudas.map((d: any) => String(d.uid || d._id))
      const existentes = await (prisma as any).syncDeuda.findMany({
        where: { integracionId: intg.id, externalId: { in: externalIds } },
        select: { externalId: true }
      })
      const existentesSet = new Set(existentes.map((e: any) => e.externalId))

      const toUpdate = deudas
        .filter((d: any) => existentesSet.has(String(d.uid || d._id)))
        .map((d: any) => ({
          externalId: String(d.uid || d._id),
          saldo: parseFloat(String(d.vSaldo ?? '0')),
          valor: parseFloat(String(d.vTotal ?? '0')),
          receivableAt: d.receivableAt ? new Date(d.receivableAt) : null,
          externalUpdatedAt: d.fModificado ? new Date(d.fModificado) : null,
        }))

      const CHUNK = 100
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK)
        await Promise.all(chunk.map((u: any) =>
          (prisma as any).syncDeuda.update({
            where: { integracionId_externalId: { integracionId: intg.id, externalId: u.externalId } },
            data: { saldo: u.saldo, valor: u.valor, receivableAt: u.receivableAt, externalUpdatedAt: u.externalUpdatedAt, sincronizadoEl: new Date() }
          })
        ))
      }

      // Invalidar Redis cartera — datos frescos en dashboard
      await invalidatePattern('g:*:cartera:*')
      await invalidatePattern('g:v:*')

      resultados.push({ empresaId: intg.empresaId, candidatas: deudas.length, actualizadas: toUpdate.length })
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
