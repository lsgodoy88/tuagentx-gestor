import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { subirFotoAlistamiento } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN_BODEGA.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { ordenId, fotoBase64 } = await req.json()
  if (!ordenId || !fotoBase64) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const orden = await (prisma as any).ordenDespacho.findUnique({ where: { id: ordenId } })
  if (!orden) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (orden.empresaId !== empresaId) {
    const vinculo = await (prisma as any).empresaVinculada.findFirst({
      where: { empresaId, empresaClienteId: orden.empresaId, activa: true }, select: { id: true },
    })
    if (!vinculo) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  const fotosActuales: string[] = (orden.fotosAlistamiento as string[]) || []
  const idx = fotosActuales.length
  const key = await subirFotoAlistamiento(fotoBase64, ordenId, idx)

  const fotos = [...fotosActuales, key]
  const updated = await (prisma as any).ordenDespacho.update({
    where: { id: ordenId },
    data: { fotosAlistamiento: fotos, fotoAlistamiento: key },
    include: {
      alistadoPor: { select: { id: true, nombre: true } },
      repartidor:  { select: { id: true, nombre: true } },
    },
  })

  return NextResponse.json({ url: `/api/egresos/url?key=${encodeURIComponent(key)}`, orden: updated })
}
