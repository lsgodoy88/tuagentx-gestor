import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })
  const empresaId = user.empresaId || user.id

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const vinculada = await prisma.empresaVinculada.findUnique({
    where: { apiKey: token },
    select: { id: true, nombre: true, activa: true, empresaClienteId: true, empresa: { select: { nombre: true } } }
  })

  if (!vinculada || !vinculada.activa) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  }

  // Obtener nombre de la empresa cliente
  const empresaCliente = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } })
  await prisma.empresaVinculada.update({
    where: { id: vinculada.id },
    data: { empresaClienteId: empresaId, nombre: empresaCliente?.nombre || 'Empresa vinculada' }
  })

  return NextResponse.json({ ok: true, nombre: vinculada.nombre || vinculada.empresa.nombre })
}
