import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['vendedor', 'impulsadora', 'supervisor'].includes(user.role)) {
    return NextResponse.json({ ok: true })
  }
  const { endpoint, keys } = await req.json()
  try {
    await prisma.$executeRaw`
      INSERT INTO gestor."PushSuscripcion" (id, "empleadoId", endpoint, p256dh, auth, "createdAt")
      VALUES (gen_random_uuid()::text, ${user.id}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, NOW())
      ON CONFLICT DO NOTHING`
  } catch (e) {
    console.error('Push suscribir error:', e)
  }
  return NextResponse.json({ ok: true })
}
