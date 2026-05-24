import { NextRequest, NextResponse } from 'next/server'
import { nowBogota } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export async function GET() {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  // Turno activo del empleado
  const turno = await prisma.turno.findFirst({
    where: { empleadoId: user.id, activo: true },
    select: { id: true, empleadoId: true, inicio: true, fin: true, activo: true, pausado: true, pausaInicio: true, pausaDuracionMin: true, pausaMotivo: true, latInicio: true, lngInicio: true, latFin: true, lngFin: true }
  })
  return NextResponse.json(turno || null)
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { accion, lat, lng, motivo, duracionMin } = await req.json()

  if (accion === 'iniciar') {
    const nuevoId = crypto.randomUUID()
    const turno = await prisma.$transaction(async (tx) => {
      // Cerrar cualquier turno activo previo
      await tx.turno.updateMany({
        where: { empleadoId: user.id, activo: true },
        data: { activo: false, fin: nowBogota() }
      })
      return tx.turno.create({
        data: {
          id: nuevoId,
          empleadoId: user.id,
          inicio: nowBogota(),  // explícito para evitar drift de timezone
          latInicio: lat || null,
          lngInicio: lng || null,
          activo: true,
        }
      })
    })
    await audit('TURNO_INICIADO', user.email, `Turno: ${turno.id}`, user.id, user.empresaId)
    return NextResponse.json({ ok: true, turno })
  }

  if (accion === 'cerrar') {
    await prisma.turno.updateMany({
      where: { empleadoId: user.id, activo: true },
      data: { activo: false, fin: nowBogota(), latFin: lat || null, lngFin: lng || null }
    })
    await audit('TURNO_CERRADO', user.email, `Turno cerrado`, user.id, user.empresaId)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'pausar') {
    await prisma.turno.updateMany({
      where: { empleadoId: user.id, activo: true },
      data: { pausado: true, pausaInicio: nowBogota(), pausaMotivo: motivo || null, pausaDuracionMin: duracionMin || null }
    })
    return NextResponse.json({ ok: true })
  }
  if (accion === 'reanudar') {
    await prisma.$transaction(async (tx) => {
      // Leer y calcular duración real dentro de la misma transacción
      const turnoActivo = await tx.turno.findFirst({
        where: { empleadoId: user.id, activo: true },
        select: { id: true, pausaInicio: true, pausaDuracionMin: true }
      })
      if (!turnoActivo) return
      let duracionRealMin = turnoActivo.pausaDuracionMin || null
      if (turnoActivo.pausaInicio) {
        const ms = Date.now() - new Date(turnoActivo.pausaInicio).getTime()
        duracionRealMin = Math.round(ms / 60000)
      }
      await tx.turno.update({
        where: { id: turnoActivo.id },
        data: { pausado: false, pausaInicio: null, pausaDuracionMin: duracionRealMin }
        // pausaMotivo se conserva — no se borra
      })
    })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
