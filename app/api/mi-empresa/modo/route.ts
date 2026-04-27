import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const empresa = await prisma.empresa.findUnique({
    where: { id: user.id },
    select: { modoEquipo: true },
  })
  if (empresa?.modoEquipo !== null) {
    return NextResponse.json({ error: 'Ya configurado' }, { status: 400 })
  }

  const body = await req.json()
  const { modo } = body
  if (!['supervisores', 'simple'].includes(modo)) {
    return NextResponse.json({ error: 'Modo inválido' }, { status: 400 })
  }

  await prisma.empresa.update({ where: { id: user.id }, data: { modoEquipo: modo } })
  return NextResponse.json({ ok: true })
}
