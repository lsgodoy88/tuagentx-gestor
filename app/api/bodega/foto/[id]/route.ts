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

  // FIX 2026-06-20: la orden puede vivir en la empresa propia o en una vinculada
  const orden = await (prisma as any).ordenDespacho.findUnique({
    where: { id },
    select: { fotoAlistamiento: true, empresaId: true },
  })
  if (!orden?.fotoAlistamiento) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })
  if (orden.empresaId !== empresaId) {
    const vinculo = await (prisma as any).empresaVinculada.findFirst({
      where: { empresaId, empresaClienteId: orden.empresaId, activa: true }, select: { id: true },
    })
    if (!vinculo) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })
  }

  const key = orden.fotoAlistamiento
  const url = await archivoUrl(key)

  return NextResponse.redirect(url)
}
