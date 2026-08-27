import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const intg = await (prisma as any).integracion.findFirst({
    where: { empresaId: user.id, tipo: 'transprensa' },
    select: { config: true }
  })
  if (!intg) return NextResponse.json({ ok: false, msg: 'Sin credenciales configuradas' })

  const config = intg.config as any
  try {
    const password = decrypt(config.usuario_password, process.env.UPTRES_SECRET!)
    const params = new URLSearchParams({ usuario_login: config.usuario_login, usuario_password: password })
    const res = await fetch('https://transprensa.colombiasoftware.net/index.php?api=servicio.Seguridad.login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const data = await res.json()
    if (data.success) return NextResponse.json({ ok: true, msg: data.data?.usuario?.empresa_nombre || 'Conectado' })
    return NextResponse.json({ ok: false, msg: data.msg || 'Credenciales inválidas' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, msg: e.message || 'Error de conexión' })
  }
}
