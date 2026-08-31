import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

async function obtenerEmpresaId() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const user = session.user as any
  if (user.role !== 'empresa' && user.role !== 'supervisor') return null
  return getEmpresaId(user)
}

export async function GET() {
  const empresaId = await obtenerEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [generadas, conectadas] = await Promise.all([
    prisma.empresaVinculada.findMany({
      where: { empresaId },
      include: { _count: { select: { rutas: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.empresaVinculada.findMany({
      where: { empresaClienteId: empresaId, activa: true },
      include: { empresa: { select: { id: true, nombre: true, horaInicioRuta: true, horaFinRuta: true, ciudadEntregaLocal: true, diasHistorialBodega: true, bodegaPuedeEnviar: true, autoAbrirTurno: true, autoCerrarTurno: true } }, _count: { select: { rutas: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return NextResponse.json({
    vinculadas: generadas,
    conectadas: conectadas.map(v => ({
      ...v,
      esConectada: true,
      nombreEmpresaPrincipal: v.empresa.nombre,
      configDuena: {
        horaInicioRuta: v.empresa.horaInicioRuta,
        horaFinRuta: v.empresa.horaFinRuta,
        ciudadEntregaLocal: v.empresa.ciudadEntregaLocal,
        diasHistorialBodega: v.empresa.diasHistorialBodega,
        bodegaPuedeEnviar: v.empresa.bodegaPuedeEnviar,
        autoAbrirTurno: v.empresa.autoAbrirTurno,
        autoCerrarTurno: v.empresa.autoCerrarTurno,
      }
    }))
  })
}

export async function POST(req: NextRequest) {
  const empresaId = await obtenerEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { color } = await req.json()

  const vinculada = await prisma.empresaVinculada.create({
    data: { empresaId, nombre: 'Pendiente', color: color || '#8b5cf6' },
  })

  return NextResponse.json({ vinculada })
}

export async function DELETE(req: NextRequest) {
  const empresaId = await obtenerEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  await prisma.empresaVinculada.updateMany({
    where: { id, empresaId },
    data: { activa: false },
  })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!['empresa', 'supervisor'].includes(user?.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const empresaId = getEmpresaId(user)
  const { id, fechaInicioBodega, activa } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const fecha = fechaInicioBodega !== undefined ? (fechaInicioBodega ? new Date(fechaInicioBodega) : null) : undefined
  const updated = await prisma.empresaVinculada.update({
    where: { id, empresaId },
    data: { ...(fecha !== undefined ? { fechaInicioBodega: fecha } : {}), ...(activa !== undefined ? { activa } : {}) },
  })

  // Sincronización inicial: cancelar pendientes de la vinculada anteriores a la fecha
  let canceladas = 0
  if (fecha) {
    canceladas = Number(await prisma.$executeRawUnsafe(
      `UPDATE ${DB_SCHEMA}."OrdenDespacho" SET estado = 'cancelado' WHERE "origenVinculadaId" = $1 AND estado = 'pendiente' AND COALESCE("fechaOrdenBogota", "createdAt") < $2`,
      id, fecha
    ))
  }

  return NextResponse.json({ ok: true, fechaInicioBodega: updated.fechaInicioBodega, canceladas })
}
