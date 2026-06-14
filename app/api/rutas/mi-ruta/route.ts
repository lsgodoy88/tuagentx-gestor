import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expandirDireccion } from '@/lib/maps'

const DELAY_MS = 1100
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

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
    where: { empleados: { some: { empleadoId: user.id } }, cerrada: false },
    orderBy: { fecha: 'desc' },
    select: {
      id: true, cerrada: true, nombre: true, createdAt: true, fecha: true,
      clientes: {
        select: {
          id: true, clienteId: true, orden: true, notas: true,
          rezago: true, asignadoEn: true,
          cliente: {
            select: {
              id: true, nombre: true, nombreComercial: true,
              direccion: true, ciudad: true, telefono: true,
              nit: true, lat: true, lng: true, latTmp: true, lngTmp: true
            }
          }
        },
        orderBy: { orden: 'asc' }
      }
    },
  })

  if (ruta) {
    // Extraer números de factura/orden desde notas "Bodega/EMPRESA #XXXX"
    const numerosNotas = ruta.clientes
      .filter(rc => rc.notas?.startsWith('Bodega/'))
      .map(rc => { const m = rc.notas!.match(/#(\d+)/); return m ? m[1] : null })
      .filter(Boolean) as string[]

    if (numerosNotas.length > 0) {
      // Buscar por numeroFactura primero (fuente de verdad), fallback a numeroOrden
      const [porFactura, porOrden] = await Promise.all([
        prisma.ordenDespacho.findMany({
          where: {
            empresaId: user.empresaId,
            numeroFactura: { in: numerosNotas },
            estado: { in: ['pendiente', 'alistado', 'en_entrega'] }
          },
          select: {
            id: true, numeroFactura: true, numeroOrden: true,
            alistadoPorId: true,
            alistadoPor: { select: { nombre: true } },
            origenVinculadaId: true,
            empresaVinculada: { select: { nombre: true } },
            createdAt: true,
          }
        }),
        prisma.ordenDespacho.findMany({
          where: {
            empresaId: user.empresaId,
            numeroOrden: { in: numerosNotas },
            numeroFactura: null, // solo las que no tienen factura
            estado: { in: ['pendiente', 'alistado', 'en_entrega'] }
          },
          select: {
            id: true, numeroFactura: true, numeroOrden: true,
            alistadoPorId: true,
            alistadoPor: { select: { nombre: true } },
            origenVinculadaId: true,
            empresaVinculada: { select: { nombre: true } },
            createdAt: true,
          }
        })
      ])

      // Mapa por el número que aparece en la nota
      const mapOrdenes = new Map<string, typeof porFactura[0]>()
      for (const o of [...porFactura, ...porOrden]) {
        if (o.numeroFactura) mapOrdenes.set(o.numeroFactura, o)
        if (o.numeroOrden)   mapOrdenes.set(o.numeroOrden, o)
      }

      // Parsear la empresa origen desde la nota: "Bodega/Lumeli #6889"
      for (const rc of ruta.clientes) {
        if (!rc.notas?.startsWith('Bodega/')) continue
        const m = rc.notas.match(/#(\d+)/)
        const num = m ? m[1] : rc.notas.split('/')[1]?.split(' ')[0]
        const empresaNota = rc.notas.replace('Bodega/', '').replace(/#\d+/, '').trim()
        const orden = mapOrdenes.get(num)

        ;(rc as any).ordenDespachoId = orden?.id || null
        ;(rc as any).numeroFactura    = orden?.numeroFactura || null
        ;(rc as any).empresaOrigen    = orden?.empresaVinculada?.nombre || empresaNota || null
        ;(rc as any).alistadoPor      = orden?.alistadoPor?.nombre || null
        ;(rc as any).ordenCreadaEl    = orden?.createdAt || null
      }
    }
  }

  // Geocodificación en background para entregas
  if (ruta && user.role === 'entregas') {
    const sinCoords = ruta.clientes.filter(rc =>
      !rc.cliente.lat && !rc.cliente.lng && !rc.cliente.latTmp && !rc.cliente.lngTmp
    )
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
