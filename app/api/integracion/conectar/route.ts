import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto-uptres'
import https from 'https'
const agent = new https.Agent({ rejectUnauthorized: false })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })
  const empresaId = user.id
  const { email, password, token, tipo } = await req.json()
  if (!token && (!email || !password)) return NextResponse.json({ error: 'Credenciales requeridas' }, { status: 400 })

  let nombre: string
  let configData: Record<string, string>

  if (token) {
    // Flujo token directo (API UpTres)
    nombre = 'API UpTres'
    configData = { token, nombre }
  } else {
    // Flujo email/password legado
    nombre = email
    try {
      const res = await fetch('https://www.uptres.top/login', {
        // @ts-ignore
        agent,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, version: '1.6.7.2', rememberMe: false }),
      })
      const data = await res.json()
      if (!data.ok && !data.token) return NextResponse.json({ error: 'Credenciales inválidas' })
      nombre = data.nombre || data.name || data.user?.nombre || email
    } catch {
      return NextResponse.json({ error: 'No se pudo conectar con el ERP' })
    }
    const encPassword = encrypt(password, process.env.UPTRES_SECRET!)
    configData = { email, password: encPassword, nombre }
  }

  const existing = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres' }
  })

  let integracion: any
  if (existing) {
    integracion = await (prisma as any).integracion.update({
      where: { id: existing.id },
      data: {
        activa: true,
        config: configData,
        updatedAt: new Date(),
      }
    })
  } else {
    integracion = await (prisma as any).integracion.create({
      data: {
        id: `intg-${empresaId}-uptres`,
        empresaId,
        nombre: 'API UpTres',
        tipo: 'uptres',
        activa: true,
        config: configData,
        updatedAt: new Date(),
      }
    })
  }

  return NextResponse.json({
    ok: true,
    nombre,
    syncInicial: (integracion as any).syncInicial ?? false,
  })
}

export async function DELETE(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  await (prisma as any).integracion.updateMany({
    where: { empresaId: user.id, tipo: 'uptres' },
    data: { activa: false, updatedAt: new Date() }
  })

  return NextResponse.json({ ok: true })
}
