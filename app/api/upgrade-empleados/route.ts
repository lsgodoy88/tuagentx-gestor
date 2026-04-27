import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ROL_COLUMN: Record<string, string> = {
  vendedor:    'maxVendedores',
  supervisor:  'maxSupervisores',
  entregas:    'maxEntregas',
  impulsadora: 'maxImpulsadoras',
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const secret = process.env.MASTER_API_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { empresaId, roles } = await req.json()
  if (!empresaId || !roles || typeof roles !== 'object') {
    return NextResponse.json({ error: 'Faltan campos: empresaId, roles (objeto)' }, { status: 400 })
  }

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } })
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  }

  const cambios: Record<string, { anterior: number; nuevo: number }> = {}

  for (const [rol, cantidad] of Object.entries(roles)) {
    const col = ROL_COLUMN[rol]
    if (!col) continue
    const n = Number(cantidad) || 0
    if (n <= 0) continue
    const actual = (empresa as any)[col] ?? 0
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { [col]: actual + n },
    })
    cambios[rol] = { anterior: actual, nuevo: actual + n }
  }

  console.log(`[upgrade-empleados] ${empresa.nombre}:`, JSON.stringify(cambios))
  return NextResponse.json({ ok: true, cambios })
}
