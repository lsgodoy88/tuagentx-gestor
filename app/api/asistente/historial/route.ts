import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const hace5dias = new Date()
  hace5dias.setDate(hace5dias.getDate() - 5)

  const msgs = await prisma.asistenteChat.findMany({
    where: { empresaId, creadoEn: { gte: hace5dias } },
    orderBy: { creadoEn: 'asc' },
    take: 100,
  })
  return NextResponse.json(msgs)
}
