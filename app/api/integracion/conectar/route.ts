import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto-uptres'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })
  const empresaId = user.id

  const body = await req.json()
  const { tipo, apiKey, apiSecret } = body

  if (tipo === 'uptres') {
    if (!apiKey || !apiSecret) return NextResponse.json({ error: 'apiKey y apiSecret requeridos' }, { status: 400 })

    const encSecret = encrypt(apiSecret, process.env.UPTRES_SECRET!)
    const configData = { apiKey, apiSecret: encSecret, nombre: 'API UpTres' }

    const existing = await (prisma as any).integracion.findFirst({
      where: { empresaId, tipo: 'uptres' }
    })
    let integracion: any
    if (existing) {
      integracion = await (prisma as any).integracion.update({
        where: { id: existing.id },
        data: { activa: true, config: configData, syncInicial: false, ultimaSync: null, updatedAt: new Date() }
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

    return NextResponse.json({ ok: true, nombre: 'API UpTres', syncInicial: integracion.syncInicial ?? false })
  }
  return NextResponse.json({ error: 'Tipo no soportado' }, { status: 400 })
}

export async function DELETE(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  await (prisma as any).integracion.updateMany({
    where: { empresaId: user.id, tipo: 'uptres' },
    data: { activa: false, syncInicial: false, ultimaSync: null, updatedAt: new Date() }
  })

  return NextResponse.json({ ok: true })
}
