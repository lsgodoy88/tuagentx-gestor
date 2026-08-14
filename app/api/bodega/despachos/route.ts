import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { getDespachos } from '@/lib/bodega/despachos'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!ROLES_ADMIN_BODEGA.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const data = await getDespachos({
      empresaId: getEmpresaId(user),
      origenId: sp.get('origenId') ?? 'propia',
      estado: sp.get('estado') ?? 'pendiente',
      cursor: sp.get('cursor'),
      controlCursor: sp.get('controlCursor'),
      q: sp.get('q')?.trim() ?? '',
    })

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
