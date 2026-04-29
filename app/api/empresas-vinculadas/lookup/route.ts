import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const vinculada = await prisma.empresaVinculada.findUnique({
    where: { apiKey: token },
    select: { id: true, nombre: true, activa: true, empresaId: true, empresa: { select: { nombre: true } } }
  })

  if (!vinculada || !vinculada.activa) {
    return NextResponse.json({ error: 'Token inválido o empresa inactiva' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, vinculadaId: vinculada.id, nombre: vinculada.empresa.nombre })
}
