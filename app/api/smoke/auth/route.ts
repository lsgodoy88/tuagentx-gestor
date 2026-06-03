import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// Endpoint interno para smoke test post-deploy
// Solo accesible con CRON_SECRET
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { email, password } = await req.json()
    if (!email || !password)
      return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 })

    const empresa = await prisma.empresa.findUnique({ where: { email } })
    if (!empresa)
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const match = await bcrypt.compare(password, empresa.password)
    if (!match)
      return NextResponse.json({ error: 'Credenciales invalidas' }, { status: 401 })

    return NextResponse.json({
      ok: true,
      empresaId: empresa.id,
      role: empresa.plan === 'superadmin' ? 'superadmin' : 'empresa',
      nombre: empresa.nombre,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
