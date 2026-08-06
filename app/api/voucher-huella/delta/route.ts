import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const DB_SCHEMA = (() => {
  const url = process.env.DATABASE_URL || ''
  const m = url.match(/schema=([^&]+)/)
  return m ? m[1] : 'gestor'
})()

async function runDelta() {
  // Solo huellas no alertadas en ventana de 60 días — índice parcial garantiza O(pendientes)
  const duplicados: any[] = await (prisma as any).$queryRawUnsafe(`
    SELECT referencia, valor::text, fecha,
           array_agg(id) as huella_ids,
           array_agg(pago_id) as pago_ids,
           array_agg(vendedor_nombre) as vendedores
    FROM "${DB_SCHEMA}"."VoucherHuella"
    WHERE alertada = false
      AND referencia IS NOT NULL
      AND valor IS NOT NULL
      AND fecha IS NOT NULL
      AND created_at > NOW() - INTERVAL '60 days'
    GROUP BY referencia, valor, fecha
    HAVING count(*) > 1
  `)

  let actualizados = 0

  for (const dup of duplicados) {
    const huellaIds: string[] = dup.huella_ids
    const pagoIds: string[]   = dup.pago_ids
    const vendedores: string[] = dup.vendedores ?? []

    // Alertar cada PagoCartera involucrado
    for (let i = 0; i < pagoIds.length; i++) {
      const otrosPagos     = pagoIds.filter((_: string, j: number) => j !== i)
      const otrosVendedores = vendedores.filter((_: string, j: number) => j !== i && vendedores[j])
      const alerta = `⚠️ Comprobante duplicado — Ref: ${dup.referencia} $${Number(dup.valor).toLocaleString('es-CO')} ${dup.fecha}. También en recibo(s): ${otrosPagos.join(', ')}${otrosVendedores.length ? ` por ${otrosVendedores.join(', ')}` : ''}`
      await (prisma as any).pagoCartera.update({
        where: { id: pagoIds[i] },
        data:  { notas: alerta }
      })
      actualizados++
    }

    // Marcar todas las huellas del grupo como alertadas — nunca se reprocesarán
    await (prisma as any).$queryRawUnsafe(`
      UPDATE "${DB_SCHEMA}"."VoucherHuella"
      SET alertada = true
      WHERE id = ANY($1::text[])
    `, huellaIds)
  }

  // Purge: eliminar huellas con más de 60 días
  await (prisma as any).$queryRawUnsafe(`
    DELETE FROM "${DB_SCHEMA}"."VoucherHuella"
    WHERE created_at < NOW() - INTERVAL '60 days'
  `)

  return { duplicados: duplicados.length, actualizados }
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runDelta()
  return NextResponse.json({ ok: true, ...result })
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runDelta()
  return NextResponse.json({ ok: true, ...result })
}
