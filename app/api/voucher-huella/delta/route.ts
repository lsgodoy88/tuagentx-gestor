import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Extraer schema del DATABASE_URL (schema=gestor o schema=gestor_staging)
const DB_SCHEMA = (() => {
  const url = process.env.DATABASE_URL || ''
  const m = url.match(/schema=([^&]+)/)
  return m ? m[1] : 'gestor'
})()

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const duplicados: any[] = await (prisma as any).$queryRawUnsafe(`
    SELECT referencia, valor::text, fecha,
           array_agg(pago_id) as pago_ids,
           array_agg(empresa_id) as empresa_ids,
           array_agg(vendedor_nombre) as vendedores
    FROM "${DB_SCHEMA}"."VoucherHuella"
    WHERE referencia IS NOT NULL AND valor IS NOT NULL AND fecha IS NOT NULL
    GROUP BY referencia, valor, fecha
    HAVING count(*) > 1
  `)

  if (!duplicados.length) {
    return NextResponse.json({ ok: true, duplicados: 0 })
  }

  let actualizados = 0
  for (const dup of duplicados) {
    const pagoIds: string[] = dup.pago_ids
    const vendedores: string[] = dup.vendedores ?? []
    for (let i = 0; i < pagoIds.length; i++) {
      const otrosPagos = pagoIds.filter((_: string, j: number) => j !== i)
      const otrosVendedores = vendedores.filter((_: string, j: number) => j !== i && vendedores[j])
      const alerta = `⚠️ Comprobante duplicado — Ref: ${dup.referencia} $${Number(dup.valor).toLocaleString('es-CO')} ${dup.fecha}. También registrado en recibo(s): ${otrosPagos.join(', ')}${otrosVendedores.length ? ` por ${otrosVendedores.join(', ')}` : ''}`
      await (prisma as any).pagoCartera.update({
        where: { id: pagoIds[i] },
        data: { notas: alerta }
      })
      actualizados++
    }
  }

  return NextResponse.json({ ok: true, duplicados: duplicados.length, actualizados })
}
