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
    nit_remitente: config?.nit_remitente ?? '',
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const { usuario_login, usuario_password, nit_remitente } = await req.json()

  // Si solo viene nit_remitente (sin password), hacer patch del config existente
  if (!usuario_password && nit_remitente !== undefined && nit_remitente !== null) {
    const existing = await (prisma as any).integracion.findFirst({ where: { empresaId: user.id, tipo: TIPO } })
    if (!existing) return NextResponse.json({ error: 'Configura primero usuario y contraseña' }, { status: 400 })
    const config = { ...(existing.config as any), nit_remitente: nit_remitente.trim() }
    await (prisma as any).integracion.update({ where: { id: existing.id }, data: { config, updatedAt: new Date() } })
    return NextResponse.json({ ok: true })
  }

  if ((!usuario_login || !usuario_password) && nit_remitente === undefined)
    return NextResponse.json({ error: 'usuario_login y usuario_password requeridos' }, { status: 400 })

  // Validar credenciales antes de guardar
  try {
    const params = new URLSearchParams({ usuario_login, usuario_password })
    const res = await fetch('https://transprensa.colombiasoftware.net/index.php?api=servicio.Seguridad.login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const data = await res.json()
    if (!data.success) return NextResponse.json({ error: data.msg || 'Credenciales inválidas en Transprensa' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: 'No se pudo conectar a Transprensa' }, { status: 503 })
  }

  const encPassword = encrypt(usuario_password, process.env.UPTRES_SECRET!)
  const config: any = { usuario_login, usuario_password: encPassword }
  if (nit_remitente) config.nit_remitente = nit_remitente.trim()

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
