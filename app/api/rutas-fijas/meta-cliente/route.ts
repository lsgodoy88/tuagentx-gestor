import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { rutaFijaId, clienteId, metaVenta } = await req.json()
  if (!rutaFijaId || !clienteId) return NextResponse.json({ error: 'rutaFijaId y clienteId requeridos' }, { status: 400 })
  const meta = Number(metaVenta) || 0

  const rfc = await (prisma as any).rutaFijaCliente.findFirst({
    where: { rutaFijaId, clienteId }
  })
  if (!rfc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await (prisma as any).rutaFijaCliente.update({
    where: { id: rfc.id },
    data: { metaVenta: meta > 0 ? meta : null }
  })
  return NextResponse.json({ ok: true })
}
