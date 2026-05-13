import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'
import fs from 'fs'
import path from 'path'

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

const BASE = 'https://serviceuptres.cloud/external/v1/api'
const AUTH_URL = 'https://serviceuptres.cloud/external/v1/auth/api'

export async function POST(req: Request) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const resultados: any[] = []
  const empresas = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { empresaId: true, config: true }
  })

  for (const integ of empresas) {
    const empresaId = integ.empresaId
    const cfg = integ.config
    const apiSecret = decrypt(cfg.apiSecret, process.env.UPTRES_SECRET!)

    const authRes = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: cfg.apiKey, apiSecret })
    })
    const auth = await authRes.json()
    const token = auth.data?.token || auth.token
    const headers = { 'x-api-key': cfg.apiKey, 'Authorization': token }

    const huerfanas = await prisma.ordenDespacho.findMany({
      where: {
        empresaId,
        OR: [{ ciudad: null }, { ciudad: '' }],
        origenId: { not: '' }
      },
      select: { id: true, origenId: true }
    })

    let actualizadas = 0
    let no_encontrada = 0

    for (const od of huerfanas) {
      if (!od.origenId) continue
      try {
        // 1) Pedir la orden con cliente expandido
        const r = await fetch(
          `${BASE}/ordenes/${od.origenId}?expand=customer`,
          { headers }
        )
        if (!r.ok) { no_encontrada++; continue }
        const d = await r.json()
        const o = d.data || d
        if (!o) { no_encontrada++; continue }

        // 2) Datos de la orden y cliente expandido
        let cityId = o.cityId || o.customer?.cityId
        let direccion = o.address || o.customer?.address || ''
        let telefono = o.phone || o.customer?.phone || ''
        const nit = o.customer?.document || ''
        const customerId = o.customerId || o.customer?.id

        // 3) Si UpTres no devolvió cityId/address en customer, buscar el cliente local por apiId o nit
        if (!cityId || !direccion) {
          const cliente = await prisma.cliente.findFirst({
            where: {
              empresaId,
              OR: [
                customerId ? { apiId: customerId } : undefined,
                nit ? { nit } : undefined,
              ].filter(Boolean) as any
            },
            select: { ciudad: true, direccion: true, telefono: true, nit: true }
          })
          if (cliente) {
            if (!direccion && cliente.direccion) direccion = cliente.direccion
            if (!telefono && cliente.telefono) telefono = cliente.telefono
          }
        }

        const ciudadNombre = cityId && municipiosDANE[String(cityId)]
          ? municipiosDANE[String(cityId)]
          : ''

        // 4) Si aun no tengo ciudad, sacarla del Cliente local
        let ciudadFinal = ciudadNombre
        if (!ciudadFinal && (customerId || nit)) {
          const cliente = await prisma.cliente.findFirst({
            where: {
              empresaId,
              OR: [
                customerId ? { apiId: customerId } : undefined,
                nit ? { nit } : undefined,
              ].filter(Boolean) as any
            },
            select: { ciudad: true }
          })
          if (cliente?.ciudad) ciudadFinal = cliente.ciudad
        }

        const data: any = {}
        if (ciudadFinal) data.ciudad = ciudadFinal
        if (direccion) data.direccion = direccion
        if (telefono) data.telefono = telefono
        if (nit) data.clienteNit = nit

        if (Object.keys(data).length > 0) {
          await prisma.ordenDespacho.update({ where: { id: od.id }, data })
          actualizadas++
        }
      } catch {
        no_encontrada++
      }
    }

    resultados.push({ empresaId, huerfanas: huerfanas.length, actualizadas, no_encontrada })
  }

  return NextResponse.json({ ok: true, resultados })
}
