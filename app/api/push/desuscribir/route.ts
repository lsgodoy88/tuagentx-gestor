import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { endpoint } = await req.json().catch(() => ({}))
  if (!endpoint) return NextResponse.json({ error: 'endpoint requerido' }, { status: 400 })

  const user = session.user as any

  try {
    if (user.role === 'empresa') {
      await (prisma as any).pushSuscripcionAdmin.deleteMany({
        where: { empresaId: user.id, endpoint }
      })
    } else {
      await (prisma as any).pushSuscripcion.deleteMany({
        where: { empleadoId: user.id, endpoint }
      })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
