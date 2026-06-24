import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { invalidateKeys } from '@/lib/cache'
import { fechaHoyBogota } from '@/lib/fechas'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { rutaFijaId, clienteId, metaVenta, horaEntrada } = await req.json()
  if (!rutaFijaId || !clienteId) return NextResponse.json({ error: 'rutaFijaId y clienteId requeridos' }, { status: 400 })

  const rfc = await (prisma as any).rutaFijaCliente.findFirst({
    where: { rutaFijaId, clienteId }
  })
  if (!rfc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const data: any = {}
  if (metaVenta !== undefined) {
    const meta = Number(metaVenta) || 0
    data.metaVenta = meta > 0 ? meta : null
  }
  if (horaEntrada !== undefined) {
    // formato "HH:mm" o null/"" para limpiar
    data.horaEntrada = horaEntrada && /^\d{2}:\d{2}$/.test(horaEntrada) ? horaEntrada : null
  }

  await (prisma as any).rutaFijaCliente.update({
    where: { id: rfc.id },
    data
  })

  // Invalida cache de vendedor/stats (dashboard) — cambios de meta/hora deben
  // reflejarse de inmediato, no esperar el TTL de 10min (bug real detectado 24/06).
  // Mismo patrón preciso que usa POST /api/rutas-fijas: solo impulsadoras de esta
  // ruta + sus vendedores, no un borrado masivo de Redis.
  const hoyStr = fechaHoyBogota()
  const empleadosRuta = await prisma.rutaFijaEmpleado.findMany({
    where: { rutaFijaId },
    select: { empleadoId: true }
  })
  const idsImpulsadoras = empleadosRuta.map((e: any) => e.empleadoId)
  const vendedoresAfectados = await prisma.empleado.findMany({
    where: { id: { in: idsImpulsadoras }, vendedorId: { not: null } },
    select: { vendedorId: true }
  })
  const keysInvalidar = [
    ...idsImpulsadoras.map((id: string) => `g:v:${id}:${hoyStr}`),
    ...vendedoresAfectados.map((e: any) => `g:v:${e.vendedorId}:${hoyStr}`),
  ]
  await invalidateKeys(...keysInvalidar)

  return NextResponse.json({ ok: true })
}
