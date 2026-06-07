import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nowBogota, fechaHoyBogota, inicioDiaBogota, finDiaBogota } from '@/lib/fechas'
import { invalidateKeys } from '@/lib/cache'
import { subirFirma } from '@/lib/r2'
import { audit } from '@/lib/audit'
import { actualizarResumenVisita } from '@/lib/visitaResumen'
import { distanciaMetros } from '@/lib/gps'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const hoy = inicioDiaBogota()

  const visitas = await prisma.visita.findMany({
    where: { empleadoId: user.id, createdAt: { gte: hoy } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, tipo: true, monto: true, nota: true, factura: true,
      firma: true, lat: true, lng: true, esLibre: true,
      createdAt: true, fechaBogota: true,
      cliente: { select: { id: true, nombre: true, direccion: true } }
    }
  })
  return NextResponse.json(visitas)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const { clienteId, lat, lng, nota, tipo, monto, esLibre, rutaFijaClienteId, factura, firma, capturarGps, ordenDespachoId } = await req.json()
  if (!clienteId) return NextResponse.json({ error: 'Cliente requerido' }, { status: 400 })

  // Obtener turno activo
  const turno = await prisma.turno.findFirst({
    where: { empleadoId: user.id, activo: true }
  })

  let firmaUrl = firma || null
  if (firma && firma.startsWith('data:')) {
    try {
      firmaUrl = await subirFirma(firma, crypto.randomUUID())
    } catch(e) {
      console.log('Error R2:', e)
    }
  }

  // Leer cliente y empleado antes de la transacción
  const cli = await prisma.cliente.findUnique({ where: { id: clienteId } })
  let alertaDistancia: number | null = null
  if (lat && lng && cli) {
    const refLat = cli.lat || cli.latTmp
    const refLng = cli.lng || cli.lngTmp
    if (refLat && refLng) {
      const distancia = distanciaMetros(lat, lng, refLat, refLng)
      if (distancia > 500) alertaDistancia = Math.round(distancia)
    }
  }

  let puedeCapturarGps = false
  if (lat && lng && capturarGps && !cli?.lat) {
    const emp = await (prisma.empleado as any).findUnique({ where: { id: user.id }, select: { puedeCapturarGps: true } })
    puedeCapturarGps = emp?.puedeCapturarGps === true
  }

  // Todo lo crítico en una sola transacción
  const visita = await prisma.$transaction(async (tx) => {
    const v = await tx.visita.create({
      data: {
        id: crypto.randomUUID(),
        empleadoId: user.id,
        clienteId,
        turnoId: turno?.id || null,
        lat: lat || null,
        lng: lng || null,
        nota: nota || null,
        tipo: tipo || 'visita',
        monto: monto ? Number(monto) : null,
        fechaBogota: nowBogota(),
        esLibre: esLibre === true,
        rutaFijaClienteId: rutaFijaClienteId || null,
        factura: factura || null,
        firma: firmaUrl,
        ordenDespachoId: ordenDespachoId || null,
      },
      select: { id: true, tipo: true, monto: true, nota: true, factura: true, firma: true, lat: true, lng: true, esLibre: true, createdAt: true, fechaBogota: true, clienteId: true, empleadoId: true, cliente: { select: { id: true, nombre: true, direccion: true, lat: true, lng: true } } }
    })

    // Marcar despacho entregado
    if (ordenDespachoId) {
      const updateOrden: any = { estado: 'entregado', entregadoEl: new Date() }
      if (firmaUrl) updateOrden.firmaEntrega = firmaUrl
      await tx.ordenDespacho.update({ where: { id: ordenDespachoId }, data: updateOrden })
    }

    // Actualizar GPS del cliente si aplica
    if (puedeCapturarGps) {
      await tx.cliente.update({ where: { id: clienteId }, data: { lat, lng, ubicacionReal: true } })
    }

    // Verificar si la ruta quedó completa
    if (!esLibre) {
      const fechaHoy = fechaHoyBogota()
      const rutaActiva = await tx.ruta.findFirst({
        where: {
          cerrada: false,
          empleados: { some: { empleadoId: user.id } },
          fecha: {
            gte: inicioDiaBogota(),
            lt:  finDiaBogota()
          }
        },
        select: { id: true, clientes: { select: { clienteId: true } } }
      })
      if (rutaActiva) {
        const cliIds = rutaActiva.clientes.map((c: any) => c.clienteId)
        const visitasHoy = await tx.visita.findMany({
          where: {
            empleadoId: user.id,
            clienteId: { in: cliIds },
            fechaBogota: {
              gte: new Date(fechaHoy + 'T00:00:00.000Z'),
              lte: new Date(fechaHoy + 'T23:59:59.999Z')
            }
          },
          select: { clienteId: true }
        })
        const visitados = new Set(visitasHoy.map((v: any) => v.clienteId))
        const completa = cliIds.every((id: string) => visitados.has(id))
        if (completa) {
          await (tx.ruta as any).update({
            where: { id: rutaActiva.id },
            data: { cerrada: true, cerradaEl: new Date() }
          })
        }
      }
    }

    return v
  }, { timeout: 15000 })

  // Audit fuera de transacción — no es crítico para la integridad
  if (alertaDistancia) {
    await audit('GPS_FUERA_RANGO', user.email, `Empleado a ${alertaDistancia}m del cliente ${cli?.nombre || clienteId}`, user.id, user.empresaId)
  }
  // Actualizar resumen de visitas (best-effort)
  const fechaBogotaStr = visita.fechaBogota ? new Date(visita.fechaBogota).toISOString().split('T')[0] : null
  actualizarResumenVisita(user.id, { tipo: tipo || 'visita', monto }, fechaBogotaStr).catch(() => {})

  await audit('VISITA_REGISTRADA', user.email, `Tipo: ${tipo} | Cliente: ${clienteId} | Libre: ${esLibre}`, user.id, user.empresaId)
  // Invalidar caché de stats afectados por esta visita
  await invalidateKeys(
    `g:${user.empresaId}:stats:${fechaHoyBogota()}`,
    `g:v:${user.id}:${fechaHoyBogota()}`
  )
  return NextResponse.json({ ok: true, visita, alertaDistancia })
}
