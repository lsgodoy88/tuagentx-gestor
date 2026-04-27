import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  // Turno activo del empleado
  const turno = await prisma.turno.findFirst({
    where: { empleadoId: user.id, activo: true },
    include: { visitas: { include: { cliente: true }, orderBy: { createdAt: 'desc' } } }
  })
  return NextResponse.json(turno || null)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { accion, lat, lng, motivo, duracionMin } = await req.json()

  if (accion === 'iniciar') {
    // Cerrar turno activo si existe
    await prisma.turno.updateMany({
      where: { empleadoId: user.id, activo: true },
      data: { activo: false, fin: new Date() }
    })
    const turno = await prisma.turno.create({
      data: {
        id: crypto.randomUUID(),
        empleadoId: user.id,
        latInicio: lat || null,
        lngInicio: lng || null,
        activo: true,
      }
    })
    await audit('TURNO_INICIADO', user.email, `Turno: ${turno.id}`, user.id, user.empresaId)
    return NextResponse.json({ ok: true, turno })
  }

  if (accion === 'cerrar') {
    await prisma.turno.updateMany({
      where: { empleadoId: user.id, activo: true },
      data: { activo: false, fin: new Date(), latFin: lat || null, lngFin: lng || null }
    })
    await audit('TURNO_CERRADO', user.email, `Turno cerrado`, user.id, user.empresaId)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'pausar') {
    await prisma.turno.updateMany({
      where: { empleadoId: user.id, activo: true },
      data: { pausado: true, pausaInicio: new Date(), pausaMotivo: motivo || null, pausaDuracionMin: duracionMin || null }
    })
    return NextResponse.json({ ok: true })
  }
  if (accion === 'reanudar') {
    await prisma.turno.updateMany({
      where: { empleadoId: user.id, activo: true },
      data: { pausado: false, pausaInicio: null, pausaMotivo: null, pausaDuracionMin: null }
    })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
