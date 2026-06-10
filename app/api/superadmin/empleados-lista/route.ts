import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empleados = await prisma.empleado.findMany({
    where: { activo: true },
    select: { id: true, email: true, nombre: true, rol: true, empresaId: true, etiqueta: true, apiId: true },
    orderBy: [{ empresaId: 'asc' }, { nombre: 'asc' }],
  })
  return NextResponse.json({ ok: true, empleados })
}
