/**
 * POST /api/bodega/backfill-fechafactura
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const empFiltro: string | undefined = body.empresaId
  const limite = Math.min(parseInt(body.limite || '50'), 200)

  const whereEmp = empFiltro ? `AND o."empresaId" = '${empFiltro}'` : ''
  const ordenesBug = await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.id, o."origenId", o."empresaId", o."fechaOrden"
    FROM gestor."OrdenDespacho" o
    WHERE ABS(EXTRACT(EPOCH FROM (o."fechaFactura" - o."createdAt"))) < 1
      AND o."isFacturada" = true ${whereEmp}
    ORDER BY o."fechaOrden" DESC
    LIMIT ${limite}
  `)

  if (ordenesBug.length === 0) {
    return NextResponse.json({ ok: true, mensaje: 'Sin ordenes para corregir', corregidas: 0 })
  }

  const porEmpresa = new Map<string, any[]>()
  for (const o of ordenesBug) {
    if (!porEmpresa.has(o.empresaId)) porEmpresa.set(o.empresaId, [])
    porEmpresa.get(o.empresaId)!.push(o)
  }

  let corregidas = 0
  let sinInvoicedAt = 0
  const errores: string[] = []

  for (const [empId, ordenes] of porEmpresa) {
    try {
      const integracion = await (prisma as any).integracion.findFirst({
        where: { empresaId: empId, tipo: 'uptres', activa: true },
      })
      if (!integracion) { errores.push(`Sin integracion: ${empId}`); continue }
      const config = integracion.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()
      const token = (adapter as any).token
      const apiKey = config.apiKey

      for (const orden of ordenes) {
        try {
          const r = await fetch(
            `https://serviceuptres.cloud/external/v1/api/ordenes/${orden.origenId}?fields=id,isInvoiced,invoicedAt`,
            { headers: { 'x-api-key': apiKey, 'Authorization': `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
          )
          const data = await r.json() as any
          if (!data?.id) { errores.push(`No encontrada: ${orden.origenId}`); continue }
          if (data.invoicedAt) {
            const fechaReal = new Date(data.invoicedAt)
            await prisma.$executeRawUnsafe(`UPDATE gestor."OrdenDespacho" SET "fechaFactura" = '${fechaReal.toISOString()}', "updatedAt" = NOW() WHERE id = '${orden.id}'`)
          } else {
            await prisma.$executeRawUnsafe(`UPDATE gestor."OrdenDespacho" SET "fechaFactura" = "fechaOrden", "updatedAt" = NOW() WHERE id = '${orden.id}'`)
            sinInvoicedAt++
          }
          corregidas++
        } catch (e: any) { errores.push(`${orden.origenId}: ${(e.message||'').slice(0,40)}`) }
      }
    } catch (e: any) { errores.push(`Empresa ${empId}: ${(e.message||'').slice(0,40)}`) }
  }

  try {
    const { redis } = await import('@/lib/redis')
    const keys = await redis.keys('g:v:*')
    if (keys.length > 0) await redis.del(...keys)
  } catch {}

  const pendientes = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*) as total FROM gestor."OrdenDespacho"
    WHERE ABS(EXTRACT(EPOCH FROM ("fechaFactura" - "createdAt"))) < 1 AND "isFacturada" = true ${whereEmp}
  `)

  return NextResponse.json({
    ok: true,
    procesadas: ordenesBug.length,
    corregidas,
    sin_invoiced_at: sinInvoicedAt,
    pendientes_restantes: parseInt((pendientes[0] as any)?.total || '0'),
    errores: errores.slice(0, 5),
  })
}
