import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { archivoUrl } from '@/lib/r2'

const ROLES = ROLES_ADMIN_BODEGA

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { id } = await params

  const orden = await (prisma as any).ordenDespacho.findFirst({
    where: { id, empresaId },
    select: { fotoAlistamiento: true },
  })
  if (!orden?.fotoAlistamiento) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })

  const key = orden.fotoAlistamiento
  const url = await archivoUrl(key)

  return NextResponse.redirect(url)
}
