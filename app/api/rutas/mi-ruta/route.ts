import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expandirDireccion } from '@/lib/maps'

const DELAY_MS = 1100

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function geocodificarCliente(clienteId: string, direccion: string | null | undefined, ciudad: string | null | undefined) {
  const mapsUrl = expandirDireccion(direccion, ciudad)
  if (!mapsUrl) return null
  const queryMatch = mapsUrl.match(/\?q=(.+)$/)
  if (!queryMatch) return null
  const query = decodeURIComponent(queryMatch[1])
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=co`,
      { headers: { 'User-Agent': 'TuAgentX/1.0' } }
    )
    const data = await res.json()
    if (data?.[0]?.lat && data?.[0]?.lon) {
      const latTmp = parseFloat(data[0].lat)
      const lngTmp = parseFloat(data[0].lon)
      await prisma.cliente.update({ where: { id: clienteId }, data: { latTmp, lngTmp } })
      return { latTmp, lngTmp }
    }
  } catch {}
  return null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json(null)
  const user = session.user as any

  const ruta = await prisma.ruta.findFirst({
    where: { empleados: { some: { empleadoId: user.id } } },
    select: {
      id: true, cerrada: true, nombre: true, createdAt: true,
      clientes: {
        select: { id: true, clienteId: true, orden: true, notas: true, cliente: { select: { id: true, nombre: true, nombreComercial: true, direccion: true, ciudad: true, telefono: true, nit: true, lat: true, lng: true, latTmp: true, lngTmp: true } } },
        orderBy: { orden: 'asc' }
      }
    },
  })

  // Enriquecer con ordenDespachoId para clientes con notas "Bodega/XXXX"
  if (ruta) {
    const numeroOrdenes = ruta.clientes
      .filter(rc => rc.notas?.startsWith('Bodega/'))
      .map(rc => { const m = rc.notas!.match(/#(\d+)/); return m ? m[1] : rc.notas!.split('/')[1] })
      .filter(Boolean)

    if (numeroOrdenes.length > 0) {
      const ordenes = await prisma.ordenDespacho.findMany({
        where: { empresaId: user.empresaId, numeroOrden: { in: numeroOrdenes }, estado: { in: ['pendiente', 'alistado', 'en_entrega'] } },
        select: { id: true, numeroOrden: true }
      })
      const mapOrden = new Map(ordenes.map(o => [o.numeroOrden, o.id]))
      const mapNumero = new Map(ordenes.map(o => [o.numeroOrden, o.numeroOrden]))
      for (const rc of ruta.clientes) {
        if (rc.notas?.startsWith('Bodega/')) {
          const m = rc.notas.match(/#(\d+)/)
          const num = m ? m[1] : rc.notas.split('/')[1]
          ;(rc as any).ordenDespachoId = mapOrden.get(num) || null
          ;(rc as any).ordenNumero = mapNumero.get(num) || null
        }
      }
    }
  }

  if (ruta && user.role === 'entregas') {
    const sinCoords = ruta.clientes.filter(rc =>
      !rc.cliente.lat && !rc.cliente.lng && !rc.cliente.latTmp && !rc.cliente.lngTmp
    )
    // Todo en background — nunca bloquear el response
    if (sinCoords.length > 0) {
      setImmediate(async () => {
        for (let i = 0; i < sinCoords.length; i++) {
          if (i > 0) await sleep(DELAY_MS)
          await geocodificarCliente(sinCoords[i].clienteId, sinCoords[i].cliente.direccion, sinCoords[i].cliente.ciudad)
        }
      })
    }
  }

  return NextResponse.json(ruta)
}
