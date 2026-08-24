import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { archivoUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'

// GET — lista eventos (vendedor: los suyos; admin/supervisor: todos)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['vendedor', 'empresa', 'supervisor', 'impulsadora'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const empresaId = getEmpresaId(user)
    const { searchParams } = new URL(req.url)
    const desde = searchParams.get('desde') || ''
    const hasta = searchParams.get('hasta') || ''
    const empleadoIdParam = searchParams.get('empleadoId') || ''

    const conditions: string[] = [`ie."empresaId" = $1`]
    const params: any[] = [empresaId]
    let pi = 2

    if (user.role === 'vendedor') {
      conditions.push(`ie."vendedorId" = $${pi}`); params.push(user.id); pi++
    } else if (user.role === 'impulsadora') {
      conditions.push(`ie."empleadoId" = $${pi}`); params.push(user.id); pi++
    } else if (empleadoIdParam) {
      conditions.push(`ie."empleadoId" = $${pi}`); params.push(empleadoIdParam); pi++
    }

    if (desde) { conditions.push(`ie.fecha >= $${pi}::timestamptz`); params.push(desde + 'T00:00:00Z'); pi++ }
    if (hasta) { conditions.push(`ie.fecha <= $${pi}::timestamptz`); params.push(hasta + 'T23:59:59Z'); pi++ }

    const rows: any[] = await (prisma as any).$queryRawUnsafe(`
      SELECT
        ie.id, ie."clienteId", ie.ciudad, ie."tipoEvento", ie.fecha, ie.fotos,
        ie."empleadoId", ie."vendedorId", ie."createdAt",
        c.nombre AS "clienteNombre",
        e.nombre AS "impulsadoraNombre"
      FROM ${DB_SCHEMA}."ImpulsoEvento" ie
      JOIN ${DB_SCHEMA}."Cliente" c ON c.id = ie."clienteId"
      JOIN ${DB_SCHEMA}."Empleado" e ON e.id = ie."empleadoId"
      WHERE ${conditions.join(' AND ')}
      ORDER BY ie.fecha DESC
      LIMIT 200
    `, ...params)

    return NextResponse.json({ eventos: rows }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/impulsar/evento] GET error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST — crear evento
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'impulsadora') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const { clienteId, ciudad, tipoEvento, fecha, fotos } = await req.json()

    if (!clienteId || !tipoEvento || !fecha || !Array.isArray(fotos) || fotos.length === 0) {
      return NextResponse.json({ error: 'clienteId, tipoEvento, fecha y al menos 1 foto son requeridos' }, { status: 400 })
    }
    if (fotos.length > 4) {
      return NextResponse.json({ error: 'Máximo 4 fotos por evento' }, { status: 400 })
    }

    const empleado = await prisma.empleado.findUnique({
      where: { id: user.id },
      select: { vendedorId: true }
    })
    if (!empleado?.vendedorId) {
      return NextResponse.json({ error: 'Impulsadora sin vendedor asignado' }, { status: 400 })
    }

    const evento = await (prisma as any).impulsoEvento.create({
      data: {
        id: crypto.randomUUID(),
        clienteId,
        ciudad: ciudad || null,
        tipoEvento,
        fecha: new Date(fecha + 'T12:00:00-05:00'),
        fotos,
        empleadoId: user.id,
        vendedorId: empleado.vendedorId,
        empresaId,
      }
    })

    return NextResponse.json({ ok: true, evento })
  } catch (err: any) {
    console.error('[api/impulsar/evento] POST error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE — eliminar evento (solo admin)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const existente = await (prisma as any).impulsoEvento.findFirst({ where: { id, empresaId } })
    if (!existente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    await (prisma as any).impulsoEvento.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[api/impulsar/evento] DELETE error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
