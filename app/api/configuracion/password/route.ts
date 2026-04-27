import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { password } = await req.json()
  if (!password || password.length < 6) return NextResponse.json({ error: 'Contraseña muy corta' }, { status: 400 })
  const hash = await bcrypt.hash(password, 10)

  if (user.role === 'empresa' || user.role === 'superadmin') {
    await prisma.empresa.update({ where: { id: user.id }, data: { password: hash } })
  } else {
    await prisma.empleado.update({ where: { id: user.id }, data: { password: hash } })
  }
  return NextResponse.json({ ok: true })
}
