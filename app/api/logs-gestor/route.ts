import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES_ADMIN = ['empresa', 'supervisor']

// GET — listar logs (admin only)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !ROLES_ADMIN.includes(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo')
  const limit = parseInt(searchParams.get('limit') || '50')

  const logs = await (prisma as any).logsGestor.findMany({
    where: { ...(tipo ? { tipo } : {}) },
    orderBy: { creadoEl: 'desc' },
    take: Math.min(limit, 200),
  })

  return NextResponse.json({ ok: true, data: logs, total: logs.length })
}

// POST — crear log (admin only o cron)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  const esCron = secret === process.env.CRON_SECRET

  if (!esCron) {
    const session = await getServerSession(authOptions)
    const user = session?.user as any
  if (!user || !ROLES_ADMIN.includes(user.role))
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await req.json()
  const { tipo, titulo, descripcion, causaRaiz, solucion, archivos, commit, severidad, empresaId } = body

  if (!tipo || !titulo)
    return NextResponse.json({ error: 'tipo y titulo requeridos' }, { status: 400 })

  const log = await (prisma as any).logsGestor.create({
    data: {
      tipo,
      titulo,
      descripcion: descripcion || null,
      causaRaiz: causaRaiz || null,
      solucion: solucion || null,
      archivos: archivos || [],
      commit: commit || null,
      severidad: severidad || null,
      empresaId: empresaId || null,
    }
  })

  return NextResponse.json({ ok: true, id: log.id })
}

// PATCH — marcar como resuelto
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !ROLES_ADMIN.includes(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const { id, solucion, resueltaEl } = body

  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const log = await (prisma as any).logsGestor.update({
    where: { id },
    data: {
      ...(solucion ? { solucion } : {}),
      resueltaEl: resueltaEl ? new Date(resueltaEl) : new Date(),
    }
  })

  return NextResponse.json({ ok: true, id: log.id })
}
