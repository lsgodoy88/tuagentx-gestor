import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subirFirma } from '@/lib/r2'
import { audit } from '@/lib/audit'
import { distanciaMetros } from '@/lib/gps'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

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

  const { clienteId, lat, lng, nota, tipo, monto, esLibre, rutaFijaClienteId, factura, firma, capturarGps } = await req.json()
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

  const visita = await prisma.visita.create({
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
      fechaBogota: new Date(Date.now() - 5 * 60 * 60 * 1000),
      esLibre: esLibre === true,
      rutaFijaClienteId: rutaFijaClienteId || null,
      factura: factura || null,
      firma: firmaUrl,
    },
    include: { cliente: true }
  })

  // Verificar distancia GPS vs cliente (alerta si > 500 metros)
  let alertaDistancia = null
  if (lat && lng) {
    const cli = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (cli?.lat && cli?.lng) {
      const distancia = distanciaMetros(lat, lng, cli.lat, cli.lng)
      if (distancia > 500) alertaDistancia = Math.round(distancia)
    }
  }

  // Solo actualizar GPS si capturarGps=true Y empleado tiene permiso Y cliente no tiene GPS
  if (lat && lng && capturarGps) {
    const emp = await (prisma.empleado as any).findUnique({ where: { id: user.id } })
    const cli = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (emp?.puedeCapturarGps) {
      await prisma.cliente.update({ where: { id: clienteId }, data: { lat, lng, ubicacionReal: true } })
    }
  }
  // Guardar alerta GPS en AuditLog si estuvo fuera de rango
  if (alertaDistancia) {
    const clienteAlerta = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true } })
    await audit(
      'GPS_FUERA_RANGO',
      user.email,
      `Empleado a ${alertaDistancia}m del cliente ${clienteAlerta?.nombre || clienteId}`,
      user.id,
      user.empresaId
    )
  }
  // Verificar si la ruta del empleado quedó completa
  if (!esLibre) {
    const fechaHoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
    const rutaActiva = await prisma.ruta.findFirst({
      where: {
        cerrada: false,
        empleados: { some: { empleadoId: user.id } },
        fecha: {
          gte: new Date(fechaHoy + 'T05:00:00.000Z'),
          lte: new Date(fechaHoy + 'T05:00:00.000Z')
        }
      },
      include: { clientes: true }
    })
    if (rutaActiva) {
      const cliIds = rutaActiva.clientes.map((c: any) => c.clienteId)
      const visitasHoy = await prisma.visita.findMany({
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
        await (prisma.ruta as any).update({
          where: { id: rutaActiva.id },
          data: { cerrada: true, cerradaEl: new Date() }
        })
      }
    }
  }

  await audit('VISITA_REGISTRADA', user.email, `Tipo: ${tipo} | Cliente: ${clienteId} | Libre: ${esLibre}`, user.id, user.empresaId)
  return NextResponse.json({ ok: true, visita, alertaDistancia })
}
