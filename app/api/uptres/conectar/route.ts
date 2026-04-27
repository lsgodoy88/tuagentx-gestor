import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto-uptres'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role === 'empresa' || user.role === 'superadmin') {
    return NextResponse.json({ error: 'Solo empleados' }, { status: 403 })
  }

  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'Credenciales requeridas' }, { status: 400 })

  let loginData: any
  try {
    const res = await fetch('https://www.uptres.top/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, version: '1.6.7.0', rememberMe: false }),
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: 'Credenciales inválidas en UpTres' })
    loginData = await res.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo conectar con UpTres' })
  }

  const nombre =
    loginData?.nombre ||
    loginData?.name ||
    loginData?.user?.nombre ||
    loginData?.vendedor?.nombre ||
    email

  const secret = process.env.UPTRES_SECRET!
  const encPassword = encrypt(password, secret)

  await prisma.empleado.update({
    where: { id: user.id },
    data: { uptresEmail: email, uptresPassword: encPassword },
  })

  return NextResponse.json({ ok: true, nombre })
}

export async function DELETE(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any

  await prisma.empleado.update({
    where: { id: user.id },
    data: { uptresEmail: null, uptresPassword: null },
  })

  return NextResponse.json({ ok: true })
}
