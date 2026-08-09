import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 })
  }

  const integraciones = await prisma.integracion.findMany({
    where: { activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados = []
  for (const integ of integraciones) {
    try {
      const config = integ.config as any
      const apiKey = config.apiKey as string
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(apiKey, apiSecret)

      // Sin desde = todos los clientes
      const clientes = await adapter.fetchClientes()

      let creados = 0, actualizados = 0, skipped = 0
      for (const c of clientes) {
        if (!c.uid) continue
        const nombre = `${c.name || ''} ${c.lastName || ''}`.trim()

        const existing = await (prisma as any).cliente.findFirst({
          where: { empresaId: integ.empresaId, apiId: c.uid },
          select: { id: true, nombre: true, ciudad: true, direccion: true, telefono: true }
        })
        if (existing) {
          const cambios: any = {}
          if (nombre && nombre !== existing.nombre) cambios.nombre = nombre
          if (c.ciudad && c.ciudad !== existing.ciudad) { cambios.ciudad = c.ciudad; cambios.lat = null; cambios.lng = null; cambios.ubicacionReal = false }
          if (c.dir && c.dir !== existing.direccion) { cambios.direccion = c.dir; cambios.lat = null; cambios.lng = null; cambios.ubicacionReal = false }
          if (c.nCel && c.nCel !== existing.telefono) cambios.telefono = c.nCel
          if (Object.keys(cambios).length > 0) {
            await (prisma as any).cliente.update({ where: { id: existing.id }, data: cambios })
            actualizados++
          } else { skipped++ }
        } else {
          await (prisma as any).cliente.create({
            data: { empresaId: integ.empresaId, apiId: c.uid, nombre, nit: c.doc || '', ciudad: c.ciudad || null, direccion: c.dir || null, telefono: c.nCel || null, email: c.email || null }
          })
          creados++
        }
      }
      await prisma.empresa.update({ where: { id: integ.empresaId }, data: { ultimaSyncClientes: new Date() } })
      resultados.push({ empresaId: integ.empresaId, total: clientes.length, creados, actualizados, skipped })
    } catch (e: any) {
      resultados.push({ empresaId: integ.empresaId, error: e.message })
    }
  }
  return NextResponse.json({ ok: true, resultados })
}
