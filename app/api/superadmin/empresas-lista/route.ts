import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresas = await prisma.empresa.findMany({
    where: { activo: true, plan: { not: 'superadmin' } },
    select: { id: true, email: true, nombre: true, plan: true },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json({ ok: true, empresas })
}
