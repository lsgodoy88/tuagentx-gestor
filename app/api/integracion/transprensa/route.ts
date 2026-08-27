import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto-uptres'

const TIPO = 'transprensa'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const intg = await (prisma as any).integracion.findFirst({
    where: { empresaId: user.id, tipo: TIPO },
    select: { id: true, activa: true, config: true }
  })

  if (!intg) return NextResponse.json({ configurado: false })

  const config = intg.config as any
  return NextResponse.json({
    configurado: true,
    activa: intg.activa,
    usuario_login: config?.usuario_login ?? '',
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const { usuario_login, usuario_password } = await req.json()
  if (!usuario_login || !usuario_password)
    return NextResponse.json({ error: 'usuario_login y usuario_password requeridos' }, { status: 400 })

  const encPassword = encrypt(usuario_password, process.env.UPTRES_SECRET!)
  const config = { usuario_login, usuario_password: encPassword }

  const existing = await (prisma as any).integracion.findFirst({
    where: { empresaId: user.id, tipo: TIPO }
  })

  if (existing) {
    await (prisma as any).integracion.update({
      where: { id: existing.id },
      data: { activa: true, config, updatedAt: new Date() }
    })
  } else {
    await (prisma as any).integracion.create({
      data: {
        id: `intg-${user.id}-${TIPO}`,
        empresaId: user.id,
        nombre: 'API Transprensa',
        tipo: TIPO,
        activa: true,
        config,
      }
    })
  }

  return NextResponse.json({ ok: true })
}
