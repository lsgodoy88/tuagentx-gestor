import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import fs from 'fs'
import path from 'path'

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

async function syncEmpresa(empresaId: string, origenVinculadaId: string | null = null) {
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })
  if (!integracion) return { empresaId, error: 'Sin integración' }

  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  // Días historial de la empresa PRINCIPAL (no la vinculada)
  const principal = empresaId // empresaId ya es la empresa con bodega

  const rows = await prisma.$queryRaw<[{ diasHistorialBodega: number }]>`
    SELECT "diasHistorialBodega" FROM gestor."Empresa" WHERE id = ${principal} LIMIT 1
  `
  const dias = rows[0]?.diasHistorialBodega ?? 7
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)

  const ordenes = await adapter.fetchVentas(desde)
  const desdeTs = desde.getTime()
  const ordenesFiltradas = ordenes.filter((o: any) => {
    const fc = o.fCreado ? new Date(o.fCreado as string).getTime() : 0
    return fc >= desdeTs
  })

  // Upsert órdenes
  let nuevas = 0
  const empresaDestino = empresaId // La bodega es siempre la empresa principal

  for (const orden of ordenesFiltradas) {
    const invoiceNum = String(orden.numeroFacturado || orden.numeroOrden)
    const existing = await (prisma as any).ordenDespacho.findFirst({
      where: {
        empresaId: empresaDestino,
        numeroOrden: invoiceNum,
        ...(origenVinculadaId ? { origenVinculadaId } : { origenVinculadaId: null })
      }
    })
    if (existing) continue

    // Normalizar ciudad
    let ciudadNombre = (orden.ciudad as string) || ''
    if (orden.cityId && municipiosDANE[String(orden.cityId)]) {
      ciudadNombre = municipiosDANE[String(orden.cityId)]
    } else if (ciudadNombre.includes('/')) {
      ciudadNombre = ciudadNombre.split('/').pop()?.trim() || ciudadNombre
    }

    let direccion = (orden as any).direccion || ''
    let telefono = (orden as any).telefono || ''
    let clienteNit = (orden as any).clienteNit || ''

    // Fallback: si UpTres no devolvió ciudad/dirección/teléfono, buscar en Cliente local
    if (!ciudadNombre || !direccion || !telefono) {
      const apiId = (orden as any).cliente?.uid
      if (apiId || clienteNit) {
        const cli = await (prisma as any).cliente.findFirst({
          where: {
            empresaId: empresaDestino,
            OR: [
              apiId ? { apiId } : undefined,
              clienteNit ? { nit: clienteNit } : undefined,
            ].filter(Boolean)
          },
          select: { ciudad: true, direccion: true, telefono: true, nit: true }
        })
        if (cli) {
          if (!ciudadNombre && cli.ciudad) ciudadNombre = cli.ciudad
          if (!direccion && cli.direccion) direccion = cli.direccion
          if (!telefono && cli.telefono) telefono = cli.telefono
          if (!clienteNit && cli.nit) clienteNit = cli.nit
        }
      }
    }

    // No crear si no hay nombre de cliente
    const nombreOrden = orden.clienteNombre || (orden as any).clienteNombreApi
    if (!nombreOrden) continue

    await (prisma as any).ordenDespacho.create({
      data: {
        empresaId: empresaDestino,
        origen: origenVinculadaId ? 'vinculada' : 'propia',
        origenId: orden.uid || orden.clienteId || '',
        origenVinculadaId,
        numeroOrden: invoiceNum,
        clienteNombre: nombreOrden,
        clienteNit,
        ciudad: ciudadNombre,
        direccion,
        telefono,
        estado: 'pendiente',
        fechaOrden: orden.fCreado ? new Date(orden.fCreado) : new Date(),
      }
    })
    nuevas++
  }

  // Actualizar ultimaSyncBodega
  await prisma.empresa.update({
    where: { id: empresaDestino },
    data: { ultimaSyncBodega: new Date() }
  })

  return { empresaId: empresaDestino, ordenes: ordenesFiltradas.length, nuevas }
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const resultados = []

  // Empresas con integración uptres activa
  const empresas = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { empresaId: true }
  })

  for (const { empresaId } of empresas) {
    try {
      // Sync propia
      const r = await syncEmpresa(empresaId)
      resultados.push(r)

      // Sync empresas vinculadas (las que no tienen bodega propia)
      const vinculadas = await (prisma as any).empresaVinculada.findMany({
        where: { empresaId, activa: true },
        select: { id: true, nombre: true, empresaClienteId: true }
      })

      for (const v of vinculadas) {
        try {
          const rv = await syncEmpresa(v.empresaClienteId, v.id)
          resultados.push({ ...rv, vinculada: v.nombre })
        } catch (err: any) {
          resultados.push({ vinculada: v.nombre, error: err.message })
        }
      }
    } catch (err: any) {
      resultados.push({ empresaId, error: err.message })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
